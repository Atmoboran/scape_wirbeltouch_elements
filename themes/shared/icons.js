// Default line icon set, drawn on a 24 x 24 grid. Each entry is the inner
// markup of an <svg>; the theme stylesheet decides stroke, fill and size.
// Elements with class "fill" are meant to be filled rather than stroked.

export const VIEWBOX = '0 0 24 24';

export const ICONS = {
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.2 9.3a2.9 2.9 0 1 1 3.6 2.8c-.6.2-.8.7-.8 1.3v.6"/><circle cx="12" cy="17.2" r="1.05" class="fill"/>',
    fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    settings: '<circle cx="12" cy="12" r="3.1"/><path d="M19.1 14.4a1.6 1.6 0 0 0 .32 1.77l.06.06a1.94 1.94 0 1 1-2.75 2.75l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-.97 1.47v.17a1.94 1.94 0 1 1-3.88 0v-.09a1.6 1.6 0 0 0-1.05-1.46 1.6 1.6 0 0 0-1.77.32l-.06.06a1.94 1.94 0 1 1-2.75-2.75l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.47-.97h-.17a1.94 1.94 0 1 1 0-3.88h.09a1.6 1.6 0 0 0 1.46-1.05 1.6 1.6 0 0 0-.32-1.77l-.06-.06a1.94 1.94 0 1 1 2.75-2.75l.06.06a1.6 1.6 0 0 0 1.77.32h.08a1.6 1.6 0 0 0 .97-1.47v-.17a1.94 1.94 0 1 1 3.88 0v.09a1.6 1.6 0 0 0 .97 1.46 1.6 1.6 0 0 0 1.77-.32l.06-.06a1.94 1.94 0 1 1 2.75 2.75l-.06.06a1.6 1.6 0 0 0-.32 1.77v.08a1.6 1.6 0 0 0 1.47.97h.17a1.94 1.94 0 1 1 0 3.88h-.09a1.6 1.6 0 0 0-1.46.97Z"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    bin: '<path d="M5 7h14M9.5 7V4.8h5V7M6.7 7l.9 12.2h8.8L17.3 7"/>',

    // obstacle tools
    circle: '<circle cx="12" cy="12" r="7.5"/>',
    square: '<rect x="5" y="5" width="14" height="14" rx="1.5"/>',
    plate: '<rect x="3.5" y="10.4" width="17" height="3.2" rx="1.5" transform="rotate(-25 12 12)"/>',
    airfoil: '<path d="M3.5 14.5c4-5.5 10-8 17-8-3.5 5.5-9.5 9-17 8Z"/>',
    hill: '<path d="M3 19 12 5l9 14Z"/>',
    brush: '<path d="M4 20c2.5.4 4.2-.6 5-2.6M17.6 3.9 20 6.3 9.6 16.8l-3.4 1 1-3.4Z"/>',
    eraser: '<path d="M8.5 19h11M4.4 15.2 9 19.6l10-10-4.6-4.6Z"/>',
    rotateLeft: '<path d="M4.5 12a7.5 7.5 0 1 1 2.2 5.3"/><path d="M4.5 7.2v4.9h4.9"/>',
    rotateRight: '<path d="M19.5 12a7.5 7.5 0 1 0-2.2 5.3"/><path d="M19.5 7.2v4.9h-4.9"/>',

    // flow commands
    stir: '<path d="M3 8h9.5a3.2 3.2 0 1 1 3.2 3.2H3"/><path d="M3 16h7.8a2.6 2.6 0 1 0-2.6-2.6"/>',
    wind: '<path d="M3 8h11.2a2.9 2.9 0 1 0-2.9-2.9"/><path d="M3 12.5h14.6a2.9 2.9 0 1 1-2.9 2.9"/><path d="M3 17h7.5"/>',
    pause: '<path d="M9 5v14M15 5v14"/>',
    play: '<path d="M7.5 4.8v14.4L19.5 12Z"/>',
    reset: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v4.5h-4.5"/>',
    undo: '<path d="M4 9h9.5a5.5 5.5 0 0 1 0 11H9"/><path d="M8 4.5 3.5 9 8 13.5"/>'
};
