// SCAPE° theme, after the corporate design by Bureau Mitte: Founders Grotesk,
// flat colour fields with hard edges, strong tones always set against pastels,
// black text. The simulation itself follows the documented combination
// "orange / yellow / cream / navy, shapes in green": warm smoke on a cream
// tunnel, obstacles as flat green shapes.

import { STRINGS } from '../shared/strings.js';
import { ICONS, VIEWBOX } from '../shared/icons.js';

// The palette colours in use - the same values as the custom properties in
// theme.css.
const C = {
    black: '#000000',
    white: '#FFFFFF',
    cream: '#F2E4BA',
    yellowPastel: '#FFF487',
    yellowPale: '#FDF6B7',
    yellow: '#FFD500',
    orange: '#EE7518',
    red: '#E41513',
    purple: '#442683',
    navy: '#28348B',
    cyan: '#0097BE',
    green: '#62BA91',
    greenStrong: '#00983A'
};

const CLAIM = 'Wetter, Klima, Wandel. Wir erklären es.';

const strings = {
    de: Object.assign({}, STRINGS.de, {
        docTitle: 'WirbelTouch – Strömung zum Anfassen · SCAPE°',
        helpTitle: 'Wie funktioniert das?',
        helpFooter: CLAIM
    }),
    en: Object.assign({}, STRINGS.en, {
        docTitle: 'WirbelTouch – flow you can touch · SCAPE°',
        helpTitle: 'How does it work?',
        helpFooter: CLAIM          // the claim stays German: brand language
    })
};

// Obstacle tools are shown as the solid shapes they place; sharp corners, as
// the system has no rounded rectangles.
const icons = Object.assign({}, ICONS, {
    square: '<rect x="5" y="5" width="14" height="14"/>',
    plate: '<rect x="3.5" y="10.4" width="17" height="3.2" transform="rotate(-25 12 12)"/>'
});

export default {
    stylesheet: 'theme.css',
    themeColor: C.cream,
    // short mark S° for small surfaces; black on a pastel field
    favicon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#FFF487"/><text x="16" y="23.5" text-anchor="middle" font-family="Founders Grotesk, Helvetica Neue, Arial, sans-serif" font-size="20" fill="#000">S°</text></svg>',
    // wordmark with its subtitle spread over the full width
    brandMark: '<div class="logo" role="img" aria-label="SCAPE° – Wetter Klima Mensch">' +
        '<span class="logo-word">SCAPE°</span>' +
        '<span class="logo-sub"><span>Wetter</span><span>Klima</span><span>Mensch</span></span>' +
        '</div>',
    icons,
    iconViewBox: VIEWBOX,
    strings,

    canvas: {
        background: C.cream,
        solid: C.green
    },
    // pairs of neighbouring hues, so the blend across the inlet stays clean
    // (navy into orange would pass through a muddy brown)
    smoke: {
        air: [C.red, C.orange],
        water: [C.navy, C.cyan]
    },
    // the chimney's smoke and the trace of a fan's jet: set apart from the
    // warm inlet smoke
    deviceSmoke: C.navy,
    stir: [C.orange, C.navy, C.cyan, C.red, C.purple, C.greenStrong],
    colormaps: {
        // pale to strong, light to dark: still to fast
        speed: [C.yellowPale, C.yellow, C.orange, C.red, C.purple],
        // clockwise / low pressure, nothing, anticlockwise / high pressure
        diverging: [C.cyan, C.cream, C.orange]
    },

    // flat, single colour, no outline, no shadow
    obstacle: {
        fill: C.green,
        edge: null,
        shadow: null
    },
    // the working parts of fans, rotors and vents
    device: {
        color: C.navy,
        accent: C.white
    },
    // a thin black line held off the shape, like the outline layer of the
    // graphic system
    selection: {
        color: C.black,
        glow: null,
        width: 0.0032,
        minWidth: 2,
        gap: 0.0045,
        gapColor: C.cream
    }
};
