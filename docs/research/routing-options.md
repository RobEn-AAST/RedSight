# Routing Options — Traverse Planning for the Marswalk Planner (Gale / Mount Sharp)

**Owner:** routing research worker (Agent task `task_640a044af8b9`). **Written:** 2026-11-13.
**Scope:** how heterogeneous NASA data becomes a traversability graph, which path-planning algorithm we should
run in a 24–48 h honest demo, route modes (fastest / safest / balanced), point-of-no-return (walkback) logic,
test plan, claims audit, and library/stack recommendation. **No app code written here** — this is the design
evidence for build tasks B2/B3/B4 in [docs/24-48-hour-plan.md](../24-48-hour-plan.md).

**Provenance taxonomy used throughout** (matches the app's provenance inspector):
**Observed** = measured by an instrument; **Derived** = computed from observations (slope, LOS, cost grid);
**Scenario** = assumption/estimate that cannot be verified from data (suit O2, SEP storms); **Unavailable** =
no data exists publicly at the needed fidelity.

## Errata — 2026-11-13 (post independent review; findings below preserved as evidence)

The [independent architecture review](independent-architecture-review.md) re-verified this report's
citations, re-derived its math, and benchmarked its performance claims on this machine. Corrections
that touch this document (original sections kept intact below as the research record):

- **F2 — §5/§9's "per-goal A\* ≤ 1 s (Python)" is refuted by benchmark.** Measured on the exact
  advertised grid (1.44 M nodes, pure-Python heapq): **6.5 s worst-case OD** (1.61 M pops). Measured
  `scipy.sparse.csgraph.dijkstra` **full field: 0.25 s**, returning predecessors from which *every*
  goal's optimal path is extractable. **Adopted:** scipy full field per mode preset is the 24 h engine
  core (build plan B3 updated); the hand-written A\* is demoted to the 48 h JS-worker implementation
  and the T7 cross-check oracle. "A fresh A\* is already <1 s" in §5's D\* Lite row inherits this
  correction (scipy re-run is ~0.25 s; hand-written Python A\* is not sub-second).
- **F5 — §8's pseudocode heuristic is an optimality bug if copied literally.** `h = euclid/v_max` is
  admissible for **pure time only**; for `J_α = α·t̂+(1−α)·r̂` the heuristic must be
  `α·(euclid/v_max)/t_ref`, and for **safest** mode there is no cheap admissible lower bound on risk →
  use h = 0 (i.e. Dijkstra). Also the §3.6 speed model `V = V_max·max(0.3, cos(2θ))` is an **even
  function of θ** (downhill speed equals uphill), contradicting §3.6's own "downhill capped" text;
  θ units (degrees vs radians) are unstated; and §10's toy uses a third variant (fixed V + time
  factor). **Adopted:** define ONE piecewise V(θ) (level/uphill per the cos-model, downhill flat
  ~1.1·V_max until −12° then decreasing; degrees stated), use it in engine and toy, property-test
  monotonicity in T6.
- **CRS label (review §2) — §2's "Mars 2000 sphere … WKID 104905" mixes two codes.** epsg.io
  registers **ESRI:104905 as the *ellipsoidal* GCS** (sphere = **ESRI:104971**; mapping-options §2.1
  has this right). Resolution: adopt mapping's rule — explicit `+proj=longlat +R=3396190` (or
  IAU2015:49900), planetocentric east-positive end-to-end, convert on ingest, verify one landmark
  against the ortho. At Gale, sphere-vs-ellipsoid latitude *is* the ~3.2–3.3 km trap, so the label
  matters even though both services serve planetocentric degrees either way.
- **F8 — §3.7's no-GDAL Bresenham fallback ignores planetary curvature** (~5.3 m of drop over a 6 km
  sight line on Mars). Acceptable if stated: add "planar approximation" to the LOS layer card whenever
  the fallback ships; `gdal_viewshed` (GDAL ≥3.6 sets CurvCoeff 1.0 for non-Earth CRS) handles it.
- **PNR precision points (review §2):** the PNR check must use the **O₂-based** backward field when
  the budget is O₂ and the **time-based** field when it is time — pick per excursion input, don't
  mix; and make T8 assert the Back≠Used reversal (soft η terms are direction-asymmetric only through
  V(θ)).
- **UI caption (review §2):** keep the mode *named* "Safest" if desired, but put "lowest modeled
  hazard-score within available data" **on the mode selector itself**, not only in docs.
- **Naming:** the project is now called **RedSight** (this report's title-era name "Marswalk Planner"
  is superseded). No other content affected.

Everything else the review re-checked was confirmed: Pandolf hand-checks (285 W / ~1020 W / 63 L/h),
the §10 toy example (all times, risks, α≈0.913 crossover, both PNR cases), the planetographic offset
(3.18 km recomputed), scale factors and the z-ladder, graph sizes (1,440,000 nodes / 11,436,858
directed edges), the gdal_viewshed non-Earth curvature behavior, and every DOI/citation.

---

## 0. Conclusions (TL;DR)

1. **Graph model:** an 8-connected grid graph over a **5–10 m planning raster** (upsampled from the 1 m
   HiRISE DEM / `Gale_DEM_SMG_1m`), with asymmetric directed edge costs. Nodes carry per-cell attributes
   (slope, surface proxy, LOS flag, science value); edges carry time, energy and risk costs. ~6×6 km at 5 m
   ⇒ 1.44 M nodes / ~11.5 M directed edges — tractable in seconds with optimized Dijkstra/A*.
2. **Algorithm:** **scalarized A\*** (single combined cost per mode preset) for routing + **one backward
   Dijkstra from the habitat** producing a *return-cost field* that yields reachability, walkability and the
   point of no return almost for free (the energy-constrained-shortest-path "feasibility via backward
   search" pattern, Sachenbacher & Artmeier 2011). This exact pair is the 24 h MVP.
3. **Modes:** *fastest* (minimize modeled EVA time), *safest* (minimize a hazard-score integral with hard
   constraints kept), *balanced* (normalized weighted sum, weights exposed in the UI). Full Pareto
   (multiobjective label-setting) is **rejected for 24 h**, offered as a 48 h ε-constraint sweep (run 3–5
   weighted searches, dedupe → "route options" cards).
4. **Point of no return:** PNR = farthest node on the outbound route where
   `used_O2 + return_O2(node) ≤ (1 − reserve) × tank`, with the return cost taken from the backward-Dijkstra
   field, *not* assumed equal to the outbound path. Directly modeled on NASA's walkback concept
   (10-km suited walkback test, NASA TP-2009-214796).
5. **Honesty:** radiation is a single-point measurement (RAD) — any spatial radiation layer is
   **Derived/Scenario**; Mars SEP forecasting is **Unavailable operationally** (research nowcasting only);
   O2/time figures are **Scenario** (Pandolf 1-g equation transferred to Mars). The UI must never print
   "safe route" — only "lowest modeled risk within available data (5–100 m, partial coverage)".
6. **Stack:** Python engine (`numpy` + `scipy.sparse.csgraph.dijkstra` + a small hand-written A* if
   needed; GDAL optional for viewshed) producing static JSON; browser UI (MapLibre) renders precomputed
   routes; 48 h option: A* re-implemented in a JS Web Worker (typed arrays) for interactive re-planning.

---

## 1. Inputs available (from the workspace data inventory)

From team-verified inventories (README data table; `martian-map-resources.md`; Mars Trek service memory,
all accessed 2026-11-13):

| Layer | Source | Native resolution | Role in routing | Taxonomy |
|---|---|---|---|---|
| DEM `Gale_DEM_SMG_1m` | Mars Trek ArcGIS ImageServer (PDS HiRISE DTM behind it) | ~1 m/px, lower Mount Sharp footprint (137.122–137.730°E, −4.925…−4.249°) | slope, energy, LOS, PNR | Observed (stereo-derived) |
| HiRISE optical mosaic `curiosity_hirise_mosaic` | Mars Trek | ~0.25 m/px | visual context; optional texture/obstacle proxy | Observed |
| THEMIS IR / thermal inertia | ASU (Trek layers) | ~100 m/px | surface-type proxy (sand vs indurated) | Observed → Derived proxy |
| CRISM-derived mineral indicators (Fe/Mg smectite, poly-sulfate, …) | Trek `MapServer` layers | ~18–200 m footprints | science-target sites (reward, not cost) | Derived (interpretive) |
| Geologic units SIM 3292 | USGS (Trek `SIM3292_Global_Geology`) | regional | surface-type prior, context | Derived (interpretive) |
| REMS weather (Curiosity) | PDS GEO / CAB | rover-local, per-sol | weather context card; scenario windows | Observed (point) |
| RAD radiation (Curiosity) | PDS PPI | rover-local, time series | radiation context; ~0.67 mSv/day GCR | Observed (point) |
| Curiosity raw images + location map | mars.nasa.gov JSON API | per-sol photos | ground-truth visual check of routes | Observed |
| MOLA/HRSC blend | Trek global layers | 200 m/px | ops-area siting context only | Observed |

Key resolutions for honesty labels: THEMIS-derived thermal inertia accuracy ~20%, precision 10–15%
(Fergason & Christensen 2006); HiRISE DTMs ~1 m post spacing with vertical precision ~0.25–1 m
(Kirk et al. 2008); CRISM pixels 18–200 m. **Nothing measures rock-by-rock walkability at suit scale over
the whole ops area** — the planner is a decision aid over proxies, and must say so.

---

## 2. Coordinate frame, scale and alignment assumptions

All Mars Trek ImageServers serve equirectangular products on the **Mars 2000 sphere** (IAU 2000,
R = 3 396 190 m; Trek reports WKID `104905`, which epsg.io maps to the Mars 2000 geodetic CRS — ESRI code,
not official EPSG; the projected equivalent is ESRI:103885 "Mars 2000 Equidistant Cylindrical (sphere)").
Sources: epsg.io/104905, epsg.io/103885 (accessed 2026-11-13).

Working assumptions (state them in the app's provenance panel):

- **Planetocentric = planetographic** on the sphere → no datum headache; east-positive longitudes.
- **Local planar approximation** for the ~6×6 km ops box: 1° ≈ 2πR/360 = **59 274.7 m** in both lon/lat;
  over 6 km on R = 3 396 km, curvature/angle distortion is negligible (<0.03% scale). We compute
  everything in local meters (`x = (λ−λ0)·59274.7·cos φ0`-style is unnecessary at equirect std-parallel 0 —
  at φ = −4.6° the cos factor 0.9968 can be applied once to lon; even omitted it is a 0.3% length error.
  Recommendation: include the cos φ0 factor, it is one multiply).
- **All layers resampled to one planning grid** (common extent + resolution) before fusion; nearest-neighbor
  for categorical (geology, LOS), bilinear for continuous (TI). Alignment is by shared lon/lat extent, not
  by pixel counting — Trek exports give bounding boxes we can trust only to the export rounding; we snap
  the habitat/target coordinates to cells *after* resampling and visually verify against the HiRISE mosaic
  (buttes are unmistakable).
- **Elevation units are meters** (HiRISE DTM products are in meters relative to the Mars areoid at R =
  3 396 190 m); we never need absolute elevations, only differences within the ops box.

---

## 3. Traversability data model

### 3.1 Planning grid and slope (Derived)

Resample the 1 m DEM to **5 m/px planning cells** (1200×1200 for 6×6 km; 10 m/px ⇒ 600×600 if compute is
tight — a good fallback switch). Compute per-cell slope with **Horn's 3×3 finite-difference method** (the
standard DEM slope operator; this is what GDAL's slope tool implements). At 5 m cells on a 1 m DEM the
vertical precision (~0.25–1 m) gives slope noise of order arctan(0.5/5) ≈ 3–6° per cell — real and must be
stated; we mitigate by computing slope from the DEM **box-filtered to the planning resolution** (average
heights, then difference), which smooths stereo noise but also smooths true small scarps. That trade is a
labeled assumption, not a hidden one.

Per-cell attributes (all Derived unless noted):

```
slope[c]        deg, Horn on smoothed DEM
elev[c]         m
surf_η[c]       terrain-cost factor proxy ∈ [1.0, 2.1] from THEMIS TI + geology (see 3.2)
los[c]          ∈ {0,1} line-of-sight to habitat antenna (see 3.7)
sci_val[c]      0..1 science interest (from CRISM/geology target polygons; Observed→Derived)
data_gap[c]     ∈ {0,1} DEM void or outside coverage (see 3.5)
risk_expo[c]    optional radiation context scalar (Scenario; see §11) — never silently added to cost
```

### 3.2 Surface-type proxies → terrain factor (Derived, 100 m-scale honesty)

The Pandolf equation's terrain factor η has measured terrestrial values: blacktop 1.0, dirt road 1.1,
light brush 1.2, heavy brush 1.5, swampy bog 1.8, **loose sand 2.1** (Soule & Goldman 1972 via Pandolf et
al. 1977). We map Mars proxies onto that scale:

| Mars proxy | Mapping to η |
|---|---|
| High thermal inertia (indurated/bedrock-like) | 1.0–1.1 |
| Mid TI (mixed) | 1.2–1.5 |
| Low TI (dust/fine sand mantles at THEMIS scale) | 1.8–2.1 |

TI→η mapping is **our invented transfer function** (label: Derived-assumption). Fergason & Christensen
(2006) caution a dust mantle is pervasive at THEMIS (~100 m) scales — so TI tells us about 100 m patches,
not the 5 m cell a boot lands on. The HiRISE mosaic can later (48 h, optional) add a texture term (rough/
shadowed cells penalized) — an unvalidated visual proxy, clearly labeled.

### 3.3 Image-derived obstacles and their uncertainty

No dataset gives per-rock obstacles across the ops area. Options, in honesty order:

1. **Slope-only obstacles** (24 h): cells above the hard slope threshold are blocked. Free, defensible.
2. **HiRISE roughness proxy** (48 h, optional): local brightness-variance at 0.25 m as a rock-field
   proxy, added as a soft cost with a large uncertainty band. Justification pattern exists in the
   literature (rock-abundance from thermal data; HiRISE rock counting for landing-site analysis,
   Golombek et al.), but our implementation would be a demo-grade proxy — label Derived-assumption,
   show the formula, show it can be switched off.
3. **Never** present proxy obstacles as "detected rocks".

Uncertainty handling rule (cheap and honest): every soft-cost term carries a weight; the "safest" mode
maximizes the weight of terms whose *data quality* is high (slope) and keeps low-quality terms (TI at 5 m)
as small penalties, rather than pretending precision.

### 3.4 Science targets

Targets are polygons/points from curated CRISM-derived layers + geology contacts + the 2025 boxwork
region. In the graph they are **goal nodes**: routing target = nearest walkable cell to the target
polygon. Science value is a *reward*, not a cost: it drives goal selection and (48 h stretch) a
"value-per-EVA-hour" ranking `sci_val / (t_out + t_back)` — a knapsack-flavored extension we do **not**
promise (multi-stop orienteering is NP-hard; even 2–3 stops needs heuristics — cut unless time allows).

### 3.5 Missing data (voids, coverage edges)

- DEM voids (HiRISE stereo failures) → mark `data_gap`. Policy choice, recommended: treat gaps as
  **soft-avoid** (cost multiplier ×2 in all modes; ×3 in safest) but passable, because gaps near validated
  terrain are usually benign; show them hatched on the map. Hard-blocking gaps can disconnect the graph
  and produce "no route" frustration that is itself dishonest (the astronaut could walk there; we just
  don't know the terrain).
- Outside the 1 m DEM footprint: not routeable. The UI simply draws the ops box boundary
  ("planner coverage") — no MOLA-grade routing (200 m elevation posts cannot see a 5 m scarp).

### 3.6 Suit / load / time / O₂ model (Scenario — the most-audited part)

Base metabolic model: **Pandolf–Givoni–Goldman** load-carriage equation
(Pandolf et al. 1977, *J Appl Physiol* 43(4):577–581; DTIC report ADA047699):

```
M = 1.5·W + 2.0·(W+L)·(L/W)² + η·(W+L)·(1.5·V² + 0.35·V·G)     [watts]
W = body mass kg; L = carried load kg; V = speed m/s; G = grade %; η = terrain factor
```

Hand check (W=80 kg, L=30 kg, V=0.9 m/s, η=1, level): M = 120 + 30.9 + 110·1.215 ≈ **285 W**.
Up the 11.9° ridge-diagonal (G = 21.2): M ≈ 120+30.9+110·(1.215+6.68) ≈ **1020 W** — slope dominates the
cost; this is exactly the physics a slope-aware router must capture.

Transfer to Mars, explicit assumptions (each a slider/constant with a source comment in the config file):

1. **Gravity**: Pandolf is empirical at 1 g. Mars g = 3.71 m/s². We keep the equation but treat the
   transfer itself as an assumption (literature on hypogravity metabolic models exists — Kluis 2024 — but
   is not operational). The metabolic *rate* numbers are Scenario.
2. **Suit overhead multiplier** κ ≈ 1.2–1.5 applied to M (suited locomotion is less efficient than
   shirtsleeve; Apollo average EVA metabolic rates were well under the PLSS design point of ~350 W/1200
   Btu·h⁻¹ — NASA LSDA; Paul et al. 2012 reports measured EVA energy expenditure down to ~115 W).
   κ is a user-set Scenario constant, default 1.3, range shown in UI.
3. **O₂ conversion**: V̇O₂ = M / 21.1 kJ·L⁻¹ (≈ 20.9–21.2 kJ per L O₂ at mixed-diet RER ≈ 0.85; standard
   physiology conversion). Example: 285 W ⇒ ~0.0135 L/s ≈ **48.6 L/h**; ×κ1.3 ⇒ ~63 L/h suited.
4. **Consumables capacity**: scenario input, not a claim. Default "8 h nominal PLSS-class supply"
   (Apollo J-mission PLSS doubled stay time to ~8 h; NASA LSDA hardware record). Tank size in liters of
   O₂ is a Scenario slider; all countdown numbers inherit its badge.
5. **Speed model**: V(θ) from a simple family `V = V_max · max(0.3, cos(2θ))` (θ = slope), V_max ≈ 1.3
   m/s walk on level, downhill capped — Scenario, monotonicity checked in tests (T6 below).

All constants live in **one config file with per-constant source + badge** — this is the B4 build task's
contract; the router consumes them opaquely so judges can audit without reading algorithm code.

### 3.7 Comms line-of-sight (Derived)

Per-cell boolean `los[c]`: viewshed from the habitat antenna position on the planning DEM. Algorithm:
Wang–Robinson–White (2000) viewshed — implemented by `gdal_viewshed` (GDAL ≥3.1; sets curvature
coefficient 1.0 automatically for non-Earth CRS; docs warn inputs should be in a projected CRS — our local
planar grid satisfies that). A 30-line Bresenham raycast per cell on the height raster is the no-GDAL
fallback (slower but fine at 1200²). Usage: soft cost in balanced/safest modes (each off-LOS cell adds a
penalty), never a hard block — losing LOS is an operational risk, not a cliff. Radio propagation is *not*
modeled (no diffraction/multipath/fresnel) — label: geometric LOS only.

### 3.8 Foot vs rover edges

Two edge families on the same graph:

| | Foot | Rover (48 h) |
|---|---|---|
| Speed | 0.3–1.3 m/s slope-dependent | 3–10 m/s, slope-dependent (Curiosity-class practical climbs ≤23–30°; JPL rerouted around a 23° slope in 2023) |
| Cost driver | Pandolf energy / O₂ | battery Wh/km (Scenario constants) |
| Hard slope limit | 15° suited working value (see §6.2) | 25° conservative (literature: rover planners avoid >25–30°) |
| Off-route mobility | any walkable cell | also blocked by coarse boulder fields we cannot map (honesty note) |
| Mixed mode | two-phase plan: rover leg to a "park" cell + foot loop from there (48 h; the graph stays the same, the router just concatenates) |

Robot helper (Stretch X1) changes only L (load redistribution) — a Scenario multiplier, not new algorithm.

---

## 4. Graph construction

- **Nodes:** planning cells (5 m). **Edges:** 8-neighborhood, **directed** — uphill ≠ downhill because
  time, energy and risk are grade-signed. Corner-cutting disallowed unless both orthogonal neighbors are
  passable (standard grid-fidelity trick).
- Edge cost decomposition (per mode weights; see §6):

```
t_e      = d_e / V(θ_e) · η_surf          time, s (θ from Δz/d_e)
E_e      = PandolfM(θ_e, V, L, η) · t_e   energy, J  → O2_e = E_e / 21100 J/L · κ_suit
risk_e   = d_e · ( w_slope·max(0, |θ_e|−θ_free)² / (2°)²
                 + w_sand·[η_surf>1.5]
                 + w_gap·[data_gap]
                 + w_los·[not los] )      hazard-score units (dimensionless-ish, normalized in §6)
hard_e   = blocked if |θ_e| > θ_max OR data_gap AND policy=block OR outside coverage
```

- Sizes: 1200×1200 ⇒ 1.44 M nodes, ~11.5 M directed edges; at 10 m ⇒ 360k nodes / 2.9 M edges. Stored as
  flat arrays (node index = r·W+c), not as network objects — see §12.
- **Return-cost field:** one Dijkstra from the habitat over reversed edges with the *time* cost gives
  `T_back[·]` for every cell (and similarly `O2_back[·]` if energy weights differ per direction). This
  single artifact powers reachability (§7), the walkable-region shading, and the PNR — the same
  "feasibility via backward search" pattern used for battery-constrained EV routing
  (Sachenbacher & Artmeier 2011).

---

## 5. Algorithm options compared

| Option | What it gives | Cost to build/run | Verdict for us |
|---|---|---|---|
| **Dijkstra (full field)** | exact single-source distances; the return-cost field; reachability maps | O(E log V); scipy on 1.44 M nodes ≈ 1–5 s | **Core, once per config** (24 h) |
| **A\* (single pair)** | exact fastest path with admissible heuristic h = euclid/v_max (scaled per cost dimension); far fewer expansions | trivial code; ms–s | **Core, per route request** (24 h) |
| Scalarized weighted A* (3 presets) | fastest/safest/balanced as separate searches | 3× A* | **Core** (24 h) |
| ε-constraint sweep | 5–9 weighted runs → approximates Pareto front; dedupe near-identical polylines → "route options" cards | 5–9× A*, still seconds | **48 h upgrade** replacing hand-tuned 3rd preset |
| True multiobjective Pareto (Martins label-setting / MOA*) | complete Pareto set (time × risk) | label explosion risk; NP-hard in general for constrained variants; no maintained off-the-shelf lib we can trust in hours | **Rejected** (24/48 h) — see §13 |
| Any-angle (Theta\*, Field D\*) | shorter, more natural-looking paths than 8-neighbor zig-zags | Θ(log n) LOS checks per expansion; PathQuality win mostly cosmetic for us | **Optional post-smoothing only** (48 h): string-pulling/LOS shortcutting of the A* polyline — O(n) and enough |
| Hierarchical (coarse MOLA → fine HiRISE) | needed for continent-scale; at 6×6 km pointless | extra code | **Rejected** for ops-area scale; noted as the answer if the demo ever grows a global map |
| Time-dependent (FIFO Dijkstra, Orda & Rom 1990) | daylight-window, thermal or comms-pass-dependent edge costs | needs time-bucketed cost tables; correctness requires FIFO (wait allowed ⇒ transformable) | **48 h stretch**: departure-time slider with 15-min buckets (daylight + scenario dust/thermal); keep FIFO by construction (costs only grow toward dusk) |
| Incremental replanning (D\* Lite, Koenig & Likhachev 2002) | efficient re-planning when the astronaut "discovers" a blocked cell mid-walk | real state management; demo value is a "block this cell" button | **Stretch (48 h+)**: a fresh A* on 1.4 M nodes is already <1 s, which kills most of D* Lite's benefit at our scale |

**Why this shape:** our graph is small (1.4 M nodes is *tiny* by road-network standards), queries are few
(≤3 presets × ≤10 goals), and the only genuinely constrained resource (O₂/time budget with return
reserve) is handled exactly and cheaply by the backward-Dijkstra feasibility field. Everything fancier
buys polish, not correctness, and burns hackathon hours we need for provenance UI.

---

## 6. Route modes — objectives, constraints, normalization, UI

### 6.1 Objective functions

Let a path P = e₁…eₖ. Mode presets:

- **Fastest:** minimize `J_t(P) = Σ t_e` (Pandolf-speed-based time). Output: time, distance, mean slope.
- **Safest:** minimize `J_r(P) = Σ risk_e` with the *same hard constraints*, plus extra soft avoidance
  (data gaps ×3, off-LOS ×2). By construction ≥ as long as fastest; typically hugs low-slope, high-TI
  ground and pays distance.
- **Balanced:** minimize `J_α(P) = α·t̂(P) + (1−α)·r̂(P)` with α = 0.5 default.

Normalization (so α is meaningful): `t̂ = t/t_ref`, `r̂ = r/r_ref` where `t_ref, r_ref` are the *fastest*
and *safest* single-objective results for the same OD pair (both already computed — free). Then
`J_α ∈ [min(t̂,r̂) … 1]`-ish, α is a genuine dial between the two extremes, and the UI can honestly say
"balanced = 50% weight on time vs 50% on hazard score".

Multi-edge caveat (kept out of the demo math): t and r are incommensurable; the weighted sum is a
designer choice, not a theorem — that's why the UI always *shows* both raw numbers instead of one
abstract "score".

### 6.2 Hard safety constraints vs soft costs

- **Hard (route cannot cross):** slope > **15°** (suited working value — justification: Apollo-era slope
  experience classes <25° "highly accessible" for *unsuited-adjacent* lunar locomotion (Iqbal 2024), but
  suited, loaded, at 0.38 g, with no rescue, we take a conservative margin; Curiosity's *hardware* limit
  ~30° with practice rerouting around 23° (JPL 2023) supports 15° as the human demo default). It is a
  **configurable constant with a visible justification card**, not a hidden rule. Second hard constraint:
  DEM coverage boundary; optional hard toggle "block all data-gap cells".
- **Soft (costed):** slope 10–15°, sand proxy (η), data gaps, off-LOS, texture roughness (48 h).
- Hard/soft separation matters for the Validity judging criterion: hard constraints are defensible
  physics/ops limits; soft costs encode preferences under uncertainty and are shown as such.

### 6.3 How users choose & how the UI shows tradeoffs

- Mode selector: **Fastest / Balanced / Safest** (+ α slider under Balanced, 48 h).
- Per-route card: time · distance · O₂ estimate (with κ badge) · max/mean slope · hazard-score breakdown
  stacked bar (slope/sand/gap/LOS) · provenance badges of every input that influenced it.
- Map: routes drawn side-by-side with different dashes; the walkable region (budget-shaded) and the PNR
  marker on the selected route; "why this detour?" tooltip listing the dominant cost term per segment
  (e.g., "12° scarp: +380 s").
- Never a single black-box score; always both raw axes (time vs hazard) so the tradeoff is visible.

---

## 7. Point of no return (walkback) — computation, recomputation, honesty

**Concept anchored in real NASA practice:** Constellation-era EVA planning used a **10-km suited walkback**
feasibility rule (NASA TP-2009-214796 EVA Walkback Test; Norcross 2008; EPSP project), and Apollo-era
traverse planning carried explicit contingency-walkback consumables limits. Our PNR generalizes it:
*the farthest point from which the crew can still return to the habitat within the reserved budget.*

**Computation (24 h version):**

```
B       usable O2/time budget = capacity · (1 − reserve), reserve default 25% (config)
Used(x) cumulative O2/time along the outbound route to cell x        (from A* search state)
Back(x) cheapest-return O2/time from x to habitat                    (from the backward-Dijkstra field!)
walkable(x)   ⇔ Used(x) + Back(x) ≤ B
PNR      = the x* on the outbound route with maximum Used(x) among walkable cells
          (report the *last safe turnaround*, plus minutes-to-PNR at current pace)
```

Using `Back(x)` from the global return-cost field — not `Used(x)` reversed — is the honest version: the
cheap return may be a different, gentler path (downhill detour), and EV-routing literature shows this
backward-feasibility pattern is exact for non-negative costs (Sachenbacher & Artmeier 2011; also the
 textbook way to answer "where can I still get home from?" for every cell at once, which also gives us
 the reachability shading for free).

**Recomputation triggers:** any change to capacity, reserve, load L, κ, or mode weights → recompute
`Used` is a re-run of one A* (<1 s) but `Back` field only changes when *costs* change (mode/weights/η),
**not** when the O2 constants change (it can be rescaled by the metabolic calculator without re-search —
factorization noted in §10 caching). HUD mode (48 h) recomputes on a timer or on "block cell" input.

**Honest labels on the PNR itself:** the PNR marker carries a card: "Scenario estimate. Assumes: Pandolf
metabolism at Mars-g (unvalidated), κ=1.3 suit overhead, 25% reserve, terrain costs from 5 m DEM + 100 m
thermal proxy. Not a flight rule." The walkback literature value (10 km) is displayed as context
(NASA TP-2009-214796), never as our validation.

---

## 8. Recommended staged build

### 24 h (matches build tasks B2/B3/B4)

1. Build the planning grid + attributes (§3): numpy only — bilinear/box resample, Horn slope, TI→η
   mapping, void mask. Export: `costgrid.npz` + `meta.json` (extent, resolution, per-layer provenance).
2. Backward Dijkstra (scipy) from habitat → `Back_time[·]`, `Back_o2[·]` fields; export downsampled PNGs
   (reachability shading).
3. Scalarized A* per mode preset (hand-written on flat arrays; heuristic = euclidean/v_max, admissible);
   exports `route_{mode}_{goal}.json` (polyline, per-segment costs, cumulative O2/time, PNR cell).
4. Metabolic calculator (pure function of constants + path) used by both engine and UI, so numbers always
   agree.
5. UI: MapLibre + precomputed JSON; mode switch = swap layers; no in-browser search yet.

### 48 h additions (priority order)

1. ε-constraint sweep (5 weights) + dedupe → "route options" cards (replaces hand-tuned balanced).
2. In-browser A* in a Web Worker (typed arrays) so load/κ/goal changes re-plan live; Python remains the
   reference implementation (same JSON schema; cross-check test T7).
3. Time-dependent departure slider (daylight/thermal buckets; FIFO by construction).
4. Optional: LOS-shortcut path smoothing; "block this cell" mid-walk re-plan (A* restart is fine);
   rover/mixed-mode two-phase routing.
5. Optional radar-chart provenance on the route card (which layers drove the detour).

### Pseudocode (core loop, identical in Python and JS)

```
function A_STAR(grid, src, dst, mode):
    open = minheap keyed by f = g + h;  g[src] = 0
    h(c) = euclid(c, dst) / v_max        # admissible: never overestimates remaining time/cost
    while open:
        c = pop_min(open)
        if c == dst: return reconstruct(c)
        for n in passable_neighbors8(c):           # hard constraints enforced here
            g_new = g[c] + edge_cost(c→n, mode)     # t̂+r̂ scalarized; asymmetric uphill/downhill
            if g_new < g[n]: g[n] = g_new; parent[n] = c; push(open, (g_new + h(n), n))
    return NO_PATH

PNR along returned route:  argmax over route cells of Used(c) s.t. Used(c) + Back[c] ≤ B
```

---

## 9. Test plan

**Synthetic (deterministic, small — CI-able):**

| # | Case | Expected |
|---|---|---|
| T1 | Flat uniform grid | path ≈ straight line (8-conn staircase within √2 bound), time = d/V |
| T2 | Wall of hard-blocked cells with one gap | route exits through the gap; detour length matches hand calc |
| T3 | Ridge crossable only at 12° diagonal (orthogonal 16.7° blocked) | fastest uses diagonal; safest goes around; assert time order t_fast ≤ t_bal ≤ t_safe |
| T4 | Sand patch on the short side | fastest may cross sand, safest avoids; η effect visible in O2 numbers |
| T5 | Target unreachable (hard ring) | NO_PATH + UI message "outside coverage or blocked — try another goal" |
| T6 | Monotonicity sweeps | increasing load L or κ strictly increases O2/time (judge-detectable sanity); decreasing budget shrinks walkable set; PNR moves monotonically closer to habitat |
| T7 | Python engine vs JS worker on same grid | identical cost within 1e-6; identical PNR cell |
| T8 | PNR equality case | construct grid where Used+Back exactly = B → PNR at the designed cell (off-by-one check) |

**Real terrain (Gale ops box, evidence recorded as screenshots/numbers in repo):**

| # | Case | Check |
|---|---|---|
| R1 | Habitat → boxwork-region goal, 3 modes | routes differ visibly & plausibly; no route crosses >15° cells (assert from DEM) |
| R2 | Steep butte flank goal | either graceful around-route or honest NO_PATH; never a phantom climb |
| R3 | Cross-check vs Curiosity's actual traverse (official location map; raw-image sols) | our planner's preferred corridor near the rover's *chosen* path on shared flat ground; deviations explained by slope/sand terms (qualitative, labeled as such — the rover optimizes different things) |
| R4 | REMS-informed scenario (48 h) | dust/thermal scenario shifts balanced route away from low-TI corridors; labeled Scenario |

**Performance targets & caching:** full scipy backward Dijkstra on 1.44 M nodes ≤ 5 s (single run,
cached per config); per-goal A* ≤ 1 s Python, ≤ 300 ms JS worker; all layer rasters cached as npz/PNG
with checksums in `data/PROVENANCE.md`; route JSONs keyed by `(mode, goal, L-bucket, κ-bucket)` — load
changes within a bucket only *rescale* O2 via the calculator (no re-search) with a visible "estimate
rescaled, path unchanged" note (the path is strictly optimal only for the searched cost — honest footnote,
avoids judge-lag).

---

## 10. Worked tiny example (hand-checkable)

5×5 grid, 10 m cells (diagonal 14.14 m). Habitat H=(0,0), target T=(4,4). Elevations: ridge row r=2,
c=0..3 at +3 m (all else 0) → orthogonal ridge crossing = 30% grade (16.7°, **blocked** by the 15° hard
limit); diagonal crossing = 21.2% grade (11.9°, allowed). Loose sand (η=2): (1,3),(1,4),(2,4),(3,3),(3,4);
the only non-ridge gap is column c=4 — through sand.

Model (the §4 formulas, with V=0.9 m/s flat, time cost `t_e = d/V · (1+2·|grade|) · η`, risk
`r_e = d·(grade)²·20 + 0.3·d·[sand]`):

| Route | Shape | Time | Risk | Notes |
|---|---|---|---|---|
| **A "straight"** (0,0)→(1,1)→(2,2)→(3,3)→(4,4) | crosses ridge twice at 11.9° + sand tail | 15.7+22.4+44.7+31.4 = **114.3 s** | 25.4 slope + 8.5 sand = **33.9** | **fastest** |
| **H "ridge-corner"** (0,0)→(1,1)→(1,2)→(2,3)→(3,4)→(4,4) | same two crossings, shorter sand tail | 15.7+11.1+22.4+44.7+22.2 = **116.2 s** | 25.4 + 7.2 = **32.7** | near-tie — shows the sand term's leverage |
| **G "sand gap"** along r=0 then down c=4 | zero slope risk, all-sand corridor | 33.3+31.4+66.7 = **131.4 s** | 13.2 sand only | **safest** (lowest risk) |

(All three recomputed and cross-checked by script; hand-check one edge:
(1,1)→(2,2) is 14.14 m at 21.2% grade → 14.14/0.9 × (1+2·0.212) = 22.4 s.)

Balanced (α=0.5, normalized by t_ref=114.3, r_ref=13.2): A: 0.5·(1.00+2.57)=1.78; H: 1.75;
G: 0.5·(1.15+1.00)=1.08 → **G wins** at α=0.5 — in this toy the hazard spread is wide, so balanced
genuinely prefers the safe corridor. The time weight must exceed **α ≈ 0.91** before the straight route
overtakes G (solve α·1.00+(1−α)·2.57 = α·1.15+(1−α)·1.00); H never wins — a useful UI truth: not every
preset produces a distinct winner. (Real Gale numbers differ; the point is the mechanics are inspectable.)

**PNR on route A:** cumulative Used: (1,1)=15.7, (2,2)=38.1, (3,3)=82.9, (4,4)=114.3 s; Back field is
symmetric here (Back(x)=Used(x)). Usable budget B=105 s: (2,2) passes (76.2 ≤ 105) but (3,3) fails
(165.8 > 105) → **PNR = (2,2), "turn around no later than 38 s in"**. B=200 s → PNR=(3,3) at 82.9 s;
B ≥ 228.6 s → the target itself is returnable. The marker walking back up the route as the budget slider
drops is the single most demo-telling interaction.

O₂ side-check on the same numbers: 114.3 s at 285 W (level walking rate) = 32.6 kJ ⇒ ≈ **1.54 L**
one-way (before κ) — the calculator and router agree by construction.

---

## 11. Claims audit — Observed / Derived / Scenario / Unavailable

| Claim (as it might appear in UI/marketing) | Verdict | Evidence & label to show |
|---|---|---|
| "Radiation higher on ridge tops / crater floor differences" | **Derived** (modeled), *measured only at Curiosity's spot* | RAD gives ~0.64–0.67 mSv/day GCR dose-equivalent at the rover (Hassler et al. 2014 Science). Dose anti-correlates with atmospheric pressure/depth (Guo et al. 2015 ApJ 810:24); a 2026 JGR-Planets study examines topographic influence on RAD dose (Guo et al. 2026, 10.1029/2026JE009704 — full text paywalled at access time; cited at abstract level). Map layer = atmospheric-depth scaling, labeled Derived-assumption. |
| "Solar-storm (SEP) alert for our Marswalk" | **Unavailable operationally; Scenario in-app** | No operational Mars SEP forecast service exists publicly. Research nowcasting proposed recently (Loewe et al. 2025, arXiv:2502.02469). SEPs *have been observed* at the surface by RAD (Hassler 2014; RAD overview Hassler 2017 SSR). In-app: a user-set "storm scenario" slider (Scenario badge), with the honest caption "no operational Mars SEP forecast exists; research only". DONKI/SWPC are Earth-focused; do not imply Mars coverage. |
| "O₂ used / time remaining / PNR numbers" | **Scenario** | Pandolf 1977 (1-g empirical) + Mars-g transfer + κ suit overhead + PLSS-class capacity are assumptions; measured EVA metabolic context exists (Paul et al. 2012; Apollo PLSS design point ~350 W, NASA LSDA) but our numbers are model estimates. |
| "Slope 12° here" | **Derived** from Observed DEM | 1 m HiRISE DTM, vertical precision 0.25–1 m (Kirk et al. 2008); slope noise ±3–6° at 5 m cells after smoothing — stated on the layer card. |
| "This is sandy / loose terrain" | **Derived-assumption** | THEMIS TI ~20% accuracy, 100 m scale (Fergason & Christensen 2006); mapping TI→η is our invented transfer. |
| "Science site: sulfate-bearing" | **Observed spectra → Derived indicator** | CRISM-derived layers (Trek/USGS) are interpretive products of observed spectra; cite instrument + product. |
| "Comms OK here" | **Derived (geometric only)** | Viewshed LOS on DEM; no RF propagation model. |
| "Safe route" | **Banned wording** | Only "lowest modeled hazard-score route within available data (slope 5 m; thermal proxy 100 m; no rock-level data)". Word list enforced in copy review. |
| "Route avoids hazards the way a real mission would" | **Qualitative only** | Cross-check vs Curiosity's real traverse (R3) is a sanity demo, not validation — the rover optimizes wheel wear, power, science differently. |
| Curiosity photos pinned on map | **Observed, position approximate** | Raw images carry sol/site, not precise coordinates — pin by region, label approximate. |

---

## 12. Library / stack options

### Engine (Python)

| Option | What | Pros | Cons | Verdict |
|---|---|---|---|---|
| `scipy.sparse.csgraph.dijkstra` | full-field Dijkstra on CSR matrix | C-speed, `indices`/`limit` options, predecessors for path rebuild; official docs | full field only (no heuristic) | **Use** for Back-field & reachability |
| Hand-written A* (heapq + flat arrays) | per-route search | trivial, no deps, exact control of asymmetric edge costs & hard masks | ours to test (T-suite) | **Use** for routes |
| `networkx.astar_path` | batteries-included | heuristic admissibility documented; weight-as-function incl. edge hiding | object graph overhead at 1.4 M nodes | fallback / unit-test oracle |
| `skimage.graph.route_through_array` (MCP) | raster shortest path | dead-simple API for cost rasters | Dijkstra-equivalent, anisotropy control limited | prototyping aid only |
| GDAL (`gdaldem slope`, `gdal_viewshed`) | slope/viewshed CLIs | standard, cited algorithms (Horn; Wang-Robinson-White) | extra install; numpy versions are ~20 lines anyway | optional; numpy if install hurts |
| `scikit-fmm` (fast marching) | continuous wavefront | smooth gradients | different problem (no hard constraints, no asymmetry) | rejected |
| OR-Tools / PuLP | constrained optimization | powerful | overkill, wrong shape | rejected |

Docs: docs.scipy.org csgraph.dijkstra; networkx astar_path; gdal.org programs/gdal_viewshed (all accessed
2026-11-13).

### UI (browser)

| Option | Verdict |
|---|---|
| MapLibre GL JS + precomputed GeoJSON routes | **Use** (24 h): zero server, fast, judge-friendly |
| A* in JS Web Worker: hand-written on typed arrays (pattern from ngraph.path A*/NBA*; PathFinding.js is grid-focused but effectively unmaintained; easystar.js lighter) | **Use** (48 h) — hand-written is <150 lines and avoids dependency risk |
| `ngraph.path` | fine, small, maintained-ish; only if we want a lib instead of our own |
| PathFinding.js | classic visualizer but repo inactive — not for a judged demo |
| Rust/WASM router | performance we don't need (1.4 M nodes < 300 ms in JS) — rejected |

**Recommended path & why:** numpy+scipy engine with our own A* and scipy full-field Dijkstra, static JSON
to a MapLibre UI, optional JS-worker A* on day 2. Rationale: fewest moving parts to a public static URL
(no backend!), every component has an official doc to cite for the Validity criterion, and the one part
that is genuinely ours (cost model + PNR) is small, testable, and fully provenance-labeled.

---

## 13. Rejected alternatives (and why, recorded for the decision log)

1. **Full Pareto multiobjective search (Martins/MOA*)** — label explosion risk, no trusted off-the-shelf
   implementation, and ε-constraint sweeps deliver 95% of the demo value at 5× A* cost.
2. **D\* Lite mid-walk replanning as a headline feature** — at our scale a fresh A* is sub-second; the
   complexity budget is better spent on provenance UI.
3. **Rust/WASM or server-side routing service** — hosting risk (judges must access without login),
   build risk, no performance need.
4. **Hierarchical routing over MOLA→HiRISE** — solves a continental problem we don't have; the ops box is
   uniformly 1 m DEM. Revisit only if the demo gains a global map.
5. **MOLA-blend-based routing anywhere** — 200 m posts cannot see walking-scale hazards; MOLA stays a
   context layer (also the position of the team's technical-approaches doc).
6. **"marsterrain" Python library** — searched PyPI/GitHub 2026-11-13: no such public package exists
   (closest: gplanetary-nav, unrelated ML terrain classifiers). Nothing to adopt; noted because the name
   circulated in early team chatter.
7. **ML terrain traversability classifiers from HiRISE** — training data + validation time unavailable in
   48 h; a black-box cost term would also *hurt* the Validity story (unexplainable detours).

---

## 14. Unresolved assumptions (flagged for the team, not blockers)

1. **Hard slope threshold 15°** is a demo default, not a certified suit limit — needs a visible
   justification card and an easy config change (candidates: 12–20°).
2. **TI→η mapping** invented; a geologist teammate should sanity-check 2–3 Gale units (e.g., Murray
   mudstone vs Stimson sandstone) against expected walkability.
3. **Pandolf at Mars g** unvalidated (all metabolic numbers are Scenario); κ suit overhead range 1.2–1.5
   is judgment. If a judge with physiology background pushes, the honest answer is "scenario slider with
   cited terrestrial anchors" — the UI already says so.
4. **Return reserve 25%** mirrors aviation/SCBA-style margins, not a NASA walkback rule number (the
   walkback literature gives 10-km capability tests, not % reserves). Label as team policy.
5. **Comms**: geometric LOS only; no orbiter-pass modeling (no public relay schedules) — mid-walk comm
   windows remain Unavailable.
6. **CRISM site coordinates** come from Trek's derived layers; exact footprint georeferencing should be
   spot-checked against the HiRISE mosaic before the demo (one visual pass).
7. **DEM export seam behavior** at the ops-box edge (Trek exports) — verify no artificial cliff at crop
   boundaries; crop 2 cells inside the true footprint.

---

## 15. Sources (all accessed 2026-11-13)

**Load-carriage metabolism & EVA human performance**
- Pandolf KB, Givoni B, Goldman RF (1977). Predicting energy expenditure with loads while standing or
  walking very slowly. *J Appl Physiol* 43(4):577–581. https://pubmed.ncbi.nlm.nih.gov/908672 ; USARIEM
  report PDF: https://apps.dtic.mil/sti/pdfs/ADA047699.pdf
- Pandolf equation (formula + terrain factor table; index): https://en.wikipedia.org/wiki/Pandolf_equation
- Soule & Goldman terrain coefficients via Richmond et al. (2019) review:
  https://pubmed.ncbi.nlm.nih.gov/30487109
- Norcross J et al. (2009). *EVA Walkback Test (EWT) Final Report*, NASA TP-2009-214796.
  https://www.lpi.usra.edu/lunar/artemis/NorcrossEtAl_NASA-TP-2009-214796_EVA%20Walkback%20Test.pdf
- Norcross J (2008). Feasibility of suited 10-km ambulation "walkback" on the Moon. NASA NTRS.
  https://ntrs.nasa.gov/api/citations/20080014853/downloads/20080014853.pdf
- Norcross et al. (2010). Metabolic Costs and Biomechanics of Level Ambulation in Planetary Suits.
  NASA TP-2010-216115. https://www.lpi.usra.edu/lunar/artemis/NorcrossEtAl_NASA-TP-2010-216115_PlanetarySuitMetabolicCosts.pdf
- Paul VL et al. (2012). Energy Expenditure During Extravehicular Activity. NASA NTRS.
  https://ntrs.nasa.gov/api/citations/20120003917/downloads/20120003917.pdf
- Apollo PLSS design metabolic point (~1,200 Btu/hr ≈ 350 W) — NASA LSDA hardware record:
  https://nlsp.nasa.gov/search/data/details/IDP-LSDA_HARDWARE-0000000000000562?dataType=HARDWARE
- Kluis L (2024). A Novel Metabolic Model for Ambulation in Hypogravity (PhD).
  https://oaktrust.library.tamu.edu/items/3a4cf95a-78b4-42a7-b15a-ee4c581e5adb
- xEVA Con Ops (NASA EVA-EXP-0042, 2020).
  https://www.nasa.gov/wp-content/uploads/2017/02/eva-exp-0042_xeva_system_con_ops_rev_b_final_dtd_10192020_ref_doc.pdf

**Slope/terrain access limits**
- Iqbal N (2024). Astronaut experiences on the slopes along Apollo EVAs (EPSC abstract; <25° classified
  highly accessible). https://ui.adsabs.harvard.edu/abs/2024EPSC...17..196I/abstract ; full text:
  https://boris-portal.unibe.ch/bitstreams/ca2e3c80-dd45-4c6d-b29a-ee79a2badea4/download
- JPL (2014). Curiosity checking possible smoother route (wheel-wear terrain assessment).
  https://www.jpl.nasa.gov/news/curiosity-mars-rover-checking-possible-smoother-route
- Universe Today (2023). Curiosity's 23° slope reroute summary.
  https://www.universetoday.com/articles/curiosity-had-to-route-around-a-23-degree-slope-to-reach-a-fascinating-field-of-craters

**DEM / thermal / spectral data properties**
- Kirk RL et al. (2008). Ultrahigh resolution topographic mapping of Mars with MRO HiRISE stereo images.
  *JGR* 113. https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2007JE003000
- HiRISE DTM overview (product + ~25 cm vertical precision notes): https://www.uahirise.org/dtm/ ;
  USGS STAC: https://stac.astrogeology.usgs.gov/docs/data/mars/hirise_dtms/
- Fergason RL & Christensen PR (2006). High-resolution thermal inertia from THEMIS. *JGR* 111.
  https://ui.adsabs.harvard.edu/abs/2006JGRE..11112004F
- THEMIS global thermal-inertia mosaic (USGS; low TI = fines, high = indurated).
  https://astrogeology.usgs.gov/search/map/mars-themis-derived-global-thermal-inertia-mosaic
- Edwards CS et al. (2009). Global distribution of bedrock exposures on Mars.
  https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2009JE003363

**Radiation**
- Hassler DM et al. (2014). Mars' Surface Radiation Environment Measured with MSL's RAD. *Science*
  343. https://authors.library.caltech.edu/records/kdt88-3aw98 (0.64–0.67 mSv/day GCR)
- Guo J et al. (2015). Modeling the variations of dose rate measured by RAD. *ApJ* 810:24.
  https://ui.adsabs.harvard.edu/abs/2015ApJ...810...24G/abstract ; https://arxiv.org/html/1507.03473v2
- Guo J et al. (2026). Influence of Mars topography on radiation dose detected by RAD. *JGR Planets*.
  https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2026JE009704 (paywalled; abstract-level)
- Hassler DM et al. (2017). RAD instrument overview. *Space Sci Rev*. https://pmc.ncbi.nlm.nih.gov/articles/PMC7370236
- NASA (2012). Daily cycles of radiation and pressure at Gale crater (RAD graphic).
  https://science.nasa.gov/resource/daily-cycles-of-radiation-and-pressure-at-gale-crater
- Loewe M et al. (2025). Nowcasting Solar Energetic Particle Events for Mars Missions.
  arXiv:2502.02469. https://arxiv.org/html/2502.02469v1

**Algorithms**
- Sachenbacher M & Artmeier A (2011). Efficient Energy-Optimal Routing for Electric Vehicles. AAAI.
  https://ojs.aaai.org/index.php/AAAI/article/view/7803 ; Artmeier et al. (2010) preprint:
  https://mediatum.ub.tum.de/doc/993196/document.pdf (backward-search feasibility for constrained paths)
- Orda A & Rom R (1990). Shortest-path and minimum-delay algorithms in networks with time-dependent edge
  lengths. https://sites.cs.ucsb.edu/~suri/cs231/Rlist/ordaRom.pdf (FIFO property; non-FIFO ⇒ NP-hard)
- Dean B. Shortest Paths in FIFO Time-Dependent Networks. https://people.csail.mit.edu/bdean/tdsp.pdf
- Koenig S & Likhachev M (2002). D* Lite. AAAI-02. https://aaai.org/Papers/AAAI/2002/AAAI02-072.pdf
- Nash A, Daniel K, Koenig S, Felner A (2007/2010). Theta*: Any-Angle Path Planning on Grids.
  https://arxiv.org/pdf/1401.3843 ; Uras & Koenig (2015) any-angle comparison (incl. Field D*):
  https://idm-lab.org/bib/abstracts/papers/socs15a.pdf
- Gandibleux X et al. (2006). Martins' algorithm revisited for multi-objective shortest path problems.
  4OR. https://link.springer.com/article/10.1007/s10288-005-0074-x ; de las Casas et al. (2021)
  improved label-setting: https://opus4.kobv.de/opus4-zib/files/7971/main.pdf
- Baum M et al. (2017). Modeling and Engineering Constrained Shortest Path (EV CSP theory).
  https://drops.dagstuhl.de/storage/00lipics/lipics-vol087-esa2017/LIPIcs.ESA.2017.11/LIPIcs.ESA.2017.11.pdf

**Prior art (traverse planners)**
- Johnson AW (2010). SEXTANT: Surface Exploration Traverse Analysis and Navigation Tool. MIT thesis.
  https://dspace.mit.edu/bitstream/handle/1721.1/59560/668226048-MIT.pdf
- NASA Ames IRG xGDS traverse planner (Desert RATS / analog tests).
  https://www.lpi.usra.edu/lpi/contribution_docs/LPI-001685.pdf
- Tomkins P (2004). ISE: Global Path Planning for Mars Rover Exploration (CMU).
  https://publications.ri.cmu.edu/storage/publications/pub_files/pub4/tompkins_paul_2004_3/tompkins_paul_2004_3.pdf

**Coordinates**
- Mars 2000 sphere (IAU2000, R = 3 396 190 m): https://epsg.io/104905 ; equirect projection:
  https://epsg.io/103885 ; PDS/ODE planetocentric equirect convention (USGS ODE docs)

**Library docs**
- scipy.sparse.csgraph.dijkstra — https://docs.scipy.org/doc/scipy/reference/generated/scipy.sparse.csgraph.dijkstra.html
- networkx.algorithms.astar_path — https://networkx.org/documentation/stable/reference/algorithms/generated/networkx.algorithms.shortest_paths.astar.astar_path.html
- gdal_viewshed (Wang-Robinson-White 2000; curvature=1.0 for non-Earth CRS) —
  https://gdal.org/en/stable/programs/gdal_viewshed.html
- ngraph.path — https://github.com/anvaka/ngraph.path ; PathFinding.js (unmaintained) —
  https://qiao.github.io/PathFinding.js/visual

*Data-access endpoints for the build (Mars Trek ArcGIS services, raw-images JSON, PDS nodes) are listed
in the team's data inventory (README data table + data-sources notes), not duplicated here.*
