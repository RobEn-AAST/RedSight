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
| **Ali** | Engine: routing + model (`feat/ali-engine`) | **Read the O₂ note in `app/public/data/README.md` first.** Pilot gate (DEM opens, slope sane, one route); 10 m grid, slope, cost; scipy Dijkstra fields; fastest + lowest-hazard routes to the stops; time/O₂ (Pandolf + κ); `constants.json`; routes + turn-back data in the contract format | `Out_fast` / `Back_fast` / `Back_safest` fields for return zones (§9); crew-2 × 15 kg preset bucket (§8); uncertainty range |
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
| 2 | 7 slides (§14) with real screenshots | Marwan (outline + notes drafted: [`submission/demo-script.md`](submission/demo-script.md); screenshots wait for real data) |
| 3 | Project page text + NASA Data list + AI disclosure (README sections) | Marwan (drafted: [`submission/project-page.md`](submission/project-page.md); team to confirm the SI answer) |
| 4 | 60-second demo script (§17) and a rehearsal | Marwan (script drafted, same file; rehearsal open) |
| 5 | Logged-out test of the public URL on phone + laptop | |
| 6 | Wording + badge audit of the UI (AGENTS rule 3) | Marwan (first pass done: [`submission/ui-audit.md`](submission/ui-audit.md); re-run on real data + deployed URL) |
| 7 | Demo GIF/recording for the project page | |
| 8 | **Submit** (by whoever the Local Lead says may submit) | |

Swapping: change the names in this table (one commit), nothing else needs editing.

**Handoff (2026-11-13):** Ali scaffolded the app shell (React + TypeScript + Tailwind spacecraft console,
branch `feat/spacecraft-web-copilot`, merged to `main`; status in [`web-foundation.md`](web-foundation.md)) and
handed it to **Yassin**, who continues the app shell from `main` (next: MapLibre map + real layers + route
cards). Ali's own row (engine) is unchanged. The AI copilot panel stays an unconnected placeholder until
after submission (team decision needed to go further).

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
- Changed anything in `app/public/data/`? Run `cd app && npm run check:data` before the PR (0 errors needed);
  `-- --final` before submission also fails on leftover mock files.
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

## 4b. Notes for owners (read yours before you start)

**Ali (engine): O₂ numbers in the route files** (decision D27, [`demo-focus-plan.md`](demo-focus-plan.md) §9c)

- Write **plain expected O₂ per crew member** at the planned walking rate (Pandolf + κ):
  `cum.o2_l` (habitat → each point) and `back.o2_l` (each point → home, from your return field).
- **Don't add** the reserve, the 20 % return margin, or pair/drill factors. The app applies them from
  `constants.json` (`reserve_minutes`, `reserve_fraction`, `walkback_o2_lpm`, `return_cost_margin`); adding
  them in the engine would count them twice.
- Without `back.o2_l` the app assumes home costs the same as the way out and says so on screen.
- `budget_l` = capacity − reserve = 385 − max(0.25 × 385, 30 × 1.22) ≈ **289 L**. To change capacity or
  reserve, edit `constants.json`, not only the route files. Keep `constants.json` key names stable.
- Exact file fields and the mock files to replace: [`app/public/data/README.md`](../app/public/data/README.md).
- **New optional field `back_fast`** on lowest-hazard routes (added 2026-11-13): the fastest way home from each
  point (`t_s`, `o2_l`, `path`, `via`), i.e. your `Back_fast` field sampled on the route plus the path it
  follows. With it, the replay and the turn-back slider switch to the fastest return when O₂ gets low (§9).
  Without it nothing breaks; there is just no switch. Its time must never exceed `back.t_s` at the same point.

**Everyone on the app side:** build against the mock files in `app/public/data/` (all `"_mock": true`)
until the real ones land. Mission Replay is already in the map workspace (`app/src/replay/MissionReplay.tsx`);
docs in [`app/src/replay/README.md`](../app/src/replay/README.md).

## 4c. Status + what to do next, per person (updated 2026-11-13 evening, Marwan)

**Before every session (all six):** `git checkout <your branch> && git merge origin/main` (after
`git fetch`), so you build on what's merged. **Before every PR:** `cd app && npm run build && npm run lint`,
and if you changed anything in `app/public/data/`: `npm run check:data` (0 errors needed). Open the PR to
`main`; Marwan merges.

**On `main` now:** Yassin's MapLibre map + stop picker + route cards, Jana's turn-back slider + source cards,
Ayman's stops + photos + RAD/REMS cards, Mission Replay (linked to the slider, automatic switch to the
fastest way home, map bar, Earth-delay note), the data checker, and drafts for slides, demo script, project
page and UI audit in [`submission/`](submission/). **Routes are still mock; tiles are one preview image.**

| Person | Status | Next (in order) | Changed by Marwan in your area (pull it) |
|---|---|---|---|
| **Ali** | Nothing pushed yet: **critical path** | 1. Pilot gate: DEM opens, slope sane, one real route. 2. Real `constants.json`, `meta.json` (habitat), routes for all stops, both modes, in the contract shape. 3. `back_fast` on lowest-hazard routes (note above). 4. `npm run check:data` → PR | none (route format: `back_fast` added as optional) |
| **Youssef** | Nothing pushed yet: **critical path** | 1. HiRISE ortho + DTM download. 2. Tiles into `app/public/data/tiles/<layer>/{z}/{x}/{y}.png` and set `"available": true` in `layers.json` (the checker fails if tiles are missing). 3. `data/PROVENANCE.md`. 4. If time: radio-coverage mask | none |
| **Yassin** | Map, stop picker, route cards merged | 1. **Deploy** `main` to the public URL; test it logged out on phone + laptop (pool item 5). 2. If time: shareable plan link | `App.tsx` + `index.html` footer wording (banned "certified" removed); `lib/engineData.tsx` reads stop photos given as objects with `url`; `MapWorkspace.tsx` mounts `<MissionReplay />`; `planStore`/`planContext` hold the shared O₂ budget (`o2BudgetL`) |
| **Ayman** | Stops, photos, cards merged | 1. Check your stop cards on `main` now show photos. 2. Judge extras (§17): Curiosity's real path overlay, EVA dose card | the app now reads your photo objects; `make-mock.mjs` never overwrites your files (they have no `_mock` flag) |
| **Jana** | Turn-back slider + source cards merged | 1. Zones layer + "don't go beyond" line (§9). 2. Crew preset toggle (§8) | `turnback.ts`: the turn-back uses the cheaper of the route's own way home and `back_fast` (`wayHome()`), same rule as the replay; your slider's budget now lives in the plan store (`usePlan().o2BudgetL`), so the replay follows it. Tests 8/8 |
| **Marwan** | Integration + replay + delivery drafts | Merge PRs as they come; rehearse the demo; retake screenshots on real data; re-run the UI audit on the deployed URL | — |

**Still unowned:** delivery pool item 1 (ask the Local Lead: cutoff, who submits) and item 7 (demo
GIF/recording). Item 8 (submit) after the Local Lead answers.

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
