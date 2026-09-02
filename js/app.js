// Wiring: canvas sizing, touch/mouse input, obstacle placement, UI controls.

import { FluidSimulation } from './simulation.js';
import { ObstacleField, makeShape, PRESETS } from './obstacles.js';
import { applyLanguage, STRINGS } from './i18n.js';

const QUALITY = [
    { sim: 128, dye: 512, iter: 24 },
    { sim: 192, dye: 768, iter: 28 },
    { sim: 256, dye: 1024, iter: 32 },
    { sim: 352, dye: 1440, iter: 36 }
];
const MAX_PIXELS = 4.2e6;      // keeps 4K screens and weak GPUs civil
const IDLE_RESET_MS = 4 * 60 * 1000;
const DEFAULT_SCENE = 'cylinder';

const simCanvas = document.getElementById('sim');
const overlay = document.getElementById('overlay');
const octx = overlay.getContext('2d');
const hintEl = document.getElementById('hint');

const field = new ObstacleField();
let sim = null;

const state = {
    lang: (navigator.language || 'de').toLowerCase().startsWith('de') ? 'de' : 'en',
    tool: 'circle',
    size: 11,
    angle: 10,
    quality: 2,
    selected: null,
    overlayDirty: true,
    lastInteraction: performance.now(),
    ghost: null
};

let dict = STRINGS[state.lang];

try {
    sim = new FluidSimulation(simCanvas, field);
} catch (err) {
    console.error(err);
    const fatal = document.getElementById('fatal');
    fatal.hidden = false;
    document.getElementById('fatal-text').textContent = STRINGS[state.lang].noWebGL;
    document.getElementById('fatal-detail').textContent = err.message;
}

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

function localPos (event) {
    const rect = overlay.getBoundingClientRect();
    return {
        x: clamp01((event.clientX - rect.left) / rect.width),
        y: clamp01((event.clientY - rect.top) / rect.height)
    };
}

function clamp01 (v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

function brushRadius () { return Math.max(0.012, state.size / 100 * 0.3); }

function markObstaclesChanged () {
    field.touch();
    state.overlayDirty = true;
}

function onPointerDown (event) {
    if (!sim) return;
    event.preventDefault();
    try { overlay.setPointerCapture(event.pointerId); } catch (e) { /* synthetic events */ }
    state.lastInteraction = performance.now();
    const p = localPos(event);
    const entry = { x: p.x, y: p.y, mode: 'stir', shape: null, grab: { x: 0, y: 0 }, color: randomColor() };

    if (state.tool === 'stir') {
        entry.mode = 'stir';
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
            syncShapeSliders(hit);
        } else if (state.tool === 'brush') {
            const shape = makeShape('brush', p.x, p.y, brushRadius());
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
}

function onPointerMove (event) {
    const entry = pointers.get(event.pointerId);
    if (!entry || !sim) return;
    event.preventDefault();
    state.lastInteraction = performance.now();
    const p = localPos(event);

    if (entry.mode === 'stir') {
        const dx = (p.x - entry.x) * sim.config.SPLAT_FORCE;
        const dy = -(p.y - entry.y) * sim.config.SPLAT_FORCE;
        if (dx !== 0 || dy !== 0) sim.splat(p.x, 1 - p.y, dx, dy, entry.color);
    } else if (entry.mode === 'erase') {
        eraseAt(p);
    } else if (entry.mode === 'move' && entry.shape) {
        entry.shape.x = clamp01(p.x + entry.grab.x);
        entry.shape.y = clamp01(p.y + entry.grab.y);
        markObstaclesChanged();
    } else if (entry.mode === 'brush' && entry.shape) {
        const pts = entry.shape.points;
        const last = pts[pts.length - 1];
        if (Math.hypot(p.x - last.x, p.y - last.y) > 0.004) {
            pts.push({ x: p.x, y: p.y });
            markObstaclesChanged();
        }
    }
    entry.x = p.x;
    entry.y = p.y;
}

function onPointerUp (event) {
    pointers.delete(event.pointerId);
    try {
        if (overlay.hasPointerCapture(event.pointerId)) overlay.releasePointerCapture(event.pointerId);
    } catch (e) { /* ignore */ }
    state.lastInteraction = performance.now();
}

function eraseAt (p) {
    const hit = field.hitTest(octx, p.x, p.y, overlay.width, overlay.height);
    if (hit) {
        if (state.selected === hit) state.selected = null;
        field.remove(hit);
        markObstaclesChanged();
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

const el = id => document.getElementById(id);

function setPressed (nodes, matcher) {
    nodes.forEach(node => node.setAttribute('aria-pressed', matcher(node) ? 'true' : 'false'));
}

const toolButtons = Array.from(document.querySelectorAll('.tool'));
toolButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        state.tool = btn.dataset.tool;
        setPressed(toolButtons, n => n.dataset.tool === state.tool);
        showHint(state.tool === 'stir' ? 'hintStir' : state.tool === 'eraser' ? 'hintErase' : 'hintPlace');
        state.lastInteraction = performance.now();
    });
});

const presetButtons = Array.from(document.querySelectorAll('[data-preset]'));
presetButtons.forEach(btn => {
    btn.addEventListener('click', () => loadPreset(btn.dataset.preset));
});

const viewButtons = Array.from(document.querySelectorAll('[data-view]'));
viewButtons.forEach(btn => {
    btn.addEventListener('click', () => setView(parseInt(btn.dataset.view, 10)));
});

const smokeButtons = Array.from(document.querySelectorAll('[data-smoke]'));
smokeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        if (!sim) return;
        sim.config.smokeMode = parseInt(btn.dataset.smoke, 10);
        setPressed(smokeButtons, n => parseInt(n.dataset.smoke, 10) === sim.config.smokeMode);
        state.lastInteraction = performance.now();
    });
});

function setView (mode) {
    if (!sim) return;
    sim.config.displayMode = mode;
    setPressed(viewButtons, n => parseInt(n.dataset.view, 10) === mode);
    state.lastInteraction = performance.now();
}

function loadPreset (name) {
    if (!sim) return;
    const builder = PRESETS[name] || PRESETS.empty;
    field.set(builder());
    state.selected = null;
    markObstaclesChanged();
    setPressed(presetButtons, n => n.dataset.preset === name);
    sim.reset();
    setWind(true);
    state.lastInteraction = performance.now();
}

function setWind (on) {
    if (!sim) return;
    sim.config.windTunnel = on;
    const btn = el('btn-wind');
    btn.classList.toggle('on', on);
    el('wind-label').textContent = on ? dict.windOff : dict.windOn;
    state.lastInteraction = performance.now();
}

function setPaused (paused) {
    if (!sim) return;
    sim.config.paused = paused;
    el('pause-label').textContent = paused ? dict.play : dict.pause;
    state.lastInteraction = performance.now();
}

el('btn-wind').addEventListener('click', () => setWind(!sim.config.windTunnel));
el('btn-pause').addEventListener('click', () => setPaused(!sim.config.paused));
el('btn-reset').addEventListener('click', () => { sim.reset(); state.lastInteraction = performance.now(); });
el('btn-undo').addEventListener('click', () => {
    field.undo();
    state.selected = null;
    markObstaclesChanged();
    state.lastInteraction = performance.now();
});
el('btn-clear').addEventListener('click', () => {
    field.clear();
    state.selected = null;
    markObstaclesChanged();
    setPressed(presetButtons, () => false);
    state.lastInteraction = performance.now();
});

el('btn-settings').addEventListener('click', () => {
    const panel = el('panel');
    panel.hidden = !panel.hidden;
    state.lastInteraction = performance.now();
});
el('panel-close').addEventListener('click', () => { el('panel').hidden = true; });

el('btn-help').addEventListener('click', () => { el('help').hidden = false; });
el('help-close').addEventListener('click', () => { el('help').hidden = true; });
el('help').addEventListener('click', e => { if (e.target.id === 'help') el('help').hidden = true; });

el('btn-fullscreen').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
});

el('btn-lang').addEventListener('click', () => {
    setLanguage(state.lang === 'de' ? 'en' : 'de');
});

function setLanguage (lang) {
    state.lang = lang;
    dict = applyLanguage(lang);
    el('btn-lang').textContent = lang === 'de' ? 'EN' : 'DE';
    if (sim) {
        el('wind-label').textContent = sim.config.windTunnel ? dict.windOff : dict.windOn;
        el('pause-label').textContent = sim.config.paused ? dict.play : dict.pause;
    }
    updateSliderOutputs();
    try { localStorage.setItem('wirbeltouch.lang', lang); } catch (e) { /* private mode */ }
}

/* ------------------------------------------------------------------ sliders */

function bindSlider (id, apply) {
    const input = el(id);
    const handler = () => {
        apply(parseFloat(input.value));
        updateSliderOutputs();
        state.lastInteraction = performance.now();
    };
    input.addEventListener('input', handler);
    return input;
}

bindSlider('in-wind', v => { if (sim) sim.config.windSpeed = v; });
bindSlider('in-size', v => {
    state.size = v;
    if (state.selected) {
        state.selected.r = state.selected.type === 'brush' ? brushRadius() : v / 100;
        markObstaclesChanged();
    }
});
bindSlider('in-angle', v => {
    state.angle = v;
    if (state.selected && state.selected.type !== 'brush' && state.selected.type !== 'circle') {
        state.selected.angle = v;
        markObstaclesChanged();
    }
});
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

function syncShapeSliders (shape) {
    if (!shape) return;
    if (shape.type !== 'brush') {
        el('in-size').value = String(Math.round(shape.r * 1000) / 10);
        state.size = shape.r * 100;
    }
    el('in-angle').value = String(shape.angle || 0);
    state.angle = shape.angle || 0;
    updateSliderOutputs();
}

function updateSliderOutputs () {
    el('out-wind').textContent = el('in-wind').value;
    el('out-size').textContent = el('in-size').value;
    el('out-angle').textContent = el('in-angle').value + '°';
    el('out-stripes').textContent = el('in-stripes').value;
    el('out-curl').textContent = el('in-curl').value;
    el('out-fade').textContent = el('in-fade').value;
    const qualityNames = [dict.qualityLow, dict.qualityMid, dict.qualityHigh, dict.qualityUltra];
    el('out-quality').textContent = qualityNames[parseInt(el('in-quality').value, 10)] || '';
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
        case 'w': setWind(!sim.config.windTunnel); break;
        case 'c': field.clear(); state.selected = null; markObstaclesChanged(); break;
        case 'r': sim.reset(); break;
        case 'h': el('help').hidden = !el('help').hidden; break;
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

    if (!sim.config.paused) sim.step(dt);
    sim.render();

    if (state.overlayDirty) {
        field.renderOverlay(octx, overlay.width, overlay.height, state.ghost);
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

    sizeCanvases();
    if (!sim) return;

    sim.initFramebuffers();
    loadPreset(DEFAULT_SCENE);
    setPaused(false);
    showHint('hintPlace');
    requestAnimationFrame(frame);
}

boot();
