"""Constrained routing API backed by the hash-checked native HiRISE DTM."""

from __future__ import annotations

import hashlib
import json
import math
import os
import gc
from pathlib import Path

import numpy as np
import rasterio
from rasterio.warp import transform
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components, dijkstra

from engine.data.native_routing import build_bounded_native_routing_inputs
from engine.export import MARS_GEOGRAPHIC_CRS, _read_stops, read_primary_dem
from engine.model.constants import read_constants
from engine.model.native_grid import build_native_routing_graph, select_access_goal
from engine.route.native import path_from_field
from engine.route.pnr import point_of_no_return

DATA = Path(__file__).resolve().parents[1] / "app/public/data"
MAX_SLOPE_DEG = 15.0
ACCESS_BOUND_M = 10.0
SUPPORTED_STOPS = {"S1", "S2", "S3", "D1", "D2"}
_BASE = None


def normalized_balanced_cost(time_csr, hazard_csr):
    """Build the documented equal-weight min-max edge objective for Dijkstra."""
    t = time_csr.tocsr(copy=True)
    h = hazard_csr.tocsr(copy=True)
    if not (np.array_equal(t.indptr, h.indptr) and np.array_equal(t.indices, h.indices)):
        raise ValueError("time and hazard graph edges do not match")
    def normalized(values):
        if values.size == 0:
            return values.astype(np.float64)
        lo, hi = float(values.min()), float(values.max())
        return np.zeros_like(values, dtype=np.float64) if hi == lo else (values.astype(np.float64) - lo) / (hi - lo)
    t.data = (0.5 * (normalized(t.data) + normalized(h.data))).astype(np.float32)
    return t


def _load_base():
    global _BASE
    if _BASE is not None:
        return _BASE
    manifest_path = Path(os.environ.get("REDSIGHT_ENGINE_MANIFEST", "data/raw/engine-pilot/input-manifest.json")).resolve()
    if not manifest_path.is_file():
        raise FileNotFoundError("hash-checked native routing manifest is not installed")
    constants_path = Path(os.environ.get("REDSIGHT_CONSTANTS", DATA / "constants.json")).resolve()
    stops_path = Path(os.environ.get("REDSIGHT_STOPS", DATA / "stops.json")).resolve()
    manifest = json.loads(manifest_path.read_text())
    dem = read_primary_dem(manifest_path)
    constants_raw, constants = read_constants(constants_path)
    stops = _read_stops(stops_path, dem)
    meta = json.loads((DATA / "meta.json").read_text())
    habitat = meta.get("habitat", {}).get("lonlat")
    if not isinstance(habitat, list) or len(habitat) != 2:
        raise ValueError("scenario habitat coordinate is unavailable")
    constants["slope_limit_foot_deg"] = MAX_SLOPE_DEG
    inputs = build_bounded_native_routing_inputs(
        manifest_path=manifest_path, manifest=manifest, primary_dem=dem,
        habitat_lonlat=habitat, stops=stops, constants=constants,
    )
    graph = inputs.graph
    native = {"elevation_m":graph.elevation_m,"slope_deg":graph.slope_deg,
              "transform":graph.transform,"crs":graph.crs,"resolution_m":graph.resolution_m,
              "source_row0":graph.source_row0,"source_col0":graph.source_col0,
              "habitat_cell":inputs.habitat_cell,"stop_cells":inputs.stop_cells,
              "projected_points":inputs.projected_points,"asset":inputs.asset,"extent":inputs.extent}
    constants_hash = hashlib.sha256((json.dumps(constants_raw,indent=2,sort_keys=True,ensure_ascii=False)+"\n").encode()).hexdigest()
    _BASE = {"manifest": manifest_path, "dem": dem, "constants": constants,
             "constants_hash":constants_hash,
             "stops": stops, "habitat": habitat, "native": native}
    del inputs, graph
    gc.collect()
    return _BASE


def route_request(request: dict) -> dict:
    """Compute one real native-grid route; errors are structured, never mocked."""
    stop_id = request.get("destination_id")
    mode = request.get("mode")
    cap = request.get("slope_cap_deg", MAX_SLOPE_DEG)
    crew = request.get("crew_count", 2)
    body_mass = request.get("body_mass_kg", 82)
    load = request.get("load_kg", 15)
    samples = request.get("sample_kg_per_stop", 0)
    if stop_id not in SUPPORTED_STOPS:
        return {"status": "error", "code": "unsupported_destination", "message": "Destination is not a supported observed stop."}
    if mode not in {"fastest", "safest", "balanced"}:
        return {"status": "error", "code": "invalid_mode", "message": "Mode must be fastest, safest, or balanced."}
    if isinstance(cap, bool) or not isinstance(cap, (int, float)) or not math.isfinite(cap) or not 0 <= cap <= MAX_SLOPE_DEG:
        return {"status": "error", "code": "invalid_slope_cap", "message": "Slope cap must be 0–15 degrees; 15 degrees is the hard model ceiling."}
    if crew not in {1, 2} or isinstance(crew, bool):
        return {"status": "error", "code": "unsupported_crew", "message": "Only the engine-supported crew sizes 1 or 2 are available."}
    if not isinstance(body_mass, (int, float)) or isinstance(body_mass, bool) or not 43 <= body_mass <= 110:
        return {"status": "error", "code": "invalid_body_mass", "message": "Body mass must be 43–110 kg."}
    if not isinstance(load, (int, float)) or isinstance(load, bool) or not 0 <= load <= 40:
        return {"status": "error", "code": "invalid_load", "message": "Per-astronaut load must be 0–40 kg."}
    if not isinstance(samples, (int, float)) or isinstance(samples, bool) or not 0 <= samples <= 10:
        return {"status": "error", "code": "invalid_samples", "message": "Sample mass per stop must be 0–10 kg."}
    try:
        base = _load_base()
    except FileNotFoundError as exc:
        return {"status": "unavailable", "code": "native_terrain_unavailable", "message": str(exc)}
    except Exception as exc:
        return {"status": "unavailable", "code": "terrain_inputs_invalid", "message": f"Native terrain inputs unavailable: {exc}"}
    constants = dict(base["constants"])
    constants.update({"slope_limit_foot_deg": float(cap), "crew_size_default": int(crew),
                      "body_mass_kg": float(body_mass), "carried_load_kg": float(load),
                      "return_load_kg": float(load + samples)})
    old = base["native"]
    graph = build_native_routing_graph(
        old["elevation_m"], old["slope_deg"], transform=old["transform"], crs=old["crs"],
        resolution_m=old["resolution_m"], slope_limit_deg=float(cap),
        body_mass_kg=float(body_mass), load_kg=float(load),
        kappa=constants["suit_factor_kappa"],
        watts_to_o2_ml_per_min=constants["watts_to_o2_ml_per_min"],
        max_speed_mps=constants["walk_speed_kmh"] / 3.6,
        return_load_kg=float(load + samples),
        source_row0=old["source_row0"], source_col0=old["source_col0"],
    )
    start, habitat = graph.node(old["habitat_cell"]), old["habitat_cell"]
    if not graph.walkable.flat[start]:
        return {"status":"no_route","code":"no_matching_route","message":"No route satisfies the requested slope cap because the existing scenario habitat is blocked by it; the constraint was not relaxed.","constraints":{"slope_cap_deg":float(cap),"destination_id":stop_id}}
    ncomp, labels = connected_components(graph.time_csr, directed=True, connection="weak")
    component = int(labels[start])
    stop = base["stops"][stop_id]
    x, y = transform(MARS_GEOGRAPHIC_CRS, graph.crs, [stop["lonlat"][0]], [stop["lonlat"][1]])
    access = select_access_goal(graph.walkable, labels.reshape(graph.shape), component_id=component,
    target_xy=(x[0], y[0]), transform=graph.transform,
                                max_offset_m=ACCESS_BOUND_M)
    if access is None:
        return {"status":"no_route","code":"no_matching_route","message":"No connected route endpoint satisfies the requested slope cap within the existing 10 m Derived approach bound; the cap was not relaxed.","constraints":{"slope_cap_deg":float(cap),"destination_id":stop_id}}
    goal = tuple(access["row_col"])
    if goal == habitat:
        return {"status":"no_route","code":"no_matching_route","message":"Destination approach resolves to the habitat cell; no excursion route is available."}
    if mode == "fastest":
        objective, matrix = "time", graph.time_csr
    elif mode == "safest":
        objective, matrix = "hazard", graph.hazard_csr
    else:
        objective, matrix = "balanced", normalized_balanced_cost(graph.time_csr, graph.hazard_csr)
    distances, predecessors = dijkstra(matrix, directed=True, indices=start, return_predecessors=True)
    goal_node = graph.node(goal)
    if not np.isfinite(distances[goal_node]):
        return {"status":"no_route","code":"no_matching_route","message":"No route satisfies the requested constraints; no fallback or slope relaxation was applied.","constraints":{"slope_cap_deg":float(cap),"destination_id":stop_id}}
    path = path_from_field(graph, start=habitat, goal=goal, objective=objective,
                           distances=distances, predecessors=predecessors, constants=constants)
    arrays = path.arrays
    pnr = point_of_no_return(arrays["cum"]["o2_l"], arrays["back"]["o2_l"],
        capacity_l=constants["o2_usable_primary_l"], reserve_fraction=constants["reserve_fraction"],
        reserve_minutes=constants["reserve_minutes"], walkback_o2_lpm=constants["walkback_o2_lpm"],
        return_margin=constants["return_cost_margin"], member_factors=(1.0,) * int(crew))
    arrays["pnr_index"] = pnr.pnr_index
    distance_m = sum(segment["cost_terms"]["distance_m"] for segment in arrays["seg"])
    return {"status":"ok","route":{
        "id":f"{stop_id}_{mode}_dynamic_c{crew}_l{load:g}_s{cap:g}","stop":stop_id,
        "mode":mode,"preference":mode,"observed_stop_lonlat":stop["lonlat"],
        "crew":int(crew),"load_kg":float(load),"badge":"Scenario","budget_l":pnr.budget_l,
        "constants_hash":base["constants_hash"],**arrays,"distance_m":distance_m,
        "goal_access":{"badge":"Derived","status":"approach_only","offset_m":access["offset_m"],
                        "access_bound_m":ACCESS_BOUND_M,"last_leg_modeled":False,
                        "observed_stop_lonlat":stop["lonlat"],"route_goal_lonlat":arrays["coords"][-1]},
        "routing":{"slope_cap_deg":float(cap),"hard_max_deg":MAX_SLOPE_DEG,
                    "native_resolution_m":graph.resolution_m,"objective":objective,
                    "objective_cost":float(distances[goal_node]),
                    "balanced_definition":"equal-weight min-max normalized per-edge modeled time and mapped slope-hazard cost; summed by directed Dijkstra; bounded native corridor",
                    "data_class":"Scenario","body_mass_kg":float(body_mass),"load_kg_per_astronaut":float(load),
                    "sample_kg_per_stop":float(samples),"sample_mass_applied_to_return":True,
                    "return_model":"same_path_only; alternate fastest-return geometry unavailable"},
        "status_summary":{"destination_id":stop_id,"endpoint_class":"Derived approach endpoint","last_leg_modeled":False}}}
