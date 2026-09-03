# WirbelTouch – Strömung zum Anfassen

A browser wind tunnel for exhibitions and classrooms: place obstacles into a
flow with your finger and watch what the air does around them.

**Everything is computed in the visitor's browser** – the incompressible
Navier–Stokes equations are solved on the GPU with WebGL fragment shaders. No
server, no build step, no dependencies.

Inspired by [IMAGINARY/navier-stroke](https://github.com/IMAGINARY/navier-stroke)
and [PavelDoGreat/WebGL-Fluid-Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation);
the solver here was written from scratch so that solid boundaries (the
obstacles) and a steady wind-tunnel inflow could be built into every step.

## What you can do

* **Wind on** – a steady flow, visualised with coloured smoke streak lines
  injected at the inlet. The inflow can come **from any of the four sides** or
  be switched off entirely.
* **Obstacles** – cylinder, block, flat plate, airfoil, hill and a freehand
  brush. Tap to place, drag to move, and either drag onto the bin that appears
  while dragging or use the eraser to remove.
* **Rotate and resize** – with the arrows right below the tools, or with **two
  fingers** directly on an obstacle (rotate and pinch at once). Freehand
  strokes turn about their own centre of gravity.
* **Medium** – *air* (wind around a building: brisk, with a turbulent wake) or
  *water* (a slow flume: a clean, regular vortex street). Both solve the same
  equations; what the presets change is the regime, i.e. roughly the Reynolds
  number, plus the look of the dye.
* **Scenes** – ready-made setups: cylinder (Kármán vortex street), airfoil,
  air brake, two cylinders, buildings, the Frankfurt skyline, mountain range,
  nozzle, slit, and a pair showing cross-ventilation: a room with one window
  barely exchanges any air, the same room with a window on the far side
  flushes right through.
* **Views** – smoke, speed, vorticity or pressure.
* **Stir** – push the air around by hand. It sits next to the flow commands
  rather than among the obstacle tools, since it acts on the air, not on the
  scenery.
* **Help** has two tabs: a short explanation for visitors and a technical one
  covering the scheme, the grid, the boundary treatment and, explicitly, where
  the model stops being trustworthy.
* **Info buttons** – every setting has a small `i` that opens a short
  explanation of what it does and what it means physically.
* German / English interface, touch and mouse, keyboard shortcuts
  (`Space` pause, `W` wind, `C` clear, `R` reset flow, `1`–`4` view,
  `Q`/`E` rotate).
* Phone-friendly: the whole tool dock collapses to a single bar, the tool row
  scrolls sideways, and the size/rotate controls sit next to the tools rather
  than in the settings panel.
* After 4 minutes without interaction the exhibit resets itself to the default
  scene (`IDLE_RESET_MS` in `js/app.js`).

## Physics

Stable-fluids scheme per frame:

1. wind-tunnel forcing (velocity nudged to the free stream in an inlet band on
   whichever edge the flow comes from, weak sponge at the outlet, plus a
   whisper of unsteadiness that lets vortex shedding start),
2. vorticity confinement (re-sharpens eddies the coarse grid would smear),
3. projection: divergence → pressure solve → gradient subtraction,
4. semi-Lagrangian advection of velocity and smoke.

Obstacles enter as a boundary mask texture (`1 = solid`). Solid neighbours get
a reflected velocity in the divergence step (zero normal velocity on the face),
a Neumann condition in the pressure solve, and the velocity is zeroed inside
solids after projection and advection — i.e. a no-slip wall. In wind-tunnel
mode the two walls along the flow axis become transparent and the outlet edge
is pinned to `p = 0` so air can actually leave; the other two stay solid tunnel
walls, and turning the wind off closes the box on all sides again.

The pressure solve is Jacobi smoothing plus a correction computed on a four
times coarser grid. The coarse level is not an optimisation — it is what makes
the solver respect a *global* mass balance. Jacobi carries information one cell
per sweep, so with fine sweeps alone the pressure inside an enclosure can never
build up enough to stop an inflow, and air pours endlessly through a room with
a single opening. Measured on a sealed room with one windward window, the net
through-flow drops from 6.7 to 0.6 and the air inside from 17 to 1.3 (free
stream 45) once the coarse correction is in; with a second window opposite, the
through-flow rises to 16 and the interior to 40. The divergence and gradient
operators also form a proper MAC pair (forward/backward differences), so that
`div(grad(p))` is exactly the five-point Laplacian being inverted — with central
differences on both, no number of iterations can drive the divergence to zero.

The mask is painted from the shape list into a hidden 2D canvas at twice the
simulation resolution; the visible, crisp obstacles are drawn on a separate
overlay canvas. A blurred copy is added on top of the sharp mask (added, never
substituted, so a thin freehand stroke cannot be blurred out of existence) and
the solver reads the mask as a fraction rather than a yes/no. Without that, a
diagonal edge is a one-cell staircase and every step sheds a little vortex of
its own — visible as small "trees" growing off a mountain slope.

Switching the wind on **primes** the whole field with the free stream instead of
letting it creep in from the inlet. An under-converged Jacobi solve only carries
pressure information a few dozen cells per frame, so a domain starting from rest
accelerates gradually, and the smoke front then travels as a shear layer against
the still air ahead of it and curls up long before it reaches any obstacle.

## Run locally

ES modules need to be served over HTTP:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deployment

* **GitHub Pages** – `.github/workflows/pages.yml` publishes the repository root
  on every push to `main`. Enable it once under
  *Settings → Pages → Build and deployment → Source: GitHub Actions*.
* **GitLab Pages** – `.gitlab-ci.yml` copies the site into `public/` if the
  repository is mirrored to GitLab.

The site is fully static; any web space will do.

## Layout

```
index.html          markup, toolbar, settings panel
css/style.css       exhibit styling, touch-sized controls
js/shaders.js       all GLSL programs
js/gl.js            WebGL context, programs, framebuffers
js/simulation.js    the fluid solver
js/obstacles.js     obstacle shapes, mask + overlay rendering, scenes
js/i18n.js          German / English strings
js/app.js           input handling, UI wiring, main loop
```

## Requirements

WebGL 2 (or WebGL 1 with half-float render targets). Works on current desktop
and mobile browsers; on very old devices the app shows a short notice instead.

## License

MIT – see [LICENSE](LICENSE).
