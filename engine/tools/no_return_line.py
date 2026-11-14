"""Write plan/limits_c{crew}_l{load}_foot.geojson: the modeled no-return line from real terrain.

For every native-DTM cell this computes, on the engine's own walking rules (15° hard slope mask on the
per-pixel Horn slope, absolute endpoint grade <= 15°, Pandolf load-carriage power x kappa with the
standing-load downhill floor, constants.json values):

  out(x)  = lowest modeled O2 to walk from the Scenario habitat to x   (Dijkstra, directed edges)
  back(x) = lowest modeled O2 to walk from x home to the habitat       (Dijkstra on swapped edges)

and draws the contour where  max(member_factors) * (out + return_cost_margin * back) == B, with
B = capacity - max(reserve_fraction * capacity, reserve_minutes * walkback_o2_lpm): the same turn-back
rule the route files use (engine/route/pnr.py). Inside the line a crew walking the lowest-O2 way out and
back stays within the budget; past it the model says O2 is not enough. This is a Scenario estimate on
Derived terrain, not a guarantee. Cells outside the native DTM window, nodata and over-limit terrain
are unknown/blocked: no line is drawn there (the contour only exists where both sides are modeled).

Run from the repo root:
  python3 -m engine.tools.no_return_line [--manifest data/raw/engine-pilot/input-manifest.json] [--stride 1]
"""

from __future__ import annotations

import argparse
import gc
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import rasterio
from rasterio.warp import transform as warp_transform
from scipy import ndimage
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra

from engine.data.native_routing import _native_asset
from engine.export import read_primary_dem
from engine.model.constants import read_constants
from engine.model.native_grid import _movement_arrays
from engine.route.native import MARS_GEOGRAPHIC_CRS

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "app/public/data"
MAX_SLOPE_DEG = 15.0
MIN_PIECE_M = 25.0  # drop contour crumbs shorter than this (single-pixel noise)
LEVEL_STEP_L = 10.0  # one line per 10 L of usable budget, so the turn-back slider can show the matching line


def _horn_slope(elevation, valid, resolution):
    """Per-pixel Horn slope (degrees); pixels whose 3x3 window touches nodata stay NaN (as the engine does)."""
    z = np.where(valid, elevation, 0.0).astype(np.float32)
    kx = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float32) / (8.0 * resolution)
    ky = np.array([[1, 2, 1], [0, 0, 0], [-1, -2, -1]], dtype=np.float32) / (8.0 * resolution)
    gx = ndimage.convolve(z, kx, mode="constant", cval=0.0)
    gy = ndimage.convolve(z, ky, mode="constant", cval=0.0)
    np.hypot(gx, gy, out=gx)
    np.arctan(gx, out=gx)
    gx *= np.float32(180.0 / math.pi)
    horn_valid = ndimage.minimum_filter(valid.astype(np.uint8), size=3, mode="constant", cval=0).astype(bool)
    gx[~horn_valid] = np.nan
    return gx


def _downsample(elevation, slope, stride):
    """Block mean elevation, block max slope (any NaN pixel blocks the block): conservative coarsening."""
    if stride == 1:
        return elevation, slope
    rows, cols = (elevation.shape[0] // stride) * stride, (elevation.shape[1] // stride) * stride
    e = elevation[:rows, :cols].reshape(rows // stride, stride, cols // stride, stride).mean(axis=(1, 3))
    s = slope[:rows, :cols].reshape(rows // stride, stride, cols // stride, stride).max(axis=(1, 3))
    return e.astype(np.float32), s.astype(np.float32)


def _edges(elevation, walkable, resolution, constants):
    """Directed edges (source, destination, o2 forward s->d, o2 reverse d->s) on the engine's rules."""
    rows, cols = elevation.shape
    tol = max(1e-10, MAX_SLOPE_DEG * 1e-12)
    out = []
    for dr, dc in ((0, 1), (1, 0), (1, 1), (1, -1)):
        r0, r1 = max(0, -dr), min(rows, rows - dr)
        c0, c1 = max(0, -dc), min(cols, cols - dc)
        legal = walkable[r0:r1, c0:c1] & walkable[r0 + dr:r1 + dr, c0 + dc:c1 + dc]
        if dr and dc:
            legal &= walkable[r0:r1, c0 + dc:c1 + dc] & walkable[r0 + dr:r1 + dr, c0:c1]
        distance = resolution * math.hypot(dr, dc)
        diff = elevation[r0 + dr:r1 + dr, c0 + dc:c1 + dc].astype(np.float64) - elevation[r0:r1, c0:c1]
        grade = np.degrees(np.arctan2(diff, distance))
        legal &= np.abs(grade) <= MAX_SLOPE_DEG + tol
        idx = np.flatnonzero(legal)
        g = grade.flat[idx]
        del grade, diff, legal
        rr = idx // (c1 - c0) + r0
        cc = idx % (c1 - c0) + c0
        src = (rr * cols + cc).astype(np.int32)
        dst = ((rr + dr) * cols + cc + dc).astype(np.int32)
        kw = dict(body_mass_kg=constants["body_mass_kg"], load_kg=constants["carried_load_kg"],
                  kappa=constants["suit_factor_kappa"], watts_to_o2_ml_per_min=constants["watts_to_o2_ml_per_min"],
                  max_speed_mps=constants["walk_speed_kmh"] / 3.6)
        _, fwd = _movement_arrays(distance, g, **kw)
        _, rev = _movement_arrays(distance, -g, **kw)
        out.append((src, dst, fwd.astype(np.float32), rev.astype(np.float32)))
        del idx, rr, cc, g
        gc.collect()
    src = np.concatenate([e[0] for e in out])
    dst = np.concatenate([e[1] for e in out])
    fwd = np.concatenate([e[2] for e in out])
    rev = np.concatenate([e[3] for e in out])
    return src, dst, fwd, rev


def _field(n, src, dst, a, b, start):
    """Dijkstra from start on edges src->dst cost a and dst->src cost b."""
    m = csr_matrix((np.concatenate((a, b)), (np.concatenate((src, dst)), np.concatenate((dst, src)))),
                   shape=(n, n), dtype=np.float32)
    d = dijkstra(m, directed=True, indices=start, min_only=True)
    del m
    gc.collect()
    return d.astype(np.float32)


def _rdp(points, tol):
    if len(points) < 3:
        return points
    a, b = points[0], points[-1]
    ab = b - a
    norm = np.hypot(*ab)
    d = np.abs(np.cross(ab, points - a)) / norm if norm else np.hypot(*(points - a).T)
    i = int(np.argmax(d))
    if d[i] <= tol:
        return np.array([a, b])
    return np.vstack((_rdp(points[: i + 1], tol)[:-1], _rdp(points[i:], tol)))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--manifest", default="data/raw/engine-pilot/input-manifest.json")
    ap.add_argument("--stride", type=int, default=1, help="coarsen the native DTM by this factor (1 = native)")
    args = ap.parse_args()

    manifest_path = Path(args.manifest).resolve()
    manifest = json.loads(manifest_path.read_text())
    dem = read_primary_dem(manifest_path)
    path, digest, resolution, asset = _native_asset(manifest_path, manifest, dem.crs)
    constants_path = DATA / "constants.json"
    constants_raw, c = read_constants(constants_path)
    if constants_raw.get("_mock") is True:
        raise SystemExit("mock constants are not valid inputs")
    constants_hash = hashlib.sha256((json.dumps(constants_raw, indent=2, sort_keys=True, ensure_ascii=False) + "\n").encode()).hexdigest()
    meta = json.loads((DATA / "meta.json").read_text())
    habitat = meta["habitat"]["lonlat"]

    with rasterio.open(path) as source:
        masked = source.read(1, masked=True)
        tr, crs = source.transform, source.crs
    elevation = np.asarray(masked.data, dtype=np.float32)
    valid = ~np.ma.getmaskarray(masked) & np.isfinite(elevation)
    del masked
    slope = _horn_slope(elevation, valid, resolution)
    elevation[~valid] = 0.0
    elevation, slope = _downsample(elevation, slope, args.stride)
    res = resolution * args.stride
    tol = max(1e-10, MAX_SLOPE_DEG * 1e-12)
    walkable = np.isfinite(slope) & (slope <= MAX_SLOPE_DEG + tol)
    del slope
    rows, cols = elevation.shape

    hx, hy = warp_transform(MARS_GEOGRAPHIC_CRS, crs, [habitat[0]], [habitat[1]])
    hr = math.floor((tr.f - hy[0]) / abs(tr.e)) // args.stride
    hc = math.floor((hx[0] - tr.c) / tr.a) // args.stride
    if not (0 <= hr < rows and 0 <= hc < cols) or not walkable[hr, hc]:
        raise SystemExit(f"habitat cell {(hr, hc)} is outside the DTM or blocked at stride {args.stride}")
    start = hr * cols + hc

    src, dst, fwd, rev = _edges(elevation, walkable, res, c)
    n = rows * cols
    out_o2 = _field(n, src, dst, fwd, rev, start)   # habitat -> x
    back_o2 = _field(n, src, dst, rev, fwd, start)  # x -> habitat (edges swapped)
    del src, dst, fwd, rev
    gc.collect()

    capacity = c["o2_usable_primary_l"]
    reserve = max(c["reserve_fraction"] * capacity, c["reserve_minutes"] * c["walkback_o2_lpm"])
    budget = capacity - reserve
    margin = c["return_cost_margin"]
    need = (out_o2 + margin * back_o2).reshape(rows, cols)
    reachable = np.isfinite(need)

    # Contour at the budget, only where the field is modeled (unreachable cells are masked).
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    levels = [float(v) for v in np.arange(LEVEL_STEP_L, budget, LEVEL_STEP_L)] + [round(budget, 2)]
    fig = plt.figure()
    cs = plt.contour(np.ma.masked_invalid(np.where(reachable, need, np.nan)), levels=levels)
    allsegs = cs.allsegs
    plt.close(fig)

    def to_lonlat(pts):  # pts: (col, row) in the coarse grid, pixel centres at integer indices
        x = tr.c + (pts[:, 0] + 0.5) * res
        y = tr.f - (pts[:, 1] + 0.5) * res
        lon, lat = warp_transform(crs, MARS_GEOGRAPHIC_CRS, x.tolist(), y.tolist())
        return [[round(a, 7), round(b, 7)] for a, b in zip(lon, lat)]

    by_level = []
    for level, segs in zip(levels, allsegs):
        lines = []
        for s in segs:
            if len(s) < 2:
                continue
            length = float(np.hypot(*np.diff(s, axis=0).T).sum()) * res
            if length < MIN_PIECE_M:
                continue
            lines.append(to_lonlat(_rdp(np.asarray(s), 1.5 / args.stride)))
        by_level.append((level, lines))

    inside = reachable & (need <= budget)
    inside_count, reach_count = int(inside.sum()), int(reachable.sum())
    summary = {
        "reachable_cells": reach_count,
        "cells_within_budget": inside_count,
        "cells_past_line": reach_count - inside_count,
        "max_need_l_on_reachable": round(float(need[reachable].max()), 2),
        "levels_with_a_line": [lv for lv, ln in by_level if ln],
    }
    # Validation against the shipped route files: field O2 at each route's endpoint vs the route's own arrays.
    checks = []
    for f in sorted((DATA / "routes").glob("*_2_15.json")):
        r = json.loads(f.read_text())
        lon, lat = r["coords"][-1]
        x, y = warp_transform(MARS_GEOGRAPHIC_CRS, crs, [lon], [lat])
        rr = math.floor((tr.f - y[0]) / abs(tr.e)) // args.stride
        cc = math.floor((x[0] - tr.c) / tr.a) // args.stride
        checks.append({
            "route": f.stem, "route_out_o2_l": round(r["cum"]["o2_l"][-1], 2), "field_out_o2_l": round(float(out_o2[rr * cols + cc]), 2),
            "route_back_o2_l": round(r["back"]["o2_l"][-1], 2), "field_back_o2_l": round(float(back_o2[rr * cols + cc]), 2),
        })

    for crew in (1, 2):
        factors = [1.0] * crew  # same per-member model as the plan files (no crew-size term)
        def props(level):
            return {
                "kind": "no_return_line", "crew": crew, "load_kg": c["carried_load_kg"], "rover": False,
                "badge": "Scenario", "terrain_badge": "Derived", "budget_l": level,
                "note": ("Past this line the modeled O2 left is not enough to walk the lowest-O2 way home to the habitat "
                         f"(turn-back rule f*(out + {margin}*back) <= {level:g} L usable budget). Modeled estimate, not a guarantee. "
                         "No line where terrain is unknown, steeper than 15°, or outside the native DTM window."),
            }
        payload = {
            "type": "FeatureCollection",
            "badge": "Scenario",
            "method": (
                "Two directed Dijkstra fields on the native HiRISE DTM walking graph (8-neighbour, per-pixel Horn slope <= 15°, "
                "endpoint grade <= 15°, Pandolf (1977) power x kappa with the standing-load downhill floor): lowest modeled O2 "
                "from the Scenario habitat to each cell and from each cell home. The line is the contour where "
                "max(member_factors)*(out + return_cost_margin*back) equals the usable budget, the same rule as engine/route/pnr.py. "
                "Lowest-O2 paths are a best case: a fastest or lowest-hazard route can turn back earlier (see its pnr_index)."
            ),
            "generator": "python3 -m engine.tools.no_return_line",
            "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "inputs": {
                "native_dem": {"sha256": digest, "source_url": asset.get("source_url", ""), "resolution_m": resolution,
                               "stride": args.stride, "grid_resolution_m": res},
                "constants_sha256": constants_hash, "habitat_lonlat": habitat,
                "member_factors": factors, "capacity_l": capacity, "reserve_l": round(reserve, 2),
                "return_cost_margin": margin,
            },
            "summary": summary,
            "validation_vs_routes": checks,
            "budget_levels_l": levels,
            "features": [
                {"type": "Feature", "properties": props(level),
                 "geometry": {"type": "MultiLineString", "coordinates": lines}}
                for level, lines in by_level if lines
            ],
        }
        target = DATA / f"plan/limits_c{crew}_l{c['carried_load_kg']:g}_foot.geojson"
        target.write_text(json.dumps(payload, separators=(",", ":")) + "\n")
        print(f"wrote {target.relative_to(ROOT)}  ({target.stat().st_size / 1e3:.0f} kB)")
    print(json.dumps(summary, indent=1))
    for ch in checks:
        print(ch)


if __name__ == "__main__":
    main()
