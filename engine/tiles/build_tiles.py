"""Build processed planning grids, Pilot Gate report, and XYZ tiles (z10-16) for RedSight."""

from __future__ import annotations

import json
import math
import shutil
from pathlib import Path
from typing import Any

import matplotlib
import numpy as np
import tifffile
from PIL import Image
from scipy.ndimage import distance_transform_edt

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"
TILES_ROOT = ROOT / "app" / "public" / "tiles"
STOPS_PATH = ROOT / "app" / "public" / "data" / "stops.json"
META_PATH = ROOT / "app" / "public" / "data" / "meta.json"

OPS_BOX = {
    "west": 137.335,
    "south": -4.85,
    "east": 137.435,
    "north": -4.75,
}
R_MARS_M = 3396190.0
METERS_PER_DEG = 2.0 * math.pi * R_MARS_M / 360.0


def fill_nodata(arr: np.ndarray) -> tuple[np.ndarray, int]:
    invalid = ~np.isfinite(arr) | (arr < -10000.0) | (arr > 30000.0)
    n_invalid = int(invalid.sum())
    if n_invalid == 0:
        return arr.astype(np.float32), 0
    if n_invalid == arr.size:
        raise ValueError("DEM array is 100% nodata!")
    indices = distance_transform_edt(invalid, return_distances=False, return_indices=True)
    filled = arr[tuple(indices)].astype(np.float32)
    return filled, n_invalid


def lonlat_to_grid_rc(lon: float, lat: float, width: int, height: int) -> tuple[int, int]:
    u = (lon - OPS_BOX["west"]) / (OPS_BOX["east"] - OPS_BOX["west"])
    v = (OPS_BOX["north"] - lat) / (OPS_BOX["north"] - OPS_BOX["south"])
    col = int(np.clip(math.floor(u * width), 0, width - 1))
    row = int(np.clip(math.floor(v * height), 0, height - 1))
    return row, col


def grid_rc_to_lonlat(row: int, col: int, width: int, height: int) -> tuple[float, float]:
    lon = OPS_BOX["west"] + ((col + 0.5) / width) * (OPS_BOX["east"] - OPS_BOX["west"])
    lat = OPS_BOX["north"] - ((row + 0.5) / height) * (OPS_BOX["north"] - OPS_BOX["south"])
    return round(lon, 6), round(lat, 6)


def compute_hillshade(dz_dx: np.ndarray, dz_dy: np.ndarray, azimuth_deg: float = 315.0, altitude_deg: float = 45.0) -> np.ndarray:
    az = math.radians(azimuth_deg)
    alt = math.radians(altitude_deg)
    sun_e = math.cos(alt) * math.sin(az)
    sun_n = math.cos(alt) * math.cos(az)
    sun_u = math.sin(alt)

    # Surface normal for north-up image (y index increases southward, so dz/dnorth = -dz_dy)
    norm = np.sqrt(dz_dx * dz_dx + dz_dy * dz_dy + 1.0)
    dot = (-dz_dx * sun_e + dz_dy * sun_n + sun_u) / norm
    hs = np.clip(dot, 0.0, 1.0)
    # Slight contrast stretch for Mars relief readability
    gray = np.clip((hs - 0.15) / 0.85 * 255.0, 0.0, 255.0).astype(np.uint8)
    rgba = np.empty((*gray.shape, 4), dtype=np.uint8)
    rgba[..., 0] = gray
    rgba[..., 1] = gray
    rgba[..., 2] = gray
    rgba[..., 3] = 255
    return rgba


def colorize_slope(slope_deg: np.ndarray) -> np.ndarray:
    h, w = slope_deg.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    m0 = slope_deg < 5.0
    m1 = (slope_deg >= 5.0) & (slope_deg < 10.0)
    m2 = (slope_deg >= 10.0) & (slope_deg <= 15.0)
    m3 = slope_deg > 15.0

    rgba[m0] = (76, 175, 80, 110)    # 0-5 deg: green
    rgba[m1] = (255, 235, 59, 145)   # 5-10 deg: yellow
    rgba[m2] = (255, 152, 0, 185)    # 10-15 deg: orange
    rgba[m3] = (229, 57, 53, 225)    # >15 deg: hard-block red
    return rgba


def colorize_themis(ti_60: np.ndarray) -> np.ndarray:
    valid = np.isfinite(ti_60)
    vmin = float(np.nanpercentile(ti_60, 2)) if valid.any() else 150.0
    vmax = float(np.nanpercentile(ti_60, 98)) if valid.any() else 450.0
    if vmax <= vmin:
        vmax = vmin + 1.0
    norm = np.clip((np.where(valid, ti_60, vmin) - vmin) / (vmax - vmin), 0.0, 1.0)
    cmap = matplotlib.colormaps["inferno"]  # cm.get_cmap was removed in matplotlib 3.9
    colors = (cmap(norm) * 255.0).astype(np.uint8)
    colors[..., 3] = np.where(valid, 175, 0).astype(np.uint8)
    return colors


def deg2tile(lon_deg: float, lat_deg: float, zoom: int) -> tuple[int, int]:
    lat_rad = math.radians(lat_deg)
    n = 1 << zoom
    xtile = int((lon_deg + 180.0) / 360.0 * n)
    ytile = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return xtile, ytile


def generate_xyz_tiles(layers: dict[str, tuple[np.ndarray, str]], z_min: int = 10, z_max: int = 16) -> dict[str, int]:
    """Slice all RGBA layers into Web Mercator XYZ tiles in one shared coordinate pass."""
    for name in layers:
        layer_dir = TILES_ROOT / name
        if layer_dir.exists():
            shutil.rmtree(layer_dir)

    tile_counts = {name: 0 for name in layers}
    px_offsets = (np.arange(256, dtype=np.float64) + 0.5) / 256.0
    box_w = OPS_BOX["east"] - OPS_BOX["west"]
    box_h = OPS_BOX["north"] - OPS_BOX["south"]

    for z in range(z_min, z_max + 1):
        n = 1 << z
        x0, y0 = deg2tile(OPS_BOX["west"], OPS_BOX["north"], z)
        x1, y1 = deg2tile(OPS_BOX["east"], OPS_BOX["south"], z)

        for tx in range(x0, x1 + 1):
            # 256 longitudes across tile tx
            lon_px = ((tx + px_offsets) / n) * 360.0 - 180.0
            u = (lon_px - OPS_BOX["west"]) / box_w
            in_x = (u >= 0.0) & (u < 1.0)
            if not in_x.any():
                continue

            for ty in range(y0, y1 + 1):
                lat_px = np.degrees(np.arctan(np.sinh(math.pi * (1.0 - 2.0 * (ty + px_offsets) / n))))
                v = (OPS_BOX["north"] - lat_px) / box_h
                in_y = (v >= 0.0) & (v < 1.0)
                if not in_y.any():
                    continue

                mask = in_y[:, None] & in_x[None, :]
                if not mask.any():
                    continue

                u_valid = np.clip(u[in_x], 0.0, 0.999999)
                v_valid = np.clip(v[in_y], 0.0, 0.999999)
                yy, xx = np.nonzero(mask)
                y_sl = slice(int(yy.min()), int(yy.max()) + 1)
                x_sl = slice(int(xx.min()), int(xx.max()) + 1)

                for name, (rgba, mode) in layers.items():
                    lh, lw, _ = rgba.shape
                    if mode == "bilinear":
                        fx = u_valid * (lw - 1)
                        fy = v_valid * (lh - 1)
                        x_lo = np.floor(fx).astype(np.int32)
                        y_lo = np.floor(fy).astype(np.int32)
                        x_hi = np.minimum(x_lo + 1, lw - 1)
                        y_hi = np.minimum(y_lo + 1, lh - 1)
                        wx = (fx - x_lo)[None, :, None].astype(np.float32)
                        wy = (fy - y_lo)[:, None, None].astype(np.float32)

                        c00 = rgba[np.ix_(y_lo, x_lo)].astype(np.float32)
                        c10 = rgba[np.ix_(y_lo, x_hi)].astype(np.float32)
                        c01 = rgba[np.ix_(y_hi, x_lo)].astype(np.float32)
                        c11 = rgba[np.ix_(y_hi, x_hi)].astype(np.float32)
                        patch = (
                            c00 * (1.0 - wx) * (1.0 - wy)
                            + c10 * wx * (1.0 - wy)
                            + c01 * (1.0 - wx) * wy
                            + c11 * wx * wy
                        ).astype(np.uint8)
                    else:
                        cx = np.floor(u_valid * lw).astype(np.int32)
                        cy = np.floor(v_valid * lh).astype(np.int32)
                        patch = rgba[np.ix_(cy, cx)]

                    tile_rgba = np.zeros((256, 256, 4), dtype=np.uint8)
                    tile_rgba[y_sl, x_sl] = patch

                    if tile_rgba[..., 3].max() == 0:
                        continue

                    out_path = TILES_ROOT / name / str(z) / str(tx) / f"{ty}.png"
                    out_path.parent.mkdir(parents=True, exist_ok=True)
                    Image.fromarray(tile_rgba, mode="RGBA").save(out_path, compress_level=4)
                    tile_counts[name] += 1

        print(f"  Zoom {z} complete: cumulative tiles={tile_counts}")
    return tile_counts


def main() -> None:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    TILES_ROOT.mkdir(parents=True, exist_ok=True)

    print("[1/4] Conditioning DEMs and computing slope/hillshade...")
    dem_2p5_raw = tifffile.imread(RAW_DIR / "gale_dem_2p5m.tif").astype(np.float32)
    dem_10_raw = tifffile.imread(RAW_DIR / "gale_dem_10m.tif").astype(np.float32)
    dem_2p5, n_inv_2p5 = fill_nodata(dem_2p5_raw)
    dem_10_direct, n_inv_10 = fill_nodata(dem_10_raw)

    assert dem_2p5.shape == (2400, 2400), f"Unexpected 2.5 m DEM shape {dem_2p5.shape}"
    assert dem_10_direct.shape == (600, 600), f"Unexpected 10 m DEM shape {dem_10_direct.shape}"

    lat_mid = 0.5 * (OPS_BOX["south"] + OPS_BOX["north"])
    dy_m = ((OPS_BOX["north"] - OPS_BOX["south"]) / 2400.0) * METERS_PER_DEG
    dx_m = ((OPS_BOX["east"] - OPS_BOX["west"]) / 2400.0) * METERS_PER_DEG * math.cos(math.radians(lat_mid))

    dz_dy, dz_dx = np.gradient(dem_2p5, dy_m, dx_m)
    slope_2p5 = np.degrees(np.arctan(np.hypot(dz_dx, dz_dy))).astype(np.float32)

    # Aggregate 4x4 blocks -> 600x600 (10 m planning grid, Review F4)
    dem_blocks = dem_2p5.reshape(600, 4, 600, 4)
    slope_blocks = slope_2p5.reshape(600, 4, 600, 4)

    dem_10 = dem_blocks.mean(axis=(1, 3)).astype(np.float32)
    slope_max_10 = slope_blocks.max(axis=(1, 3)).astype(np.float32)
    slope_p90_10 = np.percentile(slope_blocks, 90, axis=(1, 3)).astype(np.float32)
    slope_mean_10 = slope_blocks.mean(axis=(1, 3)).astype(np.float32)

    np.save(PROCESSED_DIR / "dem_10m.npy", dem_10)
    np.save(PROCESSED_DIR / "slope_max_10m.npy", slope_max_10)
    np.save(PROCESSED_DIR / "slope_p90_10m.npy", slope_p90_10)
    np.save(PROCESSED_DIR / "slope_mean_10m.npy", slope_mean_10)

    # Condition THEMIS TI 60x60 -> 600x600 block-aligned array
    ti_60_raw = tifffile.imread(RAW_DIR / "themis_ti_100m.tif").astype(np.float32)
    ti_60, n_inv_ti = fill_nodata(ti_60_raw)
    ti_10m = np.repeat(np.repeat(ti_60, 10, axis=0), 10, axis=1).astype(np.float32)
    np.save(PROCESSED_DIR / "themis_ti_10m.npy", ti_10m)

    print("[2/4] Evaluating Pilot Gate checks (stops, slope distribution, habitat candidate)...")
    stops_data = json.loads(STOPS_PATH.read_text(encoding="utf-8"))
    meta_data = json.loads(META_PATH.read_text(encoding="utf-8"))
    stop_checks: list[dict[str, Any]] = []
    for feat in stops_data.get("features", []):
        lon, lat = feat["geometry"]["coordinates"]
        r, c = lonlat_to_grid_rc(lon, lat, 600, 600)
        stop_checks.append(
            {
                "id": feat["properties"]["id"],
                "name": feat["properties"]["name"],
                "lon": lon,
                "lat": lat,
                "grid_row_col": [r, c],
                "elev_m": round(float(dem_10[r, c]), 2),
                "slope_max_deg": round(float(slope_max_10[r, c]), 2),
                "slope_mean_deg": round(float(slope_mean_10[r, c]), 2),
                "themis_ti_tiu": round(float(ti_10m[r, c]), 1),
            }
        )

    hab_lon, hab_lat = meta_data["habitat"]["lonlat"]
    hr, hc = lonlat_to_grid_rc(hab_lon, hab_lat, 600, 600)

    # Find flattest cell north (downslope) of S1 (137.38592, -4.79782)
    # Candidate search box: lon [137.375, 137.410], lat [-4.790, -4.760]
    r_n, c_w = lonlat_to_grid_rc(137.375, -4.760, 600, 600)
    r_s, c_e = lonlat_to_grid_rc(137.410, -4.790, 600, 600)
    sub_slope = slope_max_10[r_n : r_s + 1, c_w : c_e + 1]
    min_idx = np.unravel_index(int(np.argmin(sub_slope)), sub_slope.shape)
    cand_r = r_n + int(min_idx[0])
    cand_c = c_w + int(min_idx[1])
    cand_lon, cand_lat = grid_rc_to_lonlat(cand_r, cand_c, 600, 600)

    pilot_report = {
        "ops_box": OPS_BOX,
        "crs": "+proj=longlat +R=3396190 +no_defs",
        "dem_2p5m_nodata_filled": n_inv_2p5,
        "dem_10m_nodata_filled": n_inv_10,
        "themis_nodata_filled": n_inv_ti,
        "dem_10m_stats_m": {
            "min": round(float(dem_10.min()), 2),
            "max": round(float(dem_10.max()), 2),
            "mean": round(float(dem_10.mean()), 2),
            "max_diff_vs_direct_10m_export_m": round(float(np.abs(dem_10 - dem_10_direct).max()), 2),
        },
        "slope_10m_stats_deg": {
            "passable_pct_le_15deg": round(float((slope_max_10 <= 15.0).mean() * 100.0), 2),
            "max_slope_p95": round(float(np.percentile(slope_max_10, 95)), 2),
            "mean_slope_avg": round(float(slope_mean_10.mean()), 2),
        },
        "stops": stop_checks,
        "current_mock_habitat": {
            "lonlat": [hab_lon, hab_lat],
            "grid_row_col": [hr, hc],
            "elev_m": round(float(dem_10[hr, hc]), 2),
            "slope_max_deg": round(float(slope_max_10[hr, hc]), 2),
        },
        "flat_habitat_candidate_north_of_S1": {
            "lonlat": [cand_lon, cand_lat],
            "grid_row_col": [cand_r, cand_c],
            "elev_m": round(float(dem_10[cand_r, cand_c]), 2),
            "slope_max_deg": round(float(slope_max_10[cand_r, cand_c]), 2),
        },
    }
    (PROCESSED_DIR / "pilot_gate_report.json").write_text(
        json.dumps(pilot_report, indent=2), encoding="utf-8"
    )
    print(
        f"  DEM elev=[{pilot_report['dem_10m_stats_m']['min']}, {pilot_report['dem_10m_stats_m']['max']}] m, "
        f"passable <=15 deg: {pilot_report['slope_10m_stats_deg']['passable_pct_le_15deg']}%"
    )

    print("[3/4] Rendering visual layer RGBA arrays...")
    hirise_rgba = np.array(Image.open(RAW_DIR / "hirise_ortho.png").convert("RGBA"))
    hillshade_rgba = compute_hillshade(dz_dx, dz_dy)
    slope_rgba = colorize_slope(slope_2p5)
    themis_rgba = colorize_themis(ti_60)
    crism_rgba = np.array(Image.open(RAW_DIR / "crism_minerals.png").convert("RGBA"))
    geology_raw = np.array(Image.open(RAW_DIR / "sim3292_geology.png").convert("RGBA"))
    # Keep geology overlay semi-transparent (max alpha 120) so HiRISE/hillshade remain visible beneath
    geology_rgba = geology_raw.copy()
    geology_rgba[..., 3] = np.minimum(geology_rgba[..., 3], 120)

    layers = {
        "hirise": (hirise_rgba, "bilinear"),
        "hillshade": (hillshade_rgba, "bilinear"),
        "slope": (slope_rgba, "nearest"),
        "themis": (themis_rgba, "nearest"),
        "crism": (crism_rgba, "bilinear"),
        "geology": (geology_rgba, "nearest"),
    }

    print("[4/4] Generating XYZ tiles (z10-16)...")
    tile_counts = generate_xyz_tiles(layers, z_min=10, z_max=16)
    (PROCESSED_DIR / "tile_counts.json").write_text(json.dumps(tile_counts, indent=2), encoding="utf-8")
    print("Done! Tile counts:", tile_counts)


if __name__ == "__main__":
    main()

