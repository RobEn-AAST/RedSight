# RedSight Data & Tiles — How to Fetch and Build

**Owner:** Youssef (`feat/youssef-data`)
**Operations Box:** `137.335°E – 137.435°E`, `−4.85° – −4.75°` (~`5.93 × 5.93 km`, Gale crater / lower Mount Sharp)
**CRS:** `+proj=longlat +R=3396190 +no_defs` (planetocentric east-positive degrees)

Large raw files (`data/raw/`, `*.tif`) and rendered XYZ map tiles (`app/public/tiles/`, `76.64 MB` across 3,006 PNGs) are excluded from Git by [`.gitignore`](../.gitignore). Any teammate or deploy environment can regenerate them locally in ~3 minutes using the two Python scripts below.

---

## 1. Prerequisites

Python **3.10+** (verified on Python 3.12.7; **no local GDAL install required**) with:

```bash
pip install numpy scipy pillow requests tifffile imagecodecs matplotlib
```

---

## 2. Step-by-Step: Download & Build Tiles

Run both commands from the repository root (`RedSight/`):

```bash
# 1) Download and verify all NASA / USGS datasets into data/raw/ (~35 MB, ~2 min)
python engine/data/download.py

# 2) Condition DEMs, generate Ali's 10 m grids + Pilot Gate report, and slice z10-16 XYZ tiles (~1 min)
python engine/tiles/build_tiles.py
```

---

## 3. What Gets Generated

### Committed in Git (small metadata & scripts)
- [`engine/data/download.py`](../engine/data/download.py) — Retrying downloader (USGS ARD STAC, Mars Trek `Gale_DEM_SMG_1m` & `curiosity_hirise_mosaic`, S3 HTTP `206` range extraction of THEMIS quantitative TI, PDS ODE CRISM MTRDR `FRT000058A3`, USGS SIM 3292).
- [`engine/tiles/build_tiles.py`](../engine/tiles/build_tiles.py) — DEM void-filling, slope/hillshade derivation, Pilot Gate check, and Web Mercator XYZ tile slicer (`z10–16`). Note: `**/tiles/` is in `.gitignore`, so use `git add -f` if editing scripts inside `engine/tiles/`.
- [`data/PROVENANCE.md`](PROVENANCE.md) — Source URLs, licenses/credits, resolution notes, and SHA-256 checksums.
- [`data/processed/download_manifest.json`](processed/download_manifest.json) — Exact URL, HTTP status, byte size, SHA-256, and timestamp per download.
- [`data/processed/pilot_gate_report.json`](processed/pilot_gate_report.json) — Elevation/slope stats at `S1–S3`, `D1–D2`, and flat habitat candidate `[137.396917, −4.782083]` (`0.83°` max slope).
- [`data/processed/tile_counts.json`](processed/tile_counts.json) — Per-layer tile counts (`501` tiles each across `z10–16`).
- [`app/public/data/layers.json`](../app/public/data/layers.json) — App layer manifest (`available: true` on all 6 layers, legends, `Observed`/`Derived` badges).

### Generated Locally (gitignored — needed for routing & web deploy)
- **`data/raw/*`** — Cached GeoTIFFs, HiRISE ortho mosaic, CRISM browse crops, SIM 3292 GeoJSON/PNG.
- **`data/processed/*.npy`** (for **Ali**'s routing engine, `600×600` `float32`, `10 m` grid):
  - `dem_10m.npy` — Conditioned elevation (m above Mars areoid)
  - `slope_max_10m.npy` — Max `2.5 m` slope per `10 m` cell (for the `> 15°` hard constraint)
  - `slope_mean_10m.npy` — Mean `2.5 m` slope per `10 m` cell (for Pandolf energy)
  - `slope_p90_10m.npy` — 90th-percentile slope per `10 m` cell
  - `themis_ti_10m.npy` — Native `100 m` THEMIS thermal inertia (`TIU`) block-aligned to `600×600`
- **`app/public/tiles/<layer>/{z}/{x}/{y}.png`** (for **Yassin**'s MapLibre app & deploy, `z10–16`):
  - `hirise/` (`Observed`, `29.22 MB`)
  - `hillshade/` (`Derived`, `24.52 MB`)
  - `slope/` (`Derived`, `4.39 MB`)
  - `themis/` (`Derived`, `0.53 MB`)
  - `crism/` (`Derived`, `17.58 MB`)
  - `geology/` (`Derived`, `0.40 MB`)

---

## 4. Quick Verification

After running both scripts, confirm all 6 tile folders and `600×600` grids exist:

```bash
python -c "import json, numpy as np; from pathlib import Path; layers=json.loads(Path('app/public/data/layers.json').read_text())['layers']; print([(l['id'], len(list(Path('app/public/tiles', l['id']).rglob('*.png')))) for l in layers]); print(np.load('data/processed/dem_10m.npy').shape)"
```

Expected output: `501` PNG tiles per layer (`3,006` total) and `(600, 600)` grid shape.

