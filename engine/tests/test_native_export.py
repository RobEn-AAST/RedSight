import pytest
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
    tiepoint_path = tmp_path / "tiepoint.json"
    tiepoint_path.write_text('{"residual_m":4.1}\n')
    review_path = tmp_path / "independent-review.md"
    review_path.write_text("Independent bounded local visual review.\n")
    tiepoint_hash = hashlib.sha256(tiepoint_path.read_bytes()).hexdigest()
    review_hash = hashlib.sha256(review_path.read_bytes()).hexdigest()
    native_manifest = tmp_path / "native.json"
    native_manifest.write_text(json.dumps({
        "native_hard_slope": {
            "local_path": str(slope_path), "sha256": slope_hash,
            "bytes": slope_path.stat().st_size, "units": "degrees",
            "algorithm": "Horn 3x3", "aggregation": "maximum",
            "source_resolution_m": 1.0, "planning_resolution_m": 10.0,
            "source_url": "https://example.invalid/source-dem.tif", "license": "CC0-1.0",
        },
        "s1_landmark_alignment": {
            "status": "bounded_qualitative_local_landmark_pass_moderate_confidence",
            "feature_id": "K1", "apparent_residual_m": 4.1,
            "subjective_pick_uncertainty_m": 6.8,
            "local_path": str(tiepoint_path), "sha256": tiepoint_hash,
            "verified_evidence_files": [
                {"role": "tiepoint_json", "path": str(tiepoint_path), "sha256": tiepoint_hash},
                {"role": "independent_visual_review", "path": str(review_path), "sha256": review_hash},
            ],
        },
    }))

    native_dem_path = tmp_path / "primary-native.tif"
    native_elevation = np.full((300, 300), -3600.0, dtype=np.float32)
    with rasterio.open(native_dem_path, "w", driver="GTiff", width=300, height=300, count=1,
                       dtype="float32", crs=crs, transform=from_origin(8_140_000, -280_000, 1, 1),
                       nodata=-9999) as ds:
        ds.write(native_elevation, 1)
    native_dem_hash = hashlib.sha256(native_dem_path.read_bytes()).hexdigest()
    input_manifest_data = json.loads(input_manifest.read_text())
    input_manifest_data["native_routing"] = {
        "artifact": str(native_dem_path), "sha256": native_dem_hash,
        "bytes": native_dem_path.stat().st_size, "resolution_m": 1.0,
        "source_url": "https://example.invalid/fixture-native-dem.tif", "license": "CC0-1.0",
    }
    input_manifest.write_text(json.dumps(input_manifest_data))

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
    assert result["manifest"]["s1_landmark_alignment"]["status"] == "bounded_qualitative_local_landmark_pass_moderate_confidence"
    assert result["manifest"]["pilot_gates"]["G2"]["status"] == "pass_bounded_qualitative_local_landmark"
    assert result["manifest"]["pilot_gates"]["G2"]["feature_id"] == "K1"
    assert result["manifest"]["pilot_gates"]["G2"]["global_registration_established"] is False
    assert result["manifest"]["output_sha256"]["routes/index.json"]
    constants = json.loads((tmp_path / "out/constants.json").read_text())
    assert all("source_url" in item for item in constants.values())
    metadata = json.loads((tmp_path / "out/meta.json").read_text())
    assert metadata["routing_coverage"]["slope_aggregation"].startswith("Horn 3x3 maximum")
    for stop_id in SUPPORTED_STOPS:
        for mode in ("fastest", "safest"):
            route = json.loads((tmp_path / "out/routes" / f"{stop_id}_{mode}_2_15.json").read_text())
            assert route["constants_hash"] == metadata["constants_hash"]
            assert route["primary_crop_sha256"] == dem_hash
            assert route["goal_access"]["status"] == "approach_only"
            assert route["goal_access"]["badge"] == "Derived"
            assert route["goal_access"]["last_leg_modeled"] is False
            assert route["goal_access"]["offset_m"] <= 10.0
            assert route["goal_access"]["endpoint_lonlat"] == route["coords"][-1]
            assert route["goal_access"]["observed_stop_lonlat"] == route["observed_stop_lonlat"]
            assert len(route["coords"]) == len(route["cum"]["t_s"])
            assert len(route["coords"]) == len(route["back"]["o2_l"])
            assert "back_fast" not in route
            assert result["manifest"]["output_sha256"][f"routes/{stop_id}_{mode}_2_15.json"] == hashlib.sha256(
                (tmp_path / "out/routes" / f"{stop_id}_{mode}_2_15.json").read_bytes()
            ).hexdigest()


def test_only_the_allowlisted_unreachable_route_payload_is_removed(tmp_path):
    route_path = tmp_path / "routes" / "S1_fastest_2_15.json"
    route_path.parent.mkdir()
    route_path.write_text("stale mock path")

    assert _remove_stale_route_payload(route_path) is True
    assert route_path.exists() is False
    assert _remove_stale_route_payload(route_path) is False


def test_back_fast_takes_the_shorter_way_home_from_a_detour():
    from rasterio.transform import from_origin as origin
    from engine.model.native_grid import build_native_routing_graph
    from engine.route.native import back_fast_arrays, fastest_home_field, native_route_arrays

    constants = {"slope_limit_foot_deg": 15.0, "body_mass_kg": 82.0, "carried_load_kg": 15.0,
                 "suit_factor_kappa": 1.3, "watts_to_o2_ml_per_min": 2.9, "walk_speed_kmh": 1.6}
    elevation = np.zeros((5, 6), dtype=np.float32)
    graph = build_native_routing_graph(
        elevation, np.zeros_like(elevation), transform=origin(8_140_000, -280_000, 1, 1),
        crs="+proj=eqc +R=3396190 +units=m +no_defs", resolution_m=1.0, slope_limit_deg=15.0,
        body_mass_kg=82.0, load_kg=15.0, kappa=1.3, watts_to_o2_ml_per_min=2.9, max_speed_mps=1.6 / 3.6,
    )
    home = (0, 0)
    # U-shaped detour: down column 0, along row 4, up column 5 to (0, 5).
    cells = [(r, 0) for r in range(5)] + [(4, c) for c in range(1, 6)] + [(r, 5) for r in range(3, -1, -1)]
    nodes = [graph.node(cell) for cell in cells]
    arrays = native_route_arrays(graph, nodes, constants=constants)
    fast = back_fast_arrays(graph, nodes, home=home, field=fastest_home_field(graph, home=home), constants=constants)
    assert len(fast["t_s"]) == len(nodes)
    assert fast["t_s"][0] == 0.0
    assert all(t <= b + 1e-9 for t, b in zip(fast["t_s"], arrays["back"]["t_s"]))
    # From (0, 5) the fastest way home is 5 straight 1 m edges, far shorter than the 13 m route back.
    assert fast["t_s"][-1] == pytest.approx(5 / (1.6 / 3.6), rel=1e-6)
    assert fast["t_s"][-1] < 0.5 * arrays["back"]["t_s"][-1]
    assert fast["o2_l"][-1] < 0.5 * arrays["back"]["o2_l"][-1]
    assert fast["path"][-1][0] == pytest.approx(arrays["coords"][-1], abs=1e-6)
    assert fast["path"][-1][-1] == pytest.approx(arrays["coords"][0], abs=1e-6)
    assert len(fast["path"][-1]) == 2  # a straight walk simplifies to its two ends
    # The 13 m route is shorter than the 25 m key spacing: only the first and last points store a path.
    assert fast["path_from"] == [0, len(nodes) - 1] and len(fast["path"]) == 2
    dense = back_fast_arrays(graph, nodes, home=home, field=fastest_home_field(graph, home=home),
                             constants=constants, path_spacing_m=0)
    assert dense["path_from"] == list(range(len(nodes))) and dense["t_s"] == fast["t_s"]
