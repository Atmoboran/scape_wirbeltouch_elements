// Loads the design. Everything that makes up the look and the copy - colours,
// fonts, icons, logo, texts - lives in a theme folder under themes/, so the
// exhibit can be shipped in another corporate design by swapping that folder.
//
// Which theme: ?theme=<name> in the URL, else the <meta name="wirbeltouch-theme">
// in index.html, else "classic". See themes/README.md for what a theme provides.

const FALLBACK = 'classic';

export async function loadTheme () {
    const meta = document.querySelector('meta[name="wirbeltouch-theme"]');
    const requested = new URLSearchParams(location.search).get('theme');
    const candidates = [requested, meta && meta.content, FALLBACK]
        .filter(n => n && /^[\w-]+$/.test(n));

    let theme = null;
    let base = null;
    for (const name of new Set(candidates)) {
        try {
            base = new URL('../themes/' + name + '/', import.meta.url);
            const mod = await import(new URL('theme.js', base).href);
            theme = Object.assign({}, mod.default, { name });
            check(theme);
            break;
        } catch (err) {
            console.warn('Theme "' + name + '" could not be loaded:', err);
            theme = null;
        }
    }
    if (!theme) {
        document.documentElement.classList.add('themed');
        throw new Error('No theme could be loaded.');
    }

    await addStylesheet(new URL(theme.stylesheet || 'theme.css', base).href);
    applyChrome(theme);
    theme.gl = toGL(theme);
    document.documentElement.dataset.theme = theme.name;
    // settle the themed styles while transitions are still off, otherwise
    // every button animates in from the browser's default look
    void document.body.offsetWidth;
    document.documentElement.classList.add('themed');
    return theme;
}

// Fills the legend swatches (<span data-swatch="speed.0">) from the colour
// maps, so the explanations always show the colours actually on screen.
export function paintSwatches (theme) {
    document.querySelectorAll('[data-swatch]').forEach(el => {
        const [map, index] = el.getAttribute('data-swatch').split('.');
        const list = theme.colormaps[map];
        if (list && list[index]) el.style.background = list[index];
    });
}

export function hexToRGB (hex) {
    let h = String(hex).trim().replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    if (h.length !== 6 || isNaN(n)) throw new Error('Not a #rrggbb colour: ' + hex);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

function check (t) {
    const need = ['strings', 'icons', 'canvas', 'colormaps', 'smoke', 'obstacle', 'selection'];
    const missing = need.filter(k => !t[k]);
    if (missing.length) throw new Error('theme lacks ' + missing.join(', '));
    if (!t.colormaps.speed || t.colormaps.speed.length !== 5) {
        throw new Error('colormaps.speed needs exactly 5 colours');
    }
    if (!t.colormaps.diverging || t.colormaps.diverging.length !== 3) {
        throw new Error('colormaps.diverging needs exactly 3 colours');
    }
}

function addStylesheet (href) {
    return new Promise(resolve => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.onload = resolve;
        link.onerror = () => { console.warn('Theme stylesheet failed: ' + href); resolve(); };
        document.head.appendChild(link);
    });
}

// Icons, logo, favicon and browser colour.
function applyChrome (theme) {
    const viewBox = theme.iconViewBox || '0 0 24 24';
    document.querySelectorAll('svg[data-icon]').forEach(svg => {
        const body = theme.icons[svg.getAttribute('data-icon')];
        if (body === undefined) return;
        svg.setAttribute('viewBox', viewBox);
        svg.setAttribute('aria-hidden', 'true');
        svg.innerHTML = body;
    });

    const mark = document.getElementById('brand-mark');
    if (mark) {
        mark.innerHTML = theme.brandMark || '';
        mark.hidden = !theme.brandMark;
    }

    if (theme.themeColor) {
        let meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) {
            meta = document.createElement('meta');
            meta.name = 'theme-color';
            document.head.appendChild(meta);
        }
        meta.content = theme.themeColor;
    }

    if (theme.favicon) {
        const link = document.createElement('link');
        link.rel = 'icon';
        link.href = 'data:image/svg+xml,' + encodeURIComponent(theme.favicon);
        document.head.appendChild(link);
    }
}

// The canvas and the WebGL passes want colours as 0..1 float triples.
function toGL (theme) {
    const smoke = {};
    for (const key of Object.keys(theme.smoke)) smoke[key] = theme.smoke[key].map(hexToRGB);
    return {
        background: hexToRGB(theme.canvas.background),
        solid: hexToRGB(theme.canvas.solid),
        speed: theme.colormaps.speed.map(hexToRGB),
        diverging: theme.colormaps.diverging.map(hexToRGB),
        smoke,
        stir: theme.stir && theme.stir.length ? theme.stir.map(hexToRGB) : null,
        deviceSmoke: hexToRGB(theme.deviceSmoke || '#4d4d4d')
    };
}
