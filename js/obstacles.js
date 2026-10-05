// Obstacle handling.
//
// Shapes live in normalised screen coordinates: x and y in [0,1] with y
// pointing DOWN (like the DOM), angle in degrees CLOCKWISE on screen - so for
// the usual flow from the left a positive angle lifts the nose of a wing, as
// an angle of attack should - radius r as a fraction of the SHORT side of the
// domain, so circles stay round on any aspect ratio and an obstacle never fills
// a portrait screen from wall to wall. Shapes that belong to the domain itself
// (ground, channel walls, towers) set unit = 'h' and scale with its height.
//
// Devices are obstacles with a function - a fan, a spinning rotor, a suction
// vent, a chimney. Their solid parts go into the mask like any other shape;
// what they do to the air is handed to the solver as a short list of drivers.
//
// The same shape list is painted twice:
//   * into a small hidden canvas at simulation resolution -> boundary mask
//   * onto the visible overlay canvas -> crisp obstacles, styled by the theme

let nextId = 1;

export const SHAPE_TYPES = ['circle', 'square', 'plate', 'airfoil', 'hill', 'brush'];
export const DEVICE_TYPES = ['fan', 'rotor', 'sink', 'chimney'];

// shapes that can be turned; a circle and a suction vent look the same at
// any angle, a rotor's arrows set its sense of rotation instead
export const ROTATABLE = ['square', 'plate', 'airfoil', 'hill', 'brush', 'box', 'fan', 'chimney'];

export function makeShape (type, x, y, r, angle) {
    const shape = { id: nextId++, type, x, y, r, angle: angle || 0, points: null };
    if (type === 'rotor') shape.spin = -1;     // clockwise: lift upwards in a flow from the left
    return shape;
}

export function isDevice (shape) {
    return DEVICE_TYPES.indexOf(shape.type) >= 0;
}

// The length a shape's r is measured in, in pixels.
export function unitLength (s, w, h) {
    return s.unit === 'h' ? h : Math.min(w, h);
}

// How obstacles look on the overlay. The theme replaces this (see
// themes/README.md); these are only plain stand-ins.
const DEFAULT_STYLE = {
    obstacle: {
        fill: '#808080',    // a colour, or [top, bottom] for vertical shading
        edge: null,         // outline colour, or null
        shadow: null        // drop shadow colour, or null
    },
    device: {
        color: '#303030',   // moving parts and markings of fans, rotors ...
        accent: '#ffffff'   // arrows drawn on top of them
    },
    selection: {
        color: '#ffffff',   // ring around the selected obstacle
        glow: null,         // glow colour, or null for a crisp ring
        width: 0.005,       // ring width, fraction of the screen height
        minWidth: 2,        // ... but at least this many pixels
        gap: 0,             // space between shape and ring, fraction of height
        gapColor: null      // what fills that space
    }
};

export class ObstacleField {
    constructor (style = {}) {
        this.style = {
            obstacle: Object.assign({}, DEFAULT_STYLE.obstacle, style.obstacle),
            device: Object.assign({}, DEFAULT_STYLE.device, style.device),
            selection: Object.assign({}, DEFAULT_STYLE.selection, style.selection)
        };
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

    hasDevices () {
        return this.shapes.some(isDevice);
    }

    // What the devices do to the air, for the solver. Positions are in uv
    // (y up), lengths in units of the domain height, angles in radians
    // counter-clockwise, as is usual with y up. At most max of them, the most recently placed win.
    drivers (w, h, max) {
        const out = [];
        for (let i = this.shapes.length - 1; i >= 0 && out.length < max; i--) {
            const s = this.shapes[i];
            if (!isDevice(s)) continue;
            out.push({
                type: DEVICE_TYPES.indexOf(s.type),
                x: s.x,
                y: 1 - s.y,
                r: s.r * unitLength(s, w, h) / h,
                angle: -(s.angle || 0) * Math.PI / 180,
                spin: s.spin || 1
            });
        }
        return out;
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
    // time (seconds) turns the fan blades and rotors
    renderOverlay (ctx, w, h, ghost, selected, time = 0) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, w, h);
        for (const s of this.shapes) paintShape(ctx, s, w, h, 1.0, s === selected, this.style, time);
        if (ghost) paintShape(ctx, ghost, w, h, 0.45, false, this.style, time);
    }

    hitTest (ctx, x, y, w, h) {
        const px = x * w;
        const py = y * h;
        for (let i = this.shapes.length - 1; i >= 0; i--) {
            const p = hitPath(this.shapes[i], w, h);
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

function paintShape (ctx, s, w, h, alpha, selected, style, time) {
    const p = shapePath(s, w, h);
    const look = style.obstacle;
    if (selected) paintSelection(ctx, isDevice(s) ? hitPath(s, w, h) : p, h, alpha, style.selection);
    const R = Math.max(2, s.r * unitLength(s, w, h));
    let paint = look.fill;
    if (Array.isArray(paint)) {
        if (paint.length > 1) {
            const cy = (s.type === 'brush' && s.points && s.points.length ? centroid(s.points).y : s.y) * h;
            // shade over the shape's own height, otherwise a tall tower gets a
            // hard band across its middle
            const span = s.type === 'box' ? (s.hh || 0) * h : R;
            const grad = ctx.createLinearGradient(0, cy - span, 0, cy + span);
            grad.addColorStop(0, paint[0]);
            grad.addColorStop(1, paint[paint.length - 1]);
            paint = grad;
        } else {
            paint = paint[0];
        }
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    if (look.shadow) {
        ctx.shadowColor = look.shadow;
        ctx.shadowBlur = Math.max(4, R * 0.25);
    }
    if (p.isStroke) {
        ctx.strokeStyle = paint;
        ctx.lineWidth = p.lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke(p.path);
    } else {
        ctx.fillStyle = paint;
        ctx.fill(p.path);
        if (look.edge) {
            ctx.shadowBlur = 0;
            ctx.strokeStyle = look.edge;
            ctx.lineWidth = Math.max(1, R * 0.05);
            ctx.stroke(p.path);
        }
    }
    ctx.restore();
    if (isDevice(s)) paintDevice(ctx, s, w, h, R, alpha, style.device, time);
}

// The working parts on top of a device: what turns, and which way the air goes.
function paintDevice (ctx, s, w, h, R, alpha, look, time) {
    const a = (s.angle || 0) * Math.PI / 180;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(s.x * w, s.y * h);
    ctx.rotate(a);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const line = Math.max(1.5, R * 0.07);
    switch (s.type) {
        case 'fan': {
            // three blades turning in the duct, and an arrow out of the front
            ctx.save();
            ctx.translate(-R * 0.05, 0);
            ctx.scale(0.35, 1);                    // seen from the side
            ctx.rotate(time * 9);
            ctx.fillStyle = look.color;
            for (let i = 0; i < 3; i++) {
                ctx.rotate(Math.PI * 2 / 3);
                ctx.beginPath();
                ctx.ellipse(0, -R * 0.3, R * 0.16, R * 0.3, 0, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
            ctx.fillStyle = look.color;
            ctx.beginPath();
            ctx.arc(-R * 0.05, 0, R * 0.1, 0, Math.PI * 2);
            ctx.fill();
            arrow(ctx, R * 0.35, 0, R * 0.95, 0, line, look.color);
            break;
        }
        case 'rotor': {
            // a bar across the drum shows it turning, arrows show the sense
            const turn = -(s.spin || 1) * time * 2.2;
            ctx.rotate(turn);
            ctx.strokeStyle = look.color;
            ctx.lineWidth = line * 1.4;
            ctx.beginPath();
            ctx.moveTo(-R * 0.72, 0);
            ctx.lineTo(R * 0.72, 0);
            ctx.stroke();
            ctx.rotate(-turn);
            ctx.lineWidth = line;
            const dir = s.spin || 1;            // +1 counter-clockwise on screen
            for (let k = 0; k < 2; k++) {
                const a0 = k * Math.PI + 0.35;
                const a1 = a0 + 1.6;
                ctx.beginPath();
                ctx.arc(0, 0, R * 0.5, -a0, -a1, true);
                ctx.stroke();
                const tip = dir > 0 ? -a1 : -a0;
                const tx = Math.cos(tip) * R * 0.5;
                const ty = Math.sin(tip) * R * 0.5;
                const t = dir > 0 ? -1 : 1;    // tangent direction at the tip
                const ux = -Math.sin(tip) * t;
                const uy = Math.cos(tip) * t;
                head(ctx, tx, ty, ux, uy, line * 2.6, look.color);
            }
            break;
        }
        case 'sink': {
            // a grille, with arrows pointing in
            ctx.setLineDash([line * 1.6, line * 1.6]);
            ctx.strokeStyle = look.color;
            ctx.lineWidth = line;
            ctx.beginPath();
            ctx.arc(0, 0, R, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = look.color;
            ctx.beginPath();
            ctx.arc(0, 0, R * 0.32, 0, Math.PI * 2);
            ctx.fill();
            for (let k = 0; k < 4; k++) {
                const ang = k * Math.PI / 2 + Math.PI / 4;
                const c = Math.cos(ang);
                const d = Math.sin(ang);
                arrow(ctx, c * R * 0.9, d * R * 0.9, c * R * 0.45, d * R * 0.45, line, look.color);
            }
            break;
        }
        case 'chimney': {
            // a dark band round the top of the stack
            ctx.fillStyle = look.color;
            ctx.fillRect(-R * 0.27, -R, R * 0.54, R * 0.22);
            break;
        }
    }
    ctx.restore();
}

function arrow (ctx, x0, y0, x1, y1, width, color) {
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const ux = (x1 - x0) / len;
    const uy = (y1 - y0) / len;
    const size = width * 2.6;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1 - ux * size * 0.6, y1 - uy * size * 0.6);
    ctx.stroke();
    head(ctx, x1, y1, ux, uy, size, color);
}

function head (ctx, x, y, ux, uy, size, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - ux * size - uy * size * 0.6, y - uy * size + ux * size * 0.6);
    ctx.lineTo(x - ux * size + uy * size * 0.6, y - uy * size - ux * size * 0.6);
    ctx.closePath();
    ctx.fill();
}

// A rim just outside the silhouette, drawn underneath the shape itself so only
// the outer half stays visible: either glowing, or a crisp ring held off the
// shape by a gap.
function paintSelection (ctx, p, h, alpha, sel) {
    const ring = Math.max(sel.minWidth || 0, h * sel.width);
    const gap = h * (sel.gap || 0);
    const core = p.isStroke ? p.lineWidth : 0;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = sel.color;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = core + (gap + ring) * 2;
    if (sel.glow) {
        ctx.shadowColor = sel.glow;
        ctx.shadowBlur = ring * 3;
        ctx.stroke(p.path);                          // twice, for a denser glow
    }
    ctx.stroke(p.path);
    if (gap > 0 && sel.gapColor) {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = sel.gapColor;
        ctx.lineWidth = core + gap * 2;
        ctx.stroke(p.path);
    }
    ctx.restore();
}

// Builds an absolute-pixel Path2D for a shape, so the very same geometry can be
// filled, stroked and hit-tested.
export function shapePath (s, w, h) {
    const path = new Path2D();
    const cx = s.x * w;
    const cy = s.y * h;
    const R = Math.max(2, s.r * unitLength(s, w, h));
    const a = (s.angle || 0) * Math.PI / 180;  // clockwise, as screen y points down
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const tx = (px, py) => [cx + px * cos - py * sin, cy + px * sin + py * cos];

    switch (s.type) {
        case 'circle': {
            path.arc(cx, cy, R, 0, Math.PI * 2);
            break;
        }
        case 'box': {
            const hh = Math.max(2, (s.hh || 0) * h);
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
        case 'fan': {
            // the duct: two walls along the blowing direction
            const L = R * 0.62;
            const t = Math.max(1.5, R * 0.08);
            polygon(path, [[-L, -R * 0.78 - t], [L, -R * 0.78 - t], [L, -R * 0.78 + t], [-L, -R * 0.78 + t]], tx);
            polygon(path, [[-L, R * 0.78 - t], [L, R * 0.78 - t], [L, R * 0.78 + t], [-L, R * 0.78 + t]], tx);
            break;
        }
        case 'rotor': {
            path.arc(cx, cy, R, 0, Math.PI * 2);
            break;
        }
        case 'sink': {
            // nothing solid: the vent just takes air away
            break;
        }
        case 'chimney': {
            polygon(path, [[-R * 0.27, -R], [R * 0.27, -R], [R * 0.32, R], [-R * 0.32, R]], tx);
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

// What a finger has to hit to pick a shape up. Devices are grabbed by their
// whole footprint, not just by their solid parts.
export function hitPath (s, w, h) {
    if (!isDevice(s)) return shapePath(s, w, h);
    const path = new Path2D();
    const R = Math.max(2, s.r * unitLength(s, w, h));
    const cx = s.x * w;
    const cy = s.y * h;
    if (s.type === 'rotor' || s.type === 'sink') {
        path.arc(cx, cy, R, 0, Math.PI * 2);
        return { path, isStroke: false, lineWidth: 0 };
    }
    const a = (s.angle || 0) * Math.PI / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const tx = (px, py) => [cx + px * cos - py * sin, cy + px * sin + py * cos];
    if (s.type === 'fan') polygon(path, [[-R * 0.7, -R * 0.9], [R, -R * 0.9], [R, R * 0.9], [-R * 0.7, R * 0.9]], tx);
    else polygon(path, [[-R * 0.4, -R * 1.1], [R * 0.4, -R * 1.1], [R * 0.4, R], [-R * 0.4, R]], tx);
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

// NACA 4412, the cambered section of countless wind tunnel photographs and
// textbook figures: 4 % camber at 40 % chord, 12 % thick, round nose, sharp
// trailing edge. Chord = 2R, turning about the quarter chord. Screen y points
// down, so the upper surface has negative y.
export function airfoilPoints (R) {
    const m = 0.04;
    const p = 0.4;
    const t = 0.12;
    const n = 36;
    const chord = 2 * R;
    const upper = [];
    const lower = [];
    for (let i = 0; i <= n; i++) {
        const beta = (i / n) * Math.PI;
        const x = 0.5 * (1 - Math.cos(beta)); // cosine spacing, fine at the nose
        // -0.1036 instead of -0.1015 closes the trailing edge
        const yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.1260 * x - 0.3516 * x * x +
            0.2843 * x * x * x - 0.1036 * x * x * x * x);
        const yc = x < p ? m / (p * p) * (2 * p * x - x * x)
            : m / ((1 - p) * (1 - p)) * ((1 - 2 * p) + 2 * p * x - x * x);
        const dyc = x < p ? 2 * m / (p * p) * (p - x) : 2 * m / ((1 - p) * (1 - p)) * (p - x);
        const th = Math.atan(dyc);
        const ox = (-0.35) * chord;
        upper.push([ox + (x - yt * Math.sin(th)) * chord, -(yc + yt * Math.cos(th)) * chord]);
        lower.push([ox + (x + yt * Math.sin(th)) * chord, -(yc - yt * Math.cos(th)) * chord]);
    }
    // back along the lower surface, without repeating trailing edge and nose
    lower.reverse();
    return upper.concat(lower.slice(1, -1));
}

// A building standing on the ground: x centre, half width and full height,
// both as fractions of the domain height.
function tower (x, halfWidth, height) {
    const shape = makeShape('box', x, 1 - height / 2, halfWidth, 0);
    shape.unit = 'h';
    shape.hh = height / 2;
    return shape;
}

// a shape that belongs to the domain: sized by its height, not its short side
function fixed (shape) {
    shape.unit = 'h';
    return shape;
}

function device (type, x, y, r, angle) {
    return makeShape(type, x, y, r, angle);
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
        fixed(makeShape('plate', cx, cy - W, W, 0)),
        fixed(makeShape('plate', cx, cy + W, W, 0))
    ];
    const wall = (x, open) => {
        if (!open) {
            shapes.push(fixed(makeShape('plate', x, cy, W, 90)));
            return;
        }
        shapes.push(fixed(makeShape('plate', x, cy - W * 0.62, W * 0.38, 90)));
        shapes.push(fixed(makeShape('plate', x, cy + W * 0.62, W * 0.38, 90)));
    };
    wall(cx - halfW, openWindward);
    wall(cx + halfW, openLeeward);
    return shapes;
}

// Ready-made scenes. aspect = width / height of the domain. Free-standing
// bodies are sized by the short side of the screen, so they keep room for a
// wake on a portrait phone too; anything standing on the ground or forming a
// channel is sized by the height.
export const PRESETS = {
    empty: () => [],
    cylinder: () => [makeShape('circle', 0.30, 0.5, 0.07)],
    airfoil: () => [makeShape('airfoil', 0.32, 0.52, 0.12, 6)],
    plate: () => [makeShape('plate', 0.32, 0.5, 0.11, 70)],
    building: () => [
        fixed(makeShape('square', 0.40, 0.80, 0.13)),
        fixed(makeShape('square', 0.68, 0.86, 0.08))
    ],
    mountains: () => [
        fixed(makeShape('hill', 0.32, 0.88, 0.14)),
        fixed(makeShape('hill', 0.55, 0.92, 0.09)),
        fixed(makeShape('hill', 0.74, 0.89, 0.12))
    ],
    venturi: () => [
        fixed(makeShape('square', 0.45, -0.07, 0.33)),
        fixed(makeShape('square', 0.45, 1.07, 0.33))
    ],
    slit: () => [
        fixed(makeShape('plate', 0.42, 0.20, 0.22, 90)),
        fixed(makeShape('plate', 0.42, 0.80, 0.22, 90))
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
    // A street canyon roughly as wide as the buildings are tall: the classic
    // urban case, where a vortex gets trapped between the two rows and the air
    // down at street level barely exchanges with the flow above.
    canyon: () => [
        tower(0.30, 0.030, 0.55),
        tower(0.70, 0.030, 0.55)
    ],
    // A solid windbreak and a slatted one of the same height. The solid wall
    // throws a strong vortex and the shelter behind it is short; the slatted
    // fence bleeds air through and shelters much further downwind.
    wallSolid: () => [fixed(makeShape('plate', 0.38, 0.775, 0.225, 90))],
    fence: () => [
        fixed(makeShape('plate', 0.38, 0.9625, 0.0375, 90)),
        fixed(makeShape('plate', 0.38, 0.8575, 0.0375, 90)),
        fixed(makeShape('plate', 0.38, 0.7525, 0.0375, 90)),
        fixed(makeShape('plate', 0.38, 0.6475, 0.0375, 90))
    ],
    // Three rotors in a row, seen edge on. The second and third sit in the
    // wake of the first and see markedly slower air.
    windfarm: () => [
        fixed(makeShape('plate', 0.28, 0.55, 0.12, 90)), tower(0.28, 0.008, 0.33),
        fixed(makeShape('plate', 0.50, 0.55, 0.12, 90)), tower(0.50, 0.008, 0.33),
        fixed(makeShape('plate', 0.72, 0.55, 0.12, 90)), tower(0.72, 0.008, 0.33)
    ],
    // A bridge deck: a bluff body that sheds alternately above and below,
    // which is what made the Tacoma Narrows bridge famous.
    bridge: () => [makeShape('plate', 0.40, 0.5, 0.16, 0)],
    // The same wing twice, at a sensible angle and at far too steep a one.
    stall: () => [
        makeShape('airfoil', 0.34, 0.30, 0.10, 4),
        makeShape('airfoil', 0.34, 0.66, 0.10, 24)
    ],
    roomOne: aspect => roomWalls(aspect, true, false),
    roomCross: aspect => roomWalls(aspect, true, true),
    tandem: () => [
        makeShape('circle', 0.26, 0.5, 0.055),
        makeShape('circle', 0.50, 0.5, 0.055)
    ],

    // ---- devices ----------------------------------------------------------
    // A still cylinder above, a spinning one below: the spinning one drags
    // the air round with it, the wake tilts and the cylinder is pushed
    // sideways - the Magnus effect, as on a Flettner ship or a sliced ball.
    magnus: () => [
        makeShape('circle', 0.30, 0.30, 0.06),
        device('rotor', 0.30, 0.64, 0.06)
    ],
    // A jet blown across the stream bends over and rolls up - like exhaust
    // from a stack or a jet engine's thrust reverser.
    jet: () => [device('fan', 0.30, 0.78, 0.07, -90)],
    // A chimney upwind of a tall block: the plume is pulled down into the
    // eddy behind the building - why chimneys must stand clear of the roofs.
    chimney: () => [
        fixed(device('chimney', 0.22, 0.86, 0.14)),
        tower(0.45, 0.06, 0.32)
    ],
    // Smoke from a stack, caught by a suction vent downwind.
    extraction: () => [
        fixed(device('chimney', 0.25, 0.90, 0.10)),
        device('sink', 0.55, 0.74, 0.06)
    ]
};
