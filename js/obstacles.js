// Obstacle handling.
//
// Shapes live in normalised screen coordinates: x and y in [0,1] with y
// pointing DOWN (like the DOM), radius r as a fraction of the domain height so
// circles stay round on any aspect ratio.
//
// The same shape list is painted twice:
//   * into a small hidden canvas at simulation resolution -> boundary mask
//   * onto the visible overlay canvas -> crisp, nicely shaded obstacles

let nextId = 1;

export const SHAPE_TYPES = ['circle', 'square', 'plate', 'airfoil', 'hill', 'brush'];

export function makeShape (type, x, y, r, angle) {
    return { id: nextId++, type, x, y, r, angle: angle || 0, points: null };
}

export class ObstacleField {
    constructor () {
        this.shapes = [];
        this.maskCanvas = document.createElement('canvas');
        this.maskCanvas.width = 2;
        this.maskCanvas.height = 2;
        this.maskCtx = this.maskCanvas.getContext('2d', { willReadFrequently: false });
        this.edgeBlur = 0;      // in mask pixels, set from the simulation
        this.dirty = true;
    }

    resizeMask (w, h) {
        if (this.maskCanvas.width === w && this.maskCanvas.height === h) return;
        this.maskCanvas.width = w;
        this.maskCanvas.height = h;
        this.dirty = true;
    }

    add (shape) {
        this.shapes.push(shape);
        this.dirty = true;
        return shape;
    }

    remove (shape) {
        const i = this.shapes.indexOf(shape);
        if (i >= 0) {
            this.shapes.splice(i, 1);
            this.dirty = true;
        }
    }

    undo () {
        if (this.shapes.length === 0) return;
        this.shapes.pop();
        this.dirty = true;
    }

    clear () {
        if (this.shapes.length === 0) return;
        this.shapes = [];
        this.dirty = true;
    }

    set (shapes) {
        this.shapes = shapes;
        this.dirty = true;
    }

    touch () {
        this.dirty = true;
    }

    isEmpty () {
        return this.shapes.length === 0;
    }

    // Repaint the physics mask: white = solid, black = fluid.
    renderMask () {
        const ctx = this.maskCtx;
        const w = this.maskCanvas.width;
        const h = this.maskCanvas.height;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#ffffff';
        for (const s of this.shapes) {
            const p = shapePath(s, w, h);
            if (p.isStroke) {
                ctx.lineWidth = p.lineWidth;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.stroke(p.path);
            } else {
                ctx.fill(p.path);
            }
        }

        // A hard edge on a diagonal leaves a one-cell staircase, and every step
        // sheds its own little vortex - the "trees" growing off a mountain
        // slope. Adding a blurred copy on top (never replacing the sharp one,
        // so a thin freehand stroke cannot be blurred away) gives the solver a
        // boundary that ramps over about one cell instead of jumping.
        if (this.edgeBlur > 0 && 'filter' in ctx) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.filter = 'blur(' + this.edgeBlur + 'px)';
            ctx.drawImage(this.maskCanvas, 0, 0);
            ctx.filter = 'none';
            ctx.restore();
        }
        this.dirty = false;
    }

    // Pretty rendering on top of the simulation. The selected shape - the one
    // the size and rotate controls act on - gets a halo so it is obvious which
    // obstacle a tap picked up.
    renderOverlay (ctx, w, h, ghost, selected) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, w, h);
        for (const s of this.shapes) paintShape(ctx, s, w, h, 1.0, s === selected);
        if (ghost) paintShape(ctx, ghost, w, h, 0.45, false);
    }

    hitTest (ctx, x, y, w, h) {
        const px = x * w;
        const py = y * h;
        for (let i = this.shapes.length - 1; i >= 0; i--) {
            const p = shapePath(this.shapes[i], w, h);
            if (p.isStroke) {
                ctx.lineWidth = p.lineWidth;
                if (ctx.isPointInStroke(p.path, px, py)) return this.shapes[i];
            } else if (ctx.isPointInPath(p.path, px, py)) {
                return this.shapes[i];
            }
        }
        return null;
    }
}

function paintShape (ctx, s, w, h, alpha, selected) {
    const p = shapePath(s, w, h);
    if (selected) paintSelection(ctx, p, h, alpha);
    const cy = (s.type === 'brush' && s.points && s.points.length ? centroid(s.points).y : s.y) * h;
    const R = Math.max(2, s.r * h);
    // shade over the shape's own height, otherwise a tall tower gets a hard
    // band across its middle
    const span = s.type === 'box' ? R * (s.hr || 1) : R;
    const grad = ctx.createLinearGradient(0, cy - span, 0, cy + span);
    grad.addColorStop(0, 'rgba(236, 240, 247, 1)');
    grad.addColorStop(1, 'rgba(150, 162, 180, 1)');

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = Math.max(4, R * 0.25);
    if (p.isStroke) {
        ctx.strokeStyle = grad;
        ctx.lineWidth = p.lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke(p.path);
    } else {
        ctx.fillStyle = grad;
        ctx.fill(p.path);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(20, 26, 38, 0.85)';
        ctx.lineWidth = Math.max(1, R * 0.05);
        ctx.stroke(p.path);
    }
    ctx.restore();
}

// A glowing rim just outside the silhouette, drawn underneath the shape itself
// so only the outer half stays visible.
function paintSelection (ctx, p, h, alpha) {
    const halo = Math.max(3, h * 0.007);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = 'rgba(79, 195, 247, 0.95)';   // the accent of the interface
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(79, 195, 247, 0.85)';
    ctx.shadowBlur = halo * 3;
    ctx.lineWidth = (p.isStroke ? p.lineWidth : 0) + halo * 2;
    ctx.stroke(p.path);
    ctx.stroke(p.path);                              // twice, for a denser glow
    ctx.restore();
}

// Builds an absolute-pixel Path2D for a shape, so the very same geometry can be
// filled, stroked and hit-tested.
export function shapePath (s, w, h) {
    const path = new Path2D();
    const cx = s.x * w;
    const cy = s.y * h;
    const R = Math.max(2, s.r * h);
    const a = -(s.angle || 0) * Math.PI / 180; // screen y points down
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const tx = (px, py) => [cx + px * cos - py * sin, cy + px * sin + py * cos];

    switch (s.type) {
        case 'circle': {
            path.arc(cx, cy, R, 0, Math.PI * 2);
            break;
        }
        case 'box': {
            const hh = R * (s.hr || 1);
            polygon(path, [[-R, -hh], [R, -hh], [R, hh], [-R, hh]], tx);
            break;
        }
        case 'square': {
            polygon(path, [[-R, -R], [R, -R], [R, R], [-R, R]], tx);
            break;
        }
        case 'plate': {
            const t = Math.max(1.5, R * 0.09);
            polygon(path, [[-R, -t], [R, -t], [R, t], [-R, t]], tx);
            break;
        }
        case 'hill': {
            polygon(path, [[-R, R * 0.8], [0, -R * 0.9], [R, R * 0.8]], tx);
            break;
        }
        case 'airfoil': {
            polygon(path, airfoilPoints(R), tx);
            break;
        }
        case 'brush': {
            // a freehand stroke turns about its own centre of gravity
            const pts = s.points || [];
            if (pts.length > 0) {
                const c = centroid(pts);
                const rot = (px, py) => {
                    const ox = px * w - c.x * w;
                    const oy = py * h - c.y * h;
                    return [c.x * w + ox * cos - oy * sin, c.y * h + ox * sin + oy * cos];
                };
                const first = rot(pts[0].x, pts[0].y);
                path.moveTo(first[0], first[1]);
                for (let i = 1; i < pts.length; i++) {
                    const q = rot(pts[i].x, pts[i].y);
                    path.lineTo(q[0], q[1]);
                }
                if (pts.length === 1) path.lineTo(first[0] + 0.01, first[1]);
            }
            return { path, isStroke: true, lineWidth: 2 * R };
        }
        default: {
            path.arc(cx, cy, R, 0, Math.PI * 2);
        }
    }
    return { path, isStroke: false, lineWidth: 0 };
}

export function centroid (pts) {
    let x = 0;
    let y = 0;
    for (const p of pts) { x += p.x; y += p.y; }
    return { x: x / pts.length, y: y / pts.length };
}

function polygon (path, pts, tx) {
    for (let i = 0; i < pts.length; i++) {
        const [x, y] = tx(pts[i][0], pts[i][1]);
        if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
    }
    path.closePath();
}

// Symmetric NACA 0015 section, chord = 2R, centred on the quarter chord.
function airfoilPoints (R) {
    const t = 0.15;
    const n = 28;
    const chord = 2 * R;
    const upper = [];
    const lower = [];
    for (let i = 0; i <= n; i++) {
        const beta = (i / n) * Math.PI;
        const xc = 0.5 * (1 - Math.cos(beta)); // cosine spacing, fine at the nose
        const yt = 5 * t * (0.2969 * Math.sqrt(xc) - 0.1260 * xc - 0.3516 * xc * xc +
            0.2843 * xc * xc * xc - 0.1015 * xc * xc * xc * xc);
        const px = (xc - 0.35) * chord;
        upper.push([px, -yt * chord]);
        lower.push([px, yt * chord]);
    }
    lower.reverse();
    return upper.concat(lower);
}

// A building standing on the ground: x centre, half width and full height,
// both as fractions of the domain height.
function tower (x, halfWidth, height) {
    const shape = makeShape('box', x, 1 - height / 2, halfWidth, 0);
    shape.hr = (height / 2) / halfWidth;
    return shape;
}

// A room built from four walls, with a window in the windward side and
// optionally one opposite. The point of the pair: a single opening lets almost
// no air through, because the air has no way out - open the far side and the
// room flushes. Requires the pressure solve to respect the global mass
// balance, which is what the coarse grid correction is there for.
function roomWalls (aspect, openWindward, openLeeward) {
    const W = 0.19;
    const cx = 0.5;
    const cy = 0.5;
    const halfW = W / aspect;
    const shapes = [
        makeShape('plate', cx, cy - W, W, 0),
        makeShape('plate', cx, cy + W, W, 0)
    ];
    const wall = (x, open) => {
        if (!open) {
            shapes.push(makeShape('plate', x, cy, W, 90));
            return;
        }
        shapes.push(makeShape('plate', x, cy - W * 0.62, W * 0.38, 90));
        shapes.push(makeShape('plate', x, cy + W * 0.62, W * 0.38, 90));
    };
    wall(cx - halfW, openWindward);
    wall(cx + halfW, openLeeward);
    return shapes;
}

// Ready-made scenes. aspect = width / height of the domain.
export const PRESETS = {
    empty: () => [],
    cylinder: () => [makeShape('circle', 0.34, 0.5, 0.11)],
    airfoil: () => [makeShape('airfoil', 0.36, 0.52, 0.16, 10)],
    plate: () => [makeShape('plate', 0.35, 0.5, 0.18, 70)],
    building: () => [
        makeShape('square', 0.40, 0.80, 0.13),
        makeShape('square', 0.68, 0.86, 0.08)
    ],
    mountains: () => [
        makeShape('hill', 0.32, 0.88, 0.14),
        makeShape('hill', 0.55, 0.92, 0.09),
        makeShape('hill', 0.74, 0.89, 0.12)
    ],
    venturi: () => [
        makeShape('square', 0.45, -0.07, 0.33),
        makeShape('square', 0.45, 1.07, 0.33)
    ],
    slit: () => [
        makeShape('plate', 0.42, 0.20, 0.22, 90),
        makeShape('plate', 0.42, 0.80, 0.22, 90)
    ],
    // Frankfurt seen from the west: the cluster of towers around the
    // Bankenviertel, with the tallest two in the middle.
    skyline: () => [
        tower(0.20, 0.022, 0.16),
        tower(0.265, 0.030, 0.27),
        tower(0.325, 0.019, 0.41),
        tower(0.395, 0.034, 0.21),
        tower(0.460, 0.027, 0.50),
        tower(0.525, 0.023, 0.35),
        tower(0.590, 0.036, 0.19),
        tower(0.660, 0.026, 0.43),
        tower(0.730, 0.032, 0.27),
        tower(0.800, 0.021, 0.17)
    ],
    roomOne: aspect => roomWalls(aspect, true, false),
    roomCross: aspect => roomWalls(aspect, true, true),
    tandem: () => [
        makeShape('circle', 0.28, 0.5, 0.085),
        makeShape('circle', 0.55, 0.5, 0.085)
    ]
};
