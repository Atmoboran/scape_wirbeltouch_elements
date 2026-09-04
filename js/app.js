// Wiring: canvas sizing, touch/mouse input, obstacle placement, UI controls.

import { FluidSimulation } from './simulation.js';
import { ObstacleField, makeShape, PRESETS, centroid } from './obstacles.js';
import { applyLanguage, STRINGS } from './i18n.js';

const QUALITY = [
    { sim: 128, dye: 512, iter: 24 },
    { sim: 192, dye: 768, iter: 28 },
    { sim: 256, dye: 1024, iter: 32 },
    { sim: 352, dye: 1440, iter: 36 }
];

// Two settings for the two media people know. Both solve the same equations -
// what changes is the regime: wind around a building sits at a far higher
// Reynolds number than a slow water flume, so it is choppier and less orderly.
const MEDIA = {
    air: {
        windSpeed: 50,
        VELOCITY_DISSIPATION: 0.09,
        CURL: 6,
        DENSITY_DISSIPATION: 0.12,
        smokeStripes: 24,
        inflowWobble: 0.015,
        smokeColorA: [0.88, 0.92, 1.0],
        smokeColorB: [1.0, 0.70, 0.42]
    },
    water: {
        windSpeed: 30,
        VELOCITY_DISSIPATION: 0.16,
        CURL: 3,
        DENSITY_DISSIPATION: 0.10,
        smokeStripes: 14,
        inflowWobble: 0.010,
        smokeColorA: [0.30, 0.88, 0.95],
        smokeColorB: [0.28, 0.42, 0.98]
    }
};

const DIRECTIONS = {
    right: [1, 0],
    left: [-1, 0],
    down: [0, -1],
    up: [0, 1]
};

const MAX_PIXELS = 4.2e6;      // keeps 4K screens and weak GPUs civil
const IDLE_RESET_MS = 4 * 60 * 1000;
const DEFAULT_SCENE = 'cylinder';
const ROTATE_STEP = 15;
const SPIN_DOWN_S = 1.6;       // how long the fan takes to run out
const SPIN_DOWN_RATE = 2.6;    // 1/s, uniform slow-down over that time
const SETTLE_S = 0.7;          // keep slowing after the fan is off, so almost
                               // no momentum is left when the ends close

const simCanvas = document.getElementById('sim');
const overlay = document.getElementById('overlay');
const octx = overlay.getContext('2d');
const hintEl = document.getElementById('hint');

const field = new ObstacleField();
let sim = null;

const state = {
    lang: (navigator.language || 'de').toLowerCase().startsWith('de') ? 'de' : 'en',
    tool: 'circle',
    size: 11,          // obstacle radius, per cent of the domain height
    pen: 2.5,          // freehand pen half width, per cent of the domain height
    angle: 10,
    quality: 2,
    medium: 'air',
    dirKey: 'right',
    selected: null,
    windOn: false,
    settle: 0,
    overlayDirty: true,
    lastInteraction: performance.now()
};

let dict = STRINGS[state.lang];

try {
    sim = new FluidSimulation(simCanvas, field);
} catch (err) {
    console.error(err);
    document.getElementById('fatal').hidden = false;
    document.getElementById('fatal-text').textContent = STRINGS[state.lang].noWebGL;
    document.getElementById('fatal-detail').textContent = err.message;
}

const el = id => document.getElementById(id);
const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));
const clamp01 = v => clamp(v, 0, 1);

/* ------------------------------------------------------------------ sizing */

function sizeCanvases () {
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = Math.max(1, window.innerWidth);
    const cssH = Math.max(1, window.innerHeight);
    if (cssW * cssH * dpr * dpr > MAX_PIXELS) {
        dpr = Math.sqrt(MAX_PIXELS / (cssW * cssH));
    }
    const w = Math.max(2, Math.floor(cssW * dpr));
    const h = Math.max(2, Math.floor(cssH * dpr));
    if (simCanvas.width === w && simCanvas.height === h) return false;
    simCanvas.width = w;
    simCanvas.height = h;
    overlay.width = w;
    overlay.height = h;
    state.overlayDirty = true;
    return true;
}

/* ------------------------------------------------------------------- input */

const pointers = new Map();
let gesture = null;

function localPos (event) {
    const rect = overlay.getBoundingClientRect();
    return {
        x: clamp01((event.clientX - rect.left) / rect.width),
        y: clamp01((event.clientY - rect.top) / rect.height)
    };
}

function isShapeTool () {
    return state.tool !== 'stir' && state.tool !== 'eraser';
}

function markObstaclesChanged () {
    field.touch();
    state.overlayDirty = true;
}

/* ------------------------------------------------------- drag to the bin */

const trashEl = document.getElementById('trash');
let trashHintShown = false;

// The bin is there whenever it has something to act on: while an obstacle is
// being dragged, and while one is selected - then a tap on it is enough.
function refreshTrash () {
    let dragging = false;
    pointers.forEach(e => { if (draggingShape(e.mode)) dragging = true; });
    const want = dragging || (isShapeTool() && state.selected != null);
    if (want) {
        if (!trashHintShown) { trashHintShown = true; showHint('hintDrag'); }
        trashEl.hidden = false;
        // let the browser lay it out before the transition starts
        requestAnimationFrame(() => trashEl.classList.add('show'));
    } else {
        trashEl.classList.remove('show', 'hot');
        trashEl.hidden = true;
    }
}

function deleteSelected () {
    if (!state.selected) return;
    field.remove(state.selected);
    state.selected = null;
    markObstaclesChanged();
    refreshTrash();
    state.lastInteraction = performance.now();
}

trashEl.addEventListener('click', deleteSelected);

function overTrash (clientX, clientY) {
    if (trashEl.hidden) return false;
    const r = trashEl.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
}

function draggingShape (mode) {
    return mode === 'move' || mode === 'brush';
}

function onPointerDown (event) {
    if (!sim) return;
    event.preventDefault();
    try { overlay.setPointerCapture(event.pointerId); } catch (e) { /* synthetic events */ }
    state.lastInteraction = performance.now();
    const p = localPos(event);
    const entry = { x: p.x, y: p.y, mode: 'stir', shape: null, grab: { x: 0, y: 0 }, color: randomColor() };

    // A second finger turns the touch into a rotate / resize gesture instead of
    // dropping another obstacle.
    if (pointers.size > 0 && isShapeTool()) {
        const others = Array.from(pointers.values());
        const anchor = others[others.length - 1];
        const target = field.hitTest(octx, p.x, p.y, overlay.width, overlay.height) ||
            anchor.shape || state.selected;
        if (target) {
            entry.mode = 'gesture';
            entry.shape = target;
            anchor.mode = 'gesture';
            anchor.shape = target;
            state.selected = target;
            state.overlayDirty = true;
            refreshTrash();
            startGesture(target, anchor, p);
            pointers.set(event.pointerId, entry);
            syncShapeControls(target);
            showHint('hintRotate');
            return;
        }
    }

    if (state.tool === 'stir') {
        sim.splat(p.x, 1 - p.y, 0, 0, entry.color);
    } else if (state.tool === 'eraser') {
        entry.mode = 'erase';
        eraseAt(p);
    } else {
        const hit = field.hitTest(octx, p.x, p.y, overlay.width, overlay.height);
        if (hit) {
            entry.mode = 'move';
            entry.shape = hit;
            entry.grab = { x: hit.x - p.x, y: hit.y - p.y };
            state.selected = hit;
            syncShapeControls(hit);
        } else if (state.tool === 'brush') {
            const shape = makeShape('brush', p.x, p.y, state.pen / 100, 0);
            shape.points = [{ x: p.x, y: p.y }];
            field.add(shape);
            entry.mode = 'brush';
            entry.shape = shape;
            state.selected = shape;
        } else {
            const shape = makeShape(state.tool, p.x, p.y, state.size / 100, state.angle);
            field.add(shape);
            entry.mode = 'move';
            entry.shape = shape;
            state.selected = shape;
        }
        markObstaclesChanged();
    }
    pointers.set(event.pointerId, entry);
    refreshTrash();
}

function onPointerMove (event) {
    const entry = pointers.get(event.pointerId);
    if (!entry || !sim) return;
    event.preventDefault();
    state.lastInteraction = performance.now();
    const p = localPos(event);
    const prevX = entry.x;
    const prevY = entry.y;
    entry.x = p.x;
    entry.y = p.y;

    if (entry.mode === 'gesture') {
        const pair = Array.from(pointers.values()).filter(e => e.mode === 'gesture');
        if (pair.length >= 2) applyGesture(pair[0], pair[1]);
        return;
    }
    if (entry.mode === 'stir') {
        const dx = (p.x - prevX) * sim.config.SPLAT_FORCE;
        const dy = -(p.y - prevY) * sim.config.SPLAT_FORCE;
        if (dx !== 0 || dy !== 0) sim.splat(p.x, 1 - p.y, dx, dy, entry.color);
    } else if (entry.mode === 'erase') {
        eraseAt(p);
    } else if (entry.mode === 'move' && entry.shape) {
        entry.shape.x = clamp01(p.x + entry.grab.x);
        entry.shape.y = clamp01(p.y + entry.grab.y);
        markObstaclesChanged();
        trashEl.classList.toggle('hot', overTrash(event.clientX, event.clientY));
    } else if (entry.mode === 'brush' && entry.shape) {
        const pts = entry.shape.points;
        const last = pts[pts.length - 1];
        if (Math.hypot(p.x - last.x, p.y - last.y) > 0.004) {
            pts.push({ x: p.x, y: p.y });
            markObstaclesChanged();
        }
        trashEl.classList.toggle('hot', overTrash(event.clientX, event.clientY));
    }
}

function onPointerUp (event) {
    const entry = pointers.get(event.pointerId);
    if (entry && draggingShape(entry.mode) && entry.shape &&
        overTrash(event.clientX, event.clientY)) {
        if (state.selected === entry.shape) state.selected = null;
        field.remove(entry.shape);
        markObstaclesChanged();
    }

    if (entry && entry.mode === 'gesture') {
        gesture = null;
        // the finger left on the screen must not start dragging the shape
        pointers.forEach(e => { if (e.mode === 'gesture') e.mode = 'none'; });
    }
    pointers.delete(event.pointerId);
    try {
        if (overlay.hasPointerCapture(event.pointerId)) overlay.releasePointerCapture(event.pointerId);
    } catch (e) { /* ignore */ }
    refreshTrash();
    state.lastInteraction = performance.now();
}

/* ---- two finger rotate and resize ---------------------------------------- */

function pixelSpan (a, b) {
    return {
        dx: (b.x - a.x) * overlay.width,
        dy: (b.y - a.y) * overlay.height
    };
}

function startGesture (shape, a, b) {
    const v = pixelSpan(a, b);
    const pts = shape.points ? shape.points.map(q => ({ x: q.x, y: q.y })) : null;
    const c = pts && pts.length ? centroid(pts) : { x: shape.x, y: shape.y };
    gesture = {
        shape,
        ang0: Math.atan2(v.dy, v.dx),
        dist0: Math.hypot(v.dx, v.dy),
        baseAngle: shape.angle || 0,
        baseR: shape.r,
        baseX: shape.x,
        baseY: shape.y,
        mid0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        points0: pts,
        cx: c.x,
        cy: c.y
    };
}

function applyGesture (a, b) {
    if (!gesture || gesture.dist0 < 4) return;
    const s = gesture.shape;
    const v = pixelSpan(a, b);
    const dist = Math.hypot(v.dx, v.dy);
    const factor = clamp(dist / gesture.dist0, 0.15, 8);
    // screen y points down, so a positive screen rotation is a negative one on
    // the shape, whose angle is measured counter-clockwise
    const deltaDeg = -(Math.atan2(v.dy, v.dx) - gesture.ang0) * 180 / Math.PI;
    const dx = (a.x + b.x) / 2 - gesture.mid0.x;
    const dy = (a.y + b.y) / 2 - gesture.mid0.y;

    s.angle = wrapAngle(gesture.baseAngle + deltaDeg);
    if (s.type === 'brush' && gesture.points0) {
        s.r = clamp(gesture.baseR * factor, 0.003, 0.25);
        s.points = gesture.points0.map(q => ({
            x: clamp01(gesture.cx + (q.x - gesture.cx) * factor + dx),
            y: clamp01(gesture.cy + (q.y - gesture.cy) * factor + dy)
        }));
    } else {
        s.r = clamp(gesture.baseR * factor, 0.02, 0.45);
        s.x = clamp01(gesture.baseX + dx);
        s.y = clamp01(gesture.baseY + dy);
    }
    markObstaclesChanged();
    syncShapeControls(s);
}

function wrapAngle (deg) {
    let a = deg % 360;
    if (a > 180) a -= 360;
    if (a < -180) a += 360;
    return a;
}

function eraseAt (p) {
    const hit = field.hitTest(octx, p.x, p.y, overlay.width, overlay.height);
    if (hit) {
        if (state.selected === hit) state.selected = null;
        field.remove(hit);
        markObstaclesChanged();
        refreshTrash();
    }
}

function randomColor () {
    const c = HSVtoRGB(Math.random(), 0.85, 1.0);
    return [c[0] * 0.25, c[1] * 0.25, c[2] * 0.25];
}

function HSVtoRGB (h, s, v) {
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: return [v, t, p];
        case 1: return [q, v, p];
        case 2: return [p, v, t];
        case 3: return [p, q, v];
        case 4: return [t, p, v];
        default: return [v, p, q];
    }
}

overlay.addEventListener('pointerdown', onPointerDown);
overlay.addEventListener('pointermove', onPointerMove);
overlay.addEventListener('pointerup', onPointerUp);
overlay.addEventListener('pointercancel', onPointerUp);
window.addEventListener('pointerup', onPointerUp);
overlay.addEventListener('contextmenu', e => e.preventDefault());

/* ---------------------------------------------------------------------- UI */

function setPressed (nodes, matcher) {
    nodes.forEach(node => node.setAttribute('aria-pressed', matcher(node) ? 'true' : 'false'));
}

const toolButtons = Array.from(document.querySelectorAll('.tool'));
toolButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        state.tool = btn.dataset.tool;
        setPressed(toolButtons, n => n.dataset.tool === state.tool);
        state.overlayDirty = true;
        updateShapeBar();
        refreshTrash();
        showHint(state.tool === 'stir' ? 'hintStir' : state.tool === 'eraser' ? 'hintErase' : 'hintPlace');
        state.lastInteraction = performance.now();
    });
});

const sceneSelect = el('scene-select');
sceneSelect.addEventListener('change', () => {
    if (sceneSelect.value) loadPreset(sceneSelect.value);
});

const viewButtons = Array.from(document.querySelectorAll('[data-view]'));
viewButtons.forEach(btn => btn.addEventListener('click', () => setView(parseInt(btn.dataset.view, 10))));

const mediumButtons = Array.from(document.querySelectorAll('[data-medium]'));
mediumButtons.forEach(btn => btn.addEventListener('click', () => setMedium(btn.dataset.medium)));

const dirButtons = Array.from(document.querySelectorAll('[data-dir]'));
dirButtons.forEach(btn => btn.addEventListener('click', () => setDirection(btn.dataset.dir)));

const smokeButtons = Array.from(document.querySelectorAll('[data-smoke]'));
smokeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        if (!sim) return;
        sim.config.smokeMode = parseInt(btn.dataset.smoke, 10);
        setPressed(smokeButtons, n => parseInt(n.dataset.smoke, 10) === sim.config.smokeMode);
        state.lastInteraction = performance.now();
    });
});

document.querySelectorAll('.info').forEach(btn => {
    btn.addEventListener('click', () => {
        const box = el(btn.dataset.info);
        if (!box) return;
        box.hidden = !box.hidden;
        btn.setAttribute('aria-pressed', box.hidden ? 'false' : 'true');
        state.lastInteraction = performance.now();
    });
});

function setView (mode) {
    if (!sim) return;
    sim.config.displayMode = mode;
    setPressed(viewButtons, n => parseInt(n.dataset.view, 10) === mode);
    state.lastInteraction = performance.now();
}

function setMedium (key) {
    const preset = MEDIA[key];
    if (!preset || !sim) return;
    state.medium = key;
    Object.assign(sim.config, preset);
    setPressed(mediumButtons, n => n.dataset.medium === key);
    el('in-wind').value = String(preset.windSpeed);
    el('in-curl').value = String(preset.CURL);
    el('in-stripes').value = String(preset.smokeStripes);
    el('in-fade').value = String(Math.round(preset.DENSITY_DISSIPATION * 100));
    updateSliderOutputs();
    state.lastInteraction = performance.now();
}

function setDirection (key) {
    if (!sim) return;
    if (key === 'off') {
        setWind(false);
    } else {
        // dye left over from the old direction only muddies the picture
        const changed = state.dirKey !== key && state.windOn;
        state.dirKey = key;
        sim.config.windDir = DIRECTIONS[key];
        if (changed) sim.reset();
        setWind(true);
    }
    setPressed(dirButtons, n => n.dataset.dir === (state.windOn ? state.dirKey : 'off'));
    state.lastInteraction = performance.now();
}

function loadPreset (name) {
    if (!sim) return;
    const builder = PRESETS[name] || PRESETS.empty;
    field.set(builder(overlay.width / Math.max(1, overlay.height)));
    state.selected = null;
    markObstaclesChanged();
    refreshTrash();
    sceneSelect.value = name;
    sim.reset();
    setWind(true);
    state.lastInteraction = performance.now();
}

function setWind (on) {
    if (!sim) return;
    state.windOn = on;
    if (on) {
        sim.config.windTunnel = true;
        sim.config.windGain = 1;
        sim.config.windDecay = 0;
        sim.prime();
    } else {
        sim.config.windDecay = SPIN_DOWN_RATE;
    }
    // switching off does not seal the tunnel: the inlet fades out over
    // SPIN_DOWN_S in the frame loop while the ends stay open, so the air still
    // in the box drains away instead of slamming against a closed wall
    el('btn-wind').classList.toggle('on', on);
    el('wind-label').textContent = on ? dict.windOff : dict.windOn;
    setPressed(dirButtons, n => n.dataset.dir === (on ? state.dirKey : 'off'));
    state.lastInteraction = performance.now();
}

function setPaused (paused) {
    if (!sim) return;
    sim.config.paused = paused;
    el('pause-label').textContent = paused ? dict.play : dict.pause;
    // hidden is an IDL attribute of HTMLElement, not of SVGElement - assigning
    // it to an <svg> silently does nothing, so the swap goes through a class
    el('btn-pause').classList.toggle('paused', paused);
    state.lastInteraction = performance.now();
}

el('btn-wind').addEventListener('click', () => setWind(!state.windOn));
el('btn-pause').addEventListener('click', () => setPaused(!sim.config.paused));
el('btn-reset').addEventListener('click', () => { sim.reset(); state.lastInteraction = performance.now(); });
el('btn-undo').addEventListener('click', () => {
    field.undo();
    state.selected = null;
    markObstaclesChanged();
    refreshTrash();
    state.lastInteraction = performance.now();
});
el('btn-clear').addEventListener('click', () => {
    field.clear();
    state.selected = null;
    markObstaclesChanged();
    refreshTrash();
    sceneSelect.value = '';
    state.lastInteraction = performance.now();
});

el('btn-settings').addEventListener('click', () => {
    const panel = el('panel');
    panel.hidden = !panel.hidden;
    state.lastInteraction = performance.now();
});
el('panel-close').addEventListener('click', () => { el('panel').hidden = true; });

const tabButtons = Array.from(document.querySelectorAll('.tab'));
function setHelpTab (id) {
    tabButtons.forEach(b => {
        const on = b.dataset.tab === id;
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        el(b.dataset.tab).hidden = !on;
    });
}
tabButtons.forEach(b => b.addEventListener('click', () => setHelpTab(b.dataset.tab)));

el('btn-help').addEventListener('click', () => {
    setHelpTab('tab-basic');
    el('help').hidden = false;
    el('help').querySelector('.sheet').scrollTop = 0;
});
el('help-close').addEventListener('click', () => { el('help').hidden = true; });
el('help').addEventListener('click', e => { if (e.target.id === 'help') el('help').hidden = true; });

el('btn-fullscreen').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
});

el('btn-lang').addEventListener('click', () => setLanguage(state.lang === 'de' ? 'en' : 'de'));

function setLanguage (lang) {
    state.lang = lang;
    dict = applyLanguage(lang);
    el('btn-lang').textContent = lang === 'de' ? 'EN' : 'DE';
    if (sim) {
        el('wind-label').textContent = state.windOn ? dict.windOff : dict.windOn;
        el('pause-label').textContent = sim.config.paused ? dict.play : dict.pause;
    }
    updateSliderOutputs();
    updateShapeBar();
    updateDockToggle();
    try { localStorage.setItem('wirbeltouch.lang', lang); } catch (e) { /* private mode */ }
}

/* ----------------------------------------------------- dock: collapse, shape */

let dockCollapsed = false;

function setDockCollapsed (collapsed) {
    dockCollapsed = collapsed;
    el('dock-body').hidden = collapsed;
    document.body.classList.toggle('dock-collapsed', collapsed);
    el('dock-toggle').setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    updateDockToggle();
    state.lastInteraction = performance.now();
}

function updateDockToggle () {
    el('dock-toggle-label').textContent = dockCollapsed ? dict.showTools : dict.hideTools;
}

el('dock-toggle').addEventListener('click', () => setDockCollapsed(!dockCollapsed));

function updateShapeBar () {
    const shapeTool = isShapeTool();
    el('shapebar').hidden = !shapeTool;
    if (!shapeTool) return;
    const brush = state.tool === 'brush';
    const input = el('in-dock-size');
    input.min = brush ? '0.5' : '2';
    input.max = brush ? '8' : '30';
    input.step = brush ? '0.25' : '0.5';
    input.value = String(brush ? state.pen : state.size);
    el('dock-size-label').textContent = brush ? dict.penWidth : dict.size;
    el('out-dock-size').textContent = input.value;
    el('rotate-group').hidden = state.tool === 'circle';
    el('out-dock-angle').textContent = Math.round(state.angle) + '°';
}

el('in-dock-size').addEventListener('input', () => {
    const v = parseFloat(el('in-dock-size').value);
    const sel = state.selected;
    if (state.tool === 'brush') {
        state.pen = v;
        if (sel && sel.type === 'brush') { sel.r = v / 100; markObstaclesChanged(); }
    } else {
        state.size = v;
        if (sel && sel.type !== 'brush') { sel.r = v / 100; markObstaclesChanged(); }
    }
    el('out-dock-size').textContent = String(v);
    state.lastInteraction = performance.now();
});

function nudgeAngle (delta) {
    state.angle = wrapAngle(state.angle + delta);
    if (state.selected) {
        state.selected.angle = state.angle;
        markObstaclesChanged();
    }
    el('out-dock-angle').textContent = Math.round(state.angle) + '°';
    state.lastInteraction = performance.now();
}

el('btn-rot-left').addEventListener('click', () => nudgeAngle(ROTATE_STEP));
el('btn-rot-right').addEventListener('click', () => nudgeAngle(-ROTATE_STEP));

function syncShapeControls (shape) {
    if (!shape) return;
    if (shape.type === 'brush') state.pen = shape.r * 100;
    else state.size = shape.r * 100;
    state.angle = shape.angle || 0;
    updateShapeBar();
}

/* ------------------------------------------------------------------ sliders */

function bindSlider (id, apply) {
    const input = el(id);
    input.addEventListener('input', () => {
        apply(parseFloat(input.value));
        updateSliderOutputs();
        state.lastInteraction = performance.now();
    });
}

bindSlider('in-wind', v => { if (sim) sim.config.windSpeed = v; });
bindSlider('in-stripes', v => { if (sim) sim.config.smokeStripes = v; });
bindSlider('in-curl', v => { if (sim) sim.config.CURL = v; });
bindSlider('in-fade', v => { if (sim) sim.config.DENSITY_DISSIPATION = v / 100; });
bindSlider('in-quality', v => {
    state.quality = v;
    if (!sim) return;
    const q = QUALITY[v];
    sim.config.SIM_RESOLUTION = q.sim;
    sim.config.DYE_RESOLUTION = q.dye;
    sim.config.PRESSURE_ITERATIONS = q.iter;
    sim.initFramebuffers();
});

function updateSliderOutputs () {
    el('out-wind').textContent = el('in-wind').value;
    el('out-stripes').textContent = el('in-stripes').value;
    el('out-curl').textContent = el('in-curl').value;
    el('out-fade').textContent = el('in-fade').value;
    const names = [dict.qualityLow, dict.qualityMid, dict.qualityHigh, dict.qualityUltra];
    el('out-quality').textContent = names[parseInt(el('in-quality').value, 10)] || '';
}

/* -------------------------------------------------------------------- hints */

let hintTimer = null;
function showHint (key) {
    hintEl.setAttribute('data-i18n', key);
    hintEl.textContent = dict[key] || '';
    hintEl.classList.add('show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hintEl.classList.remove('show'), 3200);
}

/* ----------------------------------------------------------------- keyboard */

window.addEventListener('keydown', e => {
    if (!sim) return;
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    switch (e.key.toLowerCase()) {
        case ' ': e.preventDefault(); setPaused(!sim.config.paused); break;
        case 'w': setWind(!state.windOn); break;
        case 'c': field.clear(); state.selected = null; markObstaclesChanged(); break;
        case 'r': sim.reset(); break;
        case 'h': el('help').hidden = !el('help').hidden; break;
        case 'q': nudgeAngle(ROTATE_STEP); break;
        case 'e': nudgeAngle(-ROTATE_STEP); break;
        case '1': setView(0); break;
        case '2': setView(1); break;
        case '3': setView(2); break;
        case '4': setView(3); break;
        default: return;
    }
    state.lastInteraction = performance.now();
});

window.addEventListener('resize', () => { state.overlayDirty = true; });

/* --------------------------------------------------------------------- loop */

let lastTime = performance.now();

function frame (now) {
    requestAnimationFrame(frame);
    if (!sim) return;

    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (!isFinite(dt) || dt <= 0) dt = 1 / 60;
    dt = Math.min(dt, 1 / 45);

    if (sizeCanvases()) sim.initFramebuffers();
    sim.syncObstacles();

    // Fan spin-down: the inlet fades while the whole field is slowed uniformly,
    // and only once the air is nearly at rest are the tunnel ends closed - by
    // then there is no momentum left to slosh.
    if (!state.windOn && sim.config.windTunnel) {
        if (sim.config.windGain > 0) {
            sim.config.windGain = Math.max(0, sim.config.windGain - dt / SPIN_DOWN_S);
            state.settle = 0;
        } else {
            // the inlet keeps feeding the field while it fades, so give the
            // slow-down a moment on its own before sealing the ends
            state.settle += dt;
            if (state.settle >= SETTLE_S) {
                sim.config.windDecay = 0;
                sim.config.windTunnel = false;
            }
        }
    }

    if (!sim.config.paused) sim.step(dt);
    sim.render();

    if (state.overlayDirty) {
        field.renderOverlay(octx, overlay.width, overlay.height, null,
            isShapeTool() ? state.selected : null);
        state.overlayDirty = false;
    }

    if (now - state.lastInteraction > IDLE_RESET_MS) {
        state.lastInteraction = now;
        if (document.visibilityState === 'visible') resetToDefaultScene();
    }
}

function resetToDefaultScene () {
    loadPreset(DEFAULT_SCENE);
    setPaused(false);
    setView(0);
    setDirection('right');
    el('panel').hidden = true;
    el('help').hidden = true;
}

/* --------------------------------------------------------------------- boot */

function boot () {
    let stored = null;
    try { stored = localStorage.getItem('wirbeltouch.lang'); } catch (e) { /* ignore */ }
    setLanguage(stored || state.lang);

    setPressed(toolButtons, n => n.dataset.tool === state.tool);
    setPressed(smokeButtons, n => n.dataset.smoke === '0');
    setPressed(viewButtons, n => n.dataset.view === '0');
    setHelpTab('tab-basic');
    setDockCollapsed(window.innerWidth < 720);
    updateShapeBar();

    sizeCanvases();
    if (!sim) return;

    sim.initFramebuffers();
    setMedium('air');
    setDirection('right');
    loadPreset(DEFAULT_SCENE);
    setPaused(false);
    showHint('hintPlace');
    requestAnimationFrame(frame);
}

boot();
