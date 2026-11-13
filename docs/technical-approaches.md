# RedSight — Technical Approaches & Data Factual Inventory

**Owner:** Agent4. **Written:** 2026-11-13 (Cairo day 1); edited same day by the documentation editor to fold in
the independent review. All external facts verified against primary sources
(NASA/JPL/USGS/ASU/PDS/AGU/peer-reviewed) on 2026-11-13 unless marked UNRESOLVED. Live endpoints were probed
today. Companion docs: [`competition-overview.md`](competition-overview.md) · [`24-48-hour-plan.md`](24-48-hour-plan.md) ·
deeper dive in [`research/mapping-options.md`](research/mapping-options.md) (mapping/CRS/tile architecture) and
[`research/routing-options.md`](research/routing-options.md) (graph, algorithms, PNR math, tests — written by
other workspace agents; conclusions align with §4 below).

**Independent review status (2026-11-13).** The adversarial
[`research/independent-architecture-review.md`](research/independent-architecture-review.md) verified this
architecture against live sources and benchmarks: **YES for the 24–48 h window** after its corrections F1–F8,
now integrated: **F1** tile budget recomputed (z17 full-box ≈ 1,369 top-level tiles ≈ 160–400 MB; plan z16 full
+ z17 core) — see research errata; **F2** scipy full-field Dijkstra (0.25 s measured) replaces any hand-written
Python A\* (6.5 s measured worst-case) on the critical path — §4 already specified the Dijkstra-field core, now
normative; **F3** one quoted ARD DTM product is dead and S3 DTM URLs are intermittently flaky — Phase A2 uses
the review's probe-and-retry ladder, and Trek quantitative export needs the exact `format=tiff&compression=…`
spelling; **F4** compute both mean- and max-slope aggregates (max/90th-pct for the hard 15° constraint, mean
for Pandolf energy) — recorded as a B1 decision; **F5** A\* heuristic must be re-scaled per mode (h=0 for
safest) and V(θ) needs one stated definition — errata in routing-options; **F6** this file's earlier absence is
resolved (it now exists); **F7** MapLibre GL JS is **BSD-3-Clause** (not BSD-2) and the Trek catalog served 76
services today — errata in mapping-options; **F8** planar LOS fallback ignores ~5.3 m curvature over 6 km —
noted on the LOS layer card if the fallback ships.

**Classification legend used throughout** (this taxonomy is itself a product feature — it protects the Validity score):
- **OBSERVED** — direct instrument measurement at/or of Mars.
- **DERIVED** — computed from observed data by established algorithms (DEMs, slope, thermal inertia, mineral indicators, line-of-sight).
- **SCENARIO** — forward model, projection, or team assumption (O2/time estimates, radiation modulation, weather windows, fictional habitat).
- **UNAVAILABLE** — does not exist publicly at the needed scale; must be presented as scenario or omitted, never implied.

---

## 1. Factual inventory — what actually covers Gale at Marswalk scale

### 1.1 Terrain / topography

| Dataset | What | Resolution & Gale coverage | Access (24 h) | Class | Terms |
|---|---|---|---|---|---|
| **Mars Trek `Gale_DEM_SMG_1m`** | DEM mosaic of lower Mount Sharp (HiRISE-derived), EPSG 104905 | **1 m/px**, footprint 137.1225–137.7298 °E / −4.9255…−4.2490 (≈36×40 km — exactly our story area) | Live-tested: `trek.nasa.gov/mars/trekarcgis/rest/services/…/ImageServer/exportImage` → PNG, no auth | DERIVED (from HiRISE stereo) | No explicit license string; NASA/JPL-Caltech credit; cache locally |
| **HiRISE stereo DTMs (PDS)** | 24 Gale DTMs listed by UA HiRISE ops (e.g. PSP_009505_1755, ESP_012907_1745 "Sulfate Beds"); post spacing 1–2 m, vertical precision **tens of cm** ([uahirise.org/dtm/about.php](https://www.uahirise.org/dtm/about.php)) | Sparse — ~19–24 strips ≈ a few % of Gale's ~18,600 km², concentrated on the traverse corridor (8 COG DTMs overlap a 9×12 km window in the boxwork region alone, per mapping-options §3.2) | PDS bundle `MRO-M-HIRISE-5-DTM-V1.0`; USGS **ARD** STAC live-tested (`stac.astrogeology.usgs.gov/api/`, collection `mro_hirise_socet_dtms`) serving per-pair COG DTM+ortho+hillshade under explicit **CC0-1.0** | DERIVED | **CC0-1.0 (ARD STAC metadata)** / PDS public domain |
| **CTX stereo DTMs (Gale)** | ~12 CTX stereo pairs, 20 m grid (Calef 2015; Figshare "Gale Crater Stereo CTX DTMs") | Partial, 20 m | Figshare + USGS STAC `mro_ctx_controlled_usgs_dtms` | DERIVED | Public (NASA-funded products) |
| **HRSC (Mars Express)** | Strip DTMs 50–150 m; ESA published a Gale DTM at 100 m (2012) | Regional only at walk scale | ESA PSA | DERIVED | **CC BY-SA 3.0 IGO** (ESA/DLR/FU Berlin) — ShareAlike; keep out of the app unless credited accordingly |
| **MOLA MEGDR** | Global gridded DEM from Mars Orbiter Laser Altimeter; shot precision ~1 m radial / ~100 m horizontal, but **gridded at 463 m/px** (128 pix/deg; USGS [Astropedia](https://astrogeology.usgs.gov/search/map/mars_mgs_mola_dem_463m), PDS `MGS-M-MOLA-5-MEGDR-L3-V1.0`) | Global but useless at walk scale: a 5-km walk ≈ **11 pixels**; inter-track gaps ~4 km at the equator | USGS/PDS | DERIVED | Public domain |
| **Murray Lab CTX global mosaic** | Image mosaic (not DEM), 5.0 m/px, >99.5 % of Mars — covers all of Gale (Dickson et al. 2024, DOI 10.1029/2024EA003555) | 5 m imagery, global | [murray-lab.caltech.edu](https://murray-lab.caltech.edu/CTX/beta01.html), PDS bundle | OBSERVED (imagery) | Public (Caltech/JPL) |

**Verdict (MOLA vs HiRISE) — confirmed with arithmetic.** MOLA cannot support Marswalk-scale slope: sub-pixel
relief, interpolation between tracks. Planning DEM = **Mars Trek 1 m Gale DEM** (or PDS HiRISE DTMs); MOLA and
CTX/HRSC appear only as regional-context layers, labeled with their true resolution.

### 1.2 Obstacles / surface material

| Dataset | What | Resolution & Gale coverage | Access | Class | Terms |
|---|---|---|---|---|---|
| **HiRISE 0.25 m mosaic** (Mars Trek `curiosity_hirise_mosaic`) | Optical basemap — dune fields, scarps, boulder fields readable by eye | **0.25 m/px**, same 36×40 km footprint as the 1 m DEM | Live-tested exportImage, no auth | OBSERVED | NASA/JPL-Caltech/Univ. of Arizona credit |
| **THEMIS nighttime IR + thermal inertia** | Nighttime radiance → thermal inertia; **low inertia = fine loose material (dust/sand), high = rock/indurated** (Fergason et al. 2006, JGR, DOI 10.1029/2006JE002735) | Inertia mosaics **100 m/px**, global incl. all of Gale ([USGS global mosaic](https://astrogeology.usgs.gov/search/map/mars-themis-derived-global-thermal-inertia-mosaic)) | ASU ([themis.asu.edu](https://themis.asu.edu), viewer live) + USGS | DERIVED | Credit **NASA/JPL-Caltech/Arizona State University**; cite image/mosaic IDs (ASU terms) |
| Rock/obstacle polygons | No published product | — | — | DERIVED (we vectorize from HiRISE + slope) | ours |

Note: the ~3 km coarse inertia maps sometimes cited are **TES-derived** (Putzig & Mellon 2007), not THEMIS; do
not mix them up. At 100 m/px, thermal inertia is a *sand-likelihood* layer, not a per-step trafficability map —
label it as such in the UI.

### 1.3 Science targets

| Dataset | What | Resolution & Gale coverage | Access | Class | Terms |
|---|---|---|---|---|---|
| **CRISM targeted (FRT)** | Hyperspectral, 544 bands, 362–3920 nm; **~18 m/px** (Murchie et al. 2007; Seelos et al. 2024, Icarus, DOI 10.1016/j.icarus.2023.115422 area) | Targeted strips over key Mount Sharp units | PDS Geosciences (heavy GB cubes — avoid raw in 24 h) | OBSERVED→DERIVED | Public domain (PDS) |
| **CRISM MRDR mapping** | Multispectral mosaicked global map, **~200 m/px** (Phillips et al. 2024, Icarus; Seelos et al. 2024) | Global | PDS / ODE | DERIVED | Public domain |
| **Mars Trek pre-derived mineral layers** | e.g. `MC18_PolySulfate_Mineral_IndicatorV2`, `T1303_FeMgSmectite_Mineral_Indicator_SP`, hydrous-mineral detections — ready map services over Gale | Derived indicator polygons/rasters | Live-tested on trekarcgis REST | DERIVED (interpretation) | NASA/JPL-Caltech credit |
| **Fraeman et al. 2016** | *The stratigraphy and evolution of the lower Mount Sharp from orbital observations and Curiosity rover data*, JGR-Planets, DOI 10.1002/2016JE005095 (open copy PMC5101845) — the clay→sulfate unit map our science targets hang on | Regional | AGU/PMC | DERIVED (peer-reviewed interpretation) | cite paper |
| **USGS SIM 3292 geologic map** | Global 1:20 M geology (Tanaka et al. 2014) — **at Gale the mound incl. boxwork zone maps as unit Htu** (Hesperian transition undivided), landing floor as AHi — *not* "eHsu" (point-in-polygon verified live via pygeoapi) | 1:20 M — context only | [pubs.usgs.gov/sim/3292](https://pubs.usgs.gov/sim/3292/) + live pygeoapi | DERIVED (interpretation) | Public domain |
| **Boxwork (2025 Curiosity discovery)** | Ca-sulfate boxwork veins: ridges **~1–2 m tall**, miles-wide exposure in the sulfate layer, groundwater evidence — JPL press releases **2025-06-23** "[Curiosity Starts Unpacking Boxwork Formations](https://www.jpl.nasa.gov/news/nasas-curiosity-mars-rover-starts-unpacking-boxwork-formations)" and **2025-08-21** close-ups; HiRISE orbital view (science.nasa.gov, Nov 2024); peer-reviewed: Seeger, Siebach et al. 2026 (Altadena Member chapter) + *Geomorphology* 2026 DOI 10.1016/j.geomorph.2026.110386; veins background Nachon et al. 2014 DOI 10.1002/2013JE004588 | Orbital identification: texture below orbital resolve; Curiosity mastcam/ChemCam = ground truth | JPL/USRA links | OBSERVED (rover) | NASA/JPL-Caltech credit |

**Verdict (CRISM & boxwork) — confirmed with a precision argument.** CRISM resolves the **sulfate-bearing host
unit** (~18 m/px targeted; 200 m/px mapping); boxwork is a *texture* — cm-scale veins forming 1–2 m ridges — one
to two orders of magnitude below CRISM's smallest pixel. So: science targets = CRISM-mapped units + Curiosity's
2025 boxwork location as an OBSERVED point; the app must say "boxwork identified by Curiosity imaging, hosted in
the CRISM-mapped sulfate unit", never "boxwork detected by CRISM".

### 1.4 Radiation

| Item | Fact (source, verified 2026-11-13) | Class |
|---|---|---|
| **Curiosity RAD** | The **only** long-term surface radiation measurement on Mars — confirmed: no dosimeter on Zhurong, Perseverance, or InSight. Operating at Gale since 2012-08-07. GCR surface average **0.64 ± 0.12 mSv/day** (Hassler et al. 2014, *Science* 343:1244797, DOI 10.1126/science.1244797). Data: PDS PPI `MSL-M-RAD-2/3-…-V1.0` | OBSERVED (single roving point, not a map) |
| **SEP events at the surface** | Sept 2017 SEP event detected by RAD on the surface, ~369 µGy accumulated + Forbush decrease (Zeitlin et al. 2018, *GRL*, DOI 10.1029/2018GL077760; companions: Ehresmann 2018 GRL, Guo 2018 *Space Weather* 10.1029/2018SW001973, Hassler 2018 SW 10.1029/2018SW001959) | OBSERVED (episodic) |
| **Spatial dose map** | **No fine-scale spatial radiation dataset exists** for any Mars site. Only coarse global model maps (latitudinal ~50 % variation, Saganti et al.; JPL PIA03480). OLTARIS (NASA LaRC, oltaris.nasa.gov) supports Mars-surface scenario transport (validated vs RAD, Slaba et al. 2025) but produces no terrain-resolved map product | UNAVAILABLE → SCENARIO |
| **Terrain modulation physics** | Dose depends on sky zenith-angle distribution — published basis for sky-view-factor modulation: Guo et al. 2026 (*JGR-Planets*, DOI 10.1029/2026JE009704; terrain shadowing along Aeolis Mons, albedo ~18–24 % of dose), Khaksari & Matthiä et al. 2025 (DOI 10.1029/2025JE009352, dose vs zenith angle) | SCENARIO (we may compute a sky-view factor from the DEM and scale the RAD baseline — clearly labeled modeled, never observed) |
| **Shelters** | No overhang/cave inventory exists for Gale at usable resolution (skylight-type caves known elsewhere on Mars, not here). "Shelter" can only be a *relative* terrain-shielding estimate from the DEM | UNAVAILABLE (as data) → SCENARIO (as proxy) |
| **NASA DONKI** | Earth-centric space-weather catalog (flares/CMEs/SEP + Earth impact types), now under the Moon-to-Mars Space Weather Analysis Office: **does** include MAVEN-EUVM flare catalog (flares measured at Mars) and WSA-ENLIL runs targeting Mars — but **zero Mars surface-dose data**. Legacy `api.nasa.gov/DONKI/*` endpoints are 404; docs at ccmc.gsfc.nasa.gov/DONKI/api | OBSERVED (solar events) + models; **Mars surface impact = user extrapolation → SCENARIO** |

**Verdicts:** "only surface radiation data at Gale is rover-local" — **CONFIRMED** (and globally unique to RAD).
"Use DONKI storm events for Mars radiation" — **PARTIAL**: legitimate as *scenario seeds* (real observed solar
events + ENLIL Mars arrivals), never as Mars surface measurements. The honest stack: RAD baseline (OBSERVED
point) + user-selected SEP scenario (seeded by real events like 2017-09) + DEM sky-view modulation (SCENARIO).

### 1.5 Atmosphere, weather, light

| Item | Fact | Class |
|---|---|---|
| **REMS (Curiosity)** | Wind, air/ground temp, pressure, RH, UV (6 photodiodes); 1 Hz in ~5-min windows hourly (Gómez-Elvira et al. 2012, DOI 10.1007/s11214-012-9921-1). PDS4 bundle `msl_rems_bundle` (Atmospheres Node, sols 1–4843); CAB team site live. Surface pressure at Gale ~**700–920 Pa** annual (Gómez-Elvira 2014 DOI 10.1002/2013JE004576; Haberle 2014 DOI 10.1002/2013JE004488) — straddles water's triple point; unsuited human survival impossible | OBSERVED (rover-local time series) |
| **Live REMS feed** | **No official NASA Mars-weather API** (MAAS dead). CAB outreach widget JSON works live (`cab.inta-csic.es/rems/wp-content/plugins/marsweather-widget/api.php?sols=latest`) — returns sol-by-sol data but **lags ~2.5 months** (latest ≈ sol 4995 = 2026-08-25) and is "outreach purposes only" → snapshot to a static table, cite PDS as authoritative | OBSERVED (lagged) |
| **Mars Climate Database (LMD)** | Current site version **v6.2**; GCM grid **5.625° × 3.75°** (~330×220 km cells — Gale is sub-cell); 5 dust scenarios; free web interface, full data after registration; cite Millour et al. The site itself warns interpolation underestimates extremes → usable as **climatological context (dust season, pressure curve), not local forecast** | SCENARIO (climatology model) |
| **Sun angle** | Fully computable: Ls + local true solar time → az/el (NASA Mars24, GISS). **Verified live: JPL Horizons API** (`ssd.jpl.nasa.gov/api/horizons.api`, `CENTER='coord@499'&SITE_COORD='-137.4,4.59,0'`, QUANTITIES=4) returns Sun az/el for any Mars surface point — a real public API for daylight/EVA-window math | DERIVED (ephemeris) |
| Daylight window | From Horizons/Mars24 az/el curve — honest, exact | DERIVED |

### 1.6 Imagery & mission ground truth

| Item | Fact | Class |
|---|---|---|
| **Curiosity raw images** | Live JSON API `mars.nasa.gov/api/v1/raw_image_items/?condition=msl&per_page=…` — current through **sol ~5072 (Nov 2026)**; rich metadata (sol, camera) but **no reliable per-image coordinates** → pin by sol/region, label approximate | OBSERVED |
| **Official traverse map** | science.nasa.gov/mission/msl-curiosity/location-map/ (updated 2026-06-22; images only, no KML). Machine-readable current traverse: MSL Analyst's Notebook (PDS Geosciences, an.rsl.wustl.edu/msl) traverse files / SPICE kernels `MSL-M-SPICE-6-V1.0` (per mapping-options §3.9) | OBSERVED (curated) |
| **Mars Trek `curiosity_path`** | **STALE — ends 2018** (Vera Rubin Ridge extent, verified structurally) — do not present as current | OBSERVED (stale) |
| Perseverance raw images | Official resource #5 but Jezero, not Gale — cite as design inspiration only if used | OBSERVED (wrong site) |

---

## 2. Claim-by-claim verdicts on the user's proposal

| # | Claim in proposal | Verdict | What we do instead |
|---|---|---|---|
| 1 | "Only surface radiation data at Gale (Curiosity RAD)" | ✅ **CONFIRMED** — RAD is the only surface dosimeter on Mars, one roving point | RAD baseline card + sky-view SCENARIO modulation, labeled |
| 2 | "CRISM identifies boxwork" | ⚠️ **PARTIAL/REFUTED as stated** — CRISM maps the sulfate *host unit* (18–200 m/px); boxwork texture is 1–2 orders below pixel; boxwork was identified by Curiosity imaging (JPL 2025-06-23) | Targets = CRISM units + Curiosity boxwork point (OBSERVED) |
| 3 | "DONKI storm events drive Mars radiation" | ⚠️ **PARTIAL** — real solar events + ENLIL-to-Mars, but no Mars surface dose; legacy endpoints dead | SEP scenario cards seeded by real events (e.g. 2017-09-10, RAD-observed) |
| 4 | "Radiation spatial mapping" | ❌ dataset **UNAVAILABLE** | DEM sky-view factor scaling of RAD baseline, big SCENARIO badge |
| 5 | "Shelter inference" | ❌ data **UNAVAILABLE** (no overhang/cave inventory at Gale) | Relative terrain-shielding proxy only; "storm shelter" = concept flag |
| 6 | "O2 calculation" | ✅ feasible as **SCENARIO model** — Pandolf 1977 load-carriage + suit overhead (Norcross TP-2010-216115) + HIDH bands + EMU-class consumables; conversion **1 W ≈ 2.9 mL O₂/min** (1 L O₂ ≈ 20.9 kJ) | Deterministic calculator, all constants cited in-app |
| 7 | "Comms line of sight" | ✅ DERIVED — viewshed/raycast on the 1 m DEM (standard GIS: Esri Viewshed, GRASS r.viewshed); UHF relay architecture is real (NASA Mars Relay Network); "terrain blocks UHF" is an engineering assumption, not a NASA quote | LOS layer labeled DERIVED-from-DEM + assumption note |
| 8 | "MOLA and HiRISE DTMs" as slope inputs | ⚠️ MOLA **unusable** at walk scale (463 m/px); HiRISE DTM 1 m sparse but Trek's Gale mosaic covers our whole ops area | Planning on 1 m DEM; MOLA = context layer with honest label |

**Corrections to carry into all copy:** Zeitlin (not "Zeitler"); MCD v6.2 @ 5.625°×3.75°; Gale pressure ~700–920 Pa
(not 600–900); SIM 3292 unit at the mound is **Htu**, not eHsu; MRDR mosaic attribution = Murchie 2007/Seelos
2024/Phillips 2024 (Viviano-Beck 2014 is the spectral-parameters paper); Mars gravity **3.71–3.73 m/s²** (NSSDC
mean 3.73, GM/R² 3.721); EMU primary O₂ **0.55 kg usable** (secondary 1.19 kg), 7–8 h EVA max (OIG vs ISS guide).

---

## 3. Model constants (deterministic calculator — every value cited in-app)

| Constant | Value | Source |
|---|---|---|
| Metabolic cost of walking w/ load | M = 1.5W + 2.0(W+L)(L/W)² + η(W+L)(1.5V² + 0.35VG) [W; W=body kg, L=load kg, V=m/s, G=grade %, η=terrain] | Pandolf, Givoni & Goldman 1977, *J Appl Physiol* 43(4):577–581, DOI 10.1152/jappl.1977.43.4.577 |
| Terrain factor η | 1.0 firm / ~1.5 mixed / **2.1 loose sand** (maps to thermal-inertia bins) | Pandolf 1977 |
| Suited-EVA sanity bands | min 144–160 W · **avg 264–286 W** · max 724 W · 10-km walkback avg 696 W / max 880 W | NASA HIDH NASA/SP-2010-3407 REV1 (2014), Table 11.1-1 |
| Suit overhead | suit adds ~60 %+ at 4.3 psi (weight ~14 %, PV work ~15 %, other suit factors 10–41 %) | Norcross et al., NASA/TP-2010-216115 (2010), MKIII 3/8-g tests |
| W → O₂ | 1 L O₂ ≈ 20.9 kJ ⇒ **P[W] × 2.9 ≈ mL O₂/min** | Scott 2005 (PMC2129144); Weir 1949 |
| Suit O₂ (EMU-class reference) | primary 0.55 kg usable + secondary 1.19 kg; 7–8 h sortie max | EMU Data Book Rev V (JSC-E-DAA-TN55224, 2017); ISS Utilization Guide 2015; NASA OIG IG-17-018 |
| Mars gravity | 3.71 m/s² working value (fact sheet mean 3.73) | NSSDC Mars Fact Sheet |
| Walk speeds (suited) | 1.1–2.2 km/h working; 3.6 km/h walkback planning | Apollo Lunar Surface Journal "Lunar Gaits" (NASA) |
| Rover speeds | robotic rover 150 m/h max (Curiosity, JPL); crewed LRV-class up to 18 km/h record (NASA history) | JPL robotics; NSSDC LRV |
| Buddy rule | "Mars surface EVAs … minimum of two people and a maximum of four … always provide for a 'buddy system' … within rescue range of the surface base" | NASA DRA 5.0, NASA/SP-2009-566 (2009) |
| Return reserve | 25 % consumable margin — **team assumption, labeled as such** (no official Mars figure found) | ours (flagged) |
| Max planning slope | ~15° hard constraint, configurable — **team assumption** (no official suited Mars slope limit found in NASA-STD-3001/DRA; flagged) | ours (flagged) |

---

## 4. Implementation approaches compared

### Approach 1 — Web-first 2D planner + staged 3D/HUD extension ⭐ RECOMMENDED

**Architecture (static, no backend):**
```
[one-time data pull]                     [engine — Python, offline]           [app — static web]
Mars Trek exportImage  ─┐                DEM → 10 m planning grid            MapLibre/Leaflet raster
(bbox-tiled PNGs/GeoTIFF)│                ├─ slope, hillshade, sky-view       + layer toggles
ASU THEMIS tile         ─┼→ data/raw →    ├─ cost grid (Int16 PNG/bin)   →    planner UI (goal → route)
Trek CRISM layers       ─┘   PROVENANCE   ├─ Dijkstra field from habitat       provenance inspector
PDS/CAB REMS+RAD tables                 └─ routes/time/O2 JSON               three.js 3D + HUD (D2)
Horizons API (sun, optional live)                                             Curiosity photo cards
```
- **Stack:** Vite + TypeScript-lite JS; MapLibre GL JS or Leaflet with pre-rendered raster tiles; three.js for
  the 3D/HUD phase; plain static hosting (GitHub Pages/Netlify).
- **Router core (better than per-target A\*):** one **Dijkstra multi-source-solved field** from the habitat per
  constraint-set: gives (a) reachability isochrone (time/O2 contours), (b) least-cost path to *any* target by
  gradient descent, (c) **turn-back/point-of-no-return everywhere**: outbound cumulative cost at cell x +
  field(x) vs reserve ⇒ the turn-back marker is exact for every route, free. Grid ~600×600 @10 m → ms-scale in
  JS typed arrays with a binary heap; A* kept as the interactive re-route variant for changed goal mid-session.
- **Pros:** fastest to a judge-visible demo; zero server cost/failure; mobile-browser friendly; engine/UI split
  lets 2 people work in parallel; every layer is a cached asset (no live-API demo risk).
- **Cons:** not a full GIS; tile pyramid authoring is a manual step; "3D" is a local scene, not a globe (fine).

### Approach 2 — 3D-first (Cesium global Mars globe / game-style simulator)

CesiumJS with a custom Mars ellipsoid + self-hosted terrain + imagery: spectacular, but quantized-mesh terrain
pipeline + CRS plumbing + camera UX is realistically >24 h of risk before *any* planner logic shows. A Unity/
Unreal/Godot simulator has the same shape: high wow, high setup, weak provenance story, harder public judge links.
**Verdict:** reject for the hackathon; note in README as roadmap. (Our three.js ops-area scene in Approach 1
captures 80 % of the visual value at ~5 % of the risk.)

### Approach 3 — Mobile-first (Expo/React Native) or full mission simulator

Install/deep-link friction for judges, device fragmentation, store policies, and the challenge is judged via
**public web links** — a mobile-first bet fights the evaluation channel. **Verdict:** reject; responsive web
covers phones.

### Internal harness (not a deliverable): a Jupyter notebook driving the engine functions
used to sanity-check routes/constants (acceptance evidence for Validity) — stays in repo under `engine/notebooks/`.

| Criterion (weight for us) | A1 web-first+3D ext | A2 3D-first | A3 mobile/sim |
|---|---|---|---|
| Working Must-tier within 24 h | **High** | Low–Medium | Low |
| NASA-data provenance visible | **High (inspector)** | Medium | Medium |
| Demo over a public link | **Trivial (static URL)** | OK | Hard |
| HUD wow-factor ceiling | Medium-High (three.js) | **High** | High |
| Team parallelization | **Engine/UI/Story split** | Serial-ish | Serial-ish |
| Risk of half-finished at judging | **Low** | High | High |

**Recommendation:** Approach 1. 24 h = Must tier (2D planner + inspector + submission). 48 h = Should tier
(3D scene, HUD walk-through, photos, mission panel). Stretch only after Musts pass.

---

## 5. Honesty guardrails (baked into UI, not just README)

1. Every layer carries a badge: OBSERVED / DERIVED / SCENARIO (+ resolution + date + source link) — the
   provenance inspector is a first-class panel, not a footnote.
2. The fictional habitat/robots/suits are scenario elements, visibly styled differently from real data.
3. No "real-time", "validated", "flight-safe" language anywhere; footer: *decision-support prototype using real
   NASA data; not a certified safety system*.
4. Scenario inputs (SEP event, dust storm, load kg) are user-set with defaults sourced from real events; outputs
   recompute deterministically; the AI layer never originates numbers.
5. Known-limitations panel states: RAD = one point; MOLA/MCD/CRISM resolutions; THEMIS 100 m; Mars Trek path
   stale 2018; raw photos lack precise coordinates.

## 6. AI assistant — value without hallucinated safety facts

**Where AI genuinely adds value here:** explaining datasets ("what is thermal inertia?"), mission setup
walkthrough ("choose a goal → here's why these sites appeared"), route rationale ("this path detours X m to
avoid a >15° scarp crossing"), and plain-language Q&A over our provenance cards. These are *explanation* tasks
over a fixed, cited corpus — low hallucination risk by construction.

**Guardrails (all mandatory if X3 ships):**
1. **Grounded-only answers:** retrieval over a local corpus we author (dataset cards, constants table §3,
   FAQ). No free-form web browsing. If the answer isn't in the corpus: "I don't have a source for that."
2. **Numbers come from the engine only:** the assistant may *quote* engine outputs by reference ("route A:
   3 h 12 min per the calculator"), never compute or alter them.
3. **Refusal class:** any question phrased as safety/flight-readiness ("is this route safe?") gets a fixed
   redirect: "This is a prototype decision aid; see the provenance panel and limitations."
4. **Citations in-line:** every factual sentence links its dataset card; card links are plain anchors, auditable.
5. **SI disclosure:** per 2026 rules — disclosure of tool use, no NASA branding in generated content, watermark
   on any SI image; core idea/architecture documented as team-originated (they are — this doc).
6. **Non-AI fallback (always present):** the identical content exists as static FAQ + tooltips + the wizard;
   the app is fully usable with AI disabled — a toggle, not a dependency. **Demo script should not depend on
   the AI feature** (network/model risk at judging).

## 7. GitHub repo plan (professional presentation)

- **Structure:** as in draft README (`docs/`, `data/{raw,processed}+PROVENANCE.md`, `engine/`, `app/`, `assets/`,
  `.github/ISSUE_TEMPLATE/`). `data/raw/` git-ignored (size), `data/processed/` committed small artifacts only.
- **License — RESOLVED by research (was open-questions #4):** the official Space Apps 2026 Terms
  (spaceappschallenge.org/legal/, verified today) require original content to be **freely available or OSI
  licensed, with license documentation in the submission — "NASA will not accept or post any Solutions that do
  not include appropriate license documentation"**, and **if no OSI license is specified, NASA distributes under
  Apache 2.0**. ⇒ Ship an explicit **Apache-2.0 LICENSE** (matches the default + patent grant; MIT acceptable if
  the team insists). Data credits: PDS public domain; **USGS ARD STAC DTM/ortho COGs explicitly CC0-1.0** —
  cite ARD/PDS as the primary source where it duplicates Mars Trek exports; NASA media public domain *except*
  insignia/logotype (never in generated content); USGS public domain; THEMIS credit
  "NASA/JPL-Caltech/Arizona State University"; HRSC (if used) CC BY-SA 3.0 IGO attribution+ShareAlike;
  Mars Trek has no explicit license → credit NASA/JPL-Caltech and document pull method+date in
  `data/PROVENANCE.md`.
- **Tool licenses for the credits list:** MapLibre GL JS **BSD-3-Clause** (corrected from "BSD-2" per the
  independent review F7) · PMTiles BSD-3 · three.js MIT · GDAL MIT-style — keep the notices in the repo.
- **Issues/branches:** one issue per small task from the plan doc's §5 list (`B2-cost-grid`, `D2-hud-walkthrough`,
  …), labels `must|should|stretch`; short-lived `feat/<task-id>` branches, squash-merge to `main`; `main` always
  deployable; conventional-commit prefixes. (No Git init now — event rules; this is the plan for when the build
  starts.)
- **Demo assets:** `assets/` — screenshots (planner, inspector, HUD), one GIF loop of goal→route→HUD, the judged
  ≤30 s video **or** 7 slides (decision D03), 2-min optional deep video for the repo README (not the judged demo),
  poster slide for People's Choice pitching.

## 8. Unresolved decisions for the user (blocking vs non-blocking)

| # | Decision | Default proposal | Blocking? |
|---|---|---|---|
| U1 | Ops-area box + habitat location | ~6×6 km inside the Trek 1 m DEM footprint near the sulfate/boxwork corridor; habitat = clearly-labeled scenario | Blocks B1 (needs it first) |
| U2 | Demo format (D03) | 7 slides (safer than 30 s video for subtitle/watermark rules) | Blocks C4 |
| U3 | License sign-off | Apache-2.0 (see §7) | Blocks repo LICENSE only |
| U4 | Ship AI assistant (X3) at all | Only after Musts+Shoulds pass, with §6 guardrails; demo never depends on it | No |
| U5 | HRSC/MCD usage | HRSC: skip (license friction, low value at ops scale); MCD: static climatology table only | No |
| U6 | Ask Local Lead: pre-work boundary + local cutoff + leader-submit | Tonight (Fri) | Affects data-pull timing only |

*Key verdict in one line:* the concept is **feasible and above the challenge bar**, provided radiation/space-
weather is framed as scenario cards on RAD's observed baseline, boxwork attribution is corrected to Curiosity
imaging + CRISM host unit, and the planner runs on the Mars Trek 1 m Gale DEM — not MOLA.
