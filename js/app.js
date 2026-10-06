// Wiring: canvas sizing, touch/mouse input, obstacle placement, UI controls.
// The look and the copy come from the theme (js/theme.js, themes/<name>/).
//
// How the hand works: by default a finger is in the air - swiping stirs it,
// tapping an obstacle selects it, dragging moves it. A tool from the palette
// is "armed" by a tap; the next tap into the picture places one, and the hand
// is back. The selected obstacle shows its settings in the inspector; a tap
// on empty space lets go of it.

import { FluidSimulation } from './simulation.js';
import { ObstacleField, makeShape, PRESETS, centroid, ROTATABLE, DEVICES } from './obstacles.js';
import { applyLanguage } from './i18n.js';
import { loadTheme, paintSwatches } from './theme.js';

const theme = await loadTheme();
const STRINGS = theme.strings;
const LANGS = Object.keys(STRINGS);

const QUALITY = [
    { sim: 128, dye: 512, iter: 24 },
    { sim: 192, dye: 768, iter: 28 },
    { sim: 256, dye: 1024, iter: 32 },
    { sim: 352, dye: 1440, iter: 36 }
];

// Two settings for the two media people know. Both solve the same equations -
// what changes is the regime: wind around a building sits at a far higher
// Reynolds number than a slow water flume, so it is choppier and less orderly.
// The smoke colours of each medium come from the theme.
const MEDIA = {
    air: {
        windSpeed: 50,
        VELOCITY_DISSIPATION: 0.09,
        CURL: 6,
        DENSITY_DISSIPATION: 0.12,
        smokeStripes: 24,
        inflowWobble: 0.015
    },
    water: {
        windSpeed: 30,
        VELOCITY_DISSIPATION: 0.16,
        CURL: 3,
        DENSITY_DISSIPATION: 0.10,
        smokeStripes: 14,
        inflowWobble: 0.010
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
const DEFAULT_SIZE = 7;        // new obstacles: radius, per cent of the short side
const DEFAULT_PEN = 2;         // freehand pen half width, per cent of the short side
const DEFAULT_QUALITY = 2;
const ROTATE_STEP = 15;
const CONFIRM_MS = 3000;       // the start-over button waits this long for a second tap
const SPIN_DOWN_S = 1.6;       // how long the fan takes to run out
const SPIN_DOWN_RATE = 2.6;    // 1/s, uniform slow-down over that time
const SETTLE_S = 0.7;          // keep slowing after the fan is off, so almost
                               // no momentum is left when the ends close

const simCanvas = document.getElementById('sim');
const overlay = document.getElementById('overlay');
const octx = overlay.getContext('2d');
const hintEl = document.getElementById('hint');

const field = new ObstacleField({ obstacle: theme.obstacle, device: theme.device, selection: theme.selection });
let sim = null;

const browserLang = (navigator.language || '').toLowerCase().slice(0, 2);

const state = {
    lang: STRINGS[browserLang] ? browserLang : LANGS[0],
    armed: null,       // the palette tool the next tap places, or null: the hand
    selected: null,    // the obstacle the inspector acts on
    size: DEFAULT_SIZE,
    pen: DEFAULT_PEN,
    quality: DEFAULT_QUALITY,
    medium: 'air',
    dirKey: 'right',
    windOn: false,
    settle: 0,
    overlayDirty: true,
    lastInteraction: performance.now()
};

// string keys naming each kind of obstacle
const TYPE_LABEL = {
    circle: 'toolCircle',
    square: 'toolSquare',
    box: 'toolSquare',
    plate: 'toolPlate',
    airfoil: 'toolAirfoil',
    hill: 'toolHill',
    brush: 'toolBrush',
    fan: 'toolFan',
    rotor: 'toolRotor',
    sink: 'toolSink',
    chimney: 'toolChimney'
};

// what a device does, said once when it is placed
const DEVICE_HINTS = {
    fan: 'hintFan',
    rotor: 'hintRotor',
    sink: 'hintSink',
    chimney: 'hintChimney'
};

let dict = STRINGS[state.lang];

try {
    sim = new FluidSimulation(simCanvas, field, {
        deviceSmokeColor: theme.gl.deviceSmoke,
        backgroundColor: theme.gl.background,
        solidColor: theme.gl.solid,
        speedColormap: theme.gl.speed,
        divergingColormap: theme.gl.diverging
    });
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

function touched () {
    state.lastInteraction = performance.now();
}

function markObstaclesChanged () {
    field.touch();
    state.overlayDirty = true;
}

function hitAt (p) {
    return field.hitTest(octx, p.x, p.y, overlay.width, overlay.height);
}

/* ------------------------------------------------------- drag to the bin */

const trashEl = document.getElementById('trash');
let trashHintShown = false;

// The bin shows up while an obstacle is being dragged: drop it there to
// delete it.
function refreshTrash () {
    let dragging = false;
    pointers.forEach(e => { if (draggingShape(e.mode)) dragging = true; });
    if (dragging) {
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
    select(null);
    markObstaclesChanged();
    if (sim) sim.kick();
    refreshTrash();
    touched();
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
    touched();
    const p = localPos(event);
    const entry = { x: p.x, y: p.y, mode: 'stir', shape: null, grab: { x: 0, y: 0 }, color: randomColor() };

    // A second finger on an obstacle, or while the first one holds one, turns
    // the touch into a rotate / resize gesture.
    if (pointers.size > 0) {
        const others = Array.from(pointers.values());
        const anchor = others[others.length - 1];
        const target = hitAt(p) || anchor.shape;
        if (target) {
            entry.mode = 'gesture';
            entry.shape = target;
            anchor.mode = 'gesture';
            anchor.shape = target;
            select(target);
            refreshTrash();
            startGesture(target, anchor, p);
            pointers.set(event.pointerId, entry);
            showHint('hintRotate');
            return;
        }
    }

    if (state.armed) {
        // a tool from the palette is waiting: this tap places it, at 0°
        const type = state.armed;
        let shape;
        if (type === 'brush') {
            shape = makeShape('brush', p.x, p.y, state.pen / 100, 0);
            shape.points = [{ x: p.x, y: p.y }];
            entry.mode = 'brush';
        } else {
            shape = makeShape(type, p.x, p.y, state.size / 100, 0);
            entry.mode = 'move';
        }
        field.add(shape);
        entry.shape = shape;
        setArmed(null);
        select(shape);
        markObstaclesChanged();
        if (DEVICE_HINTS[type]) showHint(DEVICE_HINTS[type]);
    } else {
        const hit = hitAt(p);
        if (hit) {
            entry.mode = 'move';
            entry.shape = hit;
            entry.grab = { x: hit.x - p.x, y: hit.y - p.y };
            select(hit);
        } else {
            // empty space: let go of the selection and stir the air
            select(null);
            sim.splat(p.x, 1 - p.y, 0, 0, entry.color);
        }
    }
    pointers.set(event.pointerId, entry);
    refreshTrash();
}

function onPointerMove (event) {
    const entry = pointers.get(event.pointerId);
    if (!entry || !sim) return;
    event.preventDefault();
    touched();
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
        if (state.selected === entry.shape) select(null);
        field.remove(entry.shape);
        markObstaclesChanged();
    }
    // an obstacle put down somewhere new: nudge the inflow, so a symmetric
    // wake gets going
    if (entry && entry.shape && entry.mode !== 'stir' && sim) sim.kick();

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
    touched();
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
    // screen y points down: atan2 grows clockwise, as the shape's angle does
    const deltaDeg = (Math.atan2(v.dy, v.dx) - gesture.ang0) * 180 / Math.PI;
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
    syncInspector();
}

function wrapAngle (deg) {
    let a = deg % 360;
    if (a > 180) a -= 360;
    if (a < -180) a += 360;
    return a;
}

// Dye for one stir stroke: a colour from the theme's stir palette, or a random
// hue if it has none. Premultiplied, a quarter coverage per splat.
function randomColor () {
    const palette = theme.gl.stir;
    const c = palette
        ? palette[Math.floor(Math.random() * palette.length)]
        : HSVtoRGB(Math.random(), 0.85, 1.0);
    return [c[0] * 0.25, c[1] * 0.25, c[2] * 0.25, 0.25];
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

// The palette: a tap arms a tool, a second tap on it puts it away again.
const toolButtons = Array.from(document.querySelectorAll('#tools .tool'));
toolButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        setArmed(state.armed === btn.dataset.tool ? null : btn.dataset.tool);
        touched();
    });
});

function setArmed (type) {
    state.armed = type || null;
    setPressed(toolButtons, n => n.dataset.tool === state.armed);
    document.body.classList.toggle('placing', !!state.armed);
    if (state.armed) {
        select(null);
        showHint('hintArm', { tool: dict[TYPE_LABEL[state.armed]] || '' });
    }
}

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
        touched();
    });
});

document.querySelectorAll('.info').forEach(btn => {
    btn.addEventListener('click', () => {
        const box = el(btn.dataset.info);
        if (!box) return;
        box.hidden = !box.hidden;
        btn.setAttribute('aria-pressed', box.hidden ? 'false' : 'true');
        touched();
    });
});

function setView (mode) {
    if (!sim) return;
    sim.config.displayMode = mode;
    setPressed(viewButtons, n => parseInt(n.dataset.view, 10) === mode);
    touched();
}

function setMedium (key) {
    const preset = MEDIA[key];
    if (!preset || !sim) return;
    state.medium = key;
    Object.assign(sim.config, preset);
    const smoke = theme.gl.smoke[key];
    if (smoke) {
        sim.config.smokeColorA = smoke[0];
        sim.config.smokeColorB = smoke[smoke.length - 1];
    }
    setPressed(mediumButtons, n => n.dataset.medium === key);
    el('in-wind').value = String(preset.windSpeed);
    el('in-curl').value = String(preset.CURL);
    el('in-stripes').value = String(preset.smokeStripes);
    el('in-fade').value = String(Math.round(preset.DENSITY_DISSIPATION * 100));
    updateSliderOutputs();
    touched();
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
    touched();
}

function loadPreset (name) {
    if (!sim) return;
    const builder = PRESETS[name] || PRESETS.empty;
    field.set(builder(overlay.width / Math.max(1, overlay.height)));
    select(null);
    markObstaclesChanged();
    refreshTrash();
    sceneSelect.value = name;
    sim.reset();
    setWind(true);
    touched();
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
    el('btn-wind').setAttribute('aria-pressed', on ? 'true' : 'false');
    el('wind-state').textContent = on ? dict.switchOn : dict.switchOff;
    setPressed(dirButtons, n => n.dataset.dir === (on ? state.dirKey : 'off'));
    touched();
}

function setPaused (paused) {
    if (!sim) return;
    sim.config.paused = paused;
    el('pause-label').textContent = paused ? dict.play : dict.pause;
    // hidden is an IDL attribute of HTMLElement, not of SVGElement - assigning
    // it to an <svg> silently does nothing, so the swap goes through a class
    el('btn-pause').classList.toggle('paused', paused);
    touched();
}

el('btn-wind').addEventListener('click', () => setWind(!state.windOn));
el('btn-pause').addEventListener('click', () => setPaused(!sim.config.paused));
el('btn-reset').addEventListener('click', () => { sim.reset(); touched(); });
el('btn-undo').addEventListener('click', () => {
    field.undo();
    select(null);
    markObstaclesChanged();
    refreshTrash();
    touched();
});
el('btn-clear').addEventListener('click', clearPicture);

function clearPicture () {
    field.clear();
    select(null);
    markObstaclesChanged();
    refreshTrash();
    sceneSelect.value = '';
    touched();
}

// Start over asks once: the first tap turns the button into "sure?", a
// second one within CONFIRM_MS resets everything.
let confirmUntil = 0;
let confirmTimer = null;
el('btn-reset-all').addEventListener('click', () => {
    if (performance.now() < confirmUntil) {
        endConfirm();
        resetAll();
        return;
    }
    confirmUntil = performance.now() + CONFIRM_MS;
    el('btn-reset-all').classList.add('confirm');
    el('reset-all-label').textContent = dict.resetConfirm;
    showHint('resetConfirmHint');
    clearTimeout(confirmTimer);
    confirmTimer = setTimeout(endConfirm, CONFIRM_MS);
    touched();
});

function endConfirm () {
    confirmUntil = 0;
    clearTimeout(confirmTimer);
    el('btn-reset-all').classList.remove('confirm');
    el('reset-all-label').textContent = dict.resetAll;
}

el('btn-settings').addEventListener('click', () => {
    const panel = el('panel');
    panel.hidden = !panel.hidden;
    touched();
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

el('btn-lang').addEventListener('click', () => {
    setLanguage(LANGS[(LANGS.indexOf(state.lang) + 1) % LANGS.length]);
});

function setLanguage (lang) {
    state.lang = lang;
    dict = applyLanguage(STRINGS, lang);
    paintSwatches(theme);
    el('btn-lang').hidden = LANGS.length < 2;
    if (sim) {
        el('wind-state').textContent = state.windOn ? dict.switchOn : dict.switchOff;
        el('pause-label').textContent = sim.config.paused ? dict.play : dict.pause;
    }
    updateSliderOutputs();
    renderInspector();
    updateDockToggle();
    endConfirm();
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
    touched();
}

function updateDockToggle () {
    el('dock-toggle-label').textContent = dockCollapsed ? dict.showTools : dict.hideTools;
}

el('dock-toggle').addEventListener('click', () => setDockCollapsed(!dockCollapsed));

/* --------------------------------------------------------------- inspector */

// Settings of the selected obstacle: size, angle, and for a device whatever
// its entry in DEVICES lists.
function select (shape) {
    if (state.selected === shape) return;
    state.selected = shape || null;
    state.overlayDirty = true;
    renderInspector();
}

const fmt = v => String(Math.round(v * 10) / 10);

function renderInspector () {
    const s = state.selected;
    el('inspector').hidden = !s;
    if (!s) return;
    el('insp-title').textContent = dict[TYPE_LABEL[s.type]] || '';
    const brush = s.type === 'brush';
    const input = el('in-size');
    input.min = brush ? '0.5' : '2';
    input.max = brush ? '8' : '30';
    input.step = brush ? '0.25' : '0.5';
    el('insp-size-label').textContent = brush ? dict.penWidth : dict.size;
    el('rotate-group').hidden = ROTATABLE.indexOf(s.type) < 0;
    buildParams(s);
    syncInspector();
}

// values only, e.g. while two fingers turn the shape
function syncInspector () {
    const s = state.selected;
    if (!s) return;
    el('in-size').value = String(s.r * 100);
    el('out-size').textContent = fmt(s.r * 100);
    const angle = el('in-angle');
    if (document.activeElement !== angle) angle.value = String(Math.round(s.angle || 0));
}

function buildParams (s) {
    const box = el('insp-params');
    box.textContent = '';
    const spec = DEVICES[s.type];
    box.hidden = !spec;
    if (!spec) return;
    for (const p of spec.params) {
        const row = document.createElement('div');
        row.className = 'param';
        row.dataset.param = p.key;
        const label = document.createElement('span');
        label.className = 'param-label';
        label.textContent = dict[p.label] || p.key;
        row.appendChild(label);
        if (p.kind === 'range') {
            const input = document.createElement('input');
            input.type = 'range';
            input.min = String(p.min);
            input.max = String(p.max);
            input.step = String(p.step);
            input.value = String(s[p.key]);
            input.setAttribute('aria-label', label.textContent);
            const out = document.createElement('output');
            const show = () => { out.textContent = fmt(s[p.key]) + (p.unit || ''); };
            input.addEventListener('input', () => {
                s[p.key] = parseFloat(input.value);
                show();
                refreshParams();
                touched();
            });
            show();
            row.append(input, out);
        } else if (p.kind === 'choice') {
            const group = document.createElement('div');
            group.className = 'segmented';
            group.setAttribute('role', 'group');
            group.setAttribute('aria-label', label.textContent);
            for (const [value, key] of p.options) {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'seg';
                b.textContent = dict[key] || String(value);
                b.setAttribute('aria-pressed', s[p.key] === value ? 'true' : 'false');
                b.addEventListener('click', () => {
                    s[p.key] = value;
                    group.querySelectorAll('.seg').forEach(x => {
                        x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
                    });
                    refreshParams();
                    state.overlayDirty = true;
                    touched();
                });
                group.appendChild(b);
            }
            row.appendChild(group);
        }
        box.appendChild(row);
    }
    refreshParams();
}

// settings that only matter in some modes, e.g. the interval of a pulsed fan
function refreshParams () {
    const s = state.selected;
    const spec = s && DEVICES[s.type];
    if (!spec) return;
    for (const p of spec.params) {
        const row = el('insp-params').querySelector('[data-param="' + p.key + '"]');
        if (row) row.hidden = p.when ? !p.when(s) : false;
    }
}

el('in-size').addEventListener('input', () => {
    const s = state.selected;
    if (!s) return;
    const v = parseFloat(el('in-size').value);
    s.r = v / 100;
    // the next obstacle of the kind comes out the same size
    if (s.type === 'brush') state.pen = v; else state.size = v;
    el('out-size').textContent = fmt(v);
    markObstaclesChanged();
    touched();
});

function setAngle (deg) {
    const s = state.selected;
    if (!s || !isFinite(deg)) return;
    s.angle = wrapAngle(deg);
    markObstaclesChanged();
    syncInspector();
    touched();
}

function nudgeAngle (delta) {
    if (!state.selected || ROTATABLE.indexOf(state.selected.type) < 0) return;
    setAngle(Math.round((state.selected.angle || 0) + delta));
}

// angles count clockwise: turning left takes them down
el('btn-rot-left').addEventListener('click', () => nudgeAngle(-ROTATE_STEP));
el('btn-rot-right').addEventListener('click', () => nudgeAngle(ROTATE_STEP));

// the angle can be typed in to the degree
const angleInput = el('in-angle');
angleInput.addEventListener('focus', () => angleInput.select());
angleInput.addEventListener('input', () => {
    const v = parseFloat(angleInput.value);
    if (!state.selected || !isFinite(v)) return;
    state.selected.angle = wrapAngle(v);
    markObstaclesChanged();
    touched();
});
angleInput.addEventListener('change', () => {
    angleInput.value = String(Math.round(state.selected ? state.selected.angle || 0 : 0));
});
angleInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === 'Escape') angleInput.blur();
});

el('btn-delete').addEventListener('click', deleteSelected);
el('btn-done').addEventListener('click', () => { select(null); touched(); });

/* ------------------------------------------------------------------ sliders */

function bindSlider (id, apply) {
    const input = el(id);
    input.addEventListener('input', () => {
        apply(parseFloat(input.value));
        updateSliderOutputs();
        touched();
    });
}

bindSlider('in-wind', v => { if (sim) sim.config.windSpeed = v; });
bindSlider('in-stripes', v => { if (sim) sim.config.smokeStripes = v; });
bindSlider('in-curl', v => { if (sim) sim.config.CURL = v; });
bindSlider('in-fade', v => { if (sim) sim.config.DENSITY_DISSIPATION = v / 100; });
bindSlider('in-quality', setQuality);

function setQuality (v) {
    state.quality = v;
    el('in-quality').value = String(v);
    if (!sim) return;
    const q = QUALITY[v];
    sim.config.SIM_RESOLUTION = q.sim;
    sim.config.DYE_RESOLUTION = q.dye;
    sim.config.PRESSURE_ITERATIONS = q.iter;
    sim.initFramebuffers();
}

function updateSliderOutputs () {
    el('out-wind').textContent = el('in-wind').value;
    el('out-stripes').textContent = el('in-stripes').value;
    el('out-curl').textContent = el('in-curl').value;
    el('out-fade').textContent = el('in-fade').value;
    const names = [dict.qualityLow, dict.qualityMid, dict.qualityHigh, dict.qualityUltra];
    el('out-quality').textContent = names[parseInt(el('in-quality').value, 10)] || '';
}

// Publishes the dock's height as --dock-height, so a theme can keep the hint
// and the bin clear of the dock whatever its layout.
function trackDockHeight () {
    const dock = el('dock');
    const publish = () => {
        document.documentElement.style.setProperty('--dock-height', dock.offsetHeight + 'px');
    };
    publish();
    if (window.ResizeObserver) new ResizeObserver(publish).observe(dock);
}

/* -------------------------------------------------------------------- hints */

let hintTimer = null;
// vars fill in {name} placeholders, e.g. the tool that is about to be placed
function showHint (key, vars) {
    let text = dict[key] || '';
    if (vars) {
        text = text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
        hintEl.removeAttribute('data-i18n');    // a language switch cannot redo the fill-in
    } else {
        hintEl.setAttribute('data-i18n', key);
    }
    hintEl.textContent = text;
    hintEl.classList.add('show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hintEl.classList.remove('show'), 3200);
}

/* ----------------------------------------------------------------- keyboard */

window.addEventListener('keydown', e => {
    if (!sim) return;
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    switch (e.key.toLowerCase()) {
        case ' ': e.preventDefault(); setPaused(!sim.config.paused); break;
        case 'w': setWind(!state.windOn); break;
        case 'c': clearPicture(); break;
        case 'r': sim.reset(); break;
        case 'h': el('help').hidden = !el('help').hidden; break;
        case 'q': nudgeAngle(-ROTATE_STEP); break;
        case 'e': nudgeAngle(ROTATE_STEP); break;
        case 'delete':
        case 'backspace': deleteSelected(); break;
        case 'escape': setArmed(null); select(null); break;
        case '1': setView(0); break;
        case '2': setView(1); break;
        case '3': setView(2); break;
        case '4': setView(3); break;
        default: return;
    }
    touched();
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

    if (!sim.config.paused) {
        sim.step(dt);
        field.advance(dt, sim.time);
    }
    sim.render();

    // fan blades and rotors turn, so with a device in the picture the
    // overlay is redrawn every frame
    if (state.overlayDirty || (field.hasDevices() && !sim.config.paused)) {
        field.renderOverlay(octx, overlay.width, overlay.height, null, state.selected);
        state.overlayDirty = false;
    }

    if (now - state.lastInteraction > IDLE_RESET_MS) {
        state.lastInteraction = now;
        if (document.visibilityState === 'visible') resetAll();
    }
}

// Start over: the default scene with every setting as it was at the start.
// The language stays - it belongs to whoever is standing at the exhibit.
// Also what happens after IDLE_RESET_MS without anyone touching it.
function resetAll () {
    if (!sim) return;
    setArmed(null);
    select(null);
    state.size = DEFAULT_SIZE;
    state.pen = DEFAULT_PEN;
    if (state.quality !== DEFAULT_QUALITY) setQuality(DEFAULT_QUALITY);
    setMedium('air');
    sim.config.smokeMode = 0;
    setPressed(smokeButtons, n => n.dataset.smoke === '0');
    setView(0);
    setPaused(false);
    setDirection('right');
    loadPreset(DEFAULT_SCENE);
    el('panel').hidden = true;
    el('help').hidden = true;
    document.querySelectorAll('.infobox').forEach(box => { box.hidden = true; });
    document.querySelectorAll('.info').forEach(btn => btn.setAttribute('aria-pressed', 'false'));
    showHint('hintHand');
}

/* --------------------------------------------------------------------- boot */

function boot () {
    let stored = null;
    try { stored = localStorage.getItem('wirbeltouch.lang'); } catch (e) { /* ignore */ }
    setLanguage(STRINGS[stored] ? stored : state.lang);

    setArmed(null);
    setPressed(smokeButtons, n => n.dataset.smoke === '0');
    setPressed(viewButtons, n => n.dataset.view === '0');
    setHelpTab('tab-basic');
    setDockCollapsed(window.innerWidth < 720);
    renderInspector();
    trackDockHeight();

    sizeCanvases();
    if (!sim) return;

    sim.initFramebuffers();
    setMedium('air');
    setDirection('right');
    loadPreset(DEFAULT_SCENE);
    setPaused(false);
    showHint('hintHand');
    requestAnimationFrame(frame);
}

boot();
