import hashlib
import json

import numpy as np
import rasterio
from rasterio.transform import from_origin
from rasterio.warp import transform

from engine.export import MARS_GEOGRAPHIC_CRS, SUPPORTED_STOPS, build_real_routes, _remove_stale_route_payload
from engine.cli import build_summary


def test_synthetic_native_slope_manifest_drives_all_five_stop_exports(tmp_path):
    crs = "+proj=eqc +R=3396190 +units=m +no_defs"
    affine = from_origin(8_140_000, -280_000, 10, 10)
    dem_path = tmp_path / "mean-elevation.tif"
    elevations = np.full((30, 30), -3600.0, dtype=np.float32)
    with rasterio.open(dem_path, "w", driver="GTiff", width=30, height=30, count=1,
                       dtype="float32", crs=crs, transform=affine, nodata=-9999) as ds:
        ds.write(elevations, 1)
    dem_hash = hashlib.sha256(dem_path.read_bytes()).hexdigest()
    input_manifest = tmp_path / "input.json"
    input_manifest.write_text(json.dumps({
        "scope_box_lonlat_east_positive_planetocentric_deg": [137.0, -5.0, 138.0, -4.0],
        "inputs": [{
            "role": "Primary HiRISE DTM", "local_crop": str(dem_path),
            "local_crop_sha256": dem_hash, "local_crop_bytes": dem_path.stat().st_size,
            "source_url": "https://example.invalid/fixture-dem.tif", "license": "CC0-1.0",
        }],
        "coverage": {"shape_hw": [30, 30]},
    }))

    slope_path = tmp_path / "native-horn-max.tif"
    slopes = np.zeros((30, 30), dtype=np.float32)
    slopes[5, 5] = 18.0
    with rasterio.open(slope_path, "w", driver="GTiff", width=30, height=30, count=1,
                       dtype="float32", crs=crs, transform=affine, nodata=-9999) as ds:
        ds.write(slopes, 1)
    slope_hash = hashlib.sha256(slope_path.read_bytes()).hexdigest()
    native_manifest = tmp_path / "native.json"
    native_manifest.write_text(json.dumps({
        "native_hard_slope": {
            "local_path": str(slope_path), "sha256": slope_hash,
            "bytes": slope_path.stat().st_size, "units": "degrees",
            "algorithm": "Horn 3x3", "aggregation": "maximum",
            "source_resolution_m": 1.0, "planning_resolution_m": 10.0,
            "source_url": "https://example.invalid/source-dem.tif", "license": "CC0-1.0",
        },
        "s1_landmark_alignment": {"status": "synthetic-fixture", "pixel_delta": 0},
    }))

    stops = []
    target_cells = [(10, 11), (11, 10), (12, 10), (10, 12), (13, 10)]
    with rasterio.open(dem_path) as ds:
        for stop_id, cell in zip(SUPPORTED_STOPS, target_cells):
            x, y = ds.xy(*cell, offset="center")
            lon, lat = transform(ds.crs, MARS_GEOGRAPHIC_CRS, [x], [y])
            stops.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lon[0], lat[0]]},
                "properties": {"id": stop_id, "name": stop_id},
            })
    stops_path = tmp_path / "stops.json"
    stops_path.write_text(json.dumps({"type": "FeatureCollection", "features": stops}))

    result = build_real_routes(
        input_manifest=input_manifest,
        native_hazard_manifest=native_manifest,
        constants_path="app/public/data/constants.json",
        stops_path=stops_path,
        output_dir=tmp_path / "out",
        habitat_row_col=(10, 10),
    )

    summary = build_summary(result)
    assert summary["status"] == "complete"
    assert summary["files_written"] == 15
    assert len(result["route_index"]["routes"]) == 10
    assert result["manifest"]["s1_landmark_alignment"]["status"] == "synthetic-fixture"
    constants = json.loads((tmp_path / "out/constants.json").read_text())
    assert all("source_url" in item for item in constants.values())
    metadata = json.loads((tmp_path / "out/meta.json").read_text())
    assert metadata["routing_coverage"]["slope_aggregation"].startswith("Horn 3x3 maximum")
    for stop_id in SUPPORTED_STOPS:
        for mode in ("fastest", "safest"):
            route = json.loads((tmp_path / "out/routes" / f"{stop_id}_{mode}_2_15.json").read_text())
            assert route["constants_hash"] == metadata["constants_hash"]
            assert route["primary_crop_sha256"] == dem_hash


def test_only_the_allowlisted_unreachable_route_payload_is_removed(tmp_path):
    route_path = tmp_path / "routes" / "S1_fastest_2_15.json"
    route_path.parent.mkdir()
    route_path.write_text("stale mock path")

    assert _remove_stale_route_payload(route_path) is True
    assert route_path.exists() is False
    assert _remove_stale_route_payload(route_path) is False
