"""Run a deterministic real-DTM pilot and write only Ali-owned contract artifacts."""

from datetime import date, datetime
import hashlib
import json
import math
import resource
from collections import Counter
from pathlib import Path
import platform
from time import perf_counter
from zoneinfo import ZoneInfo

import numpy as np
import rasterio
from rasterio.features import shapes
from rasterio.warp import transform, transform_geom
from scipy import __version__ as scipy_version
from scipy.sparse.csgraph import connected_components

from engine.data.hazard import read_native_hard_slope
from engine.data.native_routing import NATIVE_ROUTING_MARGIN_M, build_bounded_native_routing_inputs
from engine.data.raster import read_primary_dem, sha256_file
from engine.model.constants import read_constants
from engine.model.grid import build_graph
from engine.model.native_grid import select_access_goal
from engine.route.native import (
    back_fast_arrays,
    dijkstra_field as native_dijkstra_field,
    fastest_home_field,
    path_from_field,
)
from engine.route.pnr import point_of_no_return


MARS_GEOGRAPHIC_CRS = "+proj=longlat +R=3396190 +no_defs"
SUPPORTED_STOPS = ("S1", "S2", "S3", "D1", "D2")


def _json_bytes(value):
    return (json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n").encode("utf-8")


def _write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(_json_bytes(value))


def _remove_stale_route_payload(path: Path):
    """Remove only an Ali-owned payload whose supported stop/mode is now explicitly unreachable."""
    if path.is_file():
        path.unlink()
        return True
    return False


def _read_manifest(manifest_path):
    path = Path(manifest_path).resolve()
    raw = path.read_bytes()
    return json.loads(raw), hashlib.sha256(raw).hexdigest()


def _parse_timestamp(value):
    if not value:
        return None
    result = datetime.fromisoformat(str(value))
    if result.tzinfo is None:
        result = result.replace(tzinfo=ZoneInfo("Africa/Cairo"))
    return result


def _pilot_timing(acquisition, build_started, build_completed, build_runtime_s):
    start = _parse_timestamp(acquisition.get("first_recorded_primary_STAC_response"))
    cache_ready = _parse_timestamp(acquisition.get("input_cache_ready"))
    result = {
        "acquisition_timing": acquisition,
        "build_started_at": build_started.isoformat(timespec="seconds"),
        "build_completed_at": build_completed.isoformat(timespec="seconds"),
        "build_runtime_seconds": round(float(build_runtime_s), 3),
        "g4_threshold_seconds": 3 * 60 * 60,
    }
    if start is None:
        result.update({"g4_status": "unverified", "elapsed_seconds": None})
        return result
    elapsed = (build_completed - start).total_seconds()
    result.update({
        "pilot_started_at": start.isoformat(timespec="seconds"),
        "input_cache_ready_at": cache_ready.isoformat(timespec="seconds") if cache_ready else None,
        "pilot_completed_at": build_completed.isoformat(timespec="seconds"),
        "elapsed_seconds": round(elapsed, 3),
        "interval_scope": "first recorded STAC response through native-slope engine outputs; request began shortly before the recorded response, so this is a lower-bound wall interval",
        "g4_status": "pass" if 0 <= elapsed <= 3 * 60 * 60 else "failed",
    })
    return result


def _handoff_sources(manifest, primary_dem):
    result = {
        "manifest_sha256": primary_dem.manifest_sha256,
        "route_dem": {
            "source_url": primary_dem.source_url,
            "license": primary_dem.license,
            "local_path": primary_dem.source_path,
            "local_crop_sha256": primary_dem.local_crop_sha256,
            "source_asset_sha256": "not computed; the full COG was not retained after HTTP range reads",
            "resolution_m": [primary_dem.resolution_x_m, primary_dem.resolution_y_m],
            "valid_cells": int(primary_dem.valid.sum()),
            "total_cells": int(primary_dem.valid.size),
            "valid_fraction": float(primary_dem.valid.mean()),
            "role": "primary DTM only; retained native coverage mask",
        },
    }
    for item in manifest.get("inputs", []):
        if item.get("role") == "Primary HiRISE DTM":
            continue
        if item.get("role") == "Complementary HiRISE DTM filling primary nodata":
            path = Path(item["local_crop"]).resolve()
            digest = sha256_file(path)
            if item.get("local_crop_sha256") and digest != item["local_crop_sha256"]:
                raise ValueError("complementary DTM checksum does not match the handoff manifest")
            with rasterio.open(primary_dem.source_path) as pds, rasterio.open(path) as cds:
                if pds.shape != cds.shape or pds.transform != cds.transform or pds.crs != cds.crs:
                    raise ValueError("complementary DTM crop is not on the primary planning grid")
                pa = pds.read(1, masked=True)
                ca = cds.read(1, masked=True)
                overlap = ~np.ma.getmaskarray(pa) & ~np.ma.getmaskarray(ca)
                delta = ca.data[overlap].astype(np.float64) - pa.data[overlap].astype(np.float64)
            if delta.size:
                result["seam_check"] = {
                    "overlap_cells": int(delta.size),
                    "complement_minus_primary_m": {
                        "median": float(np.median(delta)),
                        "p10": float(np.percentile(delta, 10)),
                        "p90": float(np.percentile(delta, 90)),
                        "absolute_p90": float(np.percentile(np.abs(delta), 90)),
                        "absolute_max": float(np.max(np.abs(delta))),
                    },
                    "route_policy": "exclude complementary-only pixels; do not blend the detected scene offset into slope or route costs",
                    "complementary_source_url": item.get("source_url", ""),
                    "complementary_license": item.get("license", ""),
                    "complementary_crop_sha256": digest,
                }
        elif item.get("role") == "Matching ortho context for landmark check":
            path = Path(item["local_crop"]).resolve()
            digest = sha256_file(path)
            if item.get("local_crop_sha256") and digest != item["local_crop_sha256"]:
                raise ValueError("ortho crop checksum does not match the handoff manifest")
            result["ortho_context"] = {
                "source_url": item.get("source_url", ""),
                "license": item.get("license", ""),
                "local_path": str(path),
                "local_crop_sha256": digest,
                "valid_pixel_percent": item.get("valid_pixel_percent"),
                "extent": item.get("extent"),
                "used_for_routing": False,
            }
    coverage = manifest.get("coverage", {})
    mosaic_path = coverage.get("mosaic")
    if mosaic_path:
        mosaic_path = Path(mosaic_path).resolve()
        mosaic_hash = sha256_file(mosaic_path)
        if coverage.get("sha256") and mosaic_hash != coverage["sha256"]:
            raise ValueError("coverage mosaic checksum does not match the handoff manifest")
        result["mosaic_reference"] = {
            "local_path": str(mosaic_path),
            "local_sha256": mosaic_hash,
            "shape_hw": coverage.get("shape_hw"),
            "valid_percent": coverage.get("valid_percent"),
            "used_for_routing": False,
        }
    return result


def _coords_to_cell(lon, lat, dem):
    x, y = transform(MARS_GEOGRAPHIC_CRS, dem.crs, [lon], [lat])
    return rasterio.transform.rowcol(dem.transform, x[0], y[0])


def _cell_lonlat(row, col, dem):
    x, y = rasterio.transform.xy(dem.transform, row, col, offset="center")
    lon, lat = transform(dem.crs, MARS_GEOGRAPHIC_CRS, [x], [y])
    return [float(lon[0]), float(lat[0])]


def _read_stops(stops_path, dem):
    data = json.loads(Path(stops_path).read_text())
    by_id = {}
    for feature in data.get("features", []):
        props = feature.get("properties", {})
        stop_id = props.get("id")
        if stop_id not in SUPPORTED_STOPS:
            continue
        lon, lat = feature["geometry"]["coordinates"][:2]
        row, col = _coords_to_cell(lon, lat, dem)
        if not (0 <= row < dem.height and 0 <= col < dem.width):
            raise ValueError(f"supported stop {stop_id} lies outside the primary DTM crop")
        if not dem.valid[row, col]:
            raise ValueError(f"supported stop {stop_id} falls on primary DTM nodata")
        by_id[stop_id] = {
            "id": stop_id,
            "name": props.get("name", stop_id),
            "lonlat": [float(lon), float(lat)],
            "cell": (int(row), int(col)),
        }
    missing = sorted(set(SUPPORTED_STOPS) - set(by_id))
    if missing:
        raise ValueError(f"stops contract is missing supported stops: {', '.join(missing)}")
    return by_id


def _choose_habitat(dem, graph, stops):
    s1 = stops["S1"]["cell"]
    sr, sc = s1
    rows, cols = np.indices(graph.shape)
    resolution = dem.resolution_m
    distance = np.hypot((rows - sr) * resolution, (cols - sc) * resolution)
    north = (sr - rows) * resolution
    candidates = (
        graph.valid
        & (distance >= 150.0)
        & (distance <= 600.0)
        & (north >= 100.0)
        & (dem.elevation_m < dem.elevation_m[sr, sc])
    )
    choices = np.argwhere(candidates)
    if not len(choices):
        raise ValueError("no walkable habitat candidate lies 150–600 m north and downslope of S1")
    scores = [
        (float(graph.slope_max_deg[r, c]), float(distance[r, c]), int(r), int(c))
        for r, c in choices
    ]
    _, labels = connected_components(graph.time_csr, directed=True, connection="weak")
    valid_stop_components = [
        int(labels[graph.node(stops[stop_id]["cell"])])
        for stop_id in SUPPORTED_STOPS
        if graph.valid[stops[stop_id]["cell"]]
    ]
    if valid_stop_components:
        component_counts = Counter(valid_stop_components)
        shared_component = sorted(component_counts, key=lambda component: (-component_counts[component], component))[0]
    else:
        candidate_components = [int(labels[graph.node((r, c))]) for _, _, r, c in scores]
        component_counts = Counter(candidate_components)
        shared_component = sorted(component_counts, key=lambda component: (-component_counts[component], component))[0]
    for _, _, row, col in sorted(scores):
        if labels[graph.node((row, col))] == shared_component:
            count = component_counts.get(shared_component, 0)
            return (row, col), f"Lowest neighborhood-slope candidate 150–600 m north and downslope of S1 in a component containing {count} supported stop(s) under the native-slope hard mask. Stops outside this component will be marked unreachable."
    # If the planned north/downslope search region is separated by the native hard mask, keep the
    # full ops area and stops, and site the Scenario habitat at the nearest reachable component cell.
    fallback = [
        (float(distance[r, c]), float(graph.slope_max_deg[r, c]), int(r), int(c))
        for r, c in np.argwhere(graph.valid)
        if labels[graph.node((int(r), int(c)))] == shared_component
    ]
    if not fallback:
        raise ValueError("no walkable habitat cell exists in a component containing a supported stop")
    distance_m, slope_deg, row, col = min(fallback)
    count = component_counts.get(shared_component, 0)
    note = (
        f"Native hard mask separated all 150–600 m north/downslope habitat candidates from stop-accessible cells; "
        f"selected the nearest walkable cell to S1 in the component containing {count} walkable supported stop(s) "
        f"({distance_m:.1f} m from S1, {slope_deg:.2f}° native aggregated slope). Other stop cells remain explicit no-route outcomes."
    )
    return (row, col), note


def _hazards_geojson(dem, graph, slope_limit_deg, slope_method):
    reasons = np.zeros(graph.shape, dtype=np.uint8)
    reasons[~dem.valid] = 2
    slope_missing = dem.valid & ~np.isfinite(graph.slope_max_deg)
    reasons[slope_missing] = 3
    reasons[dem.valid & np.isfinite(graph.slope_max_deg) & (graph.slope_max_deg > slope_limit_deg + 1e-10)] = 1
    labels = {
        1: ("slope", f"{slope_method} exceeds the {slope_limit_deg:g}° Scenario threshold"),
        2: ("nodata", "Primary DTM nodata; complementary-only cells excluded because overlapping scenes show substantial height offsets"),
        3: ("edge", "Native slope support unavailable at this cell; route blocked without interpolation"),
    }
    features_out = []
    for geom, value in shapes(reasons, mask=reasons > 0, transform=dem.transform, connectivity=4):
        code = int(value)
        if code not in labels:
            continue
        reason, label = labels[code]
        geographic = transform_geom(dem.crs, MARS_GEOGRAPHIC_CRS, geom, precision=7)
        features_out.append({
            "type": "Feature",
            "properties": {"reason": reason, "label": label, "badge": "Derived" if code == 1 else "Unavailable"},
            "geometry": geographic,
        })
    features_out.sort(key=lambda item: (item["properties"]["reason"], json.dumps(item["geometry"], sort_keys=True)))
    return {"type": "FeatureCollection", "features": features_out}


def _stop_target_diagnostics(dem, graph, stops, slope_limit_deg):
    walkable_cells = np.argwhere(graph.valid)
    result = {}
    for stop_id in SUPPORTED_STOPS:
        stop = stops[stop_id]
        row, col = stop["cell"]
        slope = float(graph.slope_max_deg[row, col])
        target = {
            "row_col": [row, col],
            "lonlat": stop["lonlat"],
            "primary_dem_valid": bool(dem.valid[row, col]),
            "native_horn_slope_deg": slope if np.isfinite(slope) else None,
            "walkable": bool(graph.valid[row, col]),
        }
        if not graph.valid[row, col] and len(walkable_cells):
            offsets = walkable_cells - np.array([row, col])
            distances = np.hypot(offsets[:, 0], offsets[:, 1]) * dem.resolution_m
            nearest_idx = int(np.argmin(distances))
            nr, nc = map(int, walkable_cells[nearest_idx])
            target["nearest_walkable_cell_diagnostic"] = {
                "row_col": [nr, nc],
                "straight_line_offset_m": float(distances[nearest_idx]),
                "native_horn_slope_deg": float(graph.slope_max_deg[nr, nc]),
                "used_as_route_goal": False,
            }
            if not np.isfinite(slope):
                target["block_reason"] = "native_slope_unavailable"
            elif slope > slope_limit_deg + 1e-10:
                target["block_reason"] = "native_slope_above_limit"
            else:
                target["block_reason"] = "not_walkable_under_native_mask"
        else:
            target["block_reason"] = None if graph.valid[row, col] else "no_walkable_cells"
        result[stop_id] = target
    return result


def _native_access_target_diagnostics(native_inputs, stops, component_labels, habitat_component, slope_limit_deg):
    native = native_inputs.graph
    labels = component_labels.reshape(native.shape)
    result = {}
    for stop_id in SUPPORTED_STOPS:
        stop = stops[stop_id]
        exact_row, exact_col = native_inputs.stop_cells[stop_id]
        exact_rc = (exact_row, exact_col)
        exact_slope = float(native.slope_deg[exact_rc]) if np.isfinite(native.slope_deg[exact_rc]) else None
        exact_walkable = bool(native.walkable[exact_rc])
        exact_connected = exact_walkable and int(labels[exact_rc]) == int(habitat_component)
        target_xy = native_inputs.projected_points[stop_id]
        goal = select_access_goal(
            native.walkable,
            labels,
            component_id=habitat_component,
            target_xy=target_xy,
            transform=native.transform,
            max_offset_m=10.0,
        )
        if goal is None:
            result[stop_id] = {
                "status": "unavailable",
                "badge": "Unavailable",
                "reason": "no habitat-connected native pixel center lies within the 10 m Scenario access bound",
                "observed_stop_lonlat": stop["lonlat"],
                "observed_native_cell_rc": [exact_row + native.source_row0, exact_col + native.source_col0],
                "observed_cell_horn_slope_deg": exact_slope,
                "observed_cell_walkable": exact_walkable,
                "observed_cell_connected": bool(exact_connected),
                "last_leg_modeled": False,
                "goal_cell": None,
            }
            continue
        goal_row, goal_col = goal["row_col"]
        endpoint_lonlat = transform(native.crs, MARS_GEOGRAPHIC_CRS, [goal["center_xy"][0]], [goal["center_xy"][1]])
        if exact_connected:
            reason = "the source pixel containing the Observed coordinate is walkable and connected; the route ends at its pixel center"
        elif exact_slope is not None and exact_slope > slope_limit_deg + 1e-10:
            reason = "the source pixel containing the Observed coordinate exceeds the native Horn slope limit; the route ends at a nearby connected access pixel"
        elif exact_walkable:
            reason = "the source pixel containing the Observed coordinate is walkable but disconnected from the existing habitat; no last-leg connection is modeled"
        else:
            reason = "native slope support is unavailable at the Observed pixel; the route ends at a nearby connected access pixel"
        goal_access = {
            "badge": "Derived",
            "status": "approach_only",
            "reason": reason,
            "observed_stop_lonlat": stop["lonlat"],
            "endpoint_lonlat": [float(endpoint_lonlat[0][0]), float(endpoint_lonlat[1][0])],
            "offset_m": goal["offset_m"],
            "access_bound_m": 10.0,
            "native_cell_rc": [goal_row + native.source_row0, goal_col + native.source_col0],
            "observed_native_cell_rc": [exact_row + native.source_row0, exact_col + native.source_col0],
            "observed_cell_horn_slope_deg": exact_slope,
            "observed_cell_walkable": exact_walkable,
            "observed_cell_connected": bool(exact_connected),
            "same_source_cell_as_observed_stop": [goal_row, goal_col] == [exact_row, exact_col],
            "last_leg_modeled": False,
            "goal_cell": [goal_row, goal_col],
        }
        result[stop_id] = goal_access
    return result


def build_real_routes(
    *,
    input_manifest,
    native_hazard_manifest=None,
    constants_path,
    stops_path,
    output_dir,
    habitat_row_col=None,
):
    """Build fastest and lowest-hazard routes for all five supported locations."""
    build_started = datetime.now(ZoneInfo("Africa/Cairo"))
    build_started_mono = perf_counter()
    manifest, manifest_hash = _read_manifest(input_manifest)
    dem = read_primary_dem(input_manifest)
    sources = _handoff_sources(manifest, dem)
    native_slope = read_native_hard_slope(native_hazard_manifest or input_manifest, dem)
    slope_method = (
        f"Horn 3x3 {native_slope.aggregation} slope aggregated from "
        f"{native_slope.source_resolution_m:g} m source cells to "
        f"{native_slope.planning_resolution_m:g} m planning cells"
    )
    sources["native_hard_slope"] = {
        "manifest_sha256": native_slope.manifest_sha256,
        "local_path": native_slope.local_path,
        "local_cache_sha256": native_slope.local_sha256,
        "source_url": native_slope.source_url,
        "license": native_slope.license,
        "algorithm": native_slope.algorithm,
        "aggregation": native_slope.aggregation,
        "source_resolution_m": native_slope.source_resolution_m,
        "planning_resolution_m": native_slope.planning_resolution_m,
        "valid_cells": int(native_slope.valid.sum()),
        "total_cells": int(native_slope.valid.size),
        "handoff_record": manifest.get("native_hazard", {}),
    }
    alignment_evidence = native_slope.alignment_evidence
    constants_raw, c = read_constants(constants_path)
    constants_raw.pop("_mock", None)
    constants_raw.pop("_note", None)
    constants_bytes = _json_bytes(constants_raw)
    constants_hash = hashlib.sha256(constants_bytes).hexdigest()
    stops = _read_stops(stops_path, dem)

    graph = build_graph(
        dem.elevation_m,
        resolution_m=dem.resolution_m,
        nodata=None,
        hard_slope_deg=native_slope.slope_deg,
        max_slope_deg=c["slope_limit_foot_deg"],
        body_mass_kg=c["body_mass_kg"],
        load_kg=c["carried_load_kg"],
        kappa=c["suit_factor_kappa"],
        watts_to_o2_ml_per_min=c["watts_to_o2_ml_per_min"],
        max_speed_mps=c["walk_speed_kmh"] / 3.6,
    )
    if habitat_row_col is None:
        habitat, habitat_note = _choose_habitat(dem, graph, stops)
    else:
        habitat = tuple(map(int, habitat_row_col))
        if len(habitat) != 2 or not (0 <= habitat[0] < dem.height and 0 <= habitat[1] < dem.width):
            raise ValueError("habitat row/column is outside the planning grid")
        if not graph.valid[habitat]:
            raise ValueError("habitat falls on nodata or a hard slope mask")
        habitat_note = "Explicit row/column supplied on the command line."
    if not graph.valid[habitat]:
        raise ValueError("selected habitat is hard-blocked")

    stop_target_diagnostics = _stop_target_diagnostics(dem, graph, stops, c["slope_limit_foot_deg"])
    native_route_started = perf_counter()
    native_inputs = build_bounded_native_routing_inputs(
        manifest_path=input_manifest,
        manifest=manifest,
        primary_dem=dem,
        habitat_lonlat=_cell_lonlat(*habitat, dem),
        stops=stops,
        constants=c,
    )
    native_graph = native_inputs.graph
    native_habitat = native_inputs.habitat_cell
    if not native_graph.walkable[native_habitat]:
        raise ValueError("existing Scenario habitat maps to a blocked native source pixel")
    native_habitat_node = native_graph.node(native_habitat)
    native_component_count, native_component_labels = connected_components(
        native_graph.time_csr, directed=True, connection="weak"
    )
    native_habitat_component = int(native_component_labels[native_habitat_node])
    native_access_diagnostics = _native_access_target_diagnostics(
        native_inputs,
        stops,
        native_component_labels,
        native_habitat_component,
        c["slope_limit_foot_deg"],
    )
    native_fields = {
        objective: native_dijkstra_field(native_graph, start=native_habitat, objective=objective)
        for objective in ("time", "hazard")
    }
    # Fastest modeled way home from any pixel (demo-focus-plan §9 Back_fast), same graph and costs.
    native_home_field = fastest_home_field(native_graph, home=native_habitat)
    native_graph_diagnostics = {
        **native_inputs.extent,
        "source": native_inputs.asset,
        "resolution_m": native_graph.resolution_m,
        "slope_limit_deg": c["slope_limit_foot_deg"],
        "slope_method": "Horn 3x3 maximum native pixel slope, with any nodata-touching neighborhood unavailable",
        "edge_method": "8-neighbor; diagonal requires both orthogonal pixels walkable; absolute native endpoint-sampled grade at or below the same slope limit",
        "native_habitat_cell_rc": list(native_graph.global_cell(native_habitat_node)),
        "native_habitat_component_pixels": int(np.count_nonzero(native_component_labels == native_habitat_component)),
        "component_count_in_bounded_extent": int(native_component_count),
        "access_goal_bound_m": 10.0,
        "stop_access": native_access_diagnostics,
        "graph_and_fields_runtime_seconds": round(perf_counter() - native_route_started, 3),
    }
    sources["native_route_dem"] = native_inputs.asset

    budget = c["o2_usable_primary_l"] - max(
        c["reserve_fraction"] * c["o2_usable_primary_l"],
        c["reserve_minutes"] * c["walkback_o2_lpm"],
    )
    output_dir = Path(output_dir).resolve()
    routes_dir = output_dir / "routes"
    routes_dir.mkdir(parents=True, exist_ok=True)
    route_index = {"routes": []}
    route_statuses = {}
    exported_files = []
    stale_route_files_removed = []
    habitat_lonlat = _cell_lonlat(*habitat, dem)
    native_habitat_xy = native_inputs.projected_points["HABITAT"]
    native_habitat_center = rasterio.transform.xy(native_graph.transform, *native_habitat, offset="center")
    native_habitat_lonlat = transform(native_graph.crs, MARS_GEOGRAPHIC_CRS, [native_habitat_center[0]], [native_habitat_center[1]])
    habitat_route_start = {
        "badge": "Derived",
        "scenario_habitat_lonlat": habitat_lonlat,
        "endpoint_lonlat": [float(native_habitat_lonlat[0][0]), float(native_habitat_lonlat[1][0])],
        "offset_m": math.hypot(native_habitat_center[0] - native_habitat_xy[0], native_habitat_center[1] - native_habitat_xy[1]),
        "native_cell_rc": list(native_graph.global_cell(native_habitat_node)),
        "last_leg_modeled": False,
    }

    for stop_id in SUPPORTED_STOPS:
        stop = stops[stop_id]
        for mode, objective in (("fastest", "time"), ("safest", "hazard")):
            route_id = f"{stop_id}_{mode}_{int(c['crew_size_default'])}_{int(c['carried_load_kg'])}"
            filename = f"{route_id}.json"
            record = {
                "id": route_id,
                "stop": stop_id,
                "mode": mode,
                "crew": int(c["crew_size_default"]),
                "load_kg": c["carried_load_kg"],
                "file": f"routes/{filename}",
            }
            try:
                target_access = native_access_diagnostics[stop_id]
                if target_access["status"] != "approach_only":
                    raise ValueError(target_access["reason"])
                path = path_from_field(
                    native_graph,
                    start=native_habitat,
                    goal=tuple(target_access["goal_cell"]),
                    objective=objective,
                    distances=native_fields[objective][0],
                    predecessors=native_fields[objective][1],
                    constants=c,
                )
                arrays = path.arrays
                pnr = point_of_no_return(
                    arrays["cum"]["o2_l"],
                    arrays["back"]["o2_l"],
                    capacity_l=c["o2_usable_primary_l"],
                    reserve_fraction=c["reserve_fraction"],
                    reserve_minutes=c["reserve_minutes"],
                    walkback_o2_lpm=c["walkback_o2_lpm"],
                    return_margin=c["return_cost_margin"],
                    member_factors=[1.0, 1.0][: int(c["crew_size_default"])],
                )
                back_fast = None
                if mode == "safest":
                    back_fast = {
                        **back_fast_arrays(
                            native_graph, path.nodes, home=native_habitat,
                            field=native_home_field, constants=c,
                        ),
                        "badge": "Scenario",
                        "method": (
                            "Shortest modeled time from each route point to the habitat pixel on the same native "
                            "graph and corridor (Dijkstra on reversed edges); t_s and o2_l are raw expected values "
                            "per crew member with no reserve or margin, like back. path is stored only at the route points in "
                            "path_from (first, last, one every 25 m of route); the way home from another point is the "
                            "route walked back to the nearest earlier key point, then that path. path is simplified "
                            "for display (1 m Ramer-Douglas-Peucker, one native pixel); costs use the unsimplified pixel path."
                        ),
                    }
                route_payload = {
                    **arrays,
                    **({"back_fast": back_fast} if back_fast else {}),
                    **record,
                    "stop_name": stop["name"],
                    "badge": "Scenario",
                    "budget_l": pnr.budget_l,
                    "pnr_index": pnr.pnr_index,
                    "constants_hash": constants_hash,
                    "habitat_cell_rc": list(habitat),
                    "habitat_native_cell_rc": list(native_graph.global_cell(native_habitat_node)),
                    "habitat_access": habitat_route_start,
                    "goal_cell_rc": list(stop["cell"]),
                    "goal_native_cell_rc": target_access["native_cell_rc"],
                    "goal_access": {key: value for key, value in target_access.items() if key != "goal_cell"},
                    "observed_stop_lonlat": stop["lonlat"],
                    "objective_cost": path.objective_cost,
                    "distance_m": float(sum(item["cost_terms"]["distance_m"] for item in arrays["seg"])),
                    "primary_crop_sha256": dem.local_crop_sha256,
                    "model_note": (
                        f"Scenario: routes use the primary native DTM at {native_graph.resolution_m:.6f} m spacing, "
                        f"Horn 3x3 max slope at or below {c['slope_limit_foot_deg']:g}°, and directed grades between "
                        "native source-pixel centers. Fastest or lowest-modeled-hazard optimum is limited to the "
                        f"documented {NATIVE_ROUTING_MARGIN_M:g} m analysis corridor; terrain factor is 1.0, with no "
                        "THEMIS sand cost or sample pickup load in this base 15 kg route bucket. Endpoint is a Derived "
                        "approach goal; no last leg to the Observed stop is modeled."
                    ),
                }
                _write_json(routes_dir / filename, route_payload)
                exported_files.append(routes_dir / filename)
                record.update({
                    "total_s": arrays["total_s"],
                    "pnr_index": pnr.pnr_index,
                    "status": "routed",
                    "goal_access_status": target_access["status"],
                    "goal_access_offset_m": target_access["offset_m"],
                })
                route_statuses[route_id] = {
                    "status": "routed",
                    "time_s": path.time_s,
                    "objective_cost": path.objective_cost,
                    "goal_access_status": target_access["status"],
                    "goal_access_offset_m": target_access["offset_m"],
                }
            except ValueError as exc:
                if _remove_stale_route_payload(routes_dir / filename):
                    stale_route_files_removed.append(f"routes/{filename}")
                record.update({"file": None, "status": "unreachable", "reason": str(exc)})
                route_statuses[route_id] = {"status": "unreachable", "reason": str(exc)}
            route_index["routes"].append(record)

    origin_lonlat = transform(dem.crs, MARS_GEOGRAPHIC_CRS, [dem.transform.c], [dem.transform.f])
    meta = {
        "ops_box": {
            "west": manifest["scope_box_lonlat_east_positive_planetocentric_deg"][0],
            "south": manifest["scope_box_lonlat_east_positive_planetocentric_deg"][1],
            "east": manifest["scope_box_lonlat_east_positive_planetocentric_deg"][2],
            "north": manifest["scope_box_lonlat_east_positive_planetocentric_deg"][3],
        },
        "crs": MARS_GEOGRAPHIC_CRS,
        "analysis_crs": dem.crs.to_wkt(),
        "grid": {
            "resolution_m": dem.resolution_m,
            "width": dem.width,
            "height": dem.height,
            "origin_lonlat": [float(origin_lonlat[0][0]), float(origin_lonlat[1][0])],
            "origin_projected_m": [dem.transform.c, dem.transform.f],
            "cell_value": "mean elevation from ~1.01 m HiRISE DTM average-resampled to ~9.88 m planning cells",
        },
        "nodata": dem.nodata,
        "routing_coverage": {
            "primary_dtm_valid_cells": int(dem.valid.sum()),
            "primary_dtm_valid_fraction": float(dem.valid.mean()),
            "walkable_cells_after_slope_mask": int(graph.valid.sum()),
            "walkable_fraction_of_ops_grid": float(graph.valid.mean()),
            "slope_limit_deg": c["slope_limit_foot_deg"],
            "slope_aggregation": slope_method,
            "native_slope_valid_cells": int(native_slope.valid.sum()),
            "native_slope_valid_fraction": float(native_slope.valid.mean()),
            "route_grid_resolution_m": native_graph.resolution_m,
            "route_grid_shape_hw": list(native_graph.shape),
            "route_grid_walkable_pixels": int(native_graph.walkable.sum()),
            "route_corridor_margin_m": NATIVE_ROUTING_MARGIN_M,
            "access_goal_bound_m": 10.0,
            "native_route_extent": native_inputs.extent,
        },
        "habitat": {"lonlat": habitat_lonlat, "row_col": list(habitat), "badge": "Scenario", "note": habitat_note},
        "build_date": date.today().isoformat(),
        "constants_hash": constants_hash,
        "input_hash": manifest_hash,
    }
    hazard_payload = _hazards_geojson(dem, graph, c["slope_limit_foot_deg"], slope_method)
    _write_json(output_dir / "constants.json", constants_raw)
    _write_json(output_dir / "meta.json", meta)
    _write_json(routes_dir / "index.json", route_index)
    _write_json(output_dir / "hazards.geojson", hazard_payload)
    hashed_outputs = {
        "constants.json": output_dir / "constants.json",
        "meta.json": output_dir / "meta.json",
        "hazards.geojson": output_dir / "hazards.geojson",
        "routes/index.json": routes_dir / "index.json",
    }
    hashed_outputs.update({str(path.relative_to(output_dir)): path for path in exported_files})
    output_hashes = {name: sha256_file(path) for name, path in sorted(hashed_outputs.items())}
    native_graph_diagnostics["process_peak_rss_bytes"] = int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024)
    build_completed = datetime.now(ZoneInfo("Africa/Cairo"))
    build_runtime = perf_counter() - build_started_mono
    acquisition = manifest.get("acquisition_timing", {})
    pilot_timing = _pilot_timing(acquisition, build_started, build_completed, build_runtime)
    routed_count = sum(value["status"] == "routed" for value in route_statuses.values())
    unreachable_ids = [key for key, value in route_statuses.items() if value["status"] != "routed"]
    alignment_roles = {
        item.get("role")
        for item in alignment_evidence.get("verified_files", [])
        if isinstance(item, dict)
    } if isinstance(alignment_evidence, dict) else set()
    alignment_is_bounded_local_pass = (
        isinstance(alignment_evidence, dict)
        and alignment_evidence.get("status") == "bounded_qualitative_local_landmark_pass_moderate_confidence"
        and alignment_evidence.get("verified_local_sha256")
        and {"tiepoint_json", "independent_visual_review"}.issubset(alignment_roles)
    )
    alignment_not_reproduced = (
        isinstance(alignment_evidence, dict)
        and str(alignment_evidence.get("status", "")).startswith("not_reproduced")
    )
    g2_gate = {
        "status": (
            "pass_bounded_qualitative_local_landmark" if alignment_is_bounded_local_pass
            else "not_reproduced" if alignment_not_reproduced
            else "partial_visual_only"
        ),
        "scope": "one local qualitative landmark tie; no global or calibrated registration claim",
        "feature_id": alignment_evidence.get("feature_id") if isinstance(alignment_evidence, dict) else None,
        "apparent_pick_delta_m": alignment_evidence.get("apparent_residual_m") if isinstance(alignment_evidence, dict) else None,
        "subjective_pick_uncertainty_m": alignment_evidence.get("subjective_pick_uncertainty_m") if isinstance(alignment_evidence, dict) else None,
        "uncertainty_calibrated": False,
        "global_registration_established": False,
        "evidence": alignment_evidence,
    }
    pilot_gates = {
        "G1": {
            "status": "pass" if dem.license and native_slope.license else "partial",
            "primary_dtm_license": dem.license,
            "native_slope_license": native_slope.license,
            "primary_crop_sha256_verified": True,
            "native_slope_cache_sha256_verified": True,
        },
        "G2": g2_gate,
        "G3": {
            "status": "partial_approach_only" if not unreachable_ids else "partial",
            "routed_stop_modes": routed_count,
            "unreachable_stop_modes": unreachable_ids,
            "native_slope_mask_enforced": True,
            "pnr_arrays_checked": True,
            "exact_observed_arrival_claimed": False,
            "approach_only_stop_ids": [stop_id for stop_id, item in native_access_diagnostics.items()
                                       if item["status"] == "approach_only"],
        },
        "G4": {"status": pilot_timing["g4_status"], "timing": pilot_timing},
    }
    # Keep this additive metadata deterministic and explicit rather than implying native 1 m routing.
    build_manifest = {
        "engine": "RedSight Python NumPy rasterio SciPy sparse Dijkstra",
        "engine_commit": _git_head(Path(__file__).resolve().parents[1]),
        "build_date": date.today().isoformat(),
        "command": "python3 -m engine build --input-manifest <manifest-with-native-routing-and-hazard> --constants <constants.json> --stops <stops.json> --out <app/public/data>",
        "inputs": sources,
        # A local rebuild of the inputs (engine/tools/rebuild_pilot_inputs.py) says so here, not only in G2.
        "input_provenance": (
            {"kind": "local_rebuild", "note": manifest["rebuild_note"], "rebuilt_at": manifest.get("rebuilt_at")}
            if isinstance(manifest.get("rebuild_note"), str)
            else {"kind": "original_handoff"}
        ),
        "s1_landmark_alignment": alignment_evidence,
        "stops_sha256": sha256_file(stops_path),
        "constants_sha256": constants_hash,
        "output_sha256": output_hashes,
        "analysis_grid": {"rows": dem.height, "columns": dem.width, "cell_size_m": dem.resolution_m, "cell_source": "average-resampled primary DTM context grid and conservative coarse hazard layer"},
        "routing_grid": native_graph_diagnostics,
        "hard_slope_limit_deg": c["slope_limit_foot_deg"],
        "slope_hard_mask_method": slope_method,
        "habitat": {"row_col": list(habitat), "lonlat": habitat_lonlat, "badge": "Scenario", "selection_note": habitat_note},
        "constants": constants_raw,
        "runtime": {"python": platform.python_version(), "numpy": np.__version__, "rasterio": rasterio.__version__, "scipy": scipy_version},
        "route_status": route_statuses,
        "stale_route_files_removed": stale_route_files_removed,
        "coarse_stop_cell_diagnostics": stop_target_diagnostics,
        "native_route_goal_access": native_access_diagnostics,
        "pilot_gates": pilot_gates,
        "pilot_timing": pilot_timing,
        "limitations": [
            "The primary crop covers 78.2% of the 600x600 planning grid; complementary-only cells remain blocked.",
            "The overlapping companion DTM differs substantially from the primary scene; its cells are excluded instead of applying an unsupported vertical correction.",
            "Routes use source-pixel centers at native resolution inside the documented 250m-expanded corridor; fastest and lowest-modeled-hazard results are corridor-limited optima, not unrestricted terrain optima.",
            "Route endpoints are Derived approach-only pixel centers within at most 10m of Observed stop coordinates; no last leg is modeled and no exact arrival claim is made.",
            "The approximately 9.88m maximum-slope aggregate remains a conservative context layer; a native traversable path can cross a planning cell whose neighboring source pixels exceed the threshold.",
            "No THEMIS thermal-inertia raster was supplied; the sand/terrain multiplier remains 1.0 and the lowest-hazard objective reflects slope only.",
            "Collected sample mass is not included in the base 2-crew, 15kg route bucket; it must be modeled in a separately agreed sample/load variant.",
            "Pandolf and the piecewise walking-speed function are Scenario transfers to Mars; values are estimates, not physiological measurements.",
        ],
    }

    _write_json(output_dir / "engine-build-manifest.json", build_manifest)
    return {
        "output_dir": str(output_dir),
        "meta": meta,
        "route_index": route_index,
        "manifest": build_manifest,
        "exported_files": [str(p) for p in exported_files],
        "route_status": route_statuses,
    }


def _git_head(repo_root):
    import subprocess

    try:
        return subprocess.check_output(["git", "-C", str(repo_root), "rev-parse", "HEAD"], text=True).strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"
