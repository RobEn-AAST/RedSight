# RedSight — Demo Focus Plan (what we actually build and submit)

**Written:** 2026-11-13 (Cairo day 1), from the team planning session after a full read of the repo and a
same-day live re-check of the official pages and data services (sources in §19, all accessed 2026-11-13).
**Status:** working plan, **team choice** throughout. Not a challenge rule, and not a promise of a result.
**Relationship to other docs:** this narrows [`24-48-hour-plan.md`](24-48-hour-plan.md) to a demo we can
finish. Where the two conflict on **scope or ops area**, this file wins. Phase timing, the pilot gate,
acceptance evidence and risks still come from the 24–48 h plan. Rules come from
[`../requirements/competition-requirements.md`](../requirements/competition-requirements.md).

---

## 1. The final target: what we hand in

The challenge prescribes **no exact output format**. It requires one thing (**Must**): *"create a map,
tool, or interface a Mars astronaut could use during a surface exploration mission, using NASA data and
tools."* Style, format, site and features are ours to choose.

What we submit is **one project page** on spaceappschallenge.org (Submission Guide; full field list in
competition-requirements §5):

| Item | Our content |
|---|---|
| Project name + summary | RedSight: a hyperlocal Marswalk planning map for the Mount Sharp boxwork area |
| **Demo link** (Must: ≤7 slides **or** ≤30 s video; over the limit ⇒ ineligible for Global Judging) | **7 English slides** (team default, D03/U2) |
| **Final project link** (public, no login) | Static website + GitHub repo |
| Description · NASA Data field · SI disclosure · references | Drafted by the story owner during the night |

**Our base target in one sentence (team choice):** *a website where you pick a science stop on Mount
Sharp, see a modeled route to it over real NASA layers, and drag a slider that shows your modeled
turn-back point.*

> **Build order is strict (team rule, 2026-11-13):** **Tier 1 — Base** must be finished, deployed and
> submittable first. Only then **Tier 2 — Extras** (360° view at stops + HUD), then **Tier 3 — Bonus**
> (Apple Vision Pro). Extras never delay or break the base. Any session/agent picking up work: check
> which tier is complete before starting anything from a higher tier.

### 1b. Display formats: we don't have to build two

The challenge lists display formats under "You may (but are not required to)": a planner inside the
spacecraft/habitat, a carried tablet, a helmet-visor HUD, "or another format you imagine". **None is required,
and no specific number of formats is required.** Our plan covers three with one codebase:
**habitat planning station** = the Tier 1 web map on a laptop/screen · **tablet** = the same responsive page ·
**helmet HUD** = Tier 2 overlay (Tier 3 immersive on Vision Pro).

### 1c. Challenge text → our plan (traceability, re-read 2026-11-13)

| Challenge sentence (official page) | Class | RedSight answer | Tier |
|---|---|---|---|
| "create a layered, integrated view of a location or route… data from multiple NASA science missions" | **Must** (core) | Layered map from MRO, Mars Odyssey, Curiosity + USGS/Trek | 1 |
| "help a human explorer plan and carry out a successful Marswalk… conducting… science" | **Must** (core) | Science stops → modeled route → turn-back point | 1 |
| "identifying some scientific goals… boxwork… Mount Sharp region" | Example | Boxwork stops + Curiosity drill sites (§6, §8) | 1 |
| "at least three kinds of data" | Recommended | 6 types (§7) | 1 |
| "consider what information might help a crew move safely… radiation… space weather data" | Recommended | RAD card + SEP scenario note (no spatial map: Unavailable); radio-coverage layer + blackout minutes (§9b) | 1 |
| "wearing spacesuits and possibly carrying scientific equipment and other supplies. Consider how this might impact their mobility" | Recommended | Crew setup: body mass, load, samples, suit factor (§8) | 1 |
| "if possible, include a route map… avoiding significant obstacles such as large rock formations" | Recommended | Slope-blocked routes; step/rock limits stated (§8) | 1 |
| Habitat display / tablet / helmet HUD / other | Optional | Station + tablet (1), HUD (2), Vision Pro (3) | 1–3 |
| Static, interactive, or map generator | Optional | Interactive | 1 |
| Time frame past/future/none | Optional | Present-day terrain; RAD/REMS as observed climatology | 1 |
| "point-of-view images… so the astronaut knows what to expect" | Optional | Raw photos per stop (1), 360 panoramas (2) | 1–2 |
| "rovers or other robotic systems to help transport the crew and their tools" | Optional | Rover vs foot mode, rover carries samples (§8) | 2 |
| "astronauts might work in pairs" | Optional | Crew of 2 default, buddy rule, pair turn-back (§8) | 1 |

## 2. Rules versus ideas

| Class | Items |
|---|---|
| **Must** | Map/tool/interface for an astronaut · NASA data (≥1 for any Global Award) · English · demo within limits · public links · project page complete · SI disclosure |
| **Recommended** | "at least three kinds of data" (introduced with "you may consider") · route avoiding obstacles ("if possible") · safety context (radiation, suit mobility) |
| **Optional** | Habitat/tablet/HUD display · static vs interactive · point-of-view imagery · rovers/robots · paired astronauts |
| **Team choice** | Gale / Mount Sharp boxwork site · RedSight · turn-back marker · provenance cards · 360 + HUD · Vision Pro |

## 3. Scope in tiers (build strictly in order)

**20-hour cut (2026-11-13, D25):** Tier 1 is split into **Must ship** = B1, B2, B3, B4, B5, B6, B7 +
Mission Replay lite; and **If time** = B4b, B4c, B6b, B6c + full replay (3D terrain, voice callouts).
Owners and branches: [`team-plan.md`](team-plan.md).

### Tier 1 — Base (do first; this is what gets submitted Saturday 09:00)

| # | Item | Done when (evidence) |
|---|---|---|
| B1 | 2D map of the ops box with ≥4 toggleable layers: HiRISE ortho, hillshade + slope, THEMIS, CRISM (§7) | Layers toggle on the public URL |
| B2 | 3 science stops at real Curiosity positions, with raw photos from those sols (§6) | Clicking a stop shows its card + photos + sources |
| B3 | Fastest + safest routes per stop, precomputed (scipy Dijkstra field, review F2) | Routes never cross a >15° cell (asserted in the engine) |
| B4 | **Turn-back slider**: budget → PNR marker moves along the route | Marker moves toward the habitat as the budget drops |
| B4b | **Proposed return-budget zones and alternate-return switch** (§9; currently unavailable): complete legal alternate geometry + matching costs are required before map shading or a switch recommendation is enabled | Future gate: complete return arrays and path legality tests; current product uses same-path PNR only |
| B4c | **Radio coverage layer** (§9b): where the crew can reach the habitat by direct radio line of sight and where ridges cause a radio shadow; per-route "% out of contact" and "longest blackout (min)"; lowest-hazard route prefers covered ground | Layer matches the DEM viewshed; blackout numbers appear on each route card |
| B5 | Provenance card on every layer and number (Observed / Derived / Scenario) | No visible layer or number without a card |
| B6 | RAD + REMS context **cards** (not map layers) | Cards cite their PDS sources |
| B6b | **Crew setup panel** (§8): crew of 1 or 2 (default 2, buddy rule), body mass, carried load, sample mass picked up per stop; time/O₂/turn-back recompute | Changing mass/load/crew changes O₂ and the turn-back point monotonically |
| B6c | **Judge-facing extras that cost < 1 h each** (§17): Curiosity's real traverse overlaid on our route, elevation profile + "why this route" breakdown on the route card, EVA radiation-dose card, Earth-delay note | Each is visible on the public URL with its source card |
| B7 | Deployed public URL + 7 slides + project page submitted | Submitted page; links tested logged-out |

### Tier 2 — Extras (start only after Tier 1 is submitted)

| # | Item | Detail |
|---|---|---|
| E0 | **Rover vs foot mode** (§8): separate rover traversability grid, "rover can't go here, why" reasons, mixed plan = drive to a park point + walk the last leg, walkback check if the rover fails | §8 — engine-side, reuses the Tier 1 grid |
| E1 | 360° view at stops from real NASA panoramas (PIA26559, PIA26696) | §10 |
| E2 | HUD overlay on the 360 view | §10 |
| E3 | Resubmit with E0–E2 + updated slides | Only if the Lead confirms post-judging edits count |
| E5 | **Relays:** rover or buddy as a radio relay (amber "contact via relay" zone); suggested drop point for a portable relay beacon that covers the most of the route | §9b |
| E4 | Printable **cuff card** (Apollo-style wrist checklist) + shareable plan link; daylight window (✅ done by Yassin, 2026-11-13); uncertainty bands | §17 |

### Tier 3 — Bonus (only after Tier 2 works on a normal browser)

| # | Item | Detail |
|---|---|---|
| X1 | Apple Vision Pro: same 360 + HUD page in WebXR | §11, demo-table bonus |
| X2 | 3D fly-along between stops (DEM + ortho) | Labeled visualization, not a photo |
| X3 | Chemical data at stops (ChemCam/APXS) | §7 row 7 |

### Not in this hackathon

~~AI assistant~~ (moved in scope 2026-11-14: Marwan merged PR #7, the voice/chat copilot; disclose AI use on the project page) · robot helpers beyond the rover-carries-samples option · splitting the pair onto different routes · in-browser re-routing (JS A\*) · orbiter relay-pass schedule (Unavailable) · storm
re-route · spatial radiation/weather maps (**Unavailable**: never shown as maps) · street view *between*
stops (no such imagery exists).

Cut rule: no Tier 2 work starts before Tier 1 is submitted; no Tier 3 work before Tier 2 works on a
normal browser.

## 4. Architecture

```
 ┌──────────────── NASA DATA (downloaded once, cached) ───────────────────┐
 │ USGS STAC: HiRISE DTM 1 m + ortho 0.25 m (CC0)  │ Trek: CRISM minerals │
 │ USGS: THEMIS thermal inertia 100 m              │ USGS: SIM 3292 units │
 │ MMGIS: Curiosity waypoints (sol → lon/lat)      │ raw-image API → pics │
 │ PDS: RAD dose + REMS weather (point values)     │ JPL: 360 panoramas   │
 └───────────────────────┬────────────────────────────────────────────────┘
                         ▼  data/raw/  + data/PROVENANCE.md (URL, date, license)
 ┌──────────────── ENGINE (Python, offline, runs once) ──────────────────┐
 │ 1 clip to ops box → 10 m grid (600×600)                               │
 │ 2 slope (max → 15° hard block; mean → energy), hillshade  (review F4) │
 │ 3 cost grid = slope + sand proxy (THEMIS)                             │
 │ 4 scipy Dijkstra fields per crew/load bucket:                         │
 │     Out_fast (from habitat), Back_fast, Back_safest (to habitat)      │
 │ 5 paths to stops × {fastest, safest} + time/O2 (Pandolf + κ)          │
 │ 6 radio coverage: viewshed from habitat mast → radio-shadow mask      │
 │ 7 [T2] rover grid: slope 20°, step 0.3 m, sand, width → park points   │
 │ 8 tiles (gdal2tiles z10–16)                                           │
 │   constants.json ← every number + source + badge                      │
 └───────────────────────┬───────────────────────────────────────────────┘
                         ▼  static files only (contract §15)
 ┌──────────────── WEB APP (static, no server) ──────────────────────────┐
 │ MapLibre map ── layer toggles ── stop picker ── route cards (A/B)     │
 │      │                                    │                           │
 │  crew setup (1–2, mass, load, samples) → picks precomputed bucket     │
 │  turn-back slider + zones (green/amber/red) + "don't go beyond" line  │
 │  radio layer: in contact / radio shadow + longest blackout per route  │
 │  walk-along slider → auto-switch to fastest return when O2 low        │
 │  photo pins (real sols)    source cards    RAD / REMS context cards   │
 │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ Tier 1 (base) above · Tier 2/3 below ─ ─ ─ ─ ─ ─ │
 │      │ click a stop                                                   │
 │      ▼                                                                │
 │  [T2] 360 view (three.js sphere) + HUD overlay ← routes.json          │
 │  [T3] same page in WebXR on Apple Vision Pro                          │
 └───────────────────────┬───────────────────────────────────────────────┘
                         ▼  upload the built folder (e.g. Netlify) → public URL, no login
                 Project page + 7 slides → Submit (Sat 09:00 Cairo)
```

Design rule: the browser never computes model numbers. The map, route cards and HUD all read the same
engine JSON, so they cannot disagree (review §7 integration contract). The only browser-side math allowed
is **comparing precomputed fields against the budget** (zone shading, §9) and **picking the nearest
precomputed crew/load bucket**. Both are threshold/lookup operations, not modeling.

Deployment note: `.gitignore` excludes `tiles/` and `app/dist/`, so a plain "GitHub Pages from the main
branch" deploy would ship without tiles. Deploy by uploading the built folder, or use a deploy branch.

## 5. Why Gale, not Jezero (site re-confirmed 2026-11-13, decision D02)

Jezero was reconsidered in the planning session because it is data-rich. **Gale stays** (Team choice):

| | Gale / Mount Sharp (chosen) | Jezero |
|---|---|---|
| Rover | Curiosity (since 2012) | Perseverance (since 2021) |
| Challenge's own worked example | **Yes**: boxwork in the Mount Sharp region | Not mentioned |
| Surface radiation measurement | **RAD**, the only surface dosimeter on Mars | None (no dosimeter on Perseverance) |
| Weather station | REMS (longest record) | MEDA |
| HiRISE imagery + 1 m-class elevation | Yes, plus Trek's ready 1 m Gale DEM | Yes (landing-site mapping) |
| Rover photos / 360s | Yes, incl. boxwork 360s (PIA26559, PIA26696) | Yes, very many |
| Science story | Water history, sulfates, boxwork veins | Delta/lake, potential biosignatures |

**Why Gale wins for this challenge:** (1) it is the challenge's own example (Relevance); (2) the challenge
asks for radiation/space-weather safety context, and only Gale has observed surface radiation (Jezero
would be Scenario-only). Switching would also discard the box, stops, DEM selection and panoramas.
Jezero is the better choice only if the science goal is "ancient life / delta". That's not our goal.
The Perseverance raw-image resource is therefore not used (wrong site); Curiosity imagery replaces it.

## 6. Ops area: corrected (supersedes the research-era box)

**Finding (2026-11-13, Observed):** the box assumed in the research docs, 137.30–137.45°E / −4.75…−4.55°,
does **not contain the boxwork site**, and it is about **8.9 × 11.9 km**, not the "~6×6 km" it is
labeled as. Curiosity's own waypoint file places the boxwork campaign south of it:

| Stop (proposed) | Evidence | Sol(s) | Lon °E | Lat ° | Badge |
|---|---|---|---|---|---|
| **S1 — First boxwork 360** | PIA26559 (Mastcam, 2025-05-15…18) | 4539–4541, site 116 | 137.38592 | −4.79782 | Observed (rover position) |
| **S2 — Nevado Sajama 360** | PIA26696 (2025-11-09…12-07) | waypoints at sols 4711 / 4741, site 120 | 137.38100 | −4.80800 | Observed |
| **S3 — Current position** | MMGIS current waypoint | 5070, site 125 | 137.38915 | −4.82568 | Observed |
| Habitat | Placed on flat ground downslope (north) of S1 during the pilot, from the slope map | — | TBD | TBD | **Scenario** (fictional) |

Sol↔date conversion: sols from the MSL landing (2012-08-06 05:17:57 UTC, 88,775.244 s per sol), matched to the
nearest waypoint. The waypoint file is sparse (1,388 stops), so S2 uses the waypoints bracketing the
panorama's sols, where the rover was stationary.

**Proposed ops box (Team choice, confirm at the pilot gate): 137.335–137.435°E / −4.85…−4.75°**
(≈ 5.9 × 5.9 km). It contains S1–S3 and sits inside the Trek 1 m DEM footprint.

**Elevation models covering the stops** (USGS STAC, CC0-1.0, DTM URLs probed with ranged GETs 2026-11-13):

| Item | Bbox (not footprint) | DTM | Size |
|---|---|---|---|
| `DTEEC_009149_1750_009294_1750_U01` | 137.353–137.468°E / −4.923…−4.676° | HTTP 206 ✓ | 182 MB — **first choice** |
| `DTEEC_019698_1750_019988_1750_U01` | 137.312–137.439°E / −5.040…−4.729° | HTTP 206 ✓ | 266 MB — covers the box's west edge |
| `DTEEC_040770_1755_039280_1755_A01` | — | **HTTP 404** (still dead, review F3) | — |

A bbox is not a footprint (HiRISE strips are diagonal), so the pilot must check each stop against the actual
raster. Fallback per the F3 ladder: Trek `Gale_DEM_SMG_1m` (`format=tiff&compression=LZW&size=…`).

## 7. Data types: build order

"At least three kinds" is **Recommended**, not a threshold. We reach 3 on Friday night, then add more.
A layer counts only if it helps navigation or explains a stop.

| # | Type | Dataset | Use | Badge |
|---|---|---|---|---|
| 1 | Optical | HiRISE 0.25 m ortho + Curiosity 360s/photos | See the ground and the stops | Observed |
| 2 | Topographic | HiRISE 1 m DTM → slope, hillshade | Hard 15° block; the route depends on it | Observed DEM → Derived slope |
| 3 | Thermal | THEMIS thermal inertia, 100 m | Sand-likelihood proxy (soft cost) | Derived (proxy) |
| — | **3 reached: Friday-night target** | | | |
| 4 | Spectral | CRISM mineral indicators (Trek) | Why each stop matters (sulfate host unit) | Derived |
| 5 | Radiation | Curiosity RAD dose | **Card**: dose per walk duration | Observed point + Scenario |
| 6 | Atmospheric | Curiosity REMS | **Card**: typical conditions, daylight window | Observed point |
| 7 | Chemical | ChemCam/APXS results at stops | Stop detail (manual curation) | Observed — Sunday only |
| ✗ | Geophysical | Gravity/radar | ~100 km resolution, meaningless at 6 km | Skip, say why |

Which external sources are in or out (Kaggle *Surviving Mars* game data: rejected; NASA Life Sciences
Portal EVA/walkback records: citations for the O₂/turn-back cards; the 5 official resources by tier):
see [`research/external-sources-review.md`](research/external-sources-review.md).

Honesty rules: RAD and REMS are rover-local, so show them as cards and never as map layers. SIM 3292
geology is interpretation: show it as extra context, but don't count it as spectral or chemical.
Pitch line: *"6 NASA data types from 4 missions, each labeled Observed or Derived."*

**Label decision (fixes cross-doc drift):** DEM elevation = **Observed** (stereo product); slope, hillshade
and cost = **Derived**; THEMIS thermal inertia = **Derived** (a model product from Observed radiance). The
research docs disagree on the last two (technical-approaches §1 vs mapping-options §13); the app uses this
table.

## 8. Crew, load, samples and rover model (Team choice; numbers are Scenario unless sourced)

### Crew and load: Tier 1 (B6b)

| Input | Default | Range | Source / badge |
|---|---|---|---|
| Crew size | **2** | 1–2 | NASA DRA 5.0 (SP-2009-566): Mars surface EVAs use a minimum of two people with a "buddy system" — Team choice default |
| Body mass W (each) | 82 kg | 43–110 kg | NASA JSC ICES-2026-127 *Mars Spacesuit Mass Requirements*: crew mass range 94–243 lbm (1st-pct female to 99th-pct male); its worked example uses a 180 lbm (82 kg) human |
| Carried load L (tools, kit) | 15 kg | 0–40 kg | Scenario slider. Context: ICES-2026-127 cites the NIOSH carry limit 51 lbf (227 N) |
| Samples picked up per stop | 2 kg | 0–10 kg | Scenario. Added to L for every leg **after** that stop, so the return leg costs more |
| Suit effect | κ = 1.3 | 1.2–1.5 | Norcross NASA/TP-2010-216115 (as before). Context card: the lunar xEMU is 391 lbm (177 kg); ICES-2026-127 recommends 230 lbm as a starting maximum Mars suit mass |
| Felt weight on Mars | (W + suit + L) × 3.71 m/s² | — | Derived arithmetic, shown on the crew card ("you carry X kg of Earth-weight") |

**Pair logic:** the pair walks at the pace of the slower member; each suit has its own O₂, so the pair's
turn-back point is the **earlier** of the two members' points. Load can be split evenly or carried by one
member (toggle). Stature/size isn't modeled; only mass enters the energy equation (stated on the card).
**Sample logistics:** every stop adds sample mass to whoever carries it (an astronaut, or the rover in
Tier 2). This is where "carrying equipment affects mobility" shows up visibly in the numbers.

### Science targets = rover drill sites + 360 sites (Tier 1 stop cards)

The Perseverance sample page the team shared (30 of 38 sample tubes filled, all at **Jezero**) is the
model for our stop-card layout: name, sample type, sol, rock type, size, location. At Gale, the equivalent
real targets are **Curiosity's drill sites**:

| Stop | Evidence | Nearest waypoint |
|---|---|---|
| **Altadena** drill site (boxwork-unit edge, drilled 2025-06-08) | JPL news 2025-06-23 | sol 4558–4560: 137.38350°E, −4.79981° (approximate: nearest waypoint) |
| **Valle de la Luna** block, "Monte Grande" hollow (boxwork-unit drill campaign, Oct 2025) | NASA Curiosity blog, sols 4689–4694 | sol 4687: 137.38104°E, −4.80784° (approximate) |
| + S1/S2 360 sites and S3 current position (§6) | — | — |

### Rover vs foot: Tier 2 (E0)

One planning grid, **two traversability rules**. The UI explains *why* the rover can't go somewhere:

| Terrain feature (from data) | Astronaut on foot | Crewed rover | Basis |
|---|---|---|---|
| Slope | blocked > **15°** (Team default) | blocked > **20°** (Team default, within LRV's 20–23° favorable / 25° max design) | Apollo LRV performance (NASA NTRS 20250011301); foot limit as before |
| Abrupt step / ledge (elevation jump between neighboring 1 m DEM cells) | passable up to ~0.5 m (step over/scramble) | blocked > **0.3 m** | LRV obstacle capability ~1 ft (secondary source, to verify); DEM vertical precision is tens of cm, so steps < ~0.5 m are **Unavailable** |
| Individual rocks/boulders | walk around | blocked | Rocks below HiRISE's ~1 m-scale resolution are **Unavailable**; stated, not hidden |
| Low thermal inertia (likely sand) | soft cost (slower) | **hard-avoid in safest mode** (entrapment risk: Spirit got stuck in soft soil in 2009) | THEMIS TI proxy (Derived); Spirit as context |
| Narrow passages between ridges (boxwork) | passable | blocked if narrower than vehicle width (scenario width 2.3 m) | Derived from slope mask morphology |
| Speed | 1.1–2.2 km/h working | ≤ 9–13 km/h design max on good ground (we use 5 km/h; Apollo slowed below 5 km/h around obstacles) | NASA NTRS 20250011301; ALSJ |

**Mixed plan:** the rover drives to a **park point** (nearest rover-reachable cell to the stop), and the pair
walks the last leg and back. The turn-back logic runs on the walking leg, measured to the rover.
**Walkback check:** if the rover fails at the park point, can the pair walk home to the habitat within
reserve? NASA's EVA Walkback Test concept (10 km suited walkback, NLSP record EWT; NASA TP-2009-214796)
is the reference. Our ≈6 km box always passes the distance part, so we show the O₂ check, not just distance.
**Rover carries samples:** with the rover, collected samples go on the rover, so crew load L stays constant.

## 9. Return-budget logic: zones and alternate-return proposal (Tier 1, B4b)

All outputs are **Scenario** estimates (they inherit the O₂ model's assumptions) and are worded as
modeled guidance, never as a guarantee (AGENTS rule 3).

**Current implementation boundary (2026-11-14):** production route and plan data now require complete
directed same-path `back` time/O₂ arrays. The former simplified `back_fast` display lines did not
preserve every legal native edge, so the field and automatic fastest-return switch have been removed.
Current PNR uses the same-path return costs only; the green/amber alternate-return zones and automatic
switch below remain proposals and must not be shown as current capabilities until complete alternate
geometry and matching costs exist.

**What the engine computes (same scipy Dijkstra machinery, a few extra fields):**

| Field | Meaning |
|---|---|
| `Out_fast(x)` | Modeled O₂ to reach cell x from the habitat by the fastest route |
| `Back_fast(x)` | Modeled O₂ to return from x to the habitat (or the rover park point) by the **fastest** return |
| `Back_safest(x)` | Modeled O₂ to return by the **lowest-hazard** return |
| `B` | Usable budget = capacity × (1 − reserve), per crew member; for a pair, the lower member's (§8) |

**Map zones (static layer for the current crew/load/budget):**

| Zone | Rule | Map style |
|---|---|---|
| **Return OK (any route)** | `Out_fast(x) + Back_safest(x) ≤ B` | green |
| **Fastest return only** | `Out_fast(x) + Back_fast(x) ≤ B < Out_fast(x) + Back_safest(x)` | amber |
| **Beyond turn-back** | `Out_fast(x) + Back_fast(x) > B` | red, outlined by the **"don't go beyond" boundary** |
| **Hazard no-go** | Hard-blocked cells (slope > limit; rover rules in Tier 2) + flagged data gaps | hatched, with a reason tooltip ("17° slope", "no elevation data") |

The boundary line is the edge of the red zone. It's the single clearest picture of "if you go farther
than this, getting back is modeled as not fitting your O₂".

**Along the planned route (the "walk along" slider in Tier 1; live in the HUD in Tier 2):** at each point x
with O₂ used so far `U(x)`, the remaining budget is `R(x) = B − U(x)`. Then:

1. If `R(x) ≥ Back_safest(x)` → recommend the **lowest-hazard return** (normal state).
2. Else if `R(x) ≥ Back_fast(x)` → **automatically switch** the recommendation to the **fastest return** and
   show an amber alert: "O₂ getting low: switching to the fastest way back".
3. Else → red alert: "past modeled turn-back point: return now by the fastest route". This state should be
   unreachable on a planned route (planning stops at the PNR), but the slider and HUD can show it when the
   user drags past it or changes the budget.

**Extra warnings:** approaching the boundary line (within N minutes of modeled walking, configurable)
shows "turn-back point ahead". Entering a hazard no-go cell isn't possible on a planned route (hard
constraint), but if the user drags a custom point there, the tooltip gives the reason.

**Tests (extend the T-suite):** zones are nested (green ⊆ green∪amber ⊆ reachable); lowering B only
shrinks zones; the switch point on a route is monotone in B; the recommended return always satisfies
`R(x) ≥ Back(x)` until state 3; pair mode never shows a later turn-back than either member alone.

## 9b. Radio coverage: where the crew loses contact (Tier 1 layer B4c; relays Tier 2 E5)

**Why it matters:** surface radios (helmet ↔ habitat) work by **line of sight**. On Mars the crew can't lean
on Earth: a one-way signal takes up to ≈22 min (§17). So the habitat is the crew's nearest help,
and every ridge, butte or boxwork wall between them is a place where nobody can hear a call for help.
Apollo crews solved this with a relay on the rover (the LCRU sent voice and TV straight to Earth, so
Apollo 15 kept contact 7 km from the LM with no line of sight to it). That direct-to-Earth fallback
doesn't work on Mars, so local coverage has to be planned.

**Is it range or terrain?** Derived arithmetic on a smooth Mars sphere (R = 3,389.5 km): radio horizon
d = √(2Rh) gives ≈8.2 km for a 10 m habitat mast (Scenario height) plus ≈3.7 km for a 2 m helmet antenna,
≈11.9 km in total, about twice our 6 km box. **So inside our box the limit is terrain, not distance.**
Radio range from transmit power is not modeled (**Unavailable**: no crew radio spec exists); the card says so.

**Engine (≈1–1.5 h):**
1. `gdal_viewshed` on the projected planning DEM from the habitat point, observer height = mast height,
   target height = 2 m (helmet antenna), `-cc 1.0` (no refraction, non-Earth body) and the Mars CRS, so the
   curvature uses the Mars radius. Output: coverage mask (1 = line of sight to the habitat).
2. Per route: % of time in radio shadow, **longest continuous blackout in minutes** (from the per-segment
   times), and where it starts.
3. Lowest-hazard route mode adds a cost penalty for shadow cells (Team choice weight); fastest mode
   ignores coverage but still reports it.

**Map + cards:**

| Layer state | Meaning | Style |
|---|---|---|
| In contact | Direct line of sight to the habitat mast | no tint (or light blue) |
| Contact via relay *(Tier 2)* | No line of sight to the habitat, but line of sight to the rover/buddy that sees the habitat | amber hatch |
| Radio shadow | Neither | grey-violet hatch, tooltip "ridge blocks the habitat" |

Route card line: "Out of contact 18% of the walk; longest blackout 12 min near stop 2". Warning (Scenario
threshold, Team choice): any continuous blackout over **10 min** is flagged, and the walk-along slider (§9)
shows "radio shadow ahead".

**Tier 2 relays (E5):** a second viewshed from the rover park point (rover = relay, as on Apollo) and from
the buddy's position on the route; plus a "drop a relay beacon here" suggestion: test ~50 candidate points
on high ground and pick the one that covers the most of the route's shadow minutes (one viewshed each, a
few seconds per run).

**Honesty labels:** coverage = **Derived** from the DEM (1 m DEM resampled to the 10 m grid can miss small
walls and won't model diffraction or reflections, so real coverage can be a bit better or worse);
blackout minutes = **Scenario** (they inherit the walking-speed model). Orbiter relay passes
(MRO, Odyssey, TGO) also give contact windows, but no future pass schedule for a crewed site exists, so
they're **Unavailable** and not drawn.

## 9c. O₂ model: spare oxygen, not "arrive at zero" (Mission Replay + turn-back; 2026-11-13, D27)

**Problem found:** the first replay showed only the plan's budget, so a turn-back plan looked like the crew
gets home on an empty tank. Real EVA planning never does that.

**How it works for real (searched 2026-11-13; re-check exact wording before quoting on slides):**

| Practice | What NASA did | Source |
|---|---|---|
| Reserve is never planned | Apollo traverse capacities were set **after a 30-minute consumables reserve** | Apollo traverse-planning memo (NASA ALSJ archive) |
| Red line | Apollo 11: PLSS "red line" = 30 min of O₂ or feedwater left | Apollo 11 Lunar Surface Operations Plan (ALSJ) |
| Walkback limit | Max distance from the LM was set by the **walkback** constraint (rover failure), at **3.3 km/h and 1440 BTU/h**, a pessimistic rate | Apollo 15 traverse planning (ALSJ) |
| Separate emergency supply | Apollo OPS (~30–90 min depending on flow) and the ISS EMU **secondary oxygen pack (30 min)**, used only in emergencies | ALSJ OPS page; NASA EMU overview |
| Buddy help | Apollo 14–17 BSLSS hose let a crewmember share the buddy's **cooling water** (not O₂); OPS + BSLSS gave ~75 min to reach the LM | ALSJ BSLSS page |
| Planning tools | NASA PersEIDS tracks and projects consumables over the EVA timeline and **recommends alternative timelines** when the plan won't fit | NASA NTRS (PersEIDS; exact record to confirm) |
| Apollo 17's walkback limit proved conservative; newer work adds projected metabolic rate | 2018 ICES paper (Texas Tech) | TTU repository |

**Our model (Team choice, Scenario-labeled, constants in `constants.json`):**

- **Tank = capacity C** (EMU-class usable primary O₂, 385 L).
- **Reserve R = max(25 % × C, 30 min × walkback rate)**: never spent by the plan. The walkback rate is
  1.22 L/min ≈ 422 W (Apollo's 1440 BTU/h) × 2.9 mL/min/W.
- **Plan budget B = C − R.** Turn rule: keep walking while `f × (used + m × home) ≤ B`, where
  **m = 1.2** plans the way home 20 % more expensive than expected and **f** = the hungrier suit in a pair
  (a pair is limited by its weaker member).
- **Emergency supply (30 min)** is shown separately and never used in a plan.
- **Result:** a normal plan gets home with **R plus the margin** still in the tank (on the mock route:
  ≈ 61 L left from a 200 L tank, reserve 50 L). The replay says "reserve intact", or honestly how much
  reserve a drill used.

**Replay notifications (what the crew hears/sees):**

| Event | When |
|---|---|
| **O₂ status** "O₂ 70 % · home needs ~20 % · reserve 25 % · spare 25 %" | every **10 %** of the tank (5 % option) |
| Turn-back point ahead | 10 min of walking before it |
| Turn-back point: heading home | at the modeled point |
| Usable O₂ below 25 % | crossing |
| Into the reserve / primary empty: emergency supply | only possible after a drill |
| Drill: "Suit leak ×2" / "Hard work ×1.5" | button, from the current moment; the plan recomputes, and turns on the spot if home no longer fits |
| Back at the habitat + arrival summary | end |

Gauge: one bar for the full tank: striped **reserve** zone, amber **"needed to get home"** zone, the rest is
spare. Pair: both members' O₂ shown, the plan follows the lower one. Voice callouts are optional (🔊).

**For the engine (Ali):** compute `back.o2_l` at the planned walking rate; the margin m and reserve are
applied by the turn-back logic from `constants.json`, so they're never baked in twice. `budget_l` in route
files = C − R.

## 10. Tier 2 — 360° view at stops + HUD (Optional per the challenge; Team choice; after Tier 1)

The challenge itself suggests both a helmet HUD and point-of-view images "so the astronaut knows what to
expect when they arrive at their destination".

- **Real panoramas, not invented scenery:** PIA26559 at S1, PIA26696 at S2 (credit NASA/JPL-Caltech/MSSS).
  Other stops get a strip of raw images from the same sol(s). Matching sol → waypoint gives each image the
  rover's position for that sol, which replaces the old "pin approximately" fallback for these stops.
- **Viewer:** a three.js textured sphere (MIT) rather than Pannellum, because three.js also gives a WebXR
  mode for Vision Pro (§11) with the same code. Use NASA's downsized versions (~8–16k px wide). Check
  whether each mosaic covers the full sphere and limit the vertical range if not.
- **HUD overlay:** heading · O2 remaining · distance/ETA to next stop · turn-back warning · current zone
  (green/amber/red) · recommended return (lowest-hazard or fastest, auto-switching per §9). All values
  come from `routes.json` and the §9 fields (**Scenario** model outputs, badged as such on the HUD).
- **Limit stated on screen:** real imagery exists **only at stops**. Moving between stops is a jump, like
  street-view points. A 3D fly-along from DEM + ortho is a Sunday extra, labeled "visualization from
  orbital data, not a photograph". No AI-generated Mars scenery; if any is used, SI watermark rules apply.

| Order | Item | Estimate |
|---|---|---|
| 1 | Tier 1 base: map + layers + routes + turn-back slider + cards | Fri night |
| 2 | Submit the Tier 1 snapshot | Sat 09:00 |
| 3 | 360 view at S1/S2 | +2–3 h |
| 4 | HUD overlay | +2 h |
| 5 | Tier 3: Vision Pro, 3D fly-along | Only if Tier 2 works |

Prep that can be done without touching base work: downloading the two panoramas and recording their
credits in `data/PROVENANCE.md`. Building the viewer waits until Tier 1 is submitted.

## 11. Tier 3 — Apple Vision Pro (Optional, Team choice; a demo-table bonus, never a dependency; after Tier 2)

- **Path:** the same web page, entered through **WebXR `immersive-vr` in Safari on visionOS**. Apple's WebKit
  supports the immersive-vr session type; it is on by default since visionOS 2; input arrives as
  `transient-pointer` (gaze + pinch). The user grants permission when the session starts.
- **Limit:** the WebXR **AR module is not supported** in visionOS Safari, so a HUD floating over the user's
  real room is not possible from the web. A fully immersive Mars 360 with the HUD is possible.
- **Rejected for this window:** a native visionOS app (Xcode/RealityKit). Judges can't open it from a public
  link, and it needs a separate build.
- **Use:** pitch table / People's Choice, plus a short screen recording for the slides. The judged demo
  (slides + public URL) never relies on the headset.
- **To verify on the device (Unverified until tested):** the WebXR session starts from our deployed URL; the
  panorama texture size loads; HUD text is readable at the chosen distance.

## 12. First steps (now)

1. **Lock the ops box + stops (15 min):** confirm §6, record it in the decision log (D11).
2. **Start the download immediately (critical path):** `DTEEC_009149…` DTM + its ortho, retry loop,
   checksums into `data/PROVENANCE.md`. In parallel: person B scaffolds the empty MapLibre page; person C
   asks the Local Lead (judging start time, who submits, local edit lock) and starts the slides/text.
3. **Pilot gate (~2–3 h, independent review §6):** G1 file opens + license recorded · G2 landmark alignment ·
   G3 route never crosses >15°, PNR moves monotonically · G4 ≤3 h. Full build starts only after it passes.
4. **Build Tier 1 (B1–B7) → submit.** Only then Tier 2, then Tier 3 (§3).

## 13. Tier 1 schedule and owners (assumes 3–4 people; adjust names at kickoff)

| Window (Cairo time) | Engine owner | App owner | Data/story owner |
|---|---|---|---|
| Fri, now → +3 h | Pilot: download DTM + ortho, 10 m grid, slope, one scipy route (gate G1–G4) | MapLibre shell, layer toggles on a placeholder image | Ask Local Lead; download panoramas + raw photos for the stops; start `PROVENANCE.md` |
| +3 → +7 h | Fields `Out_fast`/`Back_*` for 2 crew × 3 load buckets; routes to 4–5 stops; `constants.json` | Stop picker, route cards, turn-back slider, zones layer | THEMIS + CRISM exports; RAD/REMS card numbers; stop texts |
| +7 → +11 h | Tile ortho/hillshade/slope (z16 full + z17 core, review F1); engine tests (§9, T-suite) | Crew setup panel, walk-along slider + auto-switch alerts, source cards | 7-slide deck v1, project-page text, SI disclosure, NASA Data list |
| +11 → Sat 09:00 | Fix bugs, freeze data | Deploy (upload build), test logged-out on phone + laptop | Screenshots into slides; **submit at 09:00** |

If the pilot fails G1–G4 by +3 h: switch DEM per the F3 ladder, drop to 2 stops and 1 load bucket, and keep
the schedule. Cut order if late: radio relays stay Tier 2 anyway → walk-along slider → radio blackout stats (keep the coverage layer) → crew buckets (fix at 2 × 15 kg) → CRISM layer. The
turn-back slider and zones are the last things to cut.

## 14. Slide outline (7 slides, English, team + member names + challenge on slide 1)

1. **Title**: RedSight, team, members, "Interplanetary Survival Guide: Martian Map"
2. **Problem**: Mars Trek and USGS maps are regional/global; an astronaut needs a walk-scale plan
3. **Our map**: screenshot of layers + stops on Mount Sharp boxwork (Gale) and why this site
4. **Plan a Marswalk**: crew of two, load, samples → fastest vs lowest-hazard route, modeled time/O₂
5. **Getting home**: turn-back point, green/amber/red zones, automatic switch to the fastest return
6. **NASA data + honesty**: 6 data types, 4 missions, Observed/Derived/Scenario badges, what's Unavailable
7. **What's next + link**: Tier 2/3 (360 + HUD, rover mode, Vision Pro), public URL, repo

## 15. Data contract: engine → app (write it at kickoff; both owners code against it)

All files live in `app/public/data/` (built by `engine/`). Coordinates: planetocentric east-positive degrees,
explicit CRS `+proj=longlat +R=3396190 +no_defs` (review §7). Every number shown in the UI comes from one of
these files.

| File | Content | Producer → consumer |
|---|---|---|
| `meta.json` | ops box, grid origin/resolution/size, CRS string, nodata value, build date, constants-file hash | engine → app |
| `constants.json` | every model constant: `{value, range, unit, source_url, badge}` (κ, reserve, slope limits, speeds, O₂ conversion, crew defaults, rover rules) | engine ↔ app (UI reads, never hardcodes) |
| `layers.json` | per layer: tile URL template, zoom range, legend, provenance card fields, badge | engine → app |
| `stops.json` | GeoJSON points: name, evidence, sol(s), waypoint lon/lat, approx flag, photos[], panorama?, science text, badge | data owner → app |
| `routes/{stop}_{mode}_{crew}_{load}.json` + `routes/index.json` | `coords`, `seg[]` `{t_s, o2_l, slope_deg, cost_terms}`, `cum` + `back` tables (`t_s`, `o2_l` per point), `pnr_index`, `budget_l`, mode, constants hash, plus additive `goal_access` endpoint metadata. Exact fields: [`app/public/data/README.md`](../app/public/data/README.md) | engine → app |
| `fields/{crew}_{load}_{field}.png` | `Out_fast`, `Back_fast`, `Back_safest` as 16-bit PNG (O₂ in 0.1 L units) on the planning grid | engine → app (zones = threshold only) |
| `fields/coverage.png` + `coverage.json` | 8-bit mask (0 shadow / 1 habitat LOS / 2 relay LOS in Tier 2) on the planning grid; mast height, target height, CRS used | engine → app |
| `hazards.geojson` | hard-blocked areas with reason codes (`slope`, `nodata`, `edge`; Tier 2 adds `rover_step`, `rover_sand`, `rover_width`) | engine → app |
| `cards/rad.json`, `cards/rems.json` | context-card values + source + date range | data owner → app |

**Native route endpoint semantics (2026-11-13):** `stops.json` retains the Observed waypoint and its original
coordinates. Native route `coords` start at the existing Scenario habitat's source-pixel center and end at a
walkable Derived source-pixel center within a **10 m Scenario access bound** of the stop, selected only if it
shares the habitat's connected component under the unchanged 15° Horn maximum, nodata, no-corner-cut, and
edge-grade rules. The additive `goal_access` object carries `badge: Derived`, `status: approach_only`, the
Observed and endpoint coordinates, `offset_m`, the access bound, source row/column diagnostics, a reason, and
`last_leg_modeled: false`. Never append the Observed stop coordinate to the route or draw an implied last leg;
the route endpoint is not an exact-arrival claim. Consumers must keep the Observed stop marker separate from the
Derived route endpoint and label the endpoint as an approach point.

The engine minimizes fastest and lowest-modeled-hazard costs inside a bounded rectangle: the existing habitat
and all five Observed stop coordinates expanded by 250 m and clipped to the cached native DTM window. Report
these as corridor-limited optima, not global terrain optima. The route arrays, directed O₂/time segments,
reverse-path `back` arrays, and D27 PNR all describe the same native source-pixel path. The 9.88 m maximum-slope
aggregate remains a conservative context/hazard layer; a legal native path can pass through a planning cell
whose neighboring source pixels exceed 15°.

Buckets: crew ∈ {1, 2} × carried load ∈ {5, 15, 30} kg (+ sample mass rounded to the next load bucket for
legs after a stop). That's 6 field sets ≈ 6 × 3 × ~0.7 MB. If the size or time budget is tight, ship only
crew 2 × 15 kg.

## 16. Acceptance checks for the new features (add to the 24–48 h plan §3 list)

1. Crew of 2 never shows a later turn-back point than the same plan with one member (§8).
2. Raising load or sample mass raises modeled O₂ and moves the turn-back point toward the habitat.
3. Zones are nested and shrink when the budget drops; the "don't go beyond" line moves inward (§9).
4. On the walk-along slider, the recommendation switches to fastest exactly where `R(x) < Back_safest(x)`.
5. Coverage mask equals a direct `gdal_viewshed` rerun on the same DEM; route blackout minutes equal the sum of segment times inside shadow cells (§9b).
6. (Tier 2) every rover-mode route avoids rover-blocked cells; each blocked area shows its reason code.
7. (Tier 2) mixed plan: walking leg + walkback-to-habitat O₂ check both shown at the park point.

## 17. More ideas aimed at the judging criteria (searched 2026-11-13; Team choice)

The official Judging & Awards Guide scores **Impact, Creativity, Validity, Relevance, Presentation** and
asks teams to give Presentation equal weight (2025 guide, the latest found; re-check the 2026 text). A
feature list doesn't guarantee a win (AGENTS rule 2). Each idea below is picked because it is cheap and
hits a named criterion.

| Idea | What the user sees | Criterion | Cost | Tier | Source / label |
|---|---|---|---|---|---|
| **Our route vs Curiosity's real path** | The rover's actual traverse (MMGIS waypoints, already loaded for the stops) drawn next to our modeled walk | Validity, Relevance | 30 min | 1 (B6c) | NASA MMGIS waypoints · Observed |
| **Elevation profile + "why this route"** | Chart of height along the route; card lines like "+400 m longer to avoid a 17° slope", from the per-segment `cost_terms` already in the contract (§15) | Presentation, Validity | 45 min | 1 (B6c) | Derived |
| **EVA radiation-dose card** | "This 4 h walk ≈ 0.11 mSv" = RAD surface dose rate × EVA hours, shown next to NASA's 600 mSv career limit. Suit/terrain shielding is **not** modeled, which the card states | Relevance, Impact | 20 min | 1 (B6c) | RAD 0.64–0.67 mSv/day (already cited) + NASA-STD-3001 Vol 1 career limit 600 mSv · Derived/Scenario |
| **Earth can't help in time** | One line on the turn-back card and slide 5: a one-way signal to Earth takes up to ≈22 min (15–21 min during a long surface stay), with relay gaps and blackouts, so the crew decides on site. This is why the plan is precomputed and switches to the fastest return on its own | Impact | 10 min | 1 (B6c) | NASA Langley, McBrayer et al., ASCEND 2022 (NTRS 20220013418) · published analysis |
| **Cuff card** | Printable/phone card per route: legs as heading + distance + time + O₂ at each stop + turn-back point, like the Apollo 17 wrist checklists | Creativity, Presentation | 1–2 h | 2 (E4) | Apollo Lunar Surface Journal cuff checklists · format idea |
| **Shareable plan link** | Crew/load/stop/budget stored in the URL so a judge can open the exact plan shown on the slide | Presentation | 30 min | 2 (E4) | — |
| **Daylight window** ✅ **Done by Yassin (2026-11-13)** | Local sunrise/sunset for the planned sol at Gale, and a warning if the plan runs past sunset. Built: "Daylight" card under *Your plan* (Earth date + leave time in Mars local solar time → sunrise, back-home time, sunset, latest start, warning after sunset); `app/src/lib/mars24.ts`, `app/src/map/DaylightNote.tsx` | Validity | 1–2 h | 2 (E4) | NASA GISS Mars24 algorithm, **verified 2026-11-13**: the code reproduces both worked examples on the GISS algorithm page (`app/src/lib/mars24.test.mjs`, 5/5) · Derived (flat horizon; crater walls and dust not modeled) |
| **Uncertainty bands** | O₂ and turn-back drawn as a range (κ 1.2–1.5, sand cost low/high), not one line | Validity | 1 h | 2 (E4) | constants.json ranges · Scenario |
| **Bilingual labels (EN/AR)** | Toggle for Arabic UI labels for the Cairo audience; judging copy stays English | Presentation (local) | 1 h | 2 (E4) | Team choice |

**Demo script (Presentation):** a 60-second click path judges can repeat, written into slide 4–5 notes:
pick "boxwork + drill site" → crew of 2, 15 kg → compare fastest vs lowest-hazard → drag the budget down
and watch the zones shrink → walk-along until the switch to the fastest return → open one source card.

## 18. Doc-hygiene findings from this pass (2026-11-13)

| Finding | Status |
|---|---|
| Ops box misses boxwork; mislabeled 6×6 km (§6) | Fixed here; errata added to mapping-options; ai-context updated |
| Machine-readable traverse exists (MMGIS waypoints JSON) — the research listed the format as unknown | Recorded here + ai-context |
| Cairo event officially started Fri 2026-11-13 07:00 Africa/Cairo; Cairo page has no `submissionDeadline` | open-questions updated |
| 4 links in `requirements/` point to `/home/ali/Downloads/…`; those files are not on this Mac | Noted in open-questions; supply copies to the team or treat as unavailable |
| Build plan M4 says "A\*" though F2 made the scipy Dijkstra field the core | Annotated in 24-48-hour-plan |
| `.gitignore` excludes `tiles/` ⇒ deploy by upload, not Pages-from-main (§4) | Noted here |
| ai-context banned-word list omitted "safe time remaining" and "flight-safe" | Fixed in ai-context |

## 19. Sources (all accessed 2026-11-13)

- Official challenge page (live text re-extracted; resources unchanged, 5 items):
  https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/
- Cairo Local Event page (schedule starts 2026-11-13T07:00, timezone Africa/Cairo, `submissionDeadline: null`):
  https://www.spaceappschallenge.org/2026/local-events/cairo/
- Curiosity waypoints (NASA MMGIS): https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json ·
  current: https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints_current.json
- USGS STAC search (`mro_hirise_socet_dtms`): https://stac.astrogeology.usgs.gov/api/search
- Curiosity raw images API (latest sol 5072): https://mars.nasa.gov/api/v1/raw_image_items/?condition=msl
- PIA26559 Curiosity's First 360-Degree View of Boxwork Patterns:
  https://www.jpl.nasa.gov/images/pia26559-curiositys-first-360-degree-view-of-boxwork-patterns/
- PIA26696 Curiosity Captures a 360-Degree View at Nevado Sajama:
  https://www.jpl.nasa.gov/images/pia26696-curiosity-captures-a-360-degree-view-at-nevado-sajama/
- JPL, Curiosity starts unpacking boxwork formations (2025-06-23):
  https://www.jpl.nasa.gov/news/nasas-curiosity-mars-rover-starts-unpacking-boxwork-formations/
- Ogilvie, Swartout, Hoffmann, McFarland, Hickox, *Mars Spacesuit Mass Requirements*, ICES-2026-127, NASA JSC
  (NTRS 20260003038): https://ntrs.nasa.gov/citations/20260003038 (xEMU 391 lbm; 230 lbm recommended Mars max;
  crew mass 94–243 lbm; NIOSH 51 lbf; VO₂max ≥ 36.5 ml/min/kg for surface EVA)
- Apollo LRV performance (20–23° favorable, 25° max design slope; 9–13 km/h): NASA NTRS 20250011301,
  https://ntrs.nasa.gov/citations/20250011301 · ALSJ LRV performance:
  https://nasa.gov/wp-content/uploads/static/history/alsj/WOTM/WOTM-LRVPerformance.html
- NASA DRA 5.0, NASA/SP-2009-566 (buddy rule; surface strategy options): https://www.nasa.gov/pdf/373665main_NASA-SP-2009-566.pdf
- NASA Mars Rock Samples (Perseverance, Jezero; 30 of 38 sample tubes, 5 witness tubes):
  https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples/
- NASA Curiosity blog, sols 4689–4694, "Drill in the boxwork unit is go":
  https://science.nasa.gov/blog/curiosity-blog-sols-4689-4694-drill-in-the-boxwork-unit-is-go/
- Curiosity and Perseverance designed for slopes up to 30° (JPL):
  https://www.nasa.gov/centers-and-facilities/jpl/this-transforming-rover-can-explore-the-toughest-terrain
- Space Apps Judging & Awards Guide (five criteria): https://www.spaceappschallenge.org/resources/judging-awards-guide
- NASA-STD-3001 radiation technical brief (career effective dose < 600 mSv):
  https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf
- McBrayer, Chai, Judd (NASA Langley), *Communication Delays, Disruptions, and Blackouts for Crewed Mars Missions*,
  ASCEND 2022, NTRS 20220013418: https://ntrs.nasa.gov/citations/20220013418 (max one-way ≈22 min; 15–21 min for long stays)
- Apollo cuff checklists (heading/distance per traverse leg): https://www.nasa.gov/history/alsj/a17/cuff17.html
- Apollo LCRU (Lunar Communications Relay Unit) relayed voice/TV from the rover to Earth: NASA NTRS 19710030222,
  https://ntrs.nasa.gov/citations/19710030222 · ALSJ, Apollo 15 contact with no line of sight to the LM:
  https://nasa.gov/history/alsj/alsj-JamesBurns.html
- NASA Mars Relay Network: https://science.nasa.gov/mars/mars-relay-network/
- GDAL `gdal_viewshed` (observer/target height, curvature coefficient, projected CRS required):
  https://gdal.org/en/stable/programs/gdal_viewshed.html
- Apollo walkback/reserve/red-line practice (ALSJ): Apollo 11 Lunar Surface Operations Plan,
  https://www.nasa.gov/history/alsj/a11/AP11_LSOPsPlan.pdf · traverse-planning memo,
  https://www.nasa.gov/wp-content/uploads/static/history/alsj/19790073512_1979073512.pdf
- Apollo OPS: https://www.nasa.gov/history/alsj/WOTM/WOTM-OPS.html · BSLSS: https://www.nasa.gov/history/alsj/WOTM/WOTM-BSLSS.html
- EMU overview (secondary oxygen pack, 30 min): https://www.nasa.gov/wp-content/uploads/2009/07/188963main_extravehicular_mobility_unit.pdf
- NASA PersEIDS consumables tool (search hit; confirm the record): https://ntrs.nasa.gov/citations/20230007488
- EVA walk-back limit calculation (ICES 2018): https://ttu-ir.tdl.org/handle/2346/74208
- WebXR on visionOS. Apple Developer Forums (WebKit supports `immersive-vr`; AR module unsupported):
  https://developer.apple.com/forums/thread/743655 · https://developer.apple.com/forums/thread/756850 ·
  default-on in visionOS 2 (secondary report): https://roadtovr.com/visionos-2-webxr-support-vision-pro/
