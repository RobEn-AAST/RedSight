"""Write app/public/data/return/{route}.json: the fastest modeled way home (back_fast) for each lowest-hazard route.

Real data only. One directed Dijkstra (modeled walking time, x -> habitat) on the full native HiRISE DTM window,
same rules as the routes (per-pixel Horn slope <= 15°, endpoint grade <= 15°, diagonal corner rule, Pandolf x kappa,
standing-load downhill floor, constants.json). Return keys sit every ~KEY_SPACING_M along the route; from route
point i the way home is: walk this route back to the key at or before i, then the fastest pixel path home.

- Geometry is complete and lossless: every native pixel centre of the path is kept except interior points of
  straight 8-direction runs (they lie exactly on the kept segment), so no simplification changes the walked cells.
- t_s / o2_l at every route point are summed edge by edge on exactly that geometry with the engine's edge model:
  (back[i] - back[key]) + fastest(key). No reserve, margin or crew factor, like `back`.

The route files stay byte-identical (engine-build-manifest hashes); each output names its route's SHA-256.
Run from the repo root:  python3 -m engine.tools.fastest_home
"""

from __future__ import annotations

import gc
import hashlib
import json
import math
from pathlib import Path

import numpy as np
import rasterio
from rasterio.warp import transform as warp_transform
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra

from engine.data.native_routing import _native_asset
from engine.export import read_primary_dem
from engine.model.constants import read_constants
from engine.model.native_grid import _movement_arrays
from engine.route.native import MARS_GEOGRAPHIC_CRS
from engine.tools.no_return_line import MAX_SLOPE_DEG, _horn_slope

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "app/public/data"
KEY_SPACING_M = 25.0


def main():
    manifest_path = (ROOT / "data/raw/engine-pilot/input-manifest.json").resolve()
    manifest = json.loads(manifest_path.read_text())
    dem = read_primary_dem(manifest_path)
    path, digest, resolution, asset = _native_asset(manifest_path, manifest, dem.crs)
    constants_raw, c = read_constants(DATA / "constants.json")
    if constants_raw.get("_mock") is True:
        raise SystemExit("mock constants are not valid inputs")
    kw = dict(body_mass_kg=c["body_mass_kg"], load_kg=c["carried_load_kg"], kappa=c["suit_factor_kappa"],
              watts_to_o2_ml_per_min=c["watts_to_o2_ml_per_min"], max_speed_mps=c["walk_speed_kmh"] / 3.6)

    with rasterio.open(path) as src:
        masked = src.read(1, masked=True)
        tr, crs = src.transform, src.crs
    elev = np.asarray(masked.data, dtype=np.float32)
    valid = ~np.ma.getmaskarray(masked) & np.isfinite(elev)
    del masked
    slope = _horn_slope(elev, valid, resolution)
    elev[~valid] = 0.0
    tol = max(1e-10, MAX_SLOPE_DEG * 1e-12)
    walk = np.isfinite(slope) & (slope <= MAX_SLOPE_DEG + tol)
    del slope
    rows, cols = elev.shape

    # Time graph, edges stored as (x -> y) walking costs; Dijkstra from home on the transposed costs gives x -> home.
    S, D, TF, TR = [], [], [], []
    for dr, dc in ((0, 1), (1, 0), (1, 1), (1, -1)):
        r0, r1 = max(0, -dr), min(rows, rows - dr)
        c0, c1 = max(0, -dc), min(cols, cols - dc)
        legal = walk[r0:r1, c0:c1] & walk[r0 + dr:r1 + dr, c0 + dc:c1 + dc]
        if dr and dc:
            legal &= walk[r0:r1, c0 + dc:c1 + dc] & walk[r0 + dr:r1 + dr, c0:c1]
        dist = resolution * math.hypot(dr, dc)
        grade = np.degrees(np.arctan2(elev[r0 + dr:r1 + dr, c0 + dc:c1 + dc].astype(np.float64) - elev[r0:r1, c0:c1], dist))
        legal &= np.abs(grade) <= MAX_SLOPE_DEG + tol
        idx = np.flatnonzero(legal)
        g = grade.flat[idx]
        del grade, legal
        rr, cc = idx // (c1 - c0) + r0, idx % (c1 - c0) + c0
        S.append((rr * cols + cc).astype(np.int32))
        D.append(((rr + dr) * cols + cc + dc).astype(np.int32))
        TF.append(_movement_arrays(dist, g, **kw)[0].astype(np.float32))   # s -> d
        TR.append(_movement_arrays(dist, -g, **kw)[0].astype(np.float32))  # d -> s
        gc.collect()
    s, d = np.concatenate(S), np.concatenate(D)
    tf, trv = np.concatenate(TF), np.concatenate(TR)
    del S, D, TF, TR
    # Reversed graph: entry (v -> u) carries the cost of walking u -> v.
    n = rows * cols
    rev = csr_matrix((np.concatenate((tf, trv)), (np.concatenate((d, s)), np.concatenate((s, d)))), shape=(n, n), dtype=np.float32)
    del s, d, tf, trv
    gc.collect()

    meta = json.loads((DATA / "meta.json").read_text())
    hab = meta["habitat"]["lonlat"]

    def cell_of(lonlat):
        x, y = warp_transform(MARS_GEOGRAPHIC_CRS, crs, [lonlat[0]], [lonlat[1]])
        return math.floor((tr.f - y[0]) / abs(tr.e)), math.floor((x[0] - tr.c) / tr.a)

    hr, hc = cell_of(hab)
    home = hr * cols + hc
    _, pred = dijkstra(rev, directed=True, indices=home, return_predecessors=True)
    del rev
    gc.collect()

    def step_cost(u, v):
        (ur, uc), (vr, vc) = divmod(int(u), cols), divmod(int(v), cols)
        dist = resolution * math.hypot(vr - ur, vc - uc)
        g = math.degrees(math.atan2(float(elev[vr, vc]) - float(elev[ur, uc]), dist))
        t, o = _movement_arrays(dist, np.array([g]), **kw)
        return float(t[0]), float(o[0])

    def lonlat(nodes):
        r, cc = np.divmod(np.asarray(nodes, dtype=np.int64), cols)
        xs = tr.c + (cc + 0.5) * tr.a
        ys = tr.f + (r + 0.5) * tr.e
        lon, lat = warp_transform(crs, MARS_GEOGRAPHIC_CRS, xs.tolist(), ys.tolist())
        return [[a, b] for a, b in zip(lon, lat)]

    def lossless(nodes):
        """Drop interior points of straight 8-direction runs only."""
        if len(nodes) < 3:
            return list(nodes)
        rc = [divmod(int(x), cols) for x in nodes]
        keep = [0]
        for i in range(1, len(rc) - 1):
            if (rc[i][0] - rc[i - 1][0], rc[i][1] - rc[i - 1][1]) != (rc[i + 1][0] - rc[i][0], rc[i + 1][1] - rc[i][1]):
                keep.append(i)
        keep.append(len(rc) - 1)
        return [nodes[i] for i in keep]

    out_dir = DATA / "return"
    out_dir.mkdir(exist_ok=True)
    for f in sorted((DATA / "routes").glob("*_safest_2_15.json")):
        raw = f.read_bytes()
        route = json.loads(raw)
        coords = route["coords"]
        if cell_of(coords[0]) != (hr, hc):
            raise SystemExit(f"{f.name}: coords[0] is not the habitat pixel")
        cells = [cell_of(p) for p in coords]
        # Every route point must be a native pixel centre on this grid (same DTM, same pixels).
        for p, (r, cc) in zip(coords, cells):
            q = lonlat([r * cols + cc])[0]
            if math.dist(p, q) > 1e-7:
                raise SystemExit(f"{f.name}: route point {p} is not a native pixel centre")
        seg_d = [s["cost_terms"]["distance_m"] for s in route["seg"]]
        keys, acc = [0], 0.0
        for i, dm in enumerate(seg_d, start=1):
            acc += dm
            if acc >= KEY_SPACING_M:
                keys.append(i)
                acc = 0.0
        fast_t, fast_o, paths = [], [], []
        for k in keys:
            node = cells[k][0] * cols + cells[k][1]
            chain = [node]
            while chain[-1] != home:
                nxt = int(pred[chain[-1]])
                if nxt < 0:
                    raise SystemExit(f"{f.name}: key {k} has no legal way home")
                chain.append(nxt)
            t = o = 0.0
            for u, v in zip(chain, chain[1:]):
                dt, do = step_cost(u, v)
                t, o = t + dt, o + do
            fast_t.append(t)
            fast_o.append(o)
            pts = [[round(a, 9), round(b, 9)] for a, b in lonlat(lossless(chain))]
            pts[0], pts[-1] = list(coords[k]), list(coords[0])  # exact route values, so endpoints match bit for bit
            paths.append(pts)
        bt, bo = route["back"]["t_s"], route["back"]["o2_l"]
        t_s, o2_l, j = [], [], 0
        for i in range(len(coords)):
            while j + 1 < len(keys) and keys[j + 1] <= i:
                j += 1
            k = keys[j]
            t_s.append(round(bt[i] - bt[k] + fast_t[j], 4))
            o2_l.append(round(bo[i] - bo[k] + fast_o[j], 6))
        t_s[0] = o2_l[0] = 0
        payload = {
            "route_file": f"routes/{f.name}",
            "route_sha256": hashlib.sha256(raw).hexdigest(),
            "badge": "Scenario",
            "generator": "python3 -m engine.tools.fastest_home",
            "inputs": {"native_dem_sha256": digest, "source_url": asset.get("source_url", ""), "resolution_m": resolution},
            "method": __doc__.split("\n\n")[1].replace("\n", " "),
            "back_fast": {"t_s": t_s, "o2_l": o2_l, "path_from": keys, "path": paths, "via": "fastest_native_dijkstra"},
        }
        target = out_dir / f.name
        target.write_text(json.dumps(payload, separators=(",", ":")) + "\n")
        better = sum(1 for a, b in zip(o2_l, bo) if a < b - 1e-9)
        print(f"{target.relative_to(ROOT)} {target.stat().st_size/1e3:.0f} kB keys={len(keys)} "
              f"home-from-goal fast {t_s[-1]/60:.1f} min/{o2_l[-1]:.2f} L vs same-path {bt[-1]/60:.1f} min/{bo[-1]:.2f} L; "
              f"cheaper at {better}/{len(coords)} points")


if __name__ == "__main__":
    main()
