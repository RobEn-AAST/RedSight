"""Rebuild the engine's primary-DTM inputs locally when Ali's ``data/raw/engine-pilot`` bundle is absent.

This is a LOCAL REBUILD, not Ali's hash-checked handoff. It reads only the primary HiRISE DTM
DTEEC_019698_1750_019988_1750_U01 (CC0-1.0) and recreates, with the parameters recorded in the
committed ``app/public/data/engine-build-manifest.json``:

* the 5,859 x 5,859 native window (source rows 1224.., cols 1335.., 1.0117468 m) used for routing;
* the 600 x 600, ~9.879 m average-resampled planning crop (same planning transform);
* the Horn 3x3 maximum native-slope cache on the planning grid (nodata-touching neighborhoods and
  window-edge pixels excluded, aggregated by source-pixel center);
* an input manifest that states plainly it is a local rebuild with new hashes. The complementary DTM,
  ortho crop, coverage mosaic and G2 landmark-alignment evidence are NOT reproduced; G2 is recorded as
  ``not_reproduced`` and must never be reported as passing from this rebuild.

Usage (from the repository root; the native window is read with HTTP range requests unless
``--native-window`` points at an existing local copy):

    python3 engine/tools/rebuild_pilot_inputs.py --out data/raw/engine-pilot-rebuild
"""

import argparse
from datetime import datetime
import json
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import rasterio
from rasterio.transform import Affine
from rasterio.warp import Resampling, reproject
from rasterio.windows import Window
from scipy import ndimage

from engine.data.raster import sha256_file

SOURCE_ITEM = "DTEEC_019698_1750_019988_1750_U01"
SOURCE_URL = (
    "https://astrogeo-ard.s3-us-west-2.amazonaws.com/mars/mro/hirise/controlled/dtm/"
    "ESP_019698_1750_ESP_019988_1750/DTEEC_019698_1750_019988_1750_U01.tif"
)
LICENSE = "CC0-1.0"
NATIVE_WINDOW = Window(1335, 1224, 5859, 5859)  # col_off, row_off, width, height (Ali's D11 window)
PLANNING_EXTENT_M = (8140490.58436326, -287482.2829880351, 8146418.054115591, -281554.81323570455)
PLANNING_SHAPE = (600, 600)
SCOPE_BOX = [137.335, -4.85, 137.435, -4.75]
NODATA_OUT = -9999.0
HORN_METHOD = (
    "Horn 3x3 dz/dx,dz/dy using true native 1.0117468 m pixel spacing; slope in degrees; for each "
    "600x600 planning cell, maximum valid native Horn slope by source-pixel center; pixels whose Horn "
    "neighborhood touches source nodata are excluded; no complementary DTM fill or seam blending"
)


def planning_transform():
    west, south, east, north = PLANNING_EXTENT_M
    return Affine((east - west) / PLANNING_SHAPE[1], 0.0, west, 0.0, -(north - south) / PLANNING_SHAPE[0], north)


def read_native_window(out_path):
    with rasterio.open(f"/vsicurl/{SOURCE_URL}") as source:
        values = source.read(1, window=NATIVE_WINDOW)
        profile = source.profile.copy()
        profile.update(
            width=NATIVE_WINDOW.width, height=NATIVE_WINDOW.height,
            transform=source.window_transform(NATIVE_WINDOW),
            compress="deflate", predictor=3, tiled=True, blockxsize=512, blockysize=512,
        )
    with rasterio.open(out_path, "w", **profile) as target:
        target.write(values, 1)


def horn_max_on_planning_grid(native, transform, nodata, plan):
    """Horn 3x3 slope at native spacing, max-aggregated to planning cells by source-pixel center."""
    elevation = native.astype(np.float32)
    valid = np.isfinite(elevation) & (elevation != np.float32(nodata))
    filled = np.where(valid, elevation, 0.0).astype(np.float32)
    resolution = (abs(transform.a) + abs(transform.e)) / 2.0
    kx = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float32) / (8.0 * resolution)
    ky = np.array([[1, 2, 1], [0, 0, 0], [-1, -2, -1]], dtype=np.float32) / (8.0 * resolution)
    gx = ndimage.convolve(filled, kx, mode="constant", cval=0.0)
    gy = ndimage.convolve(filled, ky, mode="constant", cval=0.0)
    slope = np.degrees(np.arctan(np.hypot(gx, gy))).astype(np.float32)
    horn_valid = ndimage.minimum_filter(valid.astype(np.uint8), size=3, mode="constant", cval=0).astype(bool)
    rows, cols = np.nonzero(horn_valid)
    x = transform.c + (cols + 0.5) * transform.a
    y = transform.f + (rows + 0.5) * transform.e
    pc = np.floor((x - plan.c) / plan.a).astype(np.int64)
    pr = np.floor((y - plan.f) / plan.e).astype(np.int64)
    inside = (pr >= 0) & (pr < PLANNING_SHAPE[0]) & (pc >= 0) & (pc < PLANNING_SHAPE[1])
    out = np.full(PLANNING_SHAPE, -np.inf, dtype=np.float32)
    np.maximum.at(out, (pr[inside], pc[inside]), slope[rows[inside], cols[inside]])
    out[~np.isfinite(out)] = NODATA_OUT
    return out


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", required=True, help="output folder, e.g. data/raw/engine-pilot-rebuild")
    parser.add_argument("--native-window", help="existing local native window GeoTIFF (skips the range read)")
    args = parser.parse_args(argv)
    out = Path(args.out).resolve()
    assets = out / "assets"
    assets.mkdir(parents=True, exist_ok=True)
    native_path = Path(args.native_window).resolve() if args.native_window else assets / "primary_native_D11_window.tif"
    if not native_path.is_file():
        read_native_window(native_path)

    plan = planning_transform()
    with rasterio.open(native_path) as source:
        native = source.read(1)
        native_transform, crs, nodata = source.transform, source.crs, source.nodata
        native_resolution = (abs(native_transform.a) + abs(native_transform.e)) / 2.0

    crop = np.full(PLANNING_SHAPE, NODATA_OUT, dtype=np.float32)
    reproject(
        native, crop, src_transform=native_transform, src_crs=crs, src_nodata=nodata,
        dst_transform=plan, dst_crs=crs, dst_nodata=NODATA_OUT, resampling=Resampling.average,
    )
    profile = dict(driver="GTiff", width=PLANNING_SHAPE[1], height=PLANNING_SHAPE[0], count=1,
                   dtype="float32", crs=crs, transform=plan, nodata=NODATA_OUT, compress="deflate")
    crop_path = assets / "DTEEC_019698_1750_D11_10m.tif"
    with rasterio.open(crop_path, "w", **profile) as target:
        target.write(crop, 1)

    hazard = horn_max_on_planning_grid(native, native_transform, nodata, plan)
    hazard_path = assets / "native_max_slope_10m_IAU49910.tif"
    with rasterio.open(hazard_path, "w", **profile) as target:
        target.write(hazard, 1)

    valid_hazard = hazard != NODATA_OUT
    cell = [abs(plan.a), abs(plan.e)]
    manifest = {
        "rebuild_note": (
            "LOCAL REBUILD from the primary DTM only (engine/tools/rebuild_pilot_inputs.py), made because Ali's "
            "hash-checked data/raw/engine-pilot handoff is not on this machine. New local hashes; the complementary "
            "DTM, ortho crop, coverage mosaic and G2 landmark-alignment evidence are not reproduced. Ali's original "
            "bundle remains the reference."
        ),
        "rebuilt_at": datetime.now(ZoneInfo("Africa/Cairo")).isoformat(timespec="seconds"),
        "scope_box_lonlat_east_positive_planetocentric_deg": SCOPE_BOX,
        "inputs": [{
            "role": "Primary HiRISE DTM",
            "local_crop": str(crop_path),
            "local_crop_sha256": sha256_file(crop_path),
            "local_crop_bytes": crop_path.stat().st_size,
            "source_url": SOURCE_URL,
            "source_item": SOURCE_ITEM,
            "license": LICENSE,
            "method": "rasterio reproject, Resampling.average, from the native window onto the 600x600 planning transform",
        }],
        "coverage": {"shape_hw": list(PLANNING_SHAPE)},
        "native_routing": {
            "artifact": str(native_path),
            "sha256": sha256_file(native_path),
            "bytes": native_path.stat().st_size,
            "resolution_m": native_resolution,
            "source_url": SOURCE_URL,
            "source_item": SOURCE_ITEM,
            "license": LICENSE,
            "source_window_col_row_width_height": [NATIVE_WINDOW.col_off, NATIVE_WINDOW.row_off,
                                                    NATIVE_WINDOW.width, NATIVE_WINDOW.height],
        },
        "native_hazard": {
            "artifact": str(hazard_path),
            "sha256": sha256_file(hazard_path),
            "bytes": hazard_path.stat().st_size,
            "method": HORN_METHOD,
            "algorithm": HORN_METHOD,
            "aggregation": HORN_METHOD,
            "units": "degrees",
            "source_native_resolution_m": [native_resolution, native_resolution],
            "planning_cell_size_m": cell,
            "planning_grid_shape_hw": list(PLANNING_SHAPE),
            "planning_extent_m": list(PLANNING_EXTENT_M),
            "output_nodata": NODATA_OUT,
            "valid_cells": int(valid_hazard.sum()),
            "nodata_cells": int((~valid_hazard).sum()),
            "valid_cells_over_15deg": int((hazard[valid_hazard] > 15.0).sum()),
            "maximum_slope_deg": float(hazard[valid_hazard].max()),
            "source_url": SOURCE_URL,
            "source_item": SOURCE_ITEM,
            "license": LICENSE,
        },
        "s1_landmark_alignment": {
            "status": "not_reproduced_in_local_rebuild",
            "note": (
                "The G2 landmark-alignment evidence lives only in Ali's bundle and was not reproduced. "
                "Do not report G2 as passing from this rebuild."
            ),
        },
    }
    manifest_path = out / "input-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    print(json.dumps({
        "manifest": str(manifest_path),
        "crop_valid_cells": int(np.count_nonzero(crop != NODATA_OUT)),
        **{k: manifest["native_hazard"][k] for k in ("valid_cells", "nodata_cells", "valid_cells_over_15deg", "maximum_slope_deg")},
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
