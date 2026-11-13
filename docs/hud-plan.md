# 360° stop view + HUD: prototype and implementation plan (Tier 2, 2026-11-13, Marwan)

**Status:** working prototype on branch `feat/marwan-hud`. **Not merged to `main` before the Tier 1 submit**
(AGENTS tier rule; the user asked on 2026-11-13 to start it early, on its own branch, while the engine and tiles
are pending: decision D28). Design source: [`demo-focus-plan.md`](demo-focus-plan.md) §10.

## 1. What the prototype does

- **Mission Replay card → "360° view at S1 + HUD (Tier 2 preview)"** opens a full-screen view.
- **Photo (Observed):** NASA's real Curiosity Mastcam 360° mosaic **PIA26559** (291 images, sols 4539–4541,
  May 15–18, 2025; credit NASA/JPL-Caltech/MSSS; NASA Image Library). It's 2924 × 773 px: a full circle
  horizontally but only ~80° tall, so it is wrapped on the inside of a **cylinder** (three.js), not a sphere,
  and the view can't tilt past the photo. Drag/touch to look around, mouse wheel to zoom, ← → keys, Esc
  closes.
- **HUD (Scenario):** the replay model's values **at the moment of arrival**, from the same timeline as
  Mission Replay and the turn-back slider (nothing computed separately):
  O₂ on arrival (% of tank, L, minutes at walkback rate, gauge with the reserve striped) · time since leaving
  · recommended way home (back the way you came, or "Fastest way home (switched: O₂ low)" when §9's switch
  fired) · its time and O₂ · spare above the reserve after it · habitat distance and bearing.
  If the stop is past the turn-back point on the current budget, the HUD says so instead of showing numbers.
- **Film-style layout (2026-11-13, user request):** semi-transparent glass panels with a cyan glow, scan lines,
  centre reticle, heading tape (relative degrees until north-aligned). Panels: mission clock (time, distance
  walked, crew, Earth delay) · O₂ ring for the worst suit (reserve red, O₂ needed to get home amber) + one bar
  per crew member · way home (blinking "O₂ low, switched" alert when §9's switch fired) · environment from
  Curiosity's RAD/REMS cards (Observed, rover-local; EVA dose = RAD rate × walk time, unshielded) · event log
  · north-up route mini-map (way out, way home, switch point, stop, habitat) · walk progress bar with
  DEPART / SWITCH / STOP / HOME marks. No invented values: no heart rate, CO₂ or suit pressure (we have no data).
- **Fixed route on the photo (2026-11-13, user request):** the route's own coordinates are turned into
  directions seen from the stop (bearing + distance on flat ground, eye at Mastcam height 1.97 m) and drawn
  **once** as a yellow ribbon on the ground with moving arrows in the direction of travel. No GPS, no tracking.
  Default **NEXT: WAY HOME** (arrows lead away from the viewer toward the habitat; the fastest-way-home path
  when §9's switch fired) and the view opens facing it; **ROUTE WALKED** shows the way out without arrows
  (user feedback 2026-11-13: arrows must never come toward the viewer). A HABITAT pin with its distance; heading tape with N/E/S/W.
  Limits, stated on screen: flat ground (hills don't hide the line), photo heading approximate (image centre ≈ north per NASA's caption: Gale crater rim at top centre; `[` `]` rotate the drawn route to align it to a landmark), horizon set by eye
  (18° above the mosaic centre, `panoramas.ts`). Code: `app/src/hud/routeOverlay.ts`.
- **Home beacon, emergency, comms (2026-11-13, user request):**
  - **HOME beacon:** a hovering, pulsing "⌂ HOME · habitat km" marker over the habitat's direction, a ⌂ mark on the
    heading tape, and a blinking edge arrow "⌂ HOME · TURN LEFT/RIGHT n°" whenever the habitat is out of view.
  - **EMERGENCY button:** red view, route switches to the fastest way home (red line, view turns to it), panel with
    its time, O₂ needed, O₂ left and margin above reserve (Scenario), and an automatic message to habitat + Earth.
  - **COMMS:** preset messages; each shows "delivered" on local habitat radio, a countdown until it reaches Earth
    and until the earliest possible reply (2×). Delay = today's Earth–Mars distance (JPL approximate planet
    orbits, Standish, ssd.jpl.nasa.gov/planets/approx_pos.html) ÷ c: **Derived**; tested against the 2003
    closest approach (55.8 M km). Not modeled: relay-orbiter pass waits, radio shadow (both stated on screen).
    "Demo ×60" speeds the countdown for presentations. Code: `earthDelay.ts`, `CommsPanel.tsx`.
- **Honesty on screen:** Observed chip on the photo, Scenario chip on the numbers, photo credit, and "Real
  imagery exists only at stops: moving between stops is a jump" (§10).

Files: `app/src/hud/panoViewer.ts` (three.js viewer), `app/src/hud/StopHud.tsx` + `hud.css` (HUD),
`app/src/hud/panoramas.ts` (which stops have a photo), `app/public/pano/PIA26559.jpg` (2.1 MB).
Dependency added: `three` 0.170 (MIT) + `@types/three`.

## 2. Known limits

| Limit | Effect | Fix |
|---|---|---|
| Only S1 has a panorama | Button shows only at S1 | PIA26696 (S2) isn't in the NASA Image Library; get it from JPL Photojournal (**ask before downloading: size first**). Other stops: a strip of that sol's raw images (already in `stops.json`) |
| Photo not north-aligned | HUD gives the habitat bearing as text only, no arrow on the photo | Find the mosaic's azimuth (caption or Mastcam pointing for the sols), set `northCalibrated` + an offset, then draw the arrow |
| Mosaic edges are black and curved | Black areas at the top/bottom when zoomed out | Starts zoomed in (58° view); could crop the texture |
| Numbers are mock until Ali's routes land | HUD shows mock values (same as the rest of the app) | Nothing to do here: it reads the same timeline |
| Bundle +~500 kB (three.js) | Slower first load | Load the viewer with a dynamic `import()` only when the button is pressed |

## 3. How we'll implement the rest (after Tier 1 is submitted)

| Step | What | Owner | Time |
|---|---|---|---|
| 1 | Merge `feat/marwan-hud` after the Tier 1 submit; lazy-load three.js | Marwan | 30 min |
| 2 | S2 panorama (PIA26696) + raw-image strips for S3/D1/D2 | Ayman (stops) | 1 h |
| 3 | North alignment + habitat arrow on the photo | Marwan | 1 h |
| 4 | HUD zone (green/amber/red) and "don't go beyond" status from Jana's zones (§9) | Jana + Marwan | 1 h |
| 5 | Play the replay **inside** the HUD (O₂ ticking, callouts) instead of the arrival snapshot | Marwan | 1 h |
| 6 | Tier 3: same scene in WebXR `immersive-vr` for Vision Pro (three.js `VRButton`), §11 | Marwan | 2 h, device test needed |

## 4. How to try it

```
git fetch && git checkout feat/marwan-hud
cd app && npm install        # adds three.js (~36 MB in node_modules)
npm run dev                  # Set up → Show routes → stop S1 → Mission Replay card → 360° view at S1 + HUD
```
