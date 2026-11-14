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
  Default **WAY HOME** (was NEXT: WAY HOME) (arrows lead away from the viewer toward the habitat; the fastest-way-home path
  when §9's switch fired) and the view opens facing it; **WALKED** (was ROUTE WALKED) shows the way out without arrows
  (user feedback 2026-11-13: arrows must never come toward the viewer). A HABITAT pin with its distance; heading tape with N/E/S/W.
  Limits, stated on screen: flat ground (hills don't hide the line), photo heading from Mastcam pointing data, ±3° (S1 image centre ≈ 5°, S2 ≈ 138°; Derived 2026-11-14 from PDS labels, see the S2 row below; `[` `]` rotate the drawn route to align it to a landmark), horizon set by eye
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
`app/src/hud/panoramas.ts` (which stops have a photo), `app/public/pano/PIA26559.jpg` (2.1 MB, S1),
`app/public/pano/PIA26696.jpg` (2.7 MB, S2, added 2026-11-14).
Dependency added: `three` 0.170 (MIT) + `@types/three`.

## 2. Known limits

| Limit | Effect | Fix |
|---|---|---|
| S1 and S2 have panoramas; S3/D1/D2 don't | Button shows only at S1 and S2 | S2 added 2026-11-14: PIA26696 "Nevado Sajama" (Observed; 1,031 Mastcam-right frames, sols 4714–4741), 6144 × 1263 px web resize (2.7 MB) of NASA's 8192 × 1685 browse JPEG from the [Photojournal page](https://science.nasa.gov/photojournal/curiosity-captures-a-360-degree-view-at-nevado-sajama/) (caption read 2026-11-14). Other stops: a strip of that sol's raw images (already in `stops.json`) |
| S2 heading ±3°; horizon by eye | Route lines/home beacon at S1/S2 may be rotated by a few degrees | **Heading Derived 2026-11-14 from primary pointing data** (replaces the image-based 155° ± 30° estimate). Source: PDS Imaging Node [`msl_mmm/data_MSLMST`](https://planetarydata.jpl.nasa.gov/img/data/msl/msl_mmm/data_MSLMST/) PDS4 labels, `geom:instrument_azimuth` (site frame, clockwise from north). S2: `volume_0042_raw`, 1,209 Mastcam-right labels for sols 4714–4741, all at site 120 / drive 82 (cross-check on `4714MR1085930002401740C00`: rover yaw 215.9° from the label quaternion + camera azimuth 10.5° in the rover frame ≈ 226.4° vs label 226.07°). Five raw frames were located in NASA's 8192-px browse JPEG by normalised cross-correlation: az 31.15° → x 1660.5, 35.11° → 1751.5, 39.66° → 1856.5 (sequences mcam08636/08631), 221.56° → 6016.5, 226.09° → 6122.5 (mcam08595/08593). Linear fit 22.88 px/° (a full 360° wrap is 22.76 px/°), residuals ≤ 0.05° → image centre (x 4096) = **137.6°**, set to 138°; left edge ≈ 318°; the crater-floor view on the left spans ≈ 318–40° (north). S1 cross-check: `volume_0040_raw`, Mastcam-left 360° sequence mcam07599 (sol 4541, site 116 / drive 408), four frames at az 33.1/52.5/71.9/105.0° → x 1690/1851/2006/2270 of 2924 px; fit 8.04 px/° (360° wrap 8.12), residuals ≤ 0.3° → centre ≈ 4.4–5.1° (fixed or free scale), set to 5° (caption-based 0° agreed within ~5°). Uncertainty ±3° is our estimate (frame matching + rover-attitude knowledge), not a published figure; `northCalibrated` stays false so the HUD keeps "≈". S2 horizon 15° is still by eye; `[` `]` adjust |
| Photo not north-aligned | HUD gives the habitat bearing as text only, no arrow on the photo | Azimuth now found from Mastcam pointing (row above, 2026-11-14; offsets set). Left: decide whether ±3° is enough to set `northCalibrated`, then draw the arrow |
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

## Street View-style viewer and clean HUD (2026-11-14, Marwan)

- **Sphere, not cylinder:** each Mastcam mosaic spans 360° across its width with the same angle per pixel
  vertically, so it is placed at its true angles on a full sphere (S1 ≈ 95° tall, S2 ≈ 74° tall).
- **Gaps:** Mastcam did not image the black parts of the NASA mosaics (sky above the frames, rover deck below).
  The viewer fills them in the browser: each column's sky/ground colour is carried outward and blurred. The fill is
  **not imagery**. The footer says "blurred areas = not photographed", and **show gaps** shows them dark again.
  The original JPEGs are unchanged.
- **Controls:** drag with inertia, scroll/pinch zoom (30–90°), double-click to zoom toward a point, arrow keys,
  +/−, look up/down to ±85°.
- **Clean view by default:** title bar, heading tape, one status strip (O₂, mission clock, time home,
  habitat distance/bearing, Earth delay) and EMERGENCY. **DETAILS** (or H) opens the full panels, which now have
  more opaque backgrounds and larger text.
- **Limit:** one photo per stop, so you cannot walk around inside it the way Street View steps between photos;
  moving between stops is a jump.

## Demo tour for the hackathon (2026-11-14, Marwan)

The 360 view is a **simulation of a pass-through helmet with an AR HUD**. On a real EVA the background would be
the live visor camera; in the demo it is the Observed NASA Mastcam photo from the stop. The top bar says
**AR SIM · NASA PHOTO**. **▶ DEMO TOUR** plays a ~48 s guided sequence with slow camera moves and captions:
title → AR route on the ground → home beacon → suit and route data (Details) → message to Earth (light-time
countdown) → emergency (red fastest way home) → "Plan on the map · walk with the HUD". It works live at the
judges' table and as a screen recording for the video. Dragging takes over the camera; **■ STOP** ends the tour.

## AR road guide on the real terrain (2026-11-14, Marwan)

- **Terrain:** `app/scripts/build-hud-terrain.py` builds `app/public/hud/terrain-S1.json` / `terrain-S2.json`
  (8 m grid, 3.6 km square around each stop, heights from the Trek 2.5 m DEM, 543 kB each; **Derived**, display
  only, never used for routing). The route is drawn at its real ground height, so it climbs toward the habitat
  instead of lying on a flat plane.
- **Line of sight:** parts of the route hidden behind a ridge (ray from the 1.97 m eye over the grid) are drawn as
  dim dashes.
- **Look:** grid staircase smoothed (±10 m moving average), a shader ribbon with a soft glow, a bright core and a
  dark rim for contrast, chevrons flowing along the direction of travel, width growing with distance so the far
  route stays readable, fade near the camera and beyond ~1.5 km.
- **Markers:** 100 m / 250 m / 500 m / 1 km labels on the guided path; the habitat is a light pillar with a
  diamond and a HOME label.
- **Limits:** the DEM is 2.5 m, so small rocks don't occlude; photo heading ±3° and horizon by eye mean
  the line can sit a few metres off on the photo.

## Full 360 stand-in photo, AR navigation track, clearer HUD (2026-11-14, Marwan)

User request (2026-11-14): "since it's a demo, replace the 360 with an actual full high-quality 360 photo of wherever
on Mars; make the street track better; make the UI better and easier to understand."

- **Photo (Observed, stand-in):** NASA **PIA26363** "Curiosity Takes a 360-Degree View of Gediz Vallis Channel"
  ([Photojournal](https://science.nasa.gov/photojournal/curiosity-takes-a-360-degree-view-of-gediz-vallis-channel/),
  caption read 2026-11-14 via images-api.nasa.gov): Curiosity Mastcam, 336 images, sol 4220 (2024-06-19), Gediz Vallis
  channel on Mount Sharp, Gale crater; credit NASA/JPL-Caltech/MSSS. Licence: NASA media "generally are not subject to
  copyright in the United States" ([NASA Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/),
  read 2026-11-14). Original 29240 × 8311 JPEG, 34,343,102 bytes, from
  `https://assets.science.nasa.gov/content/dam/science/psd/photojournal/pia/pia26/pia26363/PIA26363.jpg`, kept in
  `data/raw/pano/` (git-ignored).
- **Why a baked sphere:** no NASA still covers the sky: Mastcam mosaics stop a few degrees above the horizon (NASA's
  own 8K 360 video of this mosaic, `JPL-20240717-MSLf-0001`, marks it "sky not imaged" / "rover not imaged" and has
  captions burned in, so it was not used). Third-party full-sphere stitches (e.g. 360cities) were not used: licence
  unclear. `app/scripts/build-pano-sphere.py` places the mosaic at its true angles on an 8192 × 4096 equirectangular
  sphere (horizon row 1950 by eye on the far crater rim → +24° to −78°) and colour-fills the sky (photographed sky
  colour per column, slowly darkening to the zenith) and the rover deck / nadir (smooth fill of nearby ground colours
  + fine grain). Output `app/public/pano/PIA26363-sphere.jpg`, 4.8 MB. The fill is not imagery; the footer says so.
- **Honesty on screen:** default photo = **Full 360 stand-in** (user's choice for the demo), with an amber note
  "PHOTO STAND-IN · Curiosity at Gediz Vallis channel, Mount Sharp, sol 4220: not the S1 spot. Route on flat ground."
  The AR route is drawn on **flat ground** there (no DEM, no line of sight) and turned so the walk ahead faces the
  photo centre (down the open channel): Scenario, never matched to the photo's landforms. **Real stop photo** switches
  back to PIA26559/PIA26696 with the DEM terrain, Mastcam-derived heading and `[ ]` nudging.
- **AR track:** car-HUD / Live View style: blue body (orange-red ground contrast), thin white edge, dark outline,
  anti-aliased edges (screen derivatives), crisp white chevrons flowing in the walking direction, starts 2.5 m in front
  of the feet. A **next-turn sign** (arrow + metres) stands at the first bend > 30° (30 m before vs after; display
  only); distance labels 100 m / 500 m / 1 km; home = light pillar + pulsing ground ring + HOME label. Emergency keeps
  the red fastest way home; Walked shows the way out without chevrons.
- **HUD layout (same on 1440 × 900 and 390 × 844):** top-left what you're looking at + photo source + view toggles;
  top-right Demo tour / Details / close; top-centre **navigation card** (heading tape, an arrow that always points
  home, "Home 1.34 km · 18° left", next cue "Straight on for 1.3 km, then bear left"); bottom **four large numbers**
  with plain labels (Oxygen left, Walk home, Spare O₂ at home: Scenario; Earth delay: Derived); bottom-right
  EMERGENCY; one-line footer with SCENARIO / DERIVED / OBSERVED chips and the photo credit. DETAILS keeps the suit,
  mission, way home, environment, comms, log + progress and map panels. Demo-tour captions rewritten to match.
- **Limit:** on flat ground at eye height the route beyond ~200 m lies within 1° of the horizon, so the far route is
  thin; the distance labels, turn sign and home pillar carry the far guidance.
