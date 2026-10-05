// Classic theme: the original dark exhibit look - glassy panels, sky blue
// accent, light smoke on a black tunnel.

import { STRINGS } from '../shared/strings.js';
import { ICONS, VIEWBOX } from '../shared/icons.js';

export default {
    stylesheet: 'theme.css',
    themeColor: '#0a0f1a',
    favicon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#0a0f1a"/><path d="M4 12h12a5 5 0 1 1 5 5" stroke="#59d2ff" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M4 20h9" stroke="#ff8c42" stroke-width="2.5" stroke-linecap="round"/></svg>',
    brandMark: '',
    icons: ICONS,
    iconViewBox: VIEWBOX,
    strings: STRINGS,

    // simulation picture
    canvas: {
        background: '#000000',      // where there is no smoke
        solid: '#000000'            // inside obstacles, under the overlay
    },
    smoke: {                        // inlet colour across the stream, A -> B
        air: ['#e0ebff', '#ffb36b'],
        water: ['#4de0f2', '#476bfa']
    },
    stir: null,                     // null: a random hue per stroke
    colormaps: {
        speed: ['#050d24', '#175c8c', '#33b89e', '#f5d452', '#fa6b3d'],     // slow -> fast
        diverging: ['#61b8ff', '#0a0f1a', '#ff7347']                         // negative, zero, positive
    },

    // obstacles drawn on the overlay canvas
    obstacle: {
        fill: ['#ecf0f7', '#96a2b4'],           // top -> bottom shading
        edge: 'rgba(20, 26, 38, 0.85)',
        shadow: 'rgba(0, 0, 0, 0.55)'
    },
    selection: {
        color: 'rgba(79, 195, 247, 0.95)',
        glow: 'rgba(79, 195, 247, 0.85)',
        width: 0.007,                           // fraction of the screen height
        minWidth: 3,                            // px
        gap: 0
    }
};
