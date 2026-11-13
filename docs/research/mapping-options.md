# Mapping Options — Gale Crater / Mount Sharp Marswalk Demo

**Owner:** mapping/data research worker (Space Apps Cairo 2026). **Written:** 2026-11-13 (hackathon day 1).
**Scope:** research only — no app code written here. This document is the input to the team's build
decisions; it does not authorize implementation, publication, or submission.

**Purpose:** determine which real NASA/USGS/PDS data can honestly power a *hyperlocal* (~6×6 km)
Marswalk map demo on lower Mount Sharp within 24–48 hours, and recommend a staged mapping
architecture. Companion docs: [`../24-48-hour-plan.md`](../24-48-hour-plan.md) (build plan),
[`../competition-overview.md`](../competition-overview.md) (challenge fit),
[`../../requirements/competition-requirements.md`](../../requirements/competition-requirements.md) (rules).

**Method:** primary-source verification (NASA/JPL/USGS/PDS/ASU catalogs, live service metadata fetched
today) plus current official library documentation. Everything below carries a confidence tag:
**[V]** = verified live or via primary page, 2026-11-13; **[L]** = literature/common knowledge, not
re-verified today; **[A]** = assumption needing team confirmation.

## Errata — 2026-11-13 (post independent review; findings below preserved as evidence)

The [independent architecture review](independent-architecture-review.md) re-verified this report
against live sources and benchmarks. Its corrections that touch this document (original sections kept
intact below as the research record):

- **F7 — MapLibre GL JS is BSD-3-Clause, not "BSD-2"** (§5 A1 row, §6.1 stack line, §11 tools row).
  The review checked the LICENSE.txt on GitHub. Use BSD-3 in all credit lines.
- **F1 — §10's z17 tile budget is understated ~2.75×.** Recomputed with this report's own (correct)
  0.318 m/px at z17: a Mars tile is 162.8 m wide → **37×37 = 1,369 top-level tiles, ~1,820 with
  pyramid → ortho ≈ 160–400 MB** (not "22×22 = 484 / ≈650 / 60–150 MB"). Still within the ≤500 MB
  budget; adopted fix is **z16 full-box + z17 core** (e.g. 3×3 km around habitat/targets, ~324 tiles),
  which also halves tiling time.
- **F3 — §3.2's example ARD product `DTEEC_040770_1755_039280_1755_A01` is a dead S3 object**
  (consistent 404; zero keys under its prefix; hillshade/thumbnail also 404). The other 7 ops-box
  DTMs were reachable, but DTM URLs flipped 206→404 for minutes under repeat probing (one 21 s
  timeout) — direct S3 ARD access is real but not dependable without retries; the ortho subfolder was
  stable. The build plan's A2 now uses the review's probe-and-retry ladder with fallbacks
  (reachable STAC DTM, e.g. `DTEEC_018854_1755_018920_1755_U01` → Trek quantitative export → PDS ODE).
- **F3 — §4 Trek exportImage sharpenings:** default output caps at **400×400 px** unless `size=` is
  passed; **`format=tif` (single f) silently returns a JPEG inside a TIFF**; **`format=tiff`
  (double f) with `compression=LZW` returns a true 32-bit float TIFF** — the quantitative-DEM path
  exists with exactly that spelling.
- **F7 (minor) — service-count drift:** the Trek catalog served **76 services** on the review's
  2026-11-13 session (this report said 83). Immaterial; carry access dates on such counts.
- **Naming:** the project is now called **RedSight** (this report's era said "Marswalk Planner"). No
  other content affected.
- **Ops box (2026-11-13 planning session; §1 table and §15 item 1):** the assumed box 137.30–137.45°E /
  −4.75…−4.55° is ≈ **8.9 × 11.9 km**, not "~6×6 km" (§3.2 itself calls it the "9×12 km window"), and it
  **does not contain the boxwork campaign**: NASA's MMGIS Curiosity waypoints place sols 4539–4752 at
  137.381–137.386°E / −4.798…−4.808° and the sol-5070 position at 137.389°E / −4.826° (accessed 2026-11-13).
  The proposed replacement is 137.335–137.435°E / −4.85…−4.75° (decision D11), covered by
  `DTEEC_009149_1750_009294_1750_U01` and `DTEEC_019698_1750_019988_1750_U01` (both DTMs HTTP 206 on
  2026-11-13). Also resolves §15 item 7 partially: a machine-readable traverse exists at
  `https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json` (GeoJSON, per-stop sol/site/lon/lat/
  elevation). See [`../demo-focus-plan.md`](../demo-focus-plan.md) §6.

Everything else the review re-checked was confirmed live: the 8 CC0-licensed ops-box DTM items, Trek
layer extents/pixel sizes to 5 decimals, the raw-image API at sol 5072, pygeoapi SIM 3292 units, and
all catalog/DOI citations.

---

## 0. Executive summary

1. **The data exists and is unusually good.** Gale is the best-covered field site on Mars: a ready-made
   0.25 m HiRISE mosaic and 1 m DEM over a 36×40 km block of lower Mount Sharp are served free by
   JPL Mars Trek [V], and the USGS "Analysis Ready Data" STAC API serves per-stereo-pair 1 m COG DTMs
   + 0.25 m orthoimages + hillshades under an explicit **CC0-1.0 license** — I verified 8 such DTMs
   overlapping a 9×12 km window in the boxwork region alone [V]. The demo does not need to be data-poor.
2. **Recommended architecture (staged):** offline preprocessing with GDAL → a **static, no-backend 2D
   web map** (MapLibre GL JS + raster XYZ/PMTiles + GeoJSON overlays) as the 24 h core, extended at 48 h
   with a **three.js 3D terrain view + first-person HUD** that reuses the exact same DEM and route
   JSON. No server component; everything cached locally and shipped as static assets.
3. **Honesty architecture is a feature, not a tax.** Layers are labeled Observed / Derived / Scenario /
   Unavailable in the UI. Radiation has **no spatial product anywhere** (RAD is a single point on the
   rover) — showing this honestly ("point measurement, extrapolated scenario") is *more* impressive to
   Validity judges than a fake heatmap.
4. **Biggest traps, in order of danger:** (a) planetographic-vs-planetocentric coordinates (~3.3 km
   offset at Gale's latitude — enough to put your habitat on the wrong side of a ridge); (b) building
   the demo on live Mars Trek endpoints (undocumented, rate-limited, TLS-flaky — cache everything at
   build time); (c) tile-size blowup at z18+ for 0.25 m imagery over the full ops area (cap at z17 or
   crop); (d) stale Curiosity traverse data (Trek's path stops in 2019; use the Analyst's Notebook /
   SPICE / official location map instead).

---

## 1. Site, extent, and staging assumptions

| Item | Value | Status |
|---|---|---|
| Site | Gale crater, lower Aeolis Mons (Mount Sharp), Curiosity field area | [A] team decision D02 (README says decided; confirm) |
| Site center (ref) | −4.59° lat, 137.44°E lon (Curiosity landing ellipse reference, Bradbury Landing −4.5895, 137.4417) | [L] |
| **Ops area (demo extent)** | ~6×6 km box, assumed **137.30–137.45°E / −4.75…−4.55°** (boxwork / lower-mound region Curiosity has been exploring since 2025) | **[A]** — final habitat/target coords are a team decision; all 8 verified DTM COGs overlap this window |
| Context extent | 36×40 km "lower Mount Sharp block" (137.122–137.730°E / −4.925…−4.249°) = exact footprint of Trek's Gale DEM & HiRISE mosaic | [V] (service metadata, §3.1/§3.2) |
| Vertical datum | Mars **areoid** (equipotential "sea level"), as used by MOLA products; HiRISE DTMs are tied to MOLA at long wavelengths | [L] (PDS MEGDR docs) |
| Time frame | Present-day (Curiosity era, sols 0–~5072) | [V] raw-image API current through sol 5072 today |

Why this extent: 6×6 km is a plausible single Marswalk operations area (a 6 h excursion at ~2 km/h
covers ≲12 km round trip), fits comfortably inside the verified DEM footprint, and keeps raster sizes
tractable (§10).

---

## 2. Planetary mapping primer (what Earth habits break on Mars)

### 2.1 Coordinates

- **Planetocentric vs planetographic latitude.** Modern Mars products (MOLA, HiRISE, CTX, Curiosity
  rover positions, Mars Trek) use **planetocentric latitude + east-positive longitude** on the IAU
  Mars sphere (R = 3,396,190 m). Older USGS maps (e.g., the 1978 Aeolis quadrangle) and image *names*
  may use planetographic latitude and/or **west-positive** longitude (Gale at 137.4°E appears as
  ~222.6°W in HiRISE target codes like `…_04S223W` — 360 − 137.4 ≈ 222.6 [V]). At Gale's latitude the
  planetographic↔planetocentric difference is ≈0.055° ≈ **3.3 km** [L — computed: tan φc = (b²/a²)·tan φg
  with a=3,396,190 m, b=3,376,200 m]. That is a habitat-on-the-wrong-ridge error. **Rule: work in
  planetocentric east-positive end-to-end; convert on ingest; never geolocate by parsing product IDs —
  always use the STAC/PDS footprint metadata.** [V] for the convention (USGS Gazetteer: planetocentric,
  east longitude: https://planetarynames.wr.usgs.gov/Page/MARS/system).
- **Registered codes.** Mars Trek services report **WKID 104905** [V — live service metadata].
  epsg.io/spatialreference.org list ESRI:104905 = "Mars 2000" (ellipsoidal GCS) and ESRI:104971 =
  "Mars 2000 Sphere"; IAU_2015:49900 = Mars sphere, planetocentric [V via
  https://epsg.io/104905, https://epsg.io/104971, spatialreference.org]. PROJ ≥ 8.2 ships IAU:2015
  codes. **Practical, safest choice
  for scripts:** skip authority codes and use the explicit PROJ string
  `+proj=longlat +R=3396190 +no_defs` — no authority-database version sensitivity. Small
  sphere-vs-ellipsoid differences (sub-pixel at demo zooms) are noted in §15.
- **Distances.** Earth GIS defaults (Haversine R=6,371 km, Web-Mercator meters) are wrong on Mars by
  ~47%. Do all distance/area/slope math on the real Mars radii (equatorial 3,396.19 km, mean 3,389.5,
  polar 3,376.2 km) — e.g. 1° of longitude = 59,274 m at the equator. Gravity for slope-stability
  talk: 3.71 m/s². [L]
- **The "fake Web Mercator" trick.** MapLibre/Leaflet assume an Earth sphere. Standard planetary hack
  (used by most public Mars web maps): serve Mars lon/lat degrees as if they were EPSG:4326/3857
  degrees. Display is correct and self-consistent; only *screen-pixel-to-ground-meter* scaling is off
  by the radii ratio (3,396.19/6,378.14 ≈ 0.532) — which matters only if you compute ground distance
  from screen pixels (don't; use the data grid). Ground meters per 512-px tile pixel at zoom z is
  ≈ **41,630/2^z** on Mars [L — computed: 360·59,274/(512·2^z)], giving the zoom ladder in §10.

### 2.2 Vertical datum & elevations

- Elevations are meters above the **areoid** in MOLA-referenced products; HiRISE DTMs inherit MOLA
  absolute datum at long wavelengths, with meter-level absolute accuracy and decimeter-level *relative*
  precision within a DTM [L]. When mosaicking DTMs from different stereo pairs, expect small step
  offsets at seams (see §3.2 mitigation). Always show elevation as "m above areoid (MOLA-referenced)".

### 2.3 Raster alignment, resampling, nodata

- **One planning grid.** Pick a single analysis grid (e.g., 5 m/px over the 6×6 km box = 1200×1200);
  resample *everything* to it (bilinear for continuous data like DEM/TI, nearest for categorical like
  geology units) so all layers, the cost grid, and the route output are cell-aligned by construction.
- **Nodata discipline.** HiRISE DTMs have voids (steep slopes, stereo failures). Identify each file's
  null value from its label/metadata (commonly 0 or a large sentinel — check per file; do not assume),
  mask before derivative math, and **never let nodata cells leak into slope** (they produce fake
  89° walls that will block your A* router everywhere). Fill small voids (e.g., `gdal_fillnodata`),
  leave large voids masked and shown as "no data" in the UI.
- **Resampling artifacts.** Derive slope *after* resampling the DEM to the planning grid (or derive at
  1 m and aggregate with a mean/max — better for hazard maps: max-slope per 5 m cell is conservative
  for a walker). Downsampling imagery: average/bilinear is fine for display.
- **Do not sharpen/resample HiRISE ortho more than once**; every resample costs crispness that is the
  demo's main visual asset.

### 2.4 Hillshade & slope

- `gdaldem hillshade` (315° azimuth, 45° altitude is the planetary convention) for relief;
  multi-directional hillshade looks better on mound terrain [L]. `gdaldem slope` in **degrees** for
  the planner (suit-climbability thresholds are quoted in degrees in EVA literature, e.g., Apollo
  traverses avoided >15–20°; slope% confuses nobody but programmers). Sun-angle tools in Mars Trek's
  config (`sunAngle`) can be used to match lighting to a real time-of-day scenario [V — config
  listing]; alternatively compute it (Mars obliquity 25.19°, Ls) and label as Derived.

### 2.5 Image overlays & provenance/uncertainty UI

- Layer toggles + opacity for every raster; blending ("overlay"/"multiply") for hillshade-on-ortho
  composites. CRISM/mineral layers as semi-transparent classified rasters with a legend; geology as
  colored polygons + unit labels on hover.
- **Provenance inspector (the differentiator).** Every layer gets a card: instrument, product ID,
  source URL, acquisition date, native resolution, processing applied, license/credit, and a badge —
  **Observed** (instrument measurement), **Derived** (computed from observations: slope, hillshade,
  cost grid, LOS), **Scenario** (model/assumption: O2 consumption, radiation extrapolation, weather
  window), **Unavailable** (no product exists: spatial radiation). Model constants (metabolic rates,
  reserve fractions) get the same treatment. This directly answers the Validity criterion and the
  challenge's "layered, integrated view" wording.

---

## 3. Candidate layer catalog (the core inventory)

Standard fields per layer: type · coverage over our extent · spatial/temporal resolution ·
CRS · access · processing effort · terms/attribution · confidence · fit · taxonomy (Observed/Derived/
Scenario/Unavailable). Fit grades: ★ core / ☆ context / ✗ skip.

### 3.1 HiRISE orthoimagery (optical) — ★ core — **Observed**

- **What:** 0.25 m/px Red-channel orthomosaic of the entire lower-Mount-Sharp block, plus per-pair
  orthoimages from USGS ARD.
- **Coverage/resolution:** Trek `curiosity_hirise_mosaic` ImageServer: extent 137.122466–137.729813°E /
  −4.925474…−4.248959°, pixel 4.2177e-6° = **0.250 m/px**, EPSG/ESRI WKID 104905 [V — live service
  metadata, 2026-11-13]. USGS ARD orthos: 0.25 m-class COGs per stereo pair, CC0-1.0 [V — STAC].
- **Temporal:** images 2006–2020s (static mosaics; no time series). HiRISE has repeatedly imaged Gale —
  the same location at two dates could even power a "change detection" stretch feature [L].
- **Access:** (a) Mars Trek exportImage (§4) — fastest for a single stitched ops-area PNG [V];
  (b) USGS STAC COG assets (direct S3 `astrogeo-ard.s3-us-west-2.amazonaws.com` URLs) [V];
  (c) PDS DTM bundle `MRO-M-HIRISE-5-DTM-V1.0` via ODE / https://www.uahirise.org/dtm/
  (+ /dtm/howto.php for Blender/QGIS) [V].
- **Processing:** crop to ops box; tile to z17. Low (hours).
- **Terms:** NASA/JPL-Caltech/University of Arizona credit; ARD STAC metadata explicitly licenses the
  files **CC0-1.0** [V — item `license` field]. No registration anywhere.
- **Confidence: high. Fit: the base "you are standing here" layer; challenge data type "optical".**

### 3.2 HiRISE DTM / DEM (topographic) — ★ core — **Observed** (elevation), **Derived** once you compute slope/hillshade

- **What:** (a) Trek `Gale_DEM_SMG_1m` ImageServer — ready 1 m DEM mosaic over the whole 36×40 km block:
  extent 137.122471–137.729813°E / −4.925474…−4.248963°, pixel 1.68706e-5° = **1.000 m/px**, WKID 104905
  [V — live metadata]. (b) USGS ARD per-pair COG DTMs, gsd ≈ 1.01 m, each with a ready hillshade COG and
  provenance.txt; example `DTEEC_040770_1755_039280_1755_A01` — bbox 137.335–137.443°E / −4.792…−4.583,
  "rationale: Gale Crater dunes and Curiosity rover", University of Arizona, **license CC0-1.0** [V].
- **Coverage:** in the assumed 9×12 km ops window (137.30–137.45°E / −4.75…−4.55) the STAC search
  returns **8 HiRISE SOCET DTMs** (partially overlapping); the wider lower-mound block has hundreds
  (5,584 HiRISE+CTX DTM *items* intersect the 36×40 km box) [V — STAC queries, 2026-11-13].
- **Access:** STAC API `POST https://stac.astrogeology.usgs.gov/api/search` with
  `collections:["mro_hirise_socet_dtms"], bbox:[…]` → assets: `dtm` (COG), `hillshade` (COG), multiple
  `*_ORTHO` (COG), `provenance` [V]. Alternative: PDS `MRO-M-HIRISE-5-DTM-V1.0`, ODE search
  (https://ode.rsl.wustl.edu/mars/), AWS Open Data registry mirror [V — catalog pages].
- **Processing:** void-fill; mosaic if >1 pair needed; resample to 5 m planning grid; derive slope/
  hillshade. Low-medium. Note seam offsets between pairs (meter-level) — acceptable at demo scale,
  disclose in provenance.
- **Terms:** CC0 (ARD) / public-domain-style PDS data; credit NASA/JPL-Caltech/University of Arizona.
- **Confidence: high. Fit: the spine of the product — slope hazard, route cost, 3D mesh, HUD terrain,
  comms LOS. Challenge data type "topographic".**

### 3.3 CTX global mosaic (optical context) — ☆ context — **Observed**

- 5.0 m/px global mosaic (Dickson et al. 2023, 86,571 images, 2006–2020) — fills every gap between
  HiRISE strips, planet-wide, so it also covers our whole extent [V — product pages].
- Access: Murray Lab browser (https://murray-lab.caltech.edu/Mars-Data-Browser — draw box, get tiles);
  PDS bundle `urn:nasa:pds:mars_mro_ctx_globalmosaicv01_murraylab_2023`; USGS Astropedia
  (https://astrogeology.usgs.gov/search/map/mars-mro-ctx-global-mosaic-murray-lab-v1); JMARS layer;
  ArcGIS Online streaming [V — search/catalog]. Paper: doi:10.1029/2024EA003555 [V].
- Fit: mid-zoom (z10–13) context between global Viking/MOLA and 0.25 m HiRISE; also the fallback base
  if any HiRISE tile pull fails. Processing: crop+tile only. Terms: PDS, credit NASA/JPL/MSSS-Caltech/
  Murray Lab.

### 3.4 CTX & HiRISE stereo → more DTMs — ✗ skip for build (already covered), roadmap for gap-fill

- STAC also hosts `mro_ctx_controlled_usgs_dtms` (~6 m class CTX DTMs) [V]. Only worth touching if the
  1 m HiRISE coverage misses a chosen target — check coverage first (§8 checklist), not by default.

### 3.5 MOLA / MOLA-HRSC blend (topographic context) — ☆ context — **Observed**

- Global MOLA MEGDR: 128 pix/deg = **463 m/px**, elevations referenced to the areoid, precision ~30 cm
  radial intrinsic, meter-level absolute [V — PDS MEGDR page + PGDA; numbers [L]]. MOLA+HRSC blend at
  200 m/px served by Trek (`Mars_MOLA_blend200ppx_HRSC_*_clon0dd_200mpp`) [V — service catalog].
- Access: PDS Geosciences (https://pds-geosciences.wustl.edu/missions/mgs/megdr.html), Astropedia
  463 m DEM (https://astrogeology.usgs.gov/search/map/mars_mgs_mola_dem_463m), or Trek export [V].
- Fit: zoom-out "you are here on Mars" level only — 463 m/px is useless for a 6 km walk. One cached
  PNG of Gale crater from MOLA shade makes a lovely intro screen. Processing: trivial. Terms: public
  domain, credit NASA/GSFC/MOLA team.

### 3.6 THEMIS thermal inertia + IR (thermal) — ★ core (as the "thermal" data type) — **Observed**

- **What:** nighttime-IR-derived **thermal inertia** — the classic proxy for particle size /
  dust-vs-rock ground: low TI ≈ fine sand (walking hazard), high TI ≈ indurated/rocky ground.
- Coverage/resolution: global, **100 m/px**, quantitative 32-bit tiles (e.g. product naming
  `themis_thermal_inertia_mosaic_quantitative_30N000E_100mpp`; Gale tile ≈ 00S135E window), absolute
  accuracy ~20% [V — USGS Astropedia product pages + LPSC 2013 abstract #2822; Fergason et al. 2006
  doi:10.1029/2006JE002735].
- Also available: THEMIS daytime IR global mosaic 256 ppd ≈ 232 m/px (https://www.mars.asu.edu/data/thm_dir)
  [V]; per-image THEMIS IR ~100 m from ASU viewer (https://viewer.mars.asu.edu/viewer/themis) [V].
- Access: USGS Astropedia tiles; ASU THEMIS portal (https://themis.asu.edu/); PDS Odyssey archives [V].
- Processing: crop to extent, color-ramp J/m²K³/100 units, resample to planning grid (bilinear), use as
  a soft cost term for sand. Low. Caveat: 100 m/px over a 6 km box = 60×60 cells — use as a *regional
  indicator*, not per-cell truth; say so in the UI.
- Terms: free, credit NASA/JPL/ASU THEMIS (J. Christensen).
- Confidence: high on the product; medium on its sand-proxy interpretation (disclose).
  Fit: covers the challenge's "thermal" data type with an honest physical meaning.

### 3.7 CRISM spectral products (spectral) — ★ core via pre-derived layers — **Observed** (reflectance) + **Derived** (mineral indicators)

- **What:** hyperspectral reflectance → mineral indicator maps (Fe/Mg smectite clays, hydrated
  sulfates, polyhydrated sulfates — exactly the Mount Sharp stratigraphy story).
- Coverage/resolution: **targeted** FRT/MTRDR observations at ~18 m/px (footprints ~10–12 km, i.e.
  one footprint ≈ our whole ops area) — multiple over Gale, including mission-curated Gale mosaics
  (Seelos et al., "CRISM data products for Gale crater MSL landing site",
  http://crism.jhuapl.edu/msl_landing_sites/2012July_Mosaics/CRISM_GMWG_7-24-12_v2.pdf — **http-only**,
  https TLS fails) [V]. Global CRISM-derived mosaics ~200 m/px exist for some parameters [L].
- **Fast path (recommended):** Mars Trek serves ready CRISM-derived mineral-indicator raster layers,
  e.g. `mars_mro_crism_mtrdr_c0a_humex_frt_sites`, `T1303_FeMgSmectite_Mineral_Indicator_SP`,
  `MC18_PolySulfate_Mineral_IndicatorV2`, `Hydrous_Mineral_Detections_OMEGA_CRISM_clon0`,
  `Chloride_Salt_bearing_Material_THEMIS_clon0` [V — Trek service catalog]. Export once as PNG/GeoTIFF
  over the extent → overlay + science-site candidates.
- Slow path (only if time): PDS MTRDR bundle (`urn:nasa:pds:mro_crism_mtrdr`,
  https://pds-geosciences.wustl.edu/missions/mro/crism.htm) — GB-scale cubes, band-math yourself.
  Skip for 24–48 h.
- Terms: NASA/JPL/JHU-APL; PDS free. Note these indicator layers are **team-derived interpretations**
  (band-ratio thresholds), not direct measurements — badge as Derived (from Observed spectra).
- Confidence: medium-high (layer names/catalog verified; exact per-layer footprints over the ops box
  to confirm at export time). Fit: challenge "spectral" type + powers the science-goal picker
  (clay → sulfate → boxwork story).

### 3.8 Geologic maps (geologic) — ☆ context / science-site evidence — **Derived** (interpretation, published)

- **Global, machine-readable, easy:** USGS SIM 3292 "Geologic Map of Mars" (Tanaka et al. 2014,
  https://pubs.usgs.gov/sim/3292/) + OGC API items:
  `https://astrogeology.usgs.gov/pygeoapi/collections/mars/sim3292_global_geologic_map/units/items?f=json`
  [V]; also served by Trek (`SIM3292_Global_Geology/MapServer`) [V]. At Gale scale it shows the
  mound units (e.g., "Sulfate-bearing unit") — coarse but real and citable.
- **Gale-specific:** **no formal USGS series map of Gale exists yet** [V — search of USGS publications].
  Best available: Anderson & Bell (2010), "Geologic mapping and characterization of Gale Crater",
  Mars journal 4, 1–53 (http://www.marsjournal.org/contents/2010/0004/files/anderson_mars_2010_0004.pdf)
  — pre-Curiosity, community-standard [V it exists/linked]; and an in-progress 1:60,000 western
  Aeolis Mons map (Thomson et al., LPSC 2024 abstract #7022) — not a released product [V].
  The 1978 Aeolis quadrangle USGS map is official but predates all of this and uses old
  planetographic/west-positive coordinates — **do not georeference from it** (§2.1) [V/L].
- Fit: unit polygons as a toggleable overlay + unit names in site cards. If georeferencing
  Anderson & Bell proves fiddly, ship SIM 3292 only — honest and zero effort.
- Terms: USGS public domain, credit "USGS/NASA Planetary Geologic Mapping Program" (an official
  challenge Resources-tab item — also counts toward "meaningful NASA resource use").

### 3.9 Curiosity traverse (mission context) — ★ core for storytelling — **Observed** (positions)

- **Current + machine-readable:** MSL Analyst's Notebook (PDS Geosciences, https://an.rsl.wustl.edu/msl)
  — traverse/rover-position files downloadable from the Resources tab; SPICE kernels
  (MSL-M-SPICE-6-V1.0, https://naif.jpl.nasa.gov/pub/naif/pds/data/msl-m-spice-6-v1.0/mslsp_1000/)
  for precise sol-by-sol positions [V — notebook traverse-help page + NAIF archive].
- **Official human-readable:** NASA location map (https://science.nasa.gov/mission/msl-curiosity/location-map/,
  where `mars.nasa.gov/msl/mission/where-is-the-rover/` redirects) — images only [V].
- **Stale-do-not-use:** Mars Trek `curiosity_path`/`curiosity_waypoints` services end at the 2018/2019
  traverse (~sol 2230, "Hematite Hotspot") — no boxwork era [V — service data]. The Resources-tab
  animation "Curiosity's proposed path up Mount Sharp" is a **2019 proposed route**, not the actual
  traverse — fine as style reference, never as data [V].
- Community aids: Planetary Society route maps (based on F. Calef/JPL maps) for cross-checking [V].
- Fit: route context, "walk where the rover drove", photo pin times. Processing: light (digitize or
  convert; keep sol attribution per vertex).

### 3.10 Curiosity surface photos (optical, ground truth) — ★ core for the "real mission" feel — **Observed**

- **Live undocumented JSON API (verified today):**
  `https://mars.nasa.gov/api/v1/raw_image_items/?condition=msl&per_page=50&order=sol%20desc`
  → sol, site, image ids, camera, URLs; current through **sol 5072** (Nov 2026) [V].
- Gallery equivalent: https://mars.nasa.gov/msl/multimedia/raw-images/ [V].
- **Geolocation honesty:** raw images carry sol/site/camera metadata, not precise lat/lon. Pin by
  site/sol joined to the traverse (§3.9) and label "approximate location". Mastcam/Navcam thumbnails:
  download at build time (hotlinking mars.nasa.gov in the demo is fragile + impolite), cache locally,
  credit NASA/JPL-Caltech/MSSS.
- Fit: photos-at-stops feature (D3 in the build plan); also the ground-truth "you can see this ridge
  in the photo AND on the map" moment for judges.

### 3.11 REMS weather (atmospheric) — time series, not a map layer — **Observed** (point time series)

- REMS (Rover Environmental Monitoring Station): pressure, ground/air temp, humidity, UV, dust
  opacity — measured *at the rover*, released ~3×/year on PDS
  (https://pds-geosciences.wustl.edu/missions/msl; instrument team http://cab.inta-csic.es/rems/en —
  third-party terms apply to their site) [V].
- **Defensible use as map context:** derive a "typical Sol conditions at Gale" card (median/percentile
  pressure/temp/wind from the PDS tables) + user-settable weather scenario for the excursion window.
  It is **not defensible** as a spatial layer over the 6 km box — no spatial product exists at that
  scale. Badge Observed (climatology) → Scenario (excursion window assumption).
- Challenge data type "atmospheric" is still honestly claimed via REMS + (stretch) Mars Climate
  Database (LMD, free with registration, netCDF — global model, clearly Scenario) [L].

### 3.12 RAD radiation (radiation) — point measurement → scenario card — **Observed** (point) / **Scenario** (spatial extrapolation) / **Unavailable** (as a real spatial layer)

- Curiosity RAD (Radiation Assessment Detector): surface dose rate ≈ **0.67 mSv/day** measured on the
  surface (Hassler et al. 2014, Science 343, doi:10.1126/science.1244797) [L — canonical figure].
  Data: PDS PPI https://pds-ppi.igpp.ucla.edu/collection/MSL-M-RAD-2-EDR-V1.0 (+ Level 2 dosimetry
  listed on data.nasa.gov) [V — collection pages].
- **There is no spatial radiation map of Gale and cannot be from RAD** (single fixed sensor on a
  rover). Honest UI: a "radiation context" card = RAD climatology × user scenario (e.g., SEP event
  multiplier from NASA DONKI space-weather API, https://api.nasa.gov — real Earth-relevant alerts,
  clearly labeled as a scenario input) → O2/zeitbudget consequence. Badge: Observed point + Scenario
  extrapolation; never render a fake "radiation heatmap".
- Stretch honesty bonus: sky-view factor from the DEM (real, derived) modulating the scenario —
  "canyon walls shield some sky" — that is a *defensible* spatial modulation of a labeled scenario.

### 3.13 Additional / geophysical / chemical candidates (short verdicts)

| Candidate | Verdict | Why |
|---|---|---|
| MOLA-HRSC blend 200 m (Trek) | ☆ context | same as §3.5 at finer res; one cached export |
| MARCI daily global dust maps | ✗ build / mention | daily global, ~km-px at best; regional only — roadmap note for "storm scenario" [L] |
| MCD (LMD Mars Climate Database) | ☆ scenario card | global GCM, free w/ registration; adds "weather window" Scenario legitimacy [L] |
| Gravity (e.g., GMM-3) | ✗ | ~100 km resolution at degree 110 — meaningless at 6 km [L] |
| SHARAD/MARSIS radar | ✗ | subsurface sounders; heavy specialist processing; not walkable-surface info at demo scale [L] |
| Rover APXS/ChemCam chemistry at stations | ☆ stretch | "chemical" data type possible via published station values / Analyst's Notebook; manual curation — only if a teammate has spare hours |
| Viking MDIM 232 m (Trek) | ☆ fallback base | if CTX pull fails; vintage but global [V — Trek catalog] |
| Aerial/globe imagery for intro | ☆ | MOLA/HRSC/Viking global products; cheap polish |

---

## 4. Mars Trek as a data service (use as a source, not as a dependency)

Verified live today [V] (see also team-verified notes in requirements):

- Services root: `https://trek.nasa.gov/mars/trekarcgis/rest/services?f=pjson` (83 services; the
  legacy `/arcgis/rest/services` path is flaky — intermittent TLS resets). No auth for reads.
- Working pattern: `…/ImageServer/exportImage?bbox=<lonmin>,<latmin>,<lonmax>,<latmax>&format=jpg&f=image`
  → real pixels; MapServer queries standard. Useful services for us: `Gale_DEM_SMG_1m`,
  `curiosity_hirise_mosaic`, `SIM3292_Global_Geology`, CRISM-derived indicators (§3.7), MOLA blend
  global layers, `curiosity_path` (STALE — §3.9).
- Broken/undocumented: TrekServices elevation-profile endpoints returned 405/204 (don't depend);
  no documented SLA, no explicit license text on the service.
- **Strategy: Trek is the fastest bulk-exporter for build-time caching (one exportImage per layer for
  the ops box, done by hour 2), and never a runtime dependency.** The demo must run from local static
  files even if trek.nasa.gov dies mid-judging. Licensing note (open-questions #4): NASA/JPL works are
  generally public domain with credit; Trek has no explicit tile-reuse terms — for a hackathon demo
  with credit this is low-risk; prefer CC0 USGS ARD (§3.2) as the *cited* primary source where both
  exist, and list Trek in credits.
- Trek app config (`https://trek.nasa.gov/mars/jpl/config/config.json`) lists tools (STL export, slope
  generation, sun angle, rock detection) — useful inspiration, not needed for our pipeline [V].

---

## 5. Architecture options considered

| # | Option | What it is | Strengths | Weaknesses for a 24–48 h demo |
|---|---|---|---|---|
| A1 | **2D web map, raster XYZ tiles + GeoJSON** (MapLibre GL JS) | Pre-rendered tile pyramids (PNG/JPG) + vector overlays, static hosting | Zero backend; rock-solid; smooth pan/zoom; MapLibre BSD-2; team-friendly | Rasters are bake-time artifacts (re-tile if extent changes); no true 3D |
| A2 | **2D + PMTiles archives** (same MapLibre + pmtiles protocol) | Single-file tile archives, range-requested | One file per layer, trivial deploy, no z/x/y directory sprawl; official MapLibre + Protomaps docs | Host must support HTTP Range (GitHub Pages: unreliable for this — verify; Netlify/Cloudflare Pages fine) |
| A3 | **COG + dynamic tile server** (titiler/rio-tiler on Lambda/Fly) | Serve tiles on the fly from COGs | No pre-tiling; on-the-fly styling | A server component to build/deploy/keep awake during judging — risk with zero benefit at our scale |
| A4 | **Vector tiles for terrain/overlays** (MapLibre vector) | Encode contours/sites as MVT/PMTiles | Tiny, crisp labels | DEM-as-vector loses raster analysis; needs tippecanoe step; raster is simply the right tool here |
| A5 | **3D in browser, three.js mesh from DEM** | Textured plane mesh, route as line, camera along path | Full control; no planetary-GIS friction; MIT; the HUD lives here | Build it yourself (lighting, camera); single-scene scale (fine: 6×6 km) |
| A6 | **3D globe, CesiumJS with Mars ellipsoid** | Swap `Ellipsoid(3396190,3396190,3376200)`, wire imagery/terrain providers | Real globe feel; Apache-2.0 | DIY planetary setup with known quirks (horizon culling assumes Earth; geoid/scale gotchas); community recipes, not a first-class feature — burn-risk in 24 h |
| A7 | Cesium ion "Cesium Mars" 3D Tiles / Cesium for Unreal | Commercial hosted Mars content; Unreal plugin with Mars presets | Beautiful | Account/commercial terms; content licensing + attribution complexity; heavy toolchain — not for this window |
| A8 | Game engine (Unity/Unreal/Godot) native build | Full game scene | Max visual ceiling | Asset pipeline + build/distribute time; overkill; judges must click a URL |
| A9 | Native/desktop GIS (QGIS project, NASA's own JMARS/Trek) | Ship a .qgz or point at Trek | Zero code | Not a "tool/interface an astronaut uses"; violates demo public-URL simplicity; no product of our own |

**Verdict:** **A1+A2 for the 24 h core; +A5 for the 48 h wow.** A3/A4/A6/A7 rejected (§12).

---

## 6. Recommended staged architecture

### 6.1 Stage 1 — 24 h submittable core (static 2D planner)

**Stack:** MapLibre GL JS (BSD-2) + plain XYZ tile directories (guaranteed to work on any static host)
with optional PMTiles upgrade if the host proves range-capable; overlays as GeoJSON; engine outputs as
JSON consumed by the UI. Static hosting (GitHub Pages/Netlify/Cloudflare Pages) — public, no login.

**Layer set (≥4 NASA data types, all cached locally at build time):**

| Layer | Source product | Badge | Zoom |
|---|---|---|---|
| L1 HiRISE ortho basemap | Trek mosaic export / ARD ortho COGs | Observed | z10–17 |
| L2 DEM hillshade (+ optional elevation ramp) | ARD DTM → gdaldem | Observed→Derived | z10–17 |
| L3 Slope (degrees) with hazard ramp ≥15° | ARD DTM → gdaldem slope → resample | Derived | z10–17 |
| L4 THEMIS thermal inertia (sand proxy) | USGS TI mosaic tile | Observed | z8–12 (native 100 m) |
| L5 CRISM mineral indicators (clay/sulfate) | Trek CRISM layers, one-time export | Derived (from Observed spectra) | z8–12 |
| L6 Geology units (SIM 3292) | USGS pygeoapi/MapServer | Derived (published interpretation) | all |
| L7 Curiosity traverse + current position | Analyst's Notebook/official map | Observed | all |
| L8 Route + cost grid + turn-back marker | our engine | Derived/Scenario | all |
| L9 Photo pins (sol/site) | raw-image API | Observed | all |
| L10 Radiation/weather context cards | RAD/REMS PDS + user inputs | Observed point + Scenario | panel, not a layer |

**Pipeline (offline, build machine, Python+GDAL — order matters):**

1. **Cache raw products** (Phase A2 of the build plan): 1–3 DTM COGs covering the ops window (STAC);
   ops-box `exportImage` PNGs from Trek (HiRISE mosaic, CRISM layers); THEMIS TI tile; SIM 3292 GeoJSON;
   traverse + photo metadata. Everything into `data/raw/` with checksums + URLs in `PROVENANCE.md`.
2. **DEM conditioning:** void-fill → mosaic (if multi-pair) → clip 6×6 km → resample to 5 m planning
   grid (bilinear) → slope (deg, aggregate as max per 5 m cell) → hillshade (315°/45°) → sky-view
   factor (stretch, for radiation honesty §3.12).
3. **Web tiles:** reproject ops-box rasters to Web-Mercator-order degrees (the §2.1 trick) and tile
   with gdal2tiles/rio-tiler: L1 JPG quality ~80 z10–17 (cap z17 = 0.32 m/px display — visually
   indistinguishable from 0.25; see §10 sizing), L2/L3 PNG. THEMIS/CRISM only to z12, then overzoom.
   Keep native-resolution COGs as `data/processed/` masters for the engine + 3D.
4. **Overlays:** traverse → GeoJSON (sol-tagged); geology units → GeoJSON (simplified); photo pins →
   GeoJSON with cached thumbnails; science-site candidates → hand-curated GeoJSON **with evidence
   fields** (CRISM layer values, geology unit, literature note).
5. **Engine outputs (Python) → JSON:** cost grid stats, route(s) as GeoJSON with per-segment
   time/O2 tables, turn-back point, LOS mask. UI never recomputes — it renders engine JSON (single
   source of truth, mirrored constants file with per-constant sources).

**Caching/offline:** 100% of tiles/JSON/thumbnails are static files; demo runs with the network cable
unplugged after build. `cache-control: max-age` long; total budget ≤ ~500 MB (§10).

### 6.2 Stage 2 — 48 h extension (3D + HUD), same data spine

- **3D view (three.js):** plane mesh from the 5 m planning grid (~1200×1200 → decimate to ~600×600 =
  360k verts, fine on integrated GPUs; full-res on discrete), textured with the z15–16 tile stitch of
  L1; vertical exaggeration slider (default 1.5×, disclosed); route as extruded line + waypoints;
  habitat marker + LOS wedge. One scene, no streaming, no globe.
- **HUD walk-through:** first-person camera at 1.6 m eye height following the route polyline at
  adjustable speed; HUD shows heading (from route bearing), O2 countdown (engine's per-segment table
  interpolated), distance/ETA to next stop, turn-back alert when passing the reserve point. **All
  numbers are the same JSON the 2D map shows** — no second model, no drift.
- **Photorealism honesty:** the scene is a DEM mesh with an orbital-image drape. Say exactly that in
  the UI ("visualization: HiRISE DTM mesh + ortho drape; not a photorealistic simulation"). No
  invented textures, no AI scenery; SI-watermark rule applies if any AI imagery sneaks in (rules doc §4).
- Optional Stage-2b: swap XYZ dirs → PMTiles if host ranges verified; add slope-profile chart on
  route hover; add boxwork-site photo carousel from §3.10.

### 6.3 What the HUD/planner may claim (calibration for copy)

- Say: "decision-support prototype; routes and consumables are model estimates from cited
  physiological constants; terrain data are real NASA products at stated resolutions."
- Never say: "safe", "certified", "flight-ready", "real-time data", "photorealistic".
- Every coarse layer shows its native resolution where used (THEMIS 100 m, CRISM 18–200 m, RAD point).

---

## 7. Tradeoff matrices

### 7.1 Data layers × purpose

| Layer | Basemap | Hazard/routing | Science story | Judge-visible NASA types | Cost to integrate | Keep? |
|---|---|---|---|---|---|---|
| HiRISE ortho 0.25 m | ●● | ● (visual) | ● | optical | low | ★ |
| HiRISE DTM 1 m | ● | ●●● | ● | topographic | low-med | ★ |
| Slope/hillshade (from DTM) | ●● | ●●● | — | (topographic, derived) | low | ★ |
| THEMIS TI 100 m | — | ●● (sand) | ● | thermal | low | ★ |
| CRISM indicators | ● overlay | — | ●●● | spectral | low (Trek export) | ★ |
| SIM 3292 geology | ● | ● | ●● | geologic(derived) | v low | ★ |
| Traverse + photos | ● | — | ●●● | mission/optical | low | ★ |
| REMS/RAD | — | ● (scenario) | ●● | atmospheric+radiation (point/scenario) | med | ★ as cards |
| CTX 5 m | ● gap-filler | — | — | optical | low | ☆ |
| MOLA 463 m | ● zoom-out | — | — | topographic | v low | ☆ |
| MCD/DONKI | — | ● scenario | ● | atmospheric (model) | med | stretch |

### 7.2 Architecture × criteria (1–5)

| Criterion | A1 XYZ+MapLibre | A2 PMTiles | A3 COG server | A5 three.js 3D | A6 Cesium Mars |
|---|---|---|---|---|---|
| 24 h feasibility | 5 | 4 | 2 | 3 (stage 2) | 2 |
| Robustness at judging | 5 | 4 (host ranges) | 2 | 4 | 2 |
| Offline/caching | 5 | 5 | 1 | 5 | 3 |
| Wow factor | 3 | 3 | 3 | 5 | 5 |
| Effort to maintain | 5 | 4 | 2 | 3 | 2 |
| Licensing cleanliness | 5 | 5 | 5 | 5 | 3 (DIY stack fine; ion content not) |

Composite → A1 core, A2 optional packaging, A5 the 48 h layer; others rejected below.

---

## 8. Data discovery checklist (reproducible, ~30 min)

1. **DTM coverage for chosen ops box:**
   `curl -sk -X POST https://stac.astrogeology.usgs.gov/api/search -H 'Content-Type: application/json' -d '{"collections":["mro_hirise_socet_dtms","mro_ctx_controlled_usgs_dtms"],"bbox":[<w>,<s>,<e>,<n>],"limit":50}'`
   → confirm ≥1 HiRISE DTM overlaps every planned target; note each item's `assets.dtm.href` (COG) and
   `properties.license` (CC0-1.0) [V].
2. **Trek bulk exports:** for each layer service in §4, `exportImage` the ops box at native-ish size;
   save URL + bbox + date into `data/PROVENANCE.md` [V pattern].
3. **THEMIS TI:** fetch the 100mpp quantitative tile covering 137°E/−5° from the USGS product page
   (https://astrogeology.usgs.gov/search/map/mars-themis-derived-global-thermal-inertia-mosaic);
   verify units/scale bar; note ~20% absolute accuracy [V pages].
4. **CRISM footprints over ops box:** inspect the Trek CRISM layers' extents (service `?f=pjson`) and
   crop exports; if thin, fall back to the Seelos Gale products PDF (http) for site evidence [V].
5. **Geology:** pull `sim3292…items?f=json` filtered to the ops bbox; count units present (expect
   mound units) [V].
6. **Traverse:** Analyst's Notebook → Resources → traverse files to sol ~5072; cross-check latest point
   against the official location map image [V].
7. **Photos:** raw-image API query for the last ~200 sols filtered by `site` near targets; record
   sol/site/json sample; decide pin set (~5–10) [V].
8. **REMS/RAD:** download latest PDS tables (REMS CSV per sol; RAD daily A/D dose) → compute the
   climatology card numbers; store script + outputs [V pages].
9. **License sweep:** record per-product license column in `data/PROVENANCE.md` (CC0 / public-domain /
   credit-only) — feeds the submission's resources & credits field (rules §3).
10. **Go/no-go gate:** if any *core* layer's coverage misses the chosen habitat/targets, move the ops
    box (data exists broadly across the mound) **before** tiling anything.

---

## 9. Minimal reproducible pilot + acceptance tests

**Pilot (≈1–2 h, proves the pipeline end-to-end before the real build):**

```bash
# 0) workspace (outside any downloaded archive dir), tools: gdal (3.6+), python3, curl
# 1) find DTMs over the ops window
curl -sk -X POST https://stac.astrogeology.usgs.gov/api/search \
  -H 'Content-Type: application/json' \
  -d '{"collections":["mro_hirise_socet_dtms"],"bbox":[137.30,-4.75,137.45,-4.55],"limit":10}' > dtms.json
python3 - <<'PY'   # print each item's DTM + ortho COG urls
import json
for f in json.load(open('dtms.json'))['features']:
    a=f['assets']
    ortho=[v['href'] for k,v in a.items() if k.endswith('_ORTHO')]
    print(f['id'], '\n  DTM:', a['dtm']['href'], '\n  orthos:', ortho[:2])
PY
# 2) download one DTM COG + its ortho COG (untrusted data: keep in own dir, inspect before use)
# 3) inspect nodata/value range, then:
gdalinfo -stats dtm.tif | head -30
# 4) derive, on a 5 m grid, then tile the ortho (fake-mercator trick):
gdalwarp -overwrite -t_srs EPSG:3857 -tr 5 5 -r bilinear -dstnodata 0 dtm.tif dem5m_3857.tif
gdaldem hillshade dem5m_3857.tif hillshade.tif -z 1.5
gdaldem slope    dem5m_3857.tif slope.tif -s 1.0     # degrees
gdal2tiles.py --xyz --processes 4 -z 10-17 ortho_3857.tif tiles/ortho   # or rio/mbtiles→pmtiles
# 5) serve tiles/ + a 20-line MapLibre HTML; local URL shows ortho+hillshade+slope over the ops box
```

**Acceptance tests (binary, judge-checkable):**
1. With networking disabled after load, the map still pans/zooms/toggles all layers (static-assets proof).
2. Slope layer max inside a known steep scarp ≥ the raster's 99th percentile; slope is 0°–~45° bounded,
   no 89° nodata artifacts (nodata masking proof).
3. Route A/B never cross a cell ≥ the hard slope threshold; changing load kg or mode changes time/O2
   monotonically (engine sanity, mirrors build-plan §3).
4. Elevations on a probe transect match Trek's published Gale DEM range within a few meters (datum proof).
5. THEMIS TI layer, at any zoom, displays its "100 m native — indicator only" disclaimer (honesty proof).
6. Radiation appears nowhere as a spatial layer; the card cites RAD 0.67 mSv/day + scenario input.
7. Traverse line ends within ~1 km of the official map's latest position; label shows the data's sol.
8. ≥5 photo pins resolve to cached thumbnails with sol + credit; positions labeled approximate.
9. Provenance card for every visible layer: source URL, date accessed, resolution, license, badge.
10. Zoom <10 shows CTX/MOLA context; zoom 10–17 shows HiRISE detail; no blank tiles anywhere in extent.
11. (48 h) HUD camera stays 1.6 m above DEM surface along the route (sampled check); O2 countdown
    matches the 2D table for the same scenario.
12. (48 h) 3D view runs ≥30 fps on a 2019-class laptop, vertical exaggeration disclosed on-screen.

---

## 10. Performance sizing (why z17 cap, why 5 m grid)

- Ground meters/pixel at zoom z (512-px tiles, Mars): m/px ≈ 41,630/2^z →
  z6 ≈ 650 m (MOLA context) · z8.7 ≈ 100 m (THEMIS) · z10–13 ≈ 41–5 m (CTX) · z15.3 ≈ 1 m (DTM) ·
  z17.3 ≈ 0.25 m (HiRISE) [L — computed, §2.1]. **Cap maxzoom 17** (0.32 m/px) — z18 quadruples tiles
  for invisible gain; allow overzoom render to 18.
- Tile counts (6×6 km): z17 ≈ 22×22 = 484 tiles top level, ≈ 650 with pyramid → JPG ortho ≈ 60–150 MB;
  PNG hillshade/slope similar; THEMIS/CRISM to z12 only ≈ trivial. Whole package comfortably ≤ 500 MB,
  typical page load at ops center ≈ 60–120 tiles ≈ 5–15 MB first paint.
- DEM data: 6×6 km @1 m float32 = 36 MP = 144 MB master (keep offline); 5 m planning grid 1200×1200
  int16 ≈ 2.9 MB (ships in-app); 3D mesh from that grid decimated to ~600×600 (360k tris) — smooth on
  integrated GPUs; full-res optional on fast machines.
- Build-time budget: STAC DTM COGs ~0.5–2 GB each download; one-time. Trek exports: single PNGs.
  Keep raw out of git; commit processed rasters ≤50 MB (README repo plan).
- Runtime: MapLibre with 3 raster sources + GeoJSON overlays is negligible CPU/GPU; three.js scene
  single draw-call-per-mesh — trivial. No WebWorkers needed at this scale.

---

## 11. Licensing, attribution, and credit lines

| Data/product | Terms | Credit line (draft) |
|---|---|---|
| USGS ARD HiRISE DTM/ortho COGs | **CC0-1.0 (explicit in STAC metadata)** [V] | "NASA/JPL-Caltech/University of Arizona; USGS Astrogeology ARD (CC0)" |
| PDS datasets (MOLA, CRISM, REMS, RAD, SPICE, CTX mosaic) | PDS data policy: free, no licensing restrictions; not copyrighted [L — standard PDS policy; cite https://pds.nasa.gov/ on the project page] | "NASA Planetary Data System" + instrument teams |
| Mars Trek exports | No explicit tile-reuse terms found [V]; NASA/JPL works generally public domain w/ credit; list Trek in credits; prefer citing ARD/PDS as primary where duplicated | "NASA/JPL-Caltech Mars Trek" |
| THEMIS / thermal inertia | Free, open [V product pages] | "NASA/JPL/Arizona State University" |
| SIM 3292 geology | USGS public domain [V] | "USGS/NASA Planetary Geologic Mapping Program (SIM 3292, Tanaka et al. 2014)" |
| Curiosity raw images | NASA media: public domain, non-endorsement terms | "NASA/JPL-Caltech/MSSS" |
| CAB INTA-CSIC REMS site (if used beyond PDS) | third-party site terms — prefer PDS copies | "REMS team, CAB (INTA-CSIC)" |
| MapLibre GL JS (BSD-2), pmtiles (BSD-3), three.js (MIT), GDAL (MIT-style) | permissive, keep notices | tool list on project page |
| Cesium ion content | commercial tiers — avoided | n/a |

Competition hooks (from requirements doc): ≥1 NASA resource mandatory for Global Awards (we far exceed);
list *everything* incl. open-source tools; SI-generated content rules (no NASA logos in generated
imagery; watermarks) — n/a unless AI imagery is used; non-US sites' data-use parameters (CAB site)
must be respected → use PDS copies instead where possible.

---

## 12. Rejected options — and exactly why

1. **COG + titiler dynamic server (A3):** adds deploy/uptime risk during judging for zero user-visible
   gain at 6×6 km scale; static tiles are deterministic and offline-capable. Revisit only if the team
   later wants arbitrary-extent map generation ("map-generator" stretch).
2. **Vector-tile terrain (A4):** terrain is raster analysis data; vectorizing adds a lossy step and a
   tool (tippecanoe) for no judge-visible benefit. Vector used only where it's right: routes, sites,
   geology polygons.
3. **CesiumJS Mars globe (A6):** custom-ellipsoid setup is community-recipe territory (horizon-culling
   and datum quirks); a 6 km ops-area demo gains nothing from a planet globe at stage 2, and the risk
   lands on the demo's critical path. (If a globe is wanted later, Mars3D/OPM-style Cesium forks exist
   — out of window.)
4. **Cesium ion / Unreal (A7/A8):** commercial accounts, content licensing review, heavy toolchains;
   challenge needs a public URL clicking straight into the tool.
5. **Native/desktop GIS or pointing judges at Trek/JMARS (A9):** fails "create a map, tool, or
   interface" — it's somebody else's interface.
6. **Live Trek runtime dependency:** undocumented, rate-limited, TLS-flaky endpoints [V] — cache at
   build, ship static.
7. **Stale Trek traverse as "the" route / 2019 proposed-path animation as data:** explicitly outdated
   [V] — use Analyst's Notebook/SPICE/official map; the 2019 animation is style reference only.
8. **Fake spatial radiation/weather heatmaps:** no spatial product exists; would be the single easiest
   Validity own-goal. Cards + disclosed scenarios instead.
9. **CRISM MTRDR cube processing from scratch:** GB-scale hyperspectral cubes and band-math for
   outputs Trek already serves as indicator layers; not in 24–48 h. (Roadmap item for "real" spectral
   maps, e.g., summary-parameter mosaics at 200 m.)
10. **Georeferencing the 1978 Aeolis map / parsing coordinates from image IDs:** coordinate-convention
    traps (§2.1) that silently corrupt the map; metadata-driven geolocation only.
11. **Gravity/radar "geophysical" layers at ops scale:** resolution physically meaningless at 6 km —
    say so in the writeup rather than shipping something fake (honesty > box-ticking; "geophysical"
    remains an optional example in the challenge wording, not a requirement).

---

## 13. Observed / Derived / Scenario / Unavailable — master table

| Layer/quantity | Badge | Basis |
|---|---|---|
| HiRISE orthoimagery | **Observed** | instrument measurement |
| HiRISE DEM elevation | **Observed** | stereo photogrammetry (itself derived from images, but a data product) |
| CTX / MOLA / THEMIS IR / CRISM spectra | **Observed** | instrument measurements |
| THEMIS thermal inertia | **Observed** (with ~20% accuracy note) | derived from calibrated radiance — published product |
| Slope, hillshade, sky-view, cost grid, routes, time/O2, LOS | **Derived** | our computations from Observed inputs (+cited physiological constants) |
| CRISM mineral indicators | **Derived** | band-ratio interpretation of Observed spectra |
| SIM 3292 geology; Anderson & Bell map | **Derived** (published interpretation) | human mapping from imagery |
| Curiosity traverse & positions | **Observed** | rover telemetry |
| Weather window, storm scenario, MCD values | **Scenario** | model + user assumptions over Observed climatology |
| Radiation "map" | **Scenario** if extrapolated; **Unavailable** as spatial measurement | RAD is a single point (§3.12) |
| Spatial dust/storm map at ops scale | **Unavailable** (MARCI is regional/daily) | no product at 6 km |
| Gravity / subsurface radar at ops scale | **Unavailable/meaningless at scale** | physics of resolution (§3.13) |
| 2019 "proposed path up Mount Sharp" | **Scenario (historical proposal)** — never data | (§3.9) |

---

## 14. Sources (all accessed 2026-11-13 unless noted)

**Services (verified live today):**
- Mars Trek services root & Gale layers — https://trek.nasa.gov/mars/trekarcgis/rest/services (Gale_DEM_SMG_1m, curiosity_hirise_mosaic, SIM3292, CRISM layers; metadata quoted in §3.1/3.2/§4)
- USGS Astrogeology STAC API — https://stac.astrogeology.usgs.gov/api (collections: mro_hirise_socet_dtms, mro_ctx_controlled_usgs_dtms, mo_themis_controlled_mosaics); docs: https://stac.astrogeology.usgs.gov/docs/data/mars/hirise_dtms/
- USGS pygeoapi SIM 3292 units — https://astrogeology.usgs.gov/pygeoapi/collections/mars/sim3292_global_geologic_map/units/items?f=json
- Curiosity raw images API — https://mars.nasa.gov/api/v1/raw_image_items/?condition=msl&per_page=50&order=sol%20desc
- Trek app config — https://trek.nasa.gov/mars/jpl/config/config.json

**Catalogs & product pages:**
- MOLA MEGDR (PDS) — https://pds-geosciences.wustl.edu/missions/mgs/megdr.html · Astropedia 463 m — https://astrogeology.usgs.gov/search/map/mars_mgs_mola_dem_463m
- THEMIS: fact sheet https://themis.asu.edu/factsheet · TI mosaic https://astrogeology.usgs.gov/search/map/mars-themis-derived-global-thermal-inertia-mosaic · quantitative 100mpp tiles https://astrogeology.usgs.gov/search/map/themis_thermal_inertia_mosaic_quantitative_30n000e_100mpp · day IR https://www.mars.asu.edu/data/thm_dir · viewer https://viewer.mars.asu.edu/viewer/themis · Fergason 2006 doi:10.1029/2006JE002735
- CTX mosaic — https://murray-lab.caltech.edu/CTX/beta01.html · browser https://murray-lab.caltech.edu/Mars-Data-Browser · PDS urn:nasa:pds:mars_mro_ctx_globalmosaicv01_murraylab_2023 · Astropedia https://astrogeology.usgs.gov/search/map/mars-mro-ctx-global-mosaic-murray-lab-v1 · doi:10.1029/2024EA003555
- HiRISE DTM hub & how-to — https://www.uahirise.org/dtm/ (+ /dtm/howto.php)
- CRISM — PDS missions page https://pds-geosciences.wustl.edu/missions/mro/crism.htm · Gale products (Seelos et al.) http://crism.jhuapl.edu/msl_landing_sites/2012July_Mosaics/CRISM_GMWG_7-24-12_v2.pdf (http-only)
- Geology — SIM 3292 https://pubs.usgs.gov/sim/3292/ · Anderson & Bell 2010 http://www.marsjournal.org/contents/2010/0004/ · Thomson LPSC 2024 https://www.hou.usra.edu/meetings/pgm2018/pdf/7020.pdf lineage / LPSC 2024 abs. 7022 · Aeolis quad 1978 https://www.usgs.gov/maps/geologic-map-aeolis-quadrangle-mars
- Traverse — location map https://science.nasa.gov/mission/msl-curiosity/location-map/ · Analyst's Notebook https://an.rsl.wustl.edu/msl (+ traverse help page) · SPICE https://naif.jpl.nasa.gov/pub/naif/pds/data/msl-m-spice-6-v1.0/mslsp_1000/aareadme.htm · Planetary Society maps https://www.planetary.org/space-images/curiosity-route-map-wide
- REMS/RAD — PDS MSL https://pds-geosciences.wustl.edu/missions/msl · RAD PPI https://pds-ppi.igpp.ucla.edu/collection/MSL-M-RAD-2-EDR-V1.0 · Hassler 2014 doi:10.1126/science.1244797
- Coordinates/CRS — USGS Gazetteer Mars system https://planetarynames.wr.usgs.gov/Page/MARS/system · https://epsg.io/104905 · https://epsg.io/104971 · spatialreference.org (IAU_2015:49900)

**Library docs:**
- MapLibre raster source https://www.maplibre.org/maplibre-gl-js/docs/examples/add-a-raster-tile-source · PMTiles+MapLibre https://www.maplibre.org/maplibre-gl-js/docs/examples/pmtiles-source-and-protocol and https://docs.protomaps.com/pmtiles/maplibre
- CesiumJS planetary threads — community.cesium.com ("Mars and other planetary" #1330; "How can I use Mars…" #21332; ellipsoid/terrain #4299, #28219); Cesium Mars content https://cesium.com/platform/cesium-ion/content/cesium-mars (not used)
- GDAL (gdaldem/gdal2tiles/gdalwarp) — https://gdal.org/programs/ (stable, long-standing)

**Workspace inputs:** requirements/*.md; docs/competition-overview.md; docs/24-48-hour-plan.md;
/home/ali/Downloads/martian-map-resources.md; team-verified service notes (session memory, 2026-11-13).

---

## 15. Unresolved assumptions & open items for the team

1. **[A] Ops-area center/habitat/target coordinates** — assumed box 137.30–137.45°E / −4.75…−4.55°;
   must be fixed before tiling (§8 step 10). Boxwork ridge exact coordinates not pinned here.
2. **[A] Trek Gale DEM vertical datum & DEM source** — service metadata carries no datum field; almost
   certainly MOLA-registered areoid meters (standard for HiRISE DTMs) — verify against a STAC DTM
   overlapping the same spot (acceptance test 4) before quoting absolute elevations.
3. **[A] Trek licensing wording** — no explicit tile-reuse terms on the service; treat as
   public-domain-with-credit, list in credits; prefer CC0 ARD as cited primary where duplicated
   (open-questions #4).
4. **[A] ESRI:104905 sphere-vs-ellipsoid detail** — Trek reports WKID 104905 (registered as ellipsoidal
   "Mars 2000" on epsg.io); ARD COGs' own CRS strings should be checked on ingest (`gdalinfo`); at
   demo zooms any sphere/ellipsoid discrepancy is sub-pixel, but pin the app CRS to one definition
   (recommend planetocentric sphere, §2.1) and convert on ingest, not at render.
5. **[A] THEMIS TI tile number for the Gale window** (e.g., 00S135E naming) — locate at download time
   via the USGS product page map; naming pattern inferred, tile not fetched in this research pass.
6. **[A] CRISM indicator layer footprints over the final ops box** — layer names verified in Trek's
   catalog; per-layer extents to confirm at export; fallback documented (§3.7).
7. **[A] Analyst's Notebook traverse export format** (CSV/KML shape) — page verified to offer the
   download; exact schema to confirm on first pull; SPICE fallback scripted.
8. **[A] PMTiles-on-GitHub-Pages range support** — historically unreliable; verify with a 2-tile test
   archive before choosing PMTiles over plain XYZ (§5 A2).
9. **[A] Raw-image API stability during the event** — live today; cache everything at build time;
   note `condition=msl` parameter is undocumented (works; Perseverance value unknown — not needed).
10. **Pre-work boundary** — dataset downloads before the official start may violate the no-pre-work
    rule; everything in §6 is designed to run inside the event window (rules/open-questions #3).

*End of document. No code was written, installed, committed, or deployed in producing this research.*
