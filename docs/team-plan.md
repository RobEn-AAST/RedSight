# Team plan — who builds what (6 people, < 20 h, 2026-11-13)

**Read this when you start a session.** Say "I am <name>" to your AI agent; it reads your row below,
switches to your branch, and starts. This is a **direction, not a spec**: each owner (and their agent)
should search for the best current way to build their part, then keep going. Detailed design lives in
[`demo-focus-plan.md`](demo-focus-plan.md) (§ numbers below point there).

## 1. The 20-hour cut

- **Must ship** = what gets submitted Sat 09:00 Cairo. If it's not on this list, it can't block the submit.
- **If time** = start only after *your* must-ship part is merged and working on `main`.
- Tier 2/3 (rover mode, 360 + HUD, Vision Pro) = after submission only (§3).

## 2. Our creative hook: **Mission Replay** (what other teams won't have)

Many teams on this challenge will show a layered map with a route. Ours **plays the Marswalk**: press ▶
and two astronaut markers walk the planned route. An O₂ gauge drains and the clock runs. The map shows
the green/amber/red return zones, radio shadow and the turn-back point as the crew passes them. When
modeled O₂ gets low, the plan switches to the fastest way home on its own. Everything comes from the
engine's numbers, so the replay never invents data.

- **Must ship (lite):** 2D replay: marker moving along the route, O₂/time gauge, turn-back moment,
  play/pause/speed.
- **If time (full):** 3D terrain camera following the crew (MapLibre terrain), spoken callouts
  ("turn-back point in 200 m", "entering radio shadow") using the browser's built-in voice, and
  radio-shadow/zone events.
- Judging hooks: Creativity + Presentation (a 60-second demo judges remember), Validity (the numbers on
  screen are the route card's numbers).

## 3. Who does what

| Person | Area (branch) | Must ship | If time |
|---|---|---|---|
| **Ali** | Engine: routing + model (`feat/ali-engine`) | Pilot gate (DEM opens, slope sane, one route); 10 m grid, slope, cost; scipy Dijkstra fields; fastest + lowest-hazard routes to the stops; time/O₂ (Pandolf + κ); `constants.json`; routes + turn-back data in the contract format | `Out_fast` / `Back_fast` / `Back_safest` fields for return zones (§9); crew-2 × 15 kg preset bucket (§8); uncertainty range |
| **Youssef** | Data + tiles (`feat/youssef-data`) | Download HiRISE ortho + DTM (USGS STAC / Trek), THEMIS TI, CRISM, SIM 3292; hillshade + slope; XYZ tiles z10–16; `meta.json`, `layers.json`; `data/PROVENANCE.md` | Radio-coverage mask with `gdal_viewshed` (§9b); terrain-RGB tiles for 3D replay; z17 core tiles |
| **Yassin** | App shell + deploy (`feat/yassin-app`) | Vite + MapLibre app; layer panel + legends; stop picker; route cards A/B (fastest vs lowest-hazard); responsive layout; **deploy** to the public URL | Shareable plan link (state in the URL); EN/AR label toggle; printable cuff card (§17) |
| **Ayman** | Science stops + context cards (`feat/ayman-stops`) | `stops.json`: boxwork 360 sites, Altadena + Valle de la Luna drill sites, current rover position (MMGIS waypoints); real raw photos per sol; stop cards (sample-page style); RAD + REMS card values with sources | Judge extras (§17): Curiosity's real path overlay, elevation profile + "why this route", EVA dose card, Earth-delay note |
| **Marwan** | Mission Replay + integration (`feat/marwan-replay`) | Mission Replay lite; **integration owner**: reviews and merges PRs to `main` at each checkpoint | Full replay: 3D terrain camera, voice callouts, auto-switch to the fastest return (§9), radio/zone events |
| **Jana** | Turn-back + planner panels (`feat/jana-planner`) | Turn-back slider (budget → marker moves along the route); source/provenance card component used on every layer and number (Observed/Derived/Scenario badges) | Zones layer + "don't go beyond" line (§9); crew preset toggle (§8); radio-shadow layer UI (§9b) |

### Shared delivery pool: anyone who finishes their Must ship takes the next open item

Claim an item by writing your name in the **Taken by** column (one small commit to `main` via PR, or tell
Marwan). Work it on your own branch. Order = priority.

| # | Delivery item | Taken by |
|---|---|---|
| 1 | Ask the Local Lead the open questions (open-questions.md: cutoff, who submits, edits after submit) | |
| 2 | 7 slides (§14) with real screenshots | |
| 3 | Project page text + NASA Data list + AI disclosure (README sections) | |
| 4 | 60-second demo script (§17) and a rehearsal | |
| 5 | Logged-out test of the public URL on phone + laptop | |
| 6 | Wording + badge audit of the UI (AGENTS rule 3) | |
| 7 | Demo GIF/recording for the project page | |
| 8 | **Submit** (by whoever the Local Lead says may submit) | |

Swapping: change the names in this table (one commit), nothing else needs editing.

## 4. How we work in parallel

- **One branch per person** from `main`: `feat/<name>-<area>`. Small commits, push often. Open a PR to
  `main`; **Marwan merges** at each checkpoint. Don't push straight to `main`.
- **Stay in your folders** so merges don't collide:
  `engine/route`, `engine/model` (Ali) · `engine/data`, `engine/tiles`, `data/` (Youssef) ·
  `app/src/map`, `app/src/ui`, app config (Yassin) · `app/public/data/stops.json`, `app/public/data/cards/`,
  `engine/content` (Ayman) · `app/src/replay` (Marwan) · `app/src/turnback`, `app/src/panels`,
  `app/src/provenance` (Jana) · `docs/submission/`, `assets/` (whoever holds that delivery item).
- **The data contract (§15) is the handshake.** App people start right away on **mock JSON** shaped like
  the contract; the engine replaces the mocks when ready. Changing the contract = tell everyone first,
  then Ali/Yassin agree and commit it in one PR.
- `constants.json` is the only place numbers live. The UI never hardcodes a model number.
- `main` must always build and deploy.

**Checkpoints (hours from kickoff):**

| H | What's merged to `main` |
|---|---|
| +1 | App skeleton with mock data; contract files committed |
| +3 | Pilot gate passed (Ali + Youssef) or fallback DEM chosen |
| +8 | Real tiles + real routes in the app; stops with photos |
| +12 | Turn-back slider + replay lite working; first deploy |
| +14 | **Feature freeze for must-ship**; if-time work continues on branches |
| +16 | Final deploy; logged-out test; slides with real screenshots |
| +18 (Sat 09:00) | **Submit** |

## 5. Recommendations from the web search (starting points, verify as you go)

- **3D terrain (replay full):** MapLibre GL JS has a built-in `raster-dem` source + `setTerrain()`; the
  `encoding` setting must match the tiles (Terrarium vs Mapbox) or it fails silently. Encoding the DEM to
  terrain-RGB with a few lines of numpy is simpler than the old `rio-rgbify` tool, which is unmaintained.
  Mars lon/lat on a Web Mercator map is the known CRS trap: see mapping-options.
- **Moving marker:** MapLibre's "animate a point along a route" example (Turf `along`) is the pattern for
  replay lite; follow-camera = `easeTo`/`jumpTo` per frame (or FreeCamera for 3D).
- **Voice callouts:** the Web Speech API (`speechSynthesis`) is built into Chrome and Safari; feature-detect
  it and keep callouts optional (sound may be off at the demo table).
- **Viewshed:** `gdal_viewshed` needs a projected CRS; set observer height (mast), target height (2 m) and
  `-cc 1.0` for a non-Earth body.
- **Routing:** scipy `csgraph.dijkstra` on the 10 m grid (review F2): fast enough; no hand-written A\* on
  the critical path.
- **Wording:** never "safe route" / "real-time" etc. (AGENTS rule 3). Badge every number.

## 6. Sources (accessed 2026-11-13)

- MapLibre 3D terrain example: https://maplibre.org/maplibre-gl-js/docs/examples/3d-terrain/
- MapLibre animate a point along a route: https://maplibre.org/maplibre-gl-js/docs/examples/animate-a-point-along-a-route/
- MapLibre terrain encoding pitfall (agent-skills issue #19): https://github.com/maplibre/maplibre-agent-skills/issues/19
- Speech synthesis availability (web-features): https://web-platform-dx.github.io/web-features-explorer/features/speech-synthesis
- GDAL `gdal_viewshed`: https://gdal.org/en/stable/programs/gdal_viewshed.html
- rio-rgbify (reference only): https://github.com/mapbox/rio-rgbify
