# Themes

Everything that makes up the look and the copy of WirbelTouch lives here:
colours, fonts, icons, logo and texts. The app itself (`index.html`, `js/`,
`css/base.css`) holds structure, behaviour and physics only, so the exhibit
can be shipped in a different corporate design by adding a folder here.

| Theme     | Look |
|-----------|------|
| `scape`   | SCAPE° corporate design (Bureau Mitte): Founders Grotesk, flat pastel and strong colour fields, cream tunnel with red-orange smoke. **Default.** |
| `classic` | The original dark exhibit look: glass panels, sky blue accent, light smoke on black. |
| `shared/` | Not a theme: the default texts (`strings.js`) and line icons (`icons.js`) that themes build on. |

## Choosing a theme

* Default: `<meta name="wirbeltouch-theme" content="scape">` in `index.html`.
* Per URL: `index.html?theme=classic`.

If a theme fails to load, the app falls back to the default, then to
`classic`.

## Making a theme

Copy `classic/` or `scape/` to `themes/<name>/` (letters, digits, `-`, `_`)
and edit the two files.

### `theme.js`

Default-exports one object:

```js
export default {
    stylesheet: 'theme.css',        // relative to the theme folder
    themeColor: '#F2E4BA',          // <meta name="theme-color">
    favicon: '<svg …>…</svg>',      // SVG markup, optional
    brandMark: '<div class="logo">…</div>',   // logo markup above the title, '' for none
    icons: { help: '<circle …/>', … },        // inner SVG markup per icon name
    iconViewBox: '0 0 24 24',
    strings: { de: { … }, en: { … } },        // one dictionary per language

    // the simulation picture (WebGL), all colours as '#rrggbb'
    canvas: { background, solid },  // empty tunnel; inside of obstacles
    smoke: { air: [a, b], water: [a, b] },    // inlet colours across the stream
    stir: [ … ] | null,             // dye palette for stirring; null = random hues
    deviceSmoke: '#28348B',         // chimney smoke and fan trace, optional
    colormaps: {
        speed: [c0, c1, c2, c3, c4],          // exactly 5: still -> fast
        diverging: [lo, zero, hi]             // exactly 3: vorticity and pressure
    },

    // obstacles on the overlay canvas, any CSS colour
    obstacle: {
        fill: '#62BA91',            // or [top, bottom] for vertical shading
        edge: null,                 // outline colour or null
        shadow: null                // drop shadow colour or null
    },
    device: {                       // working parts of fans, rotors, vents
        color, accent
    },
    selection: {                    // ring around the selected obstacle
        color, glow,                // glow: colour or null
        width, minWidth,            // fraction of screen height; px minimum
        gap, gapColor               // space between shape and ring
    }
};
```

**Strings.** Start from `shared/strings.js` and override single keys, as
`scape/theme.js` does. Each dictionary needs every key used in `index.html`
(`data-i18n…` attributes) and in `js/app.js`. Some keys need care:

* `langSwitch` is the label of the language button, i.e. the name of the
  *next* language. The button cycles through all dictionaries and is hidden if
  there is only one.
* Legends refer to colours as `<span class="sw" data-swatch="speed.0"></span>`
  (or `diverging.0`–`.2`), which are painted from `colormaps`. Never write a
  colour into a text.
* `helpFooter` is a closing line under the help text (the SCAPE° claim). Leave
  it empty for none.
* `docTitle` and `metaDescription` fill `<title>` and the description meta.

**Icons.** Start from `shared/icons.js`. Icon names are the `data-icon`
attributes in `index.html`.

### `theme.css`

Styles the whole interface. `css/base.css` is always loaded first and only
covers what the app needs to function (the `[hidden]` attribute, canvas
stacking, touch handling, the play/pause icon swap), so the theme is free to
change the rest, layout included. Things worth knowing:

* `--dock-height` is set on `<html>` by the app and follows the tool dock's
  height. Use it to keep floating elements (hint, bin) clear of the dock.
* `html[data-theme="<name>"]` is set while the theme is active.
* State hooks: `[aria-pressed="true"]` on the selected tool, pill, tab and
  info button, and on the wind switch while the wind blows (which also gets
  `.on`; its `.knob` holds the word on/off); `.paused` on the pause button; `.show` on the hint and the bin; `.hot` on the bin while an
  obstacle hovers over it; `body.dock-collapsed`.
* The tools come in three `.toolgroup`s (obstacles, devices, by hand), each
  with a `.groupcap` caption and a `.toolrow`. Obstacle tools whose icon is
  the solid shape they place carry `.solid`, device tools `.device`.
