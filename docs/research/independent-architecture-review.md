# Independent Adversarial Architecture Review — Martian Map (Gale / Mount Sharp)

**Reviewer:** independent review worker (task `task_5c93f65c923d`). **Written:** 2026-11-13 (Cairo day 1).
*Editor's note (same day, documentation editor): findings F1–F8 have been integrated into the strategy docs
(technical-approaches header, 24-48-hour-plan A2/B1/B3/B5 + risks) and as Errata headers on both research
reports; F6 is resolved — `docs/technical-approaches.md` now exists (written by Agent4 later on 2026-11-13).
This review is preserved unmodified as the evidence record.*
**Scope:** adversarial cross-examination of [`routing-options.md`](routing-options.md) and
[`mapping-options.md`](mapping-options.md) against live primary sources, plus challenge fit, scientific
honesty, integration, and 24–48 h feasibility. **Method:** every load-bearing dataset/algorithm/library
assertion was either (a) re-verified against the live service/DOI/paper, (b) re-derived numerically, or
(c) benchmarked on this machine — this review adds its own evidence rather than re-reading the reports'
own citations. Items I could not verify are listed in §9, not silently trusted.

**Verdict in one line:** the architecture is sound, unusually honest, and — after the corrections in §3 —
YES for the 24–48 h window; the two research reports are accurate on every checked citation, but contain
one dead data asset, one performance claim refuted by benchmark, one tile-budget arithmetic error, and
five internal contradictions between them that must be resolved at the pilot gate before app code.

---

## 0. Verdict table (major recommendations)

| # | Recommendation (as written in the research docs) | Verdict | Key condition / evidence (details in §3) |
|---|---|---|---|
| V1 | 8-connected 5–10 m planning grid, directed edges, per-cell attributes | **YES** | 1200×1200 / ~11.5 M edges confirmed by construction + benchmark (§3.10) |
| V2 | Scalarized A\* + one backward Dijkstra (return-cost field) for reachability + PNR (Sachenbacher & Artmeier pattern) | **CONDITIONAL** | Pattern correct and cited correctly; but **drop the hand-written Python A\*** — measured 6.5 s worst-case vs claimed ≤1 s; scipy full field is 0.25 s and serves every OD pair via predecessors (§3.2) |
| V3 | Modes fastest / safest / balanced, ε-constraint sweep at 48 h, full Pareto rejected | **YES** | Normalization scheme checks out (I recomputed the toy example — all numbers correct); heuristic must be re-scaled per mode (§3.6) |
| V4 | Pandolf metabolic model + κ suit overhead + O₂ conversion + 25 % return reserve, all Scenario-labeled | **YES** | Formula and terrain factors match the primary table exactly (§3.4); reserve labeled team policy — keep it that way |
| V5 | TI→η transfer function (THEMIS thermal inertia → terrain factor) | **CONDITIONAL** | Honest as designed (self-labeled invented); must display TI at its true 100 m footprint, never as a smooth 5 m layer (§3.7) |
| V6 | 15° hard slope limit, configurable, with justification card | **YES** | Literature chain verified at URL level (Apollo <25°, Curiosity 23° reroute); keep "configurable demo default" framing (§3.5) |
| V7 | Static no-backend 2D map: MapLibre + XYZ tiles + GeoJSON (24 h), PMTiles optional | **YES** | Correct call; MapLibre license is BSD-**3**-Clause (doc says BSD-2 — fix the credit line); tile budget must be recomputed (§3.1) |
| V8 | three.js 3D view + first-person HUD at 48 h, same DEM/route JSON | **YES** | Stage-gated behind Musts, as build plan already requires; "disclosed drape, not photorealistic" framing is right |
| V9 | USGS ARD STAC (CC0) as the cited primary DEM/ortho source; Trek only as cached exporter | **CONDITIONAL** | CC0 + 8 items verified live, **but** the exact DTM quoted in mapping-options §3.2 is a dead S3 object and DTM URLs showed intermittent 404s under repeat load — pilot must prove a reliable download path with fallbacks (§3.3) |
| V10 | No live Trek dependency at runtime; cache everything at build | **YES** | Reinforced by my own Trek session (one 405/400 on a bad param set, JPEG default export) — cache-at-build is the only safe pattern |
| V11 | Radiation as point-measurement card + scenario; never a spatial heatmap; SEP forecast labeled Unavailable | **YES** | All three radiation citations resolve to real papers with matching titles, including the 2026 topography study (§3.8) |
| V12 | Reject: Cesium globe, COG tile server, game engines, D\* Lite headline, full Pareto, MOLA routing | **YES** | All rejections are correct for this scale/window; none should be revisited |
| V13 | `docs/technical-approaches.md` as the dataset-verdict companion | **NO** (as referenced) | The file **does not exist** — three documents cite it, and build tasks point into it (§3.9). Write it or de-reference it before Phase B |

---

## 1. What I verified live (all accessed 2026-11-13, from this machine)

### 1.1 Data services — verified, with three sharpenings

| Check | Method | Result |
|---|---|---|
| USGS STAC search over ops box `bbox=[137.30,−4.75,137.45,−4.55]`, collection `mro_hirise_socet_dtms` | `POST https://stac.astrogeology.usgs.gov/api/search` | **8 items returned, `numberMatched: 8`, every item `license: CC0-1.0`** — exactly as claimed. Assets per item: `dtm`, `hillshade`, `*_ORTHO` (plural), `provenance` — confirmed |
| STAC ARD specs | https://stac.astrogeology.usgs.gov/docs/data/mars/hirise_dtms/ | DTM post spacing **"between one and two meters"** (doc's per-item "≈1.01 m" is plausible but per-file `gdalinfo` must confirm); orthos at **~0.25 m and ~1 m** variants, RGB + RED — more than the doc claims (a free win). Page also cautions true resolution ≈ 10–20 px — supports the slope-noise honesty labels |
| ARD asset downloads | ranged GETs on S3 | **Ortho COG stable (HTTP 206; 768 MB for the example pair)**. DTM COGs: 7/8 URLs reachable, but see §3.3 — the doc's flagship example is dead and reachability was intermittent under repeat probing |
| Trek `Gale_DEM_SMG_1m` + `curiosity_hirise_mosaic` | live `?f=pjson` | Both live; extents match the docs to 5 decimals; **DEM `pixelSize = 1.68706e-5° = 1.000 m/px, `pixelType: F32`** — exactly as quoted. Catalog returned **76 services** today (docs said 83 — drift, immaterial) |
| Trek `exportImage` | live calls | Works. **Sharpenings the docs lack:** default output is capped at **400×400 px** (must pass explicit `size=`); `format=tif` returns a *JPEG inside a TIFF*; **`format=tiff` (double f) with `compression=LZW` returns a true 32-bit float TIFF** — i.e. the quantitative-DEM-via-Trek path exists, with the right parameter spelling; `format=jpg` fine for context layers |
| Curiosity raw-image API | live GET | HTTP 200, **max sol 5072** — matches the doc's "current through sol 5072" exactly |
| USGS pygeoapi SIM 3292 | live GET | HTTP 200, GeoJSON features with `unit`, `unitdesc` — usable as-is |
| Product/catalog pages (THEMIS TI mosaic, MOLA 463 m, PDS MEGDR, RAD PPI, MSL Analyst's Notebook, PDS MSL, Curiosity location map, "proposed path up Mount Sharp" resource, HiRISE DTM hub, Murray Lab browser, STAC docs) | live GET | **All HTTP 200** |

### 1.2 Citations — no fabricated sources found

Every DOI in both reports resolves via the doi.org handle system (302), and where I could reach
metadata, **titles match the reports' characterizations**:

- **Guo et al. 2026, `10.1029/2026JE009704`** — the most "invented-looking" citation in routing-options §11 — is real: *"Influence of Mars Topography on Radiation Dose Detected by the Mars Science Laboratory and Assessment of Mars Surface Albedo Radiation"* (via Semantic Scholar, accessed 2026-11-13). The doc's paywalled/abstract-level flag is honest.
- Fergason & Christensen 2006 (`10.1029/2006JE002735`) and Kirk et al. 2008 (`10.1029/2007JE003000`): titles confirmed. (Wiley/ADS block plain curl — 403/405 — which is *not* evidence against them; doi.org + Semantic Scholar settle existence.)
- arXiv:2502.02469 — title is exactly *"Nowcasting Solar Energetic Particle Events for Mars Missions"* (Löwe et al., incl. Hassler, Guo — the RAD team) ✓.
- Kluis 2024 hypogravity PhD: TAMU OAKTrust item exists (bot-blocked to curl/WebFetch but confirmed by web search: *"A Novel Metabolic Model for Ambulation in Hypogravity and Applications to Planetary Extravehicular Activity"*, Logan Kluis, Texas A&M, 2024).
- HTTP-200 citations: Norcross TP-2009-214796 (LPI PDF), Sachenbacher & Artmeier AAAI'11 (ojs.aaai.org), Paul et al. 2012 (NTRS PDF), LSDA PLSS hardware record, xEVA con ops PDF, gdal_viewshed docs, arXiv Theta* 1401.3843, Universe Today 23° reroute article, Hassler 2014 Caltech copy.
- **Pandolf sanity (content-level):** Wikipedia's Pandolf-equation entry (accessed 2026-11-13) gives the identical formula `M = 1.5W + 2.0(W+L)(L/W)² + η(W+L)(1.5V² + 0.35VG)` and the identical terrain table the routing doc uses, **including loose sand 2.1 and swampy bog 1.8** — the η ∈ [1.0, 2.1] Mars mapping is anchored to the real table.

### 1.3 Numbers and code — re-derived or benchmarked

- **Pandolf hand-checks:** W=80, L=30, V=0.9, level → 284.6 W (doc: 285 ✓); G=21.2 % → 1019 W (doc: ~1020 ✓); 48.6 L/h → 63 L/h suited at κ=1.3 ✓.
- **Routing toy example (§10 of routing-options):** I recomputed every route time, risk, the α-crossover (α≈0.913), and both PNR cases — **all correct**.
- **Planetographic↔planetocentric offset at Gale:** recomputed with a=3,396,190 / b=3,376,200 → **3.18 km** (doc: "≈3.3 km" ✓). This trap is real and the doc's rule (planetocentric east-positive end-to-end; never georeference from product IDs) is the right defense.
- **Scale factors:** 1° = 59,274.7 m ✓; z-ladder (z17 = 0.318 m/px, z15.3 ≈ 1 m, z8.7 ≈ 100 m) ✓ — but see §3.1 for the tile-count error built on this correct ladder.
- **Benchmarks (this machine, numpy 2.3.5 / scipy 1.16.3, synthetic Gale-scale grid):**
  - Graph: 1,440,000 nodes, **11,436,858 directed edges** (doc: ~11.5 M ✓), vectorized build 0.5 s.
  - **`scipy.sparse.csgraph.dijkstra` full field: 0.25 s** — the doc's "1–5 s" is conservative; the return-cost field is effectively free.
  - **Hand-written pure-Python heapq A\* (far-corner OD): 6.5 s, 1.61 M pops** — the doc's "per-goal A\* ≤ 1 s Python" is **refuted** for worst-case OD pairs (§3.2).
- **gdal_viewshed claim:** GDAL docs confirm — since 3.4 Earth default CurvCoeff 0.85714; **since 3.6, non-Earth CRS (semi-major axis >5 % from WGS84) defaults CurvCoeff to 1.0**. The routing doc stated this correctly. (Note: geometric curvature drop over a 6 km sight line on Mars is ≈ 5.3 m — small, but it means the no-GDAL Bresenham fallback is slightly optimistic beyond ~4 km; acceptable if stated.)

### 1.4 Licenses (for the credits list)

- MapLibre GL JS: **BSD-3-Clause** (LICENSE.txt on GitHub; the mapping doc's "BSD-2" is wrong — fix).
- PMTiles: BSD-3 ✓. three.js: MIT ✓. ngraph.path: MIT ✓. PathFinding.js: LICENSE 404 on master — consistent with the doc's "effectively unmaintained" verdict.

---

## 2. Feasibility and honesty assessment (adversarial pass)

**Feasibility, 24 h to local judging:** realistic *after* this review's corrections, and actually **better
than the docs assume** on compute: scipy full-field Dijkstra at 0.25 s per mode makes the whole 24 h
engine (3 mode fields + PNR + reachability) a ~2-second computation; the hand-written A\* was the only
questionable piece and it is not needed on day 1. The true critical path is **data download reliability**
(§3.3) and UI wiring, not algorithms. The build plan's phase structure (A→E with cut rule) is sound; the
"submit at 9:00 a.m. snapshot Saturday, resubmit later" strategy matches the verified global rules
(edit-and-resubmit allowed until close) and the Cairo uncertainty.

**Route objectives (fastest/safest/balanced):** definitions are coherent; hard-constraint vs soft-cost
separation is defensible; the "always show both raw axes" UI rule is the right anti-black-box move. The
banned-word list ("safe route") is good — but note the mode is literally named **"Safest"**: keep the name
(usable), and put the "lowest modeled hazard-score within available data" caption directly on the mode
selector, not only in the docs.

**Return reserve / PNR:** the backward-field formulation is correct and correctly cited; recomputation
triggers and the factorization trick (rescale O₂ without re-search when only metabolic constants change)
are right. Two precision points the docs under-state: (a) the PNR check must use the **O₂-based** backward
field when B is an O₂ budget and the **time-based** field when B is a time budget — pick per excursion
input, don't mix; (b) hard slope blocks are symmetric in |θ| so the return field inherits them correctly —
fine — but *soft* η terms are direction-asymmetric only through V(θ), so Back≠Used reversal is genuinely
necessary (the doc knows this; make the implementation assert it in T8).

**Scientific honesty:** this is the strongest part of both reports. The Observed/Derived/Scenario/
Unavailable taxonomy is consistently applied; radiation/SEP honesty is exactly right and now fully
citation-verified; "no rock-by-rock walkability data exists" is true and correctly stated; the claims
audit table (routing §11) survives adversarial reading. **No invented safety precision found**: the three
invented-by-design items (TI→η, κ, 25 % reserve) are all self-labeled as such. The only soft spot: the
specific "~20 % accuracy, 10–15 % precision" figures attributed to Fergason & Christensen 2006 were
**not** re-verified at content level (paper is real; abstract inaccessible to me) — soften to "~10–25 %"
on-screen or verify from the PDF before printing on a slide.

**CRS/raster alignment:** the 3.3 km planetographic trap is correctly identified, and the fake-Web-Mercator
trick is standard and safe for display. One real inconsistency between the two reports: routing §2 calls
WKID 104905 "the Mars 2000 **sphere**", while epsg.io registers **ESRI:104905 as the *ellipsoidal* GCS**
(sphere is ESRI:104971; mapping §2.1 gets this right and prescribes the explicit `+proj=longlat +R=3396190`
string). At Gale, sphere-vs-ellipsoid latitude *is* the 3.3 km issue, so the label matters educationally
even though both services serve planetocentric degrees either way. **Resolution: adopt mapping's rule**
(explicit PROJ string / IAU2015:49900, convert on ingest, verify one landmark against the ortho) and fix
routing §2's parenthetical.

**Actual data coverage & download speed:** coverage claims check out (8 CC0 DTMs over the window; 36×40 km
Trek block; THEMIS/CRISM as described). Download speed is the uncovered risk — see §3.3. DTM COGs are
hundreds of MB to ~GB-class; one pair plus its 1 m ortho is a ~1–1.5 GB pull; budget 15–45 min with
retries, run **in parallel with** UI scaffolding, not after it.

**Runtime performance:** engine proven (§1.3). JS-worker A\* at <300 ms is *plausible but unverified* —
keep it a 48 h item exactly as the docs stage it, with the scipy engine as the always-true reference.

**Demo quality:** the 30 s/7-slide constraint, English rule, public-links rule, and SI disclosure are all
correctly captured in requirements. The strongest Presentation assets in the plan (PNR slider interaction,
provenance inspector, real Curiosity photos) are all low-risk given the engine is precomputed — good
storytelling ordering. The HUD O2-countdown-equals-2D-table invariant (single JSON source) is the right
anti-drift contract.

**Integration routing↔mapping:** the two reports agree on the static-first, no-backend spine and the same
5 m planning grid — genuinely integrable. The unresolved couplings are §3.4 (slope aggregation), §3.6
(heuristic scaling / speed model), and the not-yet-written A1 JSON contract, which must pin: CRS string +
axis order, grid origin/resolution, route coordinate encoding, per-segment table schema, and the
constants-file schema with per-constant badges.

---

## 3. Findings that require action (ranked by impact)

### F1 (HIGH, correctness of budget) — z17 tile count understated ~2.75×
mapping-options §10: "z17 ≈ 22×22 = 484 tiles top level ≈ 650 with pyramid; ortho ≈ 60–150 MB".
Recomputed with the doc's own (correct) 0.318 m/px at z17: a Mars tile is 162.8 m wide on the ground →
**37×37 = 1,369 top-level tiles, ~1,820 with pyramid → ortho ≈ 160–400 MB**. Still inside the ≤500 MB
total budget, but the "60–150 MB" line is wrong. **Fix:** recompute the table; either accept ~250 MB for
the ortho, or tile the full box to z16 (0.64 m/px) with a z17 core (e.g., 3×3 km around habitat/targets,
~324 tiles) — recommended; it also halves tiling time in Phase B.

### F2 (HIGH, 24 h plan) — hand-written Python A\* is not sub-second; scipy makes it unnecessary
Routing §5/§9 claims "per-goal A\* ≤ 1 s (Python)". Measured: **6.5 s** worst-case OD on the exact
advertised grid size (1.44 M nodes, pure-Python heapq). Meanwhile scipy full-field Dijkstra measured
**0.25 s** and returns predecessors — from which *every* goal's optimal path is extractable.
**Fix (simplifies the plan):** 24 h engine = scipy full field per mode preset (≤1 s total) + predecessor
path extraction; keep the hand-written A\* only as the 48 h JS-worker implementation (typed arrays will
plausibly hit <300 ms — unverified) and as the T7 cross-check oracle. This removes the single riskiest
custom code artifact from the submission-critical path.

### F3 (HIGH, data pipeline) — the ARD example is dead and S3 DTM reachability is intermittent
- The exact product quoted in mapping §3.2, `DTEEC_040770_1755_039280_1755_A01`, is **not in the bucket**
  (consistent 404; S3 ListObjectsV2 returns 0 keys for that prefix; its hillshade/thumbnail also 404).
  The other 7 ops-box DTMs were reachable — but during repeat probing some URLs flipped 206→404 for
  minutes before recovering (one 21 s timeout), i.e. **direct S3 ARD access is real but not dependable
  at hackathon pace without retries**. The ortho subfolder was stable throughout (768 MB example).
- Trek quantitative export **does** work — but only with the exact parameter spelling
  `format=tiff&compression=…&f=image` (true float32 TIFF); `format=tif` silently returns a JPEG-in-TIFF,
  and omitting `size=` caps output at 400×400 px.

**Fix (download playbook, Phase A2):** (1) probe all 8 STAC DTM hrefs, rank by reachability; prefer e.g.
`DTEEC_018854_1755_018920_1755_U01`; (2) download with retry loop + size/integrity check (COG header
parse) and record bytes + license in `data/PROVENANCE.md`; (3) fallback ladder per layer: another STAC
DTM → Trek `format=tiff` export at native-ish size (now proven) → PDS ODE `MRO-M-HIRISE-5-DTM-V1.0`;
(4) replace the dead example ID everywhere it is cited.

### F4 (MEDIUM, routes change materially) — the two reports prescribe different slope aggregation
Routing §3.1: derive slope on the **box-filtered (mean-height)** DEM — smooths stereo noise *and* hides
sub-cell scarps. Mapping §2.3: "derive at 1 m and aggregate with mean/max — **max per 5 m cell is
conservative for a walker**". These produce different hard-block maps and different routes.
**Fix:** compute both at build time (cheap); use **max-slope (or 90th-pct) for the hard 15° constraint**
(conservative for a suited walker — safety claims stay defensible), **mean-slope for Pandolf energy**
(noise-averaged); state the choice on the slope layer card. Add a build-plan line to B1 so it isn't
decided by accident in code.

### F5 (MEDIUM, correctness details for the JS router) — heuristic scaling and the speed model
- The A\* heuristic `h = euclid/v_max` is admissible for **pure time** only. For `J_α = α·t̂+(1−α)·r̂` the
  heuristic must be `α·(euclid/v_max)/t_ref`; for **safest** mode there is no cheap admissible lower
  bound on risk → use h=0 (i.e. Dijkstra). The routing doc's pseudocode says "admissible" without this
  scaling — an optimality bug if copied literally into the worker.
- Speed model `V = V_max·max(0.3, cos(2θ))` is an **even function of θ** — downhill speed equals uphill
  speed, contradicting §3.6's own "downhill capped" text; and θ units (degrees vs radians) are unstated.
  The §10 toy uses a third variant (fixed V + `(1+2|grade|)` time factor). **Fix:** define ONE piecewise
  V(θ) (level/uphill per cos-model, downhill flat ~1.1·V_max until −12°, then decreasing; degrees stated),
  use it in engine and toy, and property-test monotonicity (T6 already catches part of this).

### F6 (MEDIUM, provenance of the plan) — `docs/technical-approaches.md` does not exist
README links it as the full data/provenance table; competition-overview and 24-48-hour-plan cite section
numbers inside it (e.g. "§3.6", "§6 guardrails"); build task B2 depends on "literature range in
technical-approaches §3.6". The file is absent from the repo. Either write it (the content mostly exists
across the two research docs — it is a consolidation job, ~1 h) or de-reference all three documents.
**Do this before Phase B**, or B-task owners will be reading a ghost.

### F7 (LOW, copy accuracy) — small factual drift to correct in credits/docs
MapLibre is BSD-3-Clause (doc says BSD-2); Trek catalog counts 76 services today (doc says 83);
routing §2's "WKID 104905 … sphere" (see §2 above); "83 services"/"sol 5072" class of numbers should
carry access dates (they mostly do). None affects architecture.

### F8 (LOW, LOS nuance) — curvature in the no-GDAL fallback
Bresenham-on-flat-grid LOS ignores planetary curvature: ~5.3 m of drop over a 6 km ray on Mars — enough
to matter only for long near-tangent sight lines. If GDAL is installed (it must be for the pipeline
anyway), `gdal_viewshed` handles it; if the fallback raycast ships to the demo, add "planar
approximation" to the LOS layer card.

---

## 4. Recommendation-by-recommendation notes (beyond the verdict table)

1. **Grid/graph (V1):** 5 m default with the documented 10 m fallback is right; benchmark shows even the
   5 m graph is trivial for scipy. Corner-cutting rule and directed edges are correct and cheap.
2. **Backward-field PNR (V2):** keep exactly as designed — it is the demo's signature feature and the
   pattern is correctly attributed. Implement both `Back_time` and `Back_o2` fields (both are ~0.25 s).
3. **ε-constraint sweep (V3):** fine as a 48 h upgrade; the dedupe-to-cards UX is a good Presentation bet.
4. **Pandolf transfer (V4):** the honesty stack (1 g empirical → Mars-g assumption → κ slider → capacity
   slider) is exactly how to survive a physiology-literate judge. Keep "PLSS-class 8 h" as *context*
   (Apollo J-mission doubling is real per LSDA) and never as our tank spec.
5. **TI→η (V5):** also render the TI layer visually at its blocky 100 m footprint (nearest-neighbor
   display, no bilinear smoothing) so the map itself teaches the resolution limit.
6. **15° (V6):** the justification chain (Apollo slope classes; Curiosity 23° reroute as a *rover*
   datapoint) is honest about being a demo default. Keep the card; add the 20° alternative toggle.
7. **Static-first map (V7):** XYZ directories over PMTiles for the 24 h snapshot (GitHub Pages range
   support is historically unreliable — mapping already flags it; agree, and don't spend gate time there).
8. **3D/HUD (V8):** 600×600 decimated mesh is the right size class; keep vertical-exaggeration disclosure
   on-screen (already specified).
9. **ARD-primary (V9):** after F3's playbook, yes — CC0 beats Trek's unstated terms wherever both exist,
   and the STAC `provenance.txt` asset is a provenance-inspector freebie.
10. **Traverse cross-check (R3):** good as a *qualitative* sanity demo only — the doc already says so.

---

## 5. Invented-precision and unsupported-source scan — result

- **Fabricated sources: none found.** Every URL/DOI/bibcode-checked citation in both reports resolved,
  and every content-checkable title matched. The two most suspicious-looking (Guo 2026; Loewe/nowcasting
  2025) are real and accurately characterized.
- **Invented-by-design, properly labeled:** TI→η mapping, κ=1.3 (range shown), 25 % reserve ("team
  policy"), V(θ) speed family, sky-view radiation modulation. All carry Scenario/Derived-assumption
  badges in the plan — keep it that way in the UI, not just the docs.
- **Not independently verified (do not print as exact numbers without opening the sources):**
  THEMIS "~20 % accuracy / 10–15 % precision" (paper real, figures unverified by me);
  Paul et al. 2012 "measured EVA energy expenditure down to ~115 W" (PDF is live; I did not read it);
  Iqbal 2024 "<25° highly accessible" (the boris-portal full-text URL serves an HTML interstitial to
  bots; abstract not re-read). All three are safe to keep as *cited context* with the source linked.

---

## 6. Smallest evidence-backed end-to-end pilot (do this before any app code)

**Budget: ~2–3 h, one operator, inside the event window. Tools: python3 + rasterio (bundles GDAL) or
system GDAL ≥3.6 — neither is installed on this machine today, so the pilot's step 0 is the environment
install (pip wheels, ~15 min; note the no-pre-work rule applies to doing this *before* the event).**

1. **Data (45–90 min, retry-hardened):** STAC search (proven pattern, §1.1) → download one *reachable*
   DTM COG (e.g. `DTEEC_018854_1755_018920_1755_U01`) + its 1 m RED ortho; verify COG readability, CRS
   string, nodata, elevation range; log bytes + CC0 license. Fallbacks in F3's ladder if it 404s.
2. **Grid (15 min):** clip to a 6×6 km box inside the DTM footprint; resample to **10 m** (600×600 —
   pilot scale; the 5 m production grid is proven by benchmark, no need to pilot it); Horn slope on both
   mean and max aggregation (F4); assert max slope < 60° (nodata-leak check).
3. **Route (15 min):** build the directed 8-connected CSR (my bench script pattern); scipy full-field
   Dijkstra from a corner "habitat"; extract predecessor path to a far-corner "target"; **assert no path
   cell exceeds the 15° hard layer**; compute cumulative time with the Pandolf calculator constants.
4. **Render (30 min):** gdal2tiles-equivalent on the ortho at z10–16 via the fake-mercator trick; a
   20-line MapLibre HTML; overlay the route GeoJSON + PNR marker (reserve 25 %).
5. **Gate screenshot:** one PNG proving layers + route + PNR render together from static files.

**Decision gate (binary, before Phase B / any UI work):**
- **G1** DEM downloaded, readable, license recorded — else switch DEM source per F3 ladder.
- **G2** CRS pinned (explicit `+proj=longlat +R=3396190`) and **one landmark alignment** (a butte in the
  ortho vs the DEM hillshade) passes — else stop and fix coordinates (this is the 3.3 km trap).
- **G3** Route obeys hard constraints end-to-end and PNR moves monotonically when the budget slider
  drops (the T6/T8 properties, pre-checked) — else fix cost model before scaling to 5 m.
- **G4** Total pilot time ≤ 3 h on the event connection — else the 24 h plan's data phase needs the
  Lead's pre-download clarification (open-questions #3) or a smaller ops box.
- **Decisions to record at the gate:** 5 m vs 10 m production grid; mean-vs-max slope aggregation (F4);
  STAC-primary vs Trek-tiff-primary (F3); z17-core/z16-rest tiling (F1).

---

## 7. Integration contract (what Phase A1 must write down, from this review)

1. CRS: planetocentric east-positive degrees, explicit PROJ string; convert on ingest; landmark check.
2. Planning grid: origin cell, resolution, extent, nodata convention; slope layers = **two** named
   rasters (mean, max) with their roles fixed per F4.
3. Route JSON: polyline in the same degrees, per-segment {t, O2, θ, cost-terms}, cumulative tables,
   PNR cell + budget line, mode + constants-file hash.
4. Constants file: one JSON/YAML, every key carrying {value, range, source-URL, badge} — both engine and
   UI read it; UI never hardcodes a number it also displays.
5. Reserved-word list enforced in copy review: "safe route", "certified", "real-time", "validated".

## 8. Timeline realism (against the Cairo clock)

With F2's simplification (no hand-written Python A\* on the critical path) and F3's parallel download
playbook, the 24 h MVP is comfortably feasible for a 2–3 person build; the plan's risk table should add
"S3/Trek download flakiness" as its own row with the retry ladder. The 48 h items (JS-worker A\*,
ε-sweep, time-dependent buckets) are correctly ordered after submission-critical work. The single
schedule threat the docs underweight: **tiling time** — with the corrected tile counts (F1), tile the
ortho during Phase B dinner-hour, not Phase C morning.

## 9. What this review did NOT verify (stated plainly)

- The 48 h JS-worker A\* <300 ms claim (no JS benchmark run; plausible with typed arrays + binary heap).
- Content of paywalled/bot-blocked papers: Fergason 2006 accuracy figures, Iqbal 2024 threshold wording,
  Paul 2012's 115 W figure, Kluis 2024 model form, Norcross TP details (PDFs live; not read).
- THEMIS tile naming for the exact Gale window (mapping flags it [A]; unresolved here too).
- Analyst's Notebook traverse export schema (page live; format unconfirmed).
- PMTiles range support on the final host (mapping's 2-tile test remains the right check).
- Anything about the Cairo local rules beyond what requirements/*.md already verified this morning.

---

## 10. Source register for this review (all accessed 2026-11-13)

Live service checks: `https://stac.astrogeology.usgs.gov/api/search` (POST, ops-box bbox) ·
`https://astrogeo-ard.s3-us-west-2.amazonaws.com/...` (ranged GETs + ListObjectsV2) ·
`https://trek.nasa.gov/mars/trekarcgis/rest/services` (+ `Gale_DEM_SMG_1m`, `curiosity_hirise_mosaic`
`?f=pjson` and `exportImage` variants jpg/tif/tiff/png/lerc) ·
`https://mars.nasa.gov/api/v1/raw_image_items/?condition=msl&per_page=3&order=sol%20desc` ·
`https://astrogeology.usgs.gov/pygeoapi/collections/mars/sim3292_global_geologic_map/units/items` ·
product pages listed in §1.1. Citations: doi.org handle resolutions for 10.1029/2007JE003000,
10.1029/2006JE002735, 10.1029/2026JE009704, 10.1126/science.1244797, 10.1029/2024EA003555 ·
api.semanticscholar.org title lookups for the three AGU papers · arxiv.org/abs/2502.02469 ·
arxiv.org/abs/1401.3843 · en.wikipedia.org/wiki/Pandolf_equation · gdal.org/en/stable/programs/gdal_viewshed.html ·
GitHub raw LICENSE files (maplibre/maplibre-gl-js, protomaps/PMTiles, mrdoob/three.js, anvaka/ngraph.path,
qiao/PathFinding.js) · web search confirming Kluis 2024 (OAKTrust + ResearchGate). Benchmarks: local,
numpy 2.3.5 / scipy 1.16.3, scripts summarized in §1.3 (synthetic 1200×1200 grid, seed 42).

*End of review. No file outside `docs/research/independent-architecture-review.md` was modified; no code
was added to the project; no git operations performed.*
