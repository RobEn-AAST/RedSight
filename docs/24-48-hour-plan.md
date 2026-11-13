# RedSight — 24–48-Hour Build Plan

**Owner:** Agent4. **Written:** 2026-11-13; edited same day by the documentation editor to fold in the
independent review's corrections (F1–F4 especially — see its §3). Companion to [`technical-approaches.md`](technical-approaches.md).
**Clock:** T0 = Fri Nov 13 evening (Cairo day 1). **T+14 h ≈ Sat 9:00 a.m. Cairo** — project tab opens; Cairo local
judging is Saturday ⇒ a submittable snapshot must exist by then. **T+48 h ≈ Sun Nov 15, 11:59 p.m.** global close.

> Hard rule baked into every task: the "no pre-work" rule means all artifacts are produced inside this window.
> If the Local Lead permits earlier data downloads (open-questions #3), the Data track moves ahead by hours.
>
> **Pilot gate (independent review §6):** before any app code, run the ~2–3 h end-to-end pilot (one reachable
> DTM + ortho → 10 m grid → scipy route → static render) and pass gates G1–G4 (DEM downloaded & licensed; CRS
> pinned + landmark alignment; route obeys hard constraints + PNR monotone; pilot ≤ 3 h). Record the gate
> decisions (grid resolution, mean-vs-max slope, STAC-vs-Trek primary, tiling scheme) in the decision log.

---

## 1. Scope triage — Must / Should / Stretch

| # | Feature | Class | Why |
|---|---|---|---|
| M1 | Interactive map of the ops area (HiRISE 0.25 m optical + 1 m DEM hillshade) | **Must** | Core "layered view"; optical + topographic (2 of the challenge's *suggested* data kinds — three kinds is a suggestion, not a threshold) |
| M2 | Toggleable layers: slope (derived), THEMIS thermal inertia (sand proxy), CRISM-derived mineral/science sites, geology (SIM 3292) | **Must** | Reaches 3–5 NASA data kinds (strengthens the suggested bar); each layer = data-type point |
| M3 | Science-goal picker → candidate sites (curated from CRISM/boxwork/geology evidence) | **Must** | The astronaut's "why walk here" |
| M4 | Cost-grid + A* route planner with hard slope/terrain constraints; time & O2 estimate; turn-back point | **Must** | Route map ("if possible" — we deliver it); Validity criterion |
| M5 | Provenance & uncertainty inspector (Observed / Derived / Scenario badge per layer, source, date, resolution) | **Must** | Differentiator; protects Validity score; enforces honesty |
| M6 | Project page + demo (7 slides or ≤30 s video) + full credits, SI disclosure | **Must** | Submission gate — hard ineligibility rules |
| S1 | 3D terrain view of ops area (same DEM, three.js) with route overlaid | Should | Matches "3D terrain" ambition; strong Presentation |
| S2 | First-person HUD walk-through (heading, O2 countdown, next stop, turn-back) | Should | The "wow"; feasible as camera-along-route |
| S3 | Real Curiosity photos pinned at/near locations (raw-image API, sol-tagged) | Should | Grounds it in a real mission; cheap via verified JSON API |
| S4 | Mission setup panel: solo/buddy, foot/rover/mixed, load kg, time window; recompute | Should | The user's Step 2; cheap once engine exists |
| S5 | Comms line-of-sight layer (DEM raycast from habitat) | Should | Derived from data we already have |
| S6 | Radiation & weather scenario cards (RAD climatology + REMS/MCD window + user-set SEP scenario) | Should | Radiation data type without faking a spatial map |
| X1 | Robot helper load support; two-astronaut buddy split logic | Stretch | Only if engine generalize­time allows |
| X2 | Storm-abort / shelter re-route mid-walk (HUD mode) | Stretch | Depends on S6 + HUD |
| X3 | AI assistant with grounded dataset/mission Q&A | Stretch | See guardrails in technical-approaches §6 |
| X4 | Rover stereo photogrammetry input | Stretch | Likely no time; mention as roadmap |

Cut rule: **no Stretch item starts before every Must has acceptance evidence** (§3).

## 2. Phase plan (timeboxed)

### Phase A — T0 → T+3 h (Fri evening): freeze decisions, pull data
- **A1 (30 min) Architecture lock** — adopt Approach 1 (web-first 2D core + 3D/HUD extension) from
  technical-approaches §4 unless the team vetoes; write the one-page contract between Engine and UI (JSON schemas
  for `ops-area`, `cost-grid`, `route`, `layers`). *Evidence: decision recorded in team log.*
- **A2 (parallel, 90 min) Data pull** — ops-area box (≈6×6 km) around the chosen habitat point near the boxwork
  region: DEM (Mars Trek `Gale_DEM_SMG_1m` export or PDS HiRISE DTM), HiRISE mosaic (`curiosity_hirise_mosaic`),
  THEMIS IR/thermal inertia tile, CRISM-derived mineral layer (Trek services), SIM 3292 units, REMS + RAD
  climatology tables, Curiosity photo metadata. Cache everything locally — demos must not depend on live Trek
  endpoints (they are undocumented and flaky under load). **Download playbook (review F3):** probe all 8 USGS
  ARD STAC DTM hrefs and rank by reachability (the example `DTEEC_040770_1755_…` product is dead; some URLs
  flip 206→404 for minutes) — download with a retry loop + COG integrity check, and ladder down per layer:
  another STAC DTM → Trek quantitative export (**exact spelling `format=tiff&compression=LZW&f=image`; `format=tif`
  silently returns JPEG-in-TIFF; without `size=` output caps at 400×400 px**) → PDS ODE `MRO-M-HIRISE-5-DTM-V1.0`.
  Run downloads in parallel with UI scaffolding, not after it. *Evidence: `data/raw/` populated + checksums logged in
  `data/PROVENANCE.md`.*
- **A3 (30 min) License + demo-format decisions** with the user (D03, open-questions #4). License is now
  research-resolved (technical-approaches §7): official Terms require an OSI license + documentation, default
  distribution Apache 2.0 ⇒ propose Apache-2.0; demo format + hosting target to pick. *Evidence: decision-log updated.*
- **A4 (30 min) Repo scaffolding** per README structure; CI-less (no time); `.gitignore`; LICENSE file.

### Phase B — T+3 → T+9 h (Fri night): engine + data products
- **B1 DEM → derived rasters** (Python): resample 1 m DEM to planning grid (5–10 m/px), compute slope, sky-view
  factor (for the radiation-layer honesty), terrain ruggedness; hillshade PNGs for the base map.
  **Slope aggregation decision (review F4, decide here, not accidentally in code):** compute BOTH mean- and
  max-aggregated slope; use **max (or 90th-pct) for the hard 15° constraint** (conservative for a suited walker)
  and **mean for Pandolf energy** (noise-averaged); state the choice on the slope layer card.
  *Evidence: raster files + spot-check vs known Gale landforms (e.g. buttes visible in HiRISE).*
- **B2 Cost grid**: per-cell cost = slope penalty + thermal-inertia sand penalty + hazard mask (craters/scarp
  polygons over threshold slope); hard constraint at suit-climbable slope (~15° working value, configurable;
  literature range in technical-approaches §3 "Model constants" — see the "Max planning slope" row). *Evidence:
  rendered cost map + statistics; no route crosses a
  hard-constraint cell.*
- **B3 Router core — scipy Dijkstra field first (review F2; supersedes a hand-written Python A\* on the critical
  path):** `scipy.sparse.csgraph.dijkstra` full field from the habitat per mode preset (measured **0.25 s** on the
  1.44 M-node grid; returns predecessors) → extract every goal's optimal path from predecessors; a hand-written
  Python heapq A\* measured **6.5 s** worst-case and is demoted to (a) the 48 h JS-worker interactive re-route and
  (b) a cross-check oracle (review test T7). Outputs polyline, cumulative time/O2 vs Pandolf-based metabolic
  model, turn-back cell where remaining reserve = return cost; keep both `Back_time` and `Back_o2` fields and
  pick per budget type (review §2 precision point). Unit sanity tests on a synthetic grid (known shortest path).
  *Evidence: two routes on real DEM with time/O2 tables that respond to load/mode inputs.*
- **B4 Time/O2 model** (deterministic calculator): Pandolf (1977) load-carriage equation with terrain factor
  mapped to thermal-inertia bins, suit overhead per Norcross TP-2010-216115, sanity-clamped to HIDH Table 11.1-1
  bands (avg 264–286 W suited); O2 via **1 W ≈ 2.9 mL O₂/min** (1 L O₂ ≈ 20.9 kJ); EMU-class reference suit
  (0.55 kg primary O₂, 7–8 h max); return reserve 25 % and 15° max slope = labeled team assumptions. All
  constants in one config file with per-constant source citations (see technical-approaches §3). *Evidence:
  calculator unit tests; numbers match hand calculation.*
- **B5 (parallel, from T+4 h) Map UI starts** on cached hillshade+optical rasters (MapLibre or plain canvas):
  pan/zoom, layer toggles, opacity — static JSON config-driven so engine output can drop in. **Tiling timing
  (review F1):** the corrected budget is z17-full-box ≈ 1,369 top-level tiles (~1,820 with pyramid, ≈ 160–400 MB
  ortho) — recommended z16 full + z17 core (≈324 tiles) — start tiling during the **Phase B dinner hour**, not
  Phase C morning. *Evidence: local URL shows ≥4 toggleable layers.*

### Phase C — T+9 → T+14 h (Sat early morning): MVP assembly + submission snapshot
- **C1 Wire planner UI**: goal picker → site cards → route A/B with time/O2 + turn-back marker; recompute on
  load/mode change. *Evidence: end-to-end scenario "boxwork goal, 30 kg, 6 h window" produces routes + estimates
  on screen.*
- **C2 Provenance inspector**: click any layer/number → source card (URL, resolution, date, Observed/Derived/
  Scenario badge). *Evidence: every visible layer has a filled card.*
- **C3 Deploy** static build (GitHub Pages/Netlify) — public, no-login; test logged-out on phone + laptop.
- **C4 Submission pack**: project page text (English), NASA Data field, credits list, SI disclosure, demo v1.
  When the tab opens 9:00 a.m., submit immediately — edit-and-resubmit is allowed until close; **do not bet on
  post-local-judging edits without Lead confirmation**. *Evidence: submitted-page URL + screenshot.*

### Phase D — T+14 → T+24 h (Sat, after local judging): Should-tier
- **D1 3D terrain view** (three.js mesh from same DEM; route as extruded line). *Evidence: orbit view with route.*
- **D2 HUD walk-through**: first-person camera following the route polyline; HUD = heading (computed from route
  bearing), O2 countdown (from B4 table), distance/ETA to next stop, turn-back marker passing alert. *Evidence:
  60-s screen recording.*
- **D3 Curiosity photo pins** via the verified raw-images JSON (sol + camera filters; note: photos carry site/sol
  metadata, not always precise coordinates — pin by site/region honestly, labeled approximate). *Evidence: ≥5
  real photos keyed to map regions.*
- **D4 Mission setup panel + S5 comms LOS layer.** *Evidence: LOS polygon from habitat matches hand raycast of
  a visible ridge.*

### Phase E — T+24 → T+48 h (Sun): harden + Stretch + final polish
- **E1 Weather/radiation scenario cards (S6)**; **E2 buddy/robot/stretch logic (X1/X2)** only if green;
  **E3 AI assistant (X3)** only within guardrails (technical-approaches §6). 
- **E4 Presentation polish**: README, screenshots/GIF, 2-min optional walkthrough video (distinct from the
  ≤30 s judged demo), resubmit final before Sun 23:59. *Evidence: final public link re-tested logged-out.*

## 3. Acceptance evidence — the "honest demo" definition

A judge (or we, logged-out) can verify at the public URL:

1. **Layered map works**: ≥4 NASA-sourced layers toggle independently over the Gale ops area.
2. **Route is real, not drawn by hand**: pick goal + parameters → route recomputes and visibly avoids
   slope/terrain hazards; changing load kg or mode changes time/O2 monotonically and plausibly.
3. **Every number is traceable**: provenance inspector shows source + type badge (Observed/Derived/Scenario) for
   each layer and each model constant; scenario inputs are visibly user-set, not claimed as measurements.
4. **Claims match reality**: README + UI say "decision-support prototype using real NASA data", never
   "flight-safe", "real-time", or "validated for astronaut safety"; coarse-data limits (MOLA, THEMIS 100 m,
   CRISM ~18–200 m, RAD point measurement) are stated where the data is used.
5. **Demo asset** within limits (≤30 s / 7 slides), English, public, no minors, SI-disclosed.

## 4. Risks & dependencies

| Risk | Impact | Mitigation |
|---|---|---|
| Mars Trek endpoints unstable/rate-limited (undocumented; TLS resets seen) | Blocks B1/B2 | Pull everything once in Phase A, cache; fallback ladder in A2 below (STAC → Trek → PDS ODE); dataset access paths in technical-approaches §1.1 |
| **S3 ARD download flakiness (review F3): one quoted DTM dead, URLs flip 206→404 under repeat load** | Blocks B1 | A2 probe-and-retry ladder with COG integrity checks; ortho subfolder was stable; run downloads parallel to UI scaffolding |
| HiRISE DTM exports huge (6×6 km @1 m ≈ 36 MP+) | Slow build | Pre-crop to ops box; downsample planning grid to 5–10 m |
| DEM (1 m, lower Mt Sharp only) doesn't cover the whole story area | Layer mismatch | Fix habitat + targets inside the verified DEM footprint from the start; MOLA/CTX shown only as context layers |
| Pre-work boundary dispute | Eligibility | Ask Lead tonight (open-questions #3); everything committed after event start regardless |
| Cairo local lock contradicts global edit-until-close | Late fixes lost | Submit at 9:00 a.m. Sat snapshot; treat post-judging edits as bonus |
| SI/AI disclosure missed or NASA logo in generated art | Ineligibility | One owner (A3) writes disclosure + reviews all assets |
| Scope creep into Stretch before Musts pass | Miss submission | Cut rule §1; hour-gates in §2 |
| Two-astronaut/O2 model challenged by judges as unsafe | Validity score | Scenario labeling + cited constants; "prototype decision aid" framing everywhere |

## 5. Small build tasks (issue-ready)

Each = one branch, one acceptance check, ≤2 h: `A2-data-pull`, `A4-repo-scaffold`, `B1-derived-rasters`,
`B2-cost-grid`, `B3-router-core`, `B3b-router-js`, `B4-o2-model`, `B5-map-shell`, `C1-planner-ui`,
`C2-provenance-inspector`, `C3-deploy`, `C4-submission-pack`, `D1-3d-view`, `D2-hud-walkthrough`,
`D3-photo-pins`, `D4-mission-panel-los`, `E4-final-polish`.

Branch/issue conventions and repo layout: see draft `README.md`.
