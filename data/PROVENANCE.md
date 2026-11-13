# RedSight Data Provenance & Processing Record

**Owner:** Youssef (`feat/youssef-data`)
**Access Date:** 2026-11-13
**Operations Box:** `137.335°E – 137.435°E`, `−4.85° – −4.75°` (~`5.93 × 5.93 km` in Gale crater / lower Mount Sharp)
**Coordinate Reference System (CRS):** `+proj=longlat +R=3396190 +no_defs` (planetocentric, east-positive longitude, Mars IAU sphere radius `3,396,190 m`)
**Vertical Datum:** Meters above Mars areoid (MOLA-referenced)

---

## 1. Source Datasets Downloaded (`engine/data/download.py`)

| Dataset | Layer ID | Badge | Native Resolution | Source URL / Service | License / Credit | Local Cache (`data/raw/`, gitignored) | SHA-256 Checksum |
|---|---|---|---|---|---|---|---|
| **USGS ARD HiRISE DTMs (metadata + provenance + HTTP 206 probe)** | `hirise` / DEM ref | `Observed` (DEM) | `1–2 m` | `POST https://stac.astrogeology.usgs.gov/api/search` (`mro_hirise_socet_dtms`: `DTEEC_009149_1750_009294_1750_U01`, `DTEEC_019698_1750_019988_1750_U01`) | `CC0-1.0` (USGS ARD STAC / Univ. of Arizona / NASA) | `stac_hirise_dtms.json`, `DTEEC_009149_provenance.txt`, `DTEEC_019698_provenance.txt` | `f93f86e54f4514fb388a68202cb5298504d210eb25c63c7d28bd50c4d1f03531` (`stac_hirise_dtms.json`) |
| **Mars Trek `Gale_DEM_SMG_1m` (10 m & 2.5 m float32 TIFFs)** | `hillshade`, `slope` | `Observed` (DEM) → `Derived` (slope/hillshade) | `1.0 m/px` mosaic exported at `2.5 m` & `10 m` | `https://trek.nasa.gov/mars/trekarcgis/rest/services/Gale_DEM_SMG_1m/ImageServer/exportImage` (`format=tiff&compression=LZW`) | NASA/JPL-Caltech/Univ. of Arizona | `gale_dem_10m.tif` (`600×600`), `gale_dem_2p5m.tif` (`2400×2400`) | `9ddefef4020f2782beac896ca7e957aaa776f599983d14b6cbc67595fc4e543c` (`10m`), `ed3ee747a3bb84c4872d4ab53fdb16222c6adc422a5b1e0294b7c5e33d465e20` (`2.5m`) |
| **Mars Trek `curiosity_hirise_mosaic` (2×2 stitched PNG)** | `hirise` | `Observed` | `0.25 m/px` native (exported `4096×4096` ≈ `1.45 m/px` for `z10–16`) | `https://trek.nasa.gov/mars/trekarcgis/rest/services/curiosity_hirise_mosaic/ImageServer/exportImage` | NASA/JPL-Caltech/Univ. of Arizona | `hirise_ortho.png` (`4096×4096`) | `b2aa76a13db68f67ee46cedd474c2dbb4d52dfa4ef05e3142769e9c0007fd52b` |
| **USGS Mars Odyssey THEMIS Quantitative Thermal Inertia (`30S120E`)** | `themis` | `Derived` | `100 m/px` (`60×60` cells across ops box; `255.9–681.2 TIU`) | `https://asc-astropedia.s3.us-west-2.amazonaws.com/Mars/Odyssey/THEMIS-Global-Thermal-Inertia-Mosaic/Quantitative-32-Bit/THEMIS_TI_Mosaic_Quant_30S120E_100mpp.cub` (extracted via HTTP `206` Range GETs) | Public domain; credit NASA/JPL-Caltech/Arizona State Univ./USGS (Fergason et al. 2006) | `themis_ti_100m.tif`, `THEMIS_TI_30S120E_label.txt` | `473f7fbb777e0c310c8ac147b0663195c45a8203ae8f3f2f71ad1b2f01dade9e` |
| **PDS ODE / PDS Geosciences MRO CRISM MTRDR (`FRT000058A3`)** | `crism` | `Derived` | `18 m/px` | `https://oderest.rsl.wustl.edu/live2/` + `https://pds-geosciences.wustl.edu/mro/mro-m-crism-5-rdr-mptargeted-v1/mrocr_4001/browse/2007/2007_112/frt000058a3/` (`BRHYDJ`, `BRPHYJ`, `BRFALJ`) | Public domain (NASA/JPL-Caltech/JHU-APL/PDS) | `ode_crism_mtrdr.json`, `crism/BRHYDJ.png`, `crism/BRPHYJ.png`, `crism/BRFALJ.png`, `crism_minerals.png` | `edb01febf134249df54ca40525515f98c423f9de1894c0a6e274ecc61df03b7b` (`BRHYDJ`), `7b21c496ac273cde19dc6ed6cc47c75683c69dbf000cfc93f5fa16fd0695dc60` (`BRPHYJ`) |
| **USGS SIM 3292 Global Geologic Map of Mars** | `geology` | `Derived` | `1:20M` regional map scale | `https://astrogeology.usgs.gov/pygeoapi/collections/mars/sim3292_global_geologic_map/units/items?f=json` + Mars Trek `SIM3292_Global_Geology/MapServer/export` | Public domain (USGS, Tanaka et al. 2014) | `sim3292_units.geojson`, `sim3292_geology.png` | `ec702a7b9c48d6aef15996a2005acbda2c2a1af155220c45b9d973b7c9833d6a` (GeoJSON), `b77dd250c00c25f7ae150279d7f4ded97c1f436aac6b36caa0892d4de84ad7ec` (PNG) |

Full download logs, byte counts, and timestamps are stored in [`data/processed/download_manifest.json`](processed/download_manifest.json).

---

## 2. Source Selection Notes (Live Probes, 2026-11-13)

1. **DEM Coverage:** USGS ARD STAC item `DTEEC_009149_1750_009294_1750_U01` (`181,586,808` bytes, HTTP 206 verified) only covers `137.353–137.468°E`, leaving the western edge (`137.335–137.353°E`) uncovered. We therefore exported Mars Trek's `Gale_DEM_SMG_1m` seamless mosaic (which also holds zero nodata cells across our ops box) as true 32-bit float GeoTIFFs (`format=tiff&compression=LZW`) and recorded the `CC0-1.0` ARD STAC provenance files alongside it.
2. **CRISM Mineral Coverage:** Live queries against Mars Trek's `MC18_PolySulfate_Mineral_IndicatorV2_SP` (`-95.5°..-39.5°`) and `T1303_FeMgSmectite_Mineral_Indicator_SP` (`-20.5°..-14.5°`) showed those services do not intersect Gale crater (`137.335°..137.435°E`). Instead, we queried PDS ODE (`pt=MTRDR`) over our exact ops box and retrieved `FRT000058A3_07_IF165J_MTR3` (`18 m/px`), which spans `137.3242–137.5634°E / −4.9091…−4.6862°` (covering 100% of our ops box). Its map-projected `BRHYDJ` (hydrated sulfates) and `BRPHYJ` (phyllosilicates/clays) browse rasters were warped from their ENVI `.HDR` `Equidistant_Cylindrical` (`R = 3,396,190 m`) headers onto our ops box.
3. **THEMIS Resolution Honesty:** Per `docs/research/independent-architecture-review.md` (V5), THEMIS thermal inertia is kept at its native `100 m/px` (`60×60` cells) and tiled with nearest-neighbor sampling so coarse 100 m grid blocks remain visually explicit rather than artificially smoothed.

---

## 3. Processing Pipeline (`engine/tiles/build_tiles.py`)

1. **DEM Conditioning:** Checked `gale_dem_2p5m.tif` (`2400×2400`) and `gale_dem_10m.tif` (`600×600`) for nodata sentinels (`0` invalid cells found).
2. **Slope & Hillshade (`2.5 m` → `10 m`):**
   - Computed metric grid spacing at `-4.80°` on Mars sphere `R = 3,396,190 m` (`dy ≈ 2.470 m`, `dx ≈ 2.461 m`).
   - Computed `slope_2p5m` in degrees and aggregated `4×4` blocks to the `600×600` (`10 m`) routing grid (`data/processed/dem_10m.npy`, `slope_max_10m.npy`, `slope_p90_10m.npy`, `slope_mean_10m.npy`) per Review F4: `slope_max_10m` for the hard `15°` constraint, `slope_mean_10m` for Pandolf energy.
   - Computed hillshade at `315°` azimuth and `45°` altitude.
3. **Pilot Gate Checks (`data/processed/pilot_gate_report.json`):**
   - Verified elevation range `[-4202.75 m, -3003.87 m]` across the ops box (`52.36%` of cells `<= 15°` max slope).
   - Verified stops `S1–S3`, `D1–D2` have valid elevations (`-3640.93 m` to `-3452.31 m`) and recorded that the mock habitat `[137.4005, -4.8185]` sits on a `23.7°` slope, identifying `[137.396917, -4.782083]` (`slope_max = 0.83°`, `elev = -3722.44 m`) downslope north of `S1` as a flat candidate habitat site for Ali.
4. **XYZ Web Tiles (`z10–16`):**
   - Sliced all 6 layers into `256×256` RGBA PNGs under `app/public/tiles/<layer>/{z}/{x}/{y}.png` (gitignored per `.gitignore`, ready for static deploy).

