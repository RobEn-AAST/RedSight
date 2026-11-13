"""Download and cache all RedSight Must-ship NASA/USGS datasets for the ops box.

Ops box (Mount Sharp boxwork region, Gale crater):
    137.335 .. 137.435 deg E, -4.85 .. -4.75 deg N (~5.9 x 5.9 km)
CRS:
    +proj=longlat +R=3396190 +no_defs (planetocentric east-positive)
"""

from __future__ import annotations

import hashlib
import io
import json
import math
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import requests
import tifffile
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data" / "raw"
CRISM_DIR = RAW_DIR / "crism"
PROCESSED_DIR = ROOT / "data" / "processed"

OPS_BOX = {
    "west": 137.335,
    "south": -4.85,
    "east": 137.435,
    "north": -4.75,
}
BBOX_STR = f"{OPS_BOX['west']},{OPS_BOX['south']},{OPS_BOX['east']},{OPS_BOX['north']}"

R_MARS_M = 3396190.0
METERS_PER_DEG = 2.0 * math.pi * R_MARS_M / 360.0  # 59274.69752330601 m/deg


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch_with_retry(
    session: requests.Session,
    method: str,
    url: str,
    *,
    retries: int = 4,
    timeout: int = 45,
    **kwargs: Any,
) -> requests.Response:
    last_err: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            resp = session.request(method, url, timeout=timeout, **kwargs)
            if resp.status_code in (200, 206):
                return resp
            if resp.status_code in (429, 500, 502, 503, 504) or (
                resp.status_code == 404 and "astrogeo-ard.s3" in url
            ):
                raise RuntimeError(f"HTTP {resp.status_code} from {url}")
            resp.raise_for_status()
            return resp
        except Exception as exc:
            last_err = exc
            if attempt < retries:
                wait_s = 2 ** attempt
                print(f"  [retry {attempt}/{retries}] {url} -> {exc}; waiting {wait_s}s")
                time.sleep(wait_s)
    raise RuntimeError(f"Failed after {retries} attempts: {url} ({last_err})")


def record(
    manifest: list[dict[str, Any]],
    *,
    dataset: str,
    local_path: Path | None,
    url: str,
    status: int,
    byte_count: int,
    sha256: str,
    note: str = "",
) -> None:
    manifest.append(
        {
            "dataset": dataset,
            "local_path": str(local_path.relative_to(ROOT)).replace("\\", "/")
            if local_path is not None
            else None,
            "url": url,
            "http_status": status,
            "bytes": byte_count,
            "sha256": sha256,
            "note": note,
            "fetched_utc": datetime.now(timezone.utc).isoformat(),
        }
    )


def download_stac_metadata(session: requests.Session, manifest: list[dict[str, Any]]) -> None:
    print("[1/6] USGS ARD STAC metadata + provenance (CC0-1.0)...")
    stac_url = "https://stac.astrogeology.usgs.gov/api/search"
    payload = {
        "collections": ["mro_hirise_socet_dtms"],
        "ids": [
            "DTEEC_009149_1750_009294_1750_U01",
            "DTEEC_019698_1750_019988_1750_U01",
        ],
    }
    r = fetch_with_retry(session, "POST", stac_url, json=payload)
    stac_path = RAW_DIR / "stac_hirise_dtms.json"
    stac_path.write_bytes(r.content)
    record(
        manifest,
        dataset="hirise_ard_stac_metadata",
        local_path=stac_path,
        url=stac_url,
        status=r.status_code,
        byte_count=len(r.content),
        sha256=sha256_bytes(r.content),
    )

    stac_json = r.json()
    for feat in stac_json.get("features", []):
        fid = feat["id"]
        short_id = "_".join(fid.split("_")[:2])
        prov_url = feat["assets"]["provenance"]["href"]
        pr = fetch_with_retry(session, "GET", prov_url)
        prov_path = RAW_DIR / f"{short_id}_provenance.txt"
        prov_path.write_bytes(pr.content)
        record(
            manifest,
            dataset=f"hirise_ard_provenance_{short_id}",
            local_path=prov_path,
            url=prov_url,
            status=pr.status_code,
            byte_count=len(pr.content),
            sha256=sha256_bytes(pr.content),
        )

        if fid == "DTEEC_009149_1750_009294_1750_U01":
            dtm_url = feat["assets"]["dtm"]["href"]
            dr = fetch_with_retry(
                session, "GET", dtm_url, headers={"Range": "bytes=0-65535"}
            )
            cr = dr.headers.get("Content-Range", "")
            record(
                manifest,
                dataset="hirise_ard_dtm_probe_206",
                local_path=None,
                url=dtm_url,
                status=dr.status_code,
                byte_count=len(dr.content),
                sha256=sha256_bytes(dr.content),
                note=f"Ranged GET header probe; Content-Range={cr}",
            )
            print(f"  Verified STAC DTM HTTP {dr.status_code} ({cr})")


def download_trek_dem(session: requests.Session, manifest: list[dict[str, Any]]) -> None:
    print("[2/6] Mars Trek Gale_DEM_SMG_1m (10 m & 2.5 m float32 TIFFs)...")
    url = "https://trek.nasa.gov/mars/trekarcgis/rest/services/Gale_DEM_SMG_1m/ImageServer/exportImage"
    for label, size_str, fname in [
        ("dem_10m", "600,600", "gale_dem_10m.tif"),
        ("dem_2p5m", "2400,2400", "gale_dem_2p5m.tif"),
    ]:
        params = {
            "bbox": BBOX_STR,
            "bboxSR": "104905",
            "imageSR": "104905",
            "size": size_str,
            "format": "tiff",
            "compression": "LZW",
            "f": "image",
        }
        r = fetch_with_retry(session, "GET", url, params=params, timeout=60)
        out_path = RAW_DIR / fname
        out_path.write_bytes(r.content)
        arr = tifffile.imread(out_path)
        assert arr.dtype.kind == "f", f"Expected float TIFF, got {arr.dtype}"
        record(
            manifest,
            dataset=f"trek_gale_{label}",
            local_path=out_path,
            url=r.url,
            status=r.status_code,
            byte_count=len(r.content),
            sha256=sha256_bytes(r.content),
            note=f"shape={arr.shape}, dtype={arr.dtype}, min={np.nanmin(arr):.2f}, max={np.nanmax(arr):.2f}",
        )
        print(f"  Saved {fname}: shape={arr.shape}, dtype={arr.dtype}, min={np.nanmin(arr):.1f}, max={np.nanmax(arr):.1f}")


def download_hirise_ortho(session: requests.Session, manifest: list[dict[str, Any]]) -> None:
    print("[3/6] Mars Trek curiosity_hirise_mosaic (2x2 @ 2048x2048 -> 4096x4096)...")
    url = "https://trek.nasa.gov/mars/trekarcgis/rest/services/curiosity_hirise_mosaic/ImageServer/exportImage"
    mid_lon = 0.5 * (OPS_BOX["west"] + OPS_BOX["east"])
    mid_lat = 0.5 * (OPS_BOX["south"] + OPS_BOX["north"])

    # PIL origin is top-left (west, north)
    quads = [
        (0, 0, f"{OPS_BOX['west']},{mid_lat},{mid_lon},{OPS_BOX['north']}"),  # NW
        (1, 0, f"{mid_lon},{mid_lat},{OPS_BOX['east']},{OPS_BOX['north']}"),  # NE
        (0, 1, f"{OPS_BOX['west']},{OPS_BOX['south']},{mid_lon},{mid_lat}"),  # SW
        (1, 1, f"{mid_lon},{OPS_BOX['south']},{OPS_BOX['east']},{mid_lat}"),  # SE
    ]
    stitched = Image.new("RGBA", (4096, 4096))
    quad_urls: list[str] = []
    try:
        for qx, qy, qbbox in quads:
            params = {
                "bbox": qbbox,
                "bboxSR": "104905",
                "imageSR": "104905",
                "size": "2048,2048",
                "format": "png",
                "f": "image",
            }
            r = fetch_with_retry(session, "GET", url, params=params, timeout=60)
            im = Image.open(io.BytesIO(r.content)).convert("RGBA")
            if im.size != (2048, 2048):
                im = im.resize((2048, 2048), Image.Resampling.BILINEAR)
            stitched.paste(im, (qx * 2048, qy * 2048))
            quad_urls.append(r.url)
        out_path = RAW_DIR / "hirise_ortho.png"
        stitched.save(out_path, optimize=True)
        record(
            manifest,
            dataset="trek_hirise_ortho",
            local_path=out_path,
            url=" | ".join(quad_urls),
            status=200,
            byte_count=out_path.stat().st_size,
            sha256=sha256_file(out_path),
            note="4096x4096 stitched 2x2 PNG (~1.45 m/px across 5.9 km box)",
        )
        print(f"  Saved hirise_ortho.png (4096x4096, {out_path.stat().st_size // 1024} KB)")
    except Exception as exc:
        print(f"  2x2 ortho stitch failed ({exc}); falling back to single 2400x2400 export...")
        params = {
            "bbox": BBOX_STR,
            "bboxSR": "104905",
            "imageSR": "104905",
            "size": "2400,2400",
            "format": "png",
            "f": "image",
        }
        r = fetch_with_retry(session, "GET", url, params=params, timeout=60)
        out_path = RAW_DIR / "hirise_ortho.png"
        out_path.write_bytes(r.content)
        record(
            manifest,
            dataset="trek_hirise_ortho_fallback",
            local_path=out_path,
            url=r.url,
            status=r.status_code,
            byte_count=len(r.content),
            sha256=sha256_bytes(r.content),
            note="2400x2400 single-export PNG fallback",
        )


def download_themis_ti(session: requests.Session, manifest: list[dict[str, Any]]) -> None:
    print("[4/6] USGS THEMIS 100 m/px quantitative thermal inertia (S3 ranged ISIS3 tiles)...")
    cub_url = "https://asc-astropedia.s3.us-west-2.amazonaws.com/Mars/Odyssey/THEMIS-Global-Thermal-Inertia-Mosaic/Quantitative-32-Bit/THEMIS_TI_Mosaic_Quant_30S120E_100mpp.cub"
    hdr_resp = fetch_with_retry(session, "GET", cub_url, headers={"Range": "bytes=0-65535"})
    label_path = RAW_DIR / "THEMIS_TI_30S120E_label.txt"
    label_text = hdr_resp.content.decode("latin1", errors="ignore")
    end_pos = label_text.find("\nEnd\n")
    if end_pos == -1:
        end_pos = label_text.find("End\r\n")
    clean_label = label_text[: end_pos + 5] if end_pos != -1 else label_text[:8192]
    label_path.write_text(clean_label, encoding="utf-8")

    def parse_int(key: str) -> int:
        m = re.search(rf"\b{key}\s*=\s*(\d+)", clean_label)
        if not m:
            raise ValueError(f"Missing {key} in ISIS label")
        return int(m.group(1))

    def parse_float(key: str) -> float:
        m = re.search(rf"\b{key}\s*=\s*([-+]?\d+(?:\.\d+)?)", clean_label)
        if not m:
            raise ValueError(f"Missing {key} in ISIS label")
        return float(m.group(1))

    start_byte_0 = parse_int("StartByte") - 1
    tile_w = parse_int("TileSamples")
    tile_h = parse_int("TileLines")
    samples = parse_int("Samples")
    lines = parse_int("Lines")
    ul_x = parse_float("UpperLeftCornerX")
    ul_y = parse_float("UpperLeftCornerY")
    res_m = parse_float("PixelResolution")

    n_tx = math.ceil(samples / tile_w)
    tile_bytes = tile_w * tile_h * 4  # 32-bit float LSB

    # Compute pixel bounds covering OPS_BOX in SimpleCylindrical meters (CenterLon=0)
    x_min = OPS_BOX["west"] * METERS_PER_DEG
    x_max = OPS_BOX["east"] * METERS_PER_DEG
    y_max = OPS_BOX["north"] * METERS_PER_DEG
    y_min = OPS_BOX["south"] * METERS_PER_DEG

    c0 = max(0, int(math.floor((x_min - ul_x) / res_m)))
    c1 = min(samples, int(math.ceil((x_max - ul_x) / res_m)))
    r0 = max(0, int(math.floor((ul_y - y_max) / res_m)))
    r1 = min(lines, int(math.ceil((ul_y - y_min) / res_m)))

    tx0, tx1 = c0 // tile_w, (c1 - 1) // tile_w
    ty0, ty1 = r0 // tile_h, (r1 - 1) // tile_h

    sub_w = (tx1 - tx0 + 1) * tile_w
    sub_h = (ty1 - ty0 + 1) * tile_h
    sub = np.empty((sub_h, sub_w), dtype=np.float32)

    fetched_ranges: list[str] = []
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            tile_idx = ty * n_tx + tx
            off = start_byte_0 + tile_idx * tile_bytes
            rng = f"bytes={off}-{off + tile_bytes - 1}"
            tr = fetch_with_retry(session, "GET", cub_url, headers={"Range": rng})
            tile_arr = np.frombuffer(tr.content, dtype="<f4").reshape((tile_h, tile_w))
            y_off = (ty - ty0) * tile_h
            x_off = (tx - tx0) * tile_w
            sub[y_off : y_off + tile_h, x_off : x_off + tile_w] = tile_arr
            fetched_ranges.append(rng)

    # Crop exact native 100 m cells overlapping ops box
    lc0 = c0 - tx0 * tile_w
    lc1 = c1 - tx0 * tile_w
    lr0 = r0 - ty0 * tile_h
    lr1 = r1 - ty0 * tile_h
    native_crop = sub[lr0:lr1, lc0:lc1].copy()

    # Replace ISIS3 special pixels (< -1e20) with NaN
    native_crop[native_crop < -1e20] = np.nan
    native_crop[native_crop <= 0] = np.nan

    # Sample nearest native 100 m cell for an exact 60x60 ops-box grid (100 m display)
    # and store metadata
    lat_centers = np.linspace(OPS_BOX["north"], OPS_BOX["south"], 60, endpoint=False) - (
        (OPS_BOX["north"] - OPS_BOX["south"]) / 120.0
    )
    lon_centers = np.linspace(OPS_BOX["west"], OPS_BOX["east"], 60, endpoint=False) + (
        (OPS_BOX["east"] - OPS_BOX["west"]) / 120.0
    )
    rr = np.clip(
        np.floor((ul_y - lat_centers[:, None] * METERS_PER_DEG) / res_m).astype(int) - r0,
        0,
        native_crop.shape[0] - 1,
    )
    cc = np.clip(
        np.floor((lon_centers[None, :] * METERS_PER_DEG - ul_x) / res_m).astype(int) - c0,
        0,
        native_crop.shape[1] - 1,
    )
    grid_60 = native_crop[rr, cc].astype(np.float32)

    ti_tif = RAW_DIR / "themis_ti_100m.tif"
    tifffile.imwrite(ti_tif, grid_60)

    ti_meta = {
        "source_cub": cub_url,
        "native_crop_shape": list(native_crop.shape),
        "ops_60x60_shape": list(grid_60.shape),
        "tiles_fetched": len(fetched_ranges),
        "ranges": fetched_ranges,
        "units": "J m^-2 K^-1 s^-1/2 (TIU)",
        "valid_pixels": int(np.isfinite(grid_60).sum()),
        "min_ti": float(np.nanmin(grid_60)),
        "max_ti": float(np.nanmax(grid_60)),
        "mean_ti": float(np.nanmean(grid_60)),
    }
    (RAW_DIR / "themis_ti_meta.json").write_text(json.dumps(ti_meta, indent=2), encoding="utf-8")
    record(
        manifest,
        dataset="usgs_themis_ti_100m",
        local_path=ti_tif,
        url=cub_url,
        status=206,
        byte_count=ti_tif.stat().st_size,
        sha256=sha256_file(ti_tif),
        note=f"Extracted via {len(fetched_ranges)} HTTP 206 S3 ranges; TI min={ti_meta['min_ti']:.1f}, max={ti_meta['max_ti']:.1f}",
    )
    print(f"  Extracted 60x60 THEMIS TI: min={ti_meta['min_ti']:.1f}, max={ti_meta['max_ti']:.1f} TIU")


def parse_envi_map_info(hdr_text: str) -> dict[str, float]:
    m = re.search(r"samples\s*=\s*(\d+)", hdr_text)
    samples = int(m.group(1))
    m = re.search(r"lines\s*=\s*(\d+)", hdr_text)
    lines = int(m.group(1))
    m = re.search(r"map info\s*=\s*\{([^}]+)\}", hdr_text)
    parts = [p.strip() for p in m.group(1).split(",")]
    # {proj, x_px_1based, y_px_1based, ul_x, ul_y, dx, dy, ...}
    ref_x = float(parts[1]) - 1.0
    ref_y = float(parts[2]) - 1.0
    x0 = float(parts[3])
    y0 = float(parts[4])
    dx = float(parts[5])
    dy = float(parts[6])
    ul_x = x0 - ref_x * dx
    ul_y = y0 + ref_y * dy
    return {"samples": samples, "lines": lines, "ul_x": ul_x, "ul_y": ul_y, "dx": dx, "dy": dy}


def warp_crism_to_ops(png_path: Path, map_info: dict[str, float], out_size: int = 1200) -> Image.Image:
    src = np.array(Image.open(png_path).convert("RGB"))
    # Generate target grid coordinates in Equidistant_Cylindrical meters (std_parallel=0)
    lons = np.linspace(OPS_BOX["west"], OPS_BOX["east"], out_size, endpoint=False) + (
        (OPS_BOX["east"] - OPS_BOX["west"]) / (2 * out_size)
    )
    lats = np.linspace(OPS_BOX["north"], OPS_BOX["south"], out_size, endpoint=False) - (
        (OPS_BOX["north"] - OPS_BOX["south"]) / (2 * out_size)
    )
    tx_m = lons[None, :] * METERS_PER_DEG
    ty_m = lats[:, None] * METERS_PER_DEG

    col = np.floor((tx_m - map_info["ul_x"]) / map_info["dx"]).astype(int)
    row = np.floor((map_info["ul_y"] - ty_m) / map_info["dy"]).astype(int)

    in_bounds = (
        (col >= 0)
        & (col < map_info["samples"])
        & (row >= 0)
        & (row < map_info["lines"])
    )
    col_c = np.clip(col, 0, int(map_info["samples"]) - 1)
    row_c = np.clip(row, 0, int(map_info["lines"]) - 1)

    rgb = src[row_c, col_c]
    # PDS MTRDR browse PNGs use black (0,0,0) for outside-footprint nodata
    valid = in_bounds & (rgb.sum(axis=2) > 12)
    rgba = np.zeros((out_size, out_size, 4), dtype=np.uint8)
    rgba[..., :3] = rgb
    rgba[valid, 3] = 255
    return Image.fromarray(rgba, mode="RGBA")


def download_crism_mtrdr(session: requests.Session, manifest: list[dict[str, Any]]) -> None:
    print("[5/6] PDS ODE / PDS Geosciences CRISM MTRDR (18 m/px mineral indicators)...")
    CRISM_DIR.mkdir(parents=True, exist_ok=True)
    ode_url = "https://oderest.rsl.wustl.edu/live2/"
    params = {
        "target": "mars",
        "query": "product",
        "results": "cmf",
        "ihid": "MRO",
        "iid": "CRISM",
        "pt": "MTRDR",
        "minlat": OPS_BOX["south"],
        "maxlat": OPS_BOX["north"],
        "westernlon": OPS_BOX["west"],
        "easternlon": OPS_BOX["east"],
        "output": "JSON",
    }
    r = fetch_with_retry(session, "GET", ode_url, params=params, timeout=45)
    ode_path = RAW_DIR / "ode_crism_mtrdr.json"
    ode_path.write_bytes(r.content)
    record(
        manifest,
        dataset="pds_ode_crism_mtrdr_search",
        local_path=ode_path,
        url=r.url,
        status=r.status_code,
        byte_count=len(r.content),
        sha256=sha256_bytes(r.content),
    )

    ode_data = r.json()
    prods = ode_data.get("ODEResults", {}).get("Products", {}).get("Product", [])
    if isinstance(prods, dict):
        prods = [prods]

    # Sort so products covering the full ops box come first (prefer FRT000058A3)
    def cov_score(p: dict[str, Any]) -> tuple[int, float]:
        min_lat = float(p.get("Minimum_latitude", 0))
        max_lat = float(p.get("Maximum_latitude", 0))
        min_lon = float(p.get("Westernmost_longitude", 0))
        max_lon = float(p.get("Easternmost_longitude", 0))
        full = int(
            min_lon <= OPS_BOX["west"]
            and max_lon >= OPS_BOX["east"]
            and min_lat <= OPS_BOX["south"]
            and max_lat >= OPS_BOX["north"]
        )
        overlap_w = max(0.0, min(max_lon, OPS_BOX["east"]) - max(min_lon, OPS_BOX["west"]))
        overlap_h = max(0.0, min(max_lat, OPS_BOX["north"]) - max(min_lat, OPS_BOX["south"]))
        return (full, overlap_w * overlap_h)

    prods.sort(key=cov_score, reverse=True)
    chosen = prods[0]
    pfiles = chosen.get("Product_files", {}).get("Product_file", [])
    if isinstance(pfiles, dict):
        pfiles = [pfiles]

    wanted = {}
    for pf in pfiles:
        fname = pf.get("FileName", "").upper()
        url = pf.get("URL", "")
        for tag in ("BRHYDJ", "BRPHYJ", "BRFALJ"):
            if f"_{tag}_MTR3.PNG" in fname:
                wanted[f"{tag}_PNG"] = url
            elif f"_{tag}_MTR3.HDR" in fname:
                wanted[f"{tag}_HDR"] = url

    warped_layers: dict[str, np.ndarray] = {}
    for tag in ("BRHYDJ", "BRPHYJ", "BRFALJ"):
        png_url = wanted.get(f"{tag}_PNG")
        hdr_url = wanted.get(f"{tag}_HDR")
        if not png_url or not hdr_url:
            continue
        pr = fetch_with_retry(session, "GET", png_url, timeout=45)
        hr = fetch_with_retry(session, "GET", hdr_url, timeout=45)
        png_local = CRISM_DIR / f"{tag}.png"
        hdr_local = CRISM_DIR / f"{tag}.hdr"
        png_local.write_bytes(pr.content)
        hdr_local.write_text(hr.text, encoding="utf-8", errors="ignore")
        record(
            manifest,
            dataset=f"pds_crism_{tag.lower()}",
            local_path=png_local,
            url=png_url,
            status=pr.status_code,
            byte_count=len(pr.content),
            sha256=sha256_bytes(pr.content),
            note=f"Observation {chosen.get('pdsid') or png_url.split('/')[-2]}",
        )
        minfo = parse_envi_map_info(hr.text)
        warped_im = warp_crism_to_ops(png_local, minfo, out_size=1200)
        warped_im.save(CRISM_DIR / f"{tag}_ops.png")
        warped_layers[tag] = np.array(warped_im)
        print(f"  Downloaded + warped {tag} ({int((warped_layers[tag][:,:,3] > 0).mean() * 100)}% ops coverage)")

    # Build a clean mineral-indicator composite for the map overlay:
    # Emphasize strong HYD (sulfates/hydrated: R/G/B contrast) + PHY (clays) over subtle FAL context
    if "BRHYDJ" in warped_layers and "BRPHYJ" in warped_layers:
        hyd = warped_layers["BRHYDJ"].astype(np.float32)
        phy = warped_layers["BRPHYJ"].astype(np.float32)
        valid = (hyd[..., 3] > 0) | (phy[..., 3] > 0)

        # In CRISM HYD browse (R=SINDEX2, G=BD2100_2, B=BD1900_2), bright/colorful pixels indicate hydrated sulfates.
        # In PHY browse (R=D2300, G=D2200, B=BD1900R2), red/green/cyan indicate phyllosilicates.
        hyd_strength = np.clip((hyd[..., :3].max(axis=2) - 25.0) / 180.0, 0.0, 1.0)
        phy_strength = np.clip((phy[..., :3].max(axis=2) - 25.0) / 180.0, 0.0, 1.0)

        out = np.zeros((1200, 1200, 4), dtype=np.uint8)
        # Blend HYD (hydrated sulfates) and PHY (smectite clays) cleanly
        blend_rgb = np.clip(0.65 * hyd[..., :3] + 0.35 * phy[..., :3], 0, 255).astype(np.uint8)
        alpha = np.where(
            valid,
            np.clip(70 + 165 * np.maximum(hyd_strength, phy_strength), 0, 225),
            0,
        ).astype(np.uint8)
        out[..., :3] = blend_rgb
        out[..., 3] = alpha
        comp_path = RAW_DIR / "crism_minerals.png"
        Image.fromarray(out, mode="RGBA").save(comp_path, optimize=True)
        print(f"  Composited crism_minerals.png ({comp_path.stat().st_size // 1024} KB)")


def download_geology_sim3292(session: requests.Session, manifest: list[dict[str, Any]]) -> None:
    print("[6/6] USGS SIM 3292 geologic units (GeoJSON + Trek raster)...")
    geo_url = "https://astrogeology.usgs.gov/pygeoapi/collections/mars/sim3292_global_geologic_map/units/items"
    r = fetch_with_retry(
        session,
        "GET",
        geo_url,
        params={"f": "json", "bbox": BBOX_STR},
        timeout=30,
    )
    gj_path = RAW_DIR / "sim3292_units.geojson"
    gj_path.write_bytes(r.content)
    gj = r.json()
    units = [f.get("properties", {}).get("unit") for f in gj.get("features", [])]
    record(
        manifest,
        dataset="usgs_sim3292_geojson",
        local_path=gj_path,
        url=r.url,
        status=r.status_code,
        byte_count=len(r.content),
        sha256=sha256_bytes(r.content),
        note=f"units={units}",
    )

    trek_geo_url = "https://trek.nasa.gov/mars/trekarcgis/rest/services/SIM3292_Global_Geology/MapServer/export"
    tr = fetch_with_retry(
        session,
        "GET",
        trek_geo_url,
        params={
            "bbox": BBOX_STR,
            "bboxSR": "104905",
            "imageSR": "104905",
            "size": "1200,1200",
            "format": "png32",
            "transparent": "true",
            "f": "image",
        },
        timeout=30,
    )
    png_path = RAW_DIR / "sim3292_geology.png"
    png_path.write_bytes(tr.content)
    record(
        manifest,
        dataset="trek_sim3292_geology_png",
        local_path=png_path,
        url=tr.url,
        status=tr.status_code,
        byte_count=len(tr.content),
        sha256=sha256_bytes(tr.content),
    )
    print(f"  Saved SIM 3292 units={units}")


def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    manifest: list[dict[str, Any]] = []
    with requests.Session() as session:
        session.headers.update({"User-Agent": "RedSight-NASA-SpaceApps-2026/1.0"})
        download_stac_metadata(session, manifest)
        download_trek_dem(session, manifest)
        download_hirise_ortho(session, manifest)
        download_themis_ti(session, manifest)
        download_crism_mtrdr(session, manifest)
        download_geology_sim3292(session, manifest)

    manifest_path = PROCESSED_DIR / "download_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"All downloads complete. Manifest saved to {manifest_path}")


if __name__ == "__main__":
    main()

