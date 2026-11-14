"""Build the small terrain grids the 360 HUD uses to draw the AR route on the real ground (Marwan, 2026-11-14).

For each panorama stop (S1, S2): an 8 m grid, 3.6 km square, centred on the stop, in local east/north metres.
Heights come from the Trek Gale DEM (2.5 m, data/raw/gale_dem_2p5m.tif), sampled bilinearly. Output:
app/public/hud/terrain-<stop>.json = {origin [lon,lat], cell_m, n, z0_m, heights_dm (base64 int16, row 0 = north,
relative to the stop's ground height, decimetres), source, built}. Derived data: display only (AR drawing and
line-of-sight), never used for routing.

Run: .venv/bin/python app/scripts/build-hud-terrain.py   (from the repo root)
"""
import base64, datetime, json, math, pathlib
import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.warp import transform

ROOT = pathlib.Path(__file__).resolve().parents[2]
DEM = ROOT / "data/raw/gale_dem_2p5m.tif"
OUT = ROOT / "app/public/hud"
STOPS = json.loads((ROOT / "app/public/data/stops.json").read_text())
MARS_R = 3_389_500.0  # same radius as the HUD's local projection (routeOverlay.ts)
CELL, HALF = 8.0, 1800.0

def stop_lonlat(sid):
    feats = STOPS.get("features") or STOPS.get("stops") or STOPS
    for f in feats:
        props = f.get("properties", f)
        if props.get("id") == sid:
            g = f.get("geometry")
            return tuple(g["coordinates"]) if g else (props["lon"], props["lat"])
    raise KeyError(sid)

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    geo = CRS.from_proj4(f"+proj=longlat +R={MARS_R} +no_defs")
    with rasterio.open(DEM) as ds:
        band = ds.read(1, masked=True).astype("float64").filled(np.nan)
        inv = ~ds.transform
        for sid in ("S1", "S2"):
            lon0, lat0 = stop_lonlat(sid)
            n = int(2 * HALF / CELL) + 1
            off = np.arange(n) * CELL - HALF
            east, north = np.meshgrid(off, -off)  # row 0 = north
            r = math.pi / 180
            lon = lon0 + east / (MARS_R * math.cos(lat0 * r)) / r
            lat = lat0 + north / MARS_R / r
            xs, ys = transform(geo, ds.crs, lon.ravel().tolist(), lat.ravel().tolist())
            cols, rows = inv * (np.array(xs), np.array(ys))
            c0, r0 = np.floor(cols - 0.5).astype(int), np.floor(rows - 0.5).astype(int)
            fx, fy = cols - 0.5 - c0, rows - 0.5 - r0
            def px(rr, cc):
                ok = (rr >= 0) & (rr < band.shape[0]) & (cc >= 0) & (cc < band.shape[1])
                v = np.full(rr.shape, np.nan)
                v[ok] = band[rr[ok], cc[ok]]
                return v
            z = (px(r0, c0) * (1 - fx) * (1 - fy) + px(r0, c0 + 1) * fx * (1 - fy)
                 + px(r0 + 1, c0) * (1 - fx) * fy + px(r0 + 1, c0 + 1) * fx * fy).reshape(n, n)
            z0 = float(z[n // 2, n // 2])
            rel = np.where(np.isnan(z), -32768, np.clip(np.round((z - z0) * 10), -32767, 32767)).astype("<i2")
            doc = {
                "stop": sid, "origin": [lon0, lat0], "cell_m": CELL, "n": n, "z0_m": round(z0, 2),
                "heights_dm": base64.b64encode(rel.tobytes()).decode(),
                "nodata": -32768,
                "badge": "Derived",
                "source": "Trek Gale_DEM_SMG_1m resampled 2.5 m (data/raw/gale_dem_2p5m.tif), bilinear; display only",
                "built": datetime.date.today().isoformat(),
            }
            (OUT / f"terrain-{sid}.json").write_text(json.dumps(doc))
            print(sid, n, "x", n, "z0", round(z0, 1), "range", round(float(np.nanmin(z) - z0), 1), round(float(np.nanmax(z) - z0), 1),
                  "nodata", int(np.isnan(z).sum()), f"{(OUT / f'terrain-{sid}.json').stat().st_size/1e3:.0f} kB")

main()
