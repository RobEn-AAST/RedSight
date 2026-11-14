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
from engine.route.native import path_from_field, native_route_arrays, fastest_home_field
from engine.route.pnr import point_of_no_return

DATA = Path(__file__).resolve().parents[1] / "app/public/data"
MAX_SLOPE_DEG = 15.0
ACCESS_BOUND_M = 10.0
SUPPORTED_STOPS = {"S1", "S2", "S3", "D1", "D2"}
_BASE = None


def normalized_balanced_cost(time_csr, hazard_csr):
    """Build the documented equal-weight min-max edge objective for Dijkstra."""
    return blended_cost(time_csr, hazard_csr, 0.5)


MARS_RADIUS_M = 3396190.0
SAND_WEIGHT_MAX = 3.0
# Team choice (Scenario): THEMIS TI -> Pandolf terrain factor eta (1.0 firm .. 2.1 loose sand),
# docs/technical-approaches.md section 3. TI >= firm is firm ground, TI <= loose is loose sand.
SAND_TI_FIRM_TIU = 450.0
SAND_TI_LOOSE_TIU = 200.0
SAND_ETA_MAX = 2.1
OPS_BOX = {"west": 137.335, "east": 137.435, "south": -4.85, "north": -4.75}
TI_PATH = Path(__file__).resolve().parents[1] / "data/processed/themis_ti_10m.npy"
_TI = None


def ti_to_eta(ti):
    """Map THEMIS thermal inertia (TIU) to a terrain factor eta in [1.0, 2.1] (Scenario mapping)."""
    ti = np.asarray(ti, dtype=np.float64)
    frac = np.clip((SAND_TI_FIRM_TIU - ti) / (SAND_TI_FIRM_TIU - SAND_TI_LOOSE_TIU), 0.0, 1.0)
    return 1.0 + (SAND_ETA_MAX - 1.0) * frac


def apply_sand_weight(hazard_csr, eta, weight):
    """Scale each edge hazard by 1 + weight*(eta[destination]-1); eta is a flat array or callable(indices)."""
    out = hazard_csr.tocsr(copy=True)
    if weight == 0:
        return out
    cell_eta = eta(out.indices) if callable(eta) else np.asarray(eta)[out.indices]
    out.data = (out.data * (1.0 + float(weight) * (cell_eta - 1.0))).astype(np.float32)
    return out


def blended_cost(time_csr, hazard_csr, hazard_weight):
    """(1-a)*normalized time + a*normalized hazard per edge; a=0.5 is the documented equal-weight objective."""
    t = time_csr.tocsr(copy=True)
    h = hazard_csr.tocsr(copy=True)
    if not (np.array_equal(t.indptr, h.indptr) and np.array_equal(t.indices, h.indices)):
        raise ValueError("time and hazard graph edges do not match")
    def normalized(values):
        if values.size == 0:
            return values.astype(np.float64)
        lo, hi = float(values.min()), float(values.max())
        return np.zeros_like(values, dtype=np.float64) if hi == lo else (values.astype(np.float64) - lo) / (hi - lo)
    a = float(hazard_weight)
    t.data = ((1.0 - a) * normalized(t.data) + a * normalized(h.data)).astype(np.float32)
    return t


def native_eta_lookup(transform, shape):
    """Return callable(flat_cell_indices)->eta sampled from the THEMIS TI grid; outside the box is firm (1.0)."""
    global _TI
    if _TI is None:
        _TI = np.load(TI_PATH, mmap_mode="r")
    rows, cols = shape
    xs = transform.c + (np.arange(cols) + 0.5) * transform.a
    ys = transform.f + (np.arange(rows) + 0.5) * transform.e
    lon = np.degrees(xs / MARS_RADIUS_M)
    lat = np.degrees(ys / MARS_RADIUS_M)
    u = (lon - OPS_BOX["west"]) / (OPS_BOX["east"] - OPS_BOX["west"])
    v = (OPS_BOX["north"] - lat) / (OPS_BOX["north"] - OPS_BOX["south"])
    inside_c, inside_r = (u >= 0) & (u < 1), (v >= 0) & (v < 1)
    ci = np.clip(np.floor(u * _TI.shape[1]).astype(np.int64), 0, _TI.shape[1] - 1)
    ri = np.clip(np.floor(v * _TI.shape[0]).astype(np.int64), 0, _TI.shape[0] - 1)
    eta_ops = ti_to_eta(np.asarray(_TI))

    def lookup(indices):
        r, c = indices // cols, indices % cols
        eta = eta_ops[ri[r], ci[c]]
        return np.where(inside_r[r] & inside_c[c], eta, 1.0)

    return lookup


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
    sand_weight = request.get("sand_weight", 0.0)
    hazard_weight = request.get("hazard_weight", 0.5)
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
    if isinstance(sand_weight, bool) or not isinstance(sand_weight, (int, float)) or not math.isfinite(sand_weight) or not 0 <= sand_weight <= SAND_WEIGHT_MAX:
        return {"status": "error", "code": "invalid_sand_weight", "message": f"Sand weight must be 0–{SAND_WEIGHT_MAX:g}."}
    if isinstance(hazard_weight, bool) or not isinstance(hazard_weight, (int, float)) or not math.isfinite(hazard_weight) or not 0 <= hazard_weight <= 1:
        return {"status": "error", "code": "invalid_hazard_weight", "message": "Hazard weight must be 0–1."}
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
    hazard_csr = apply_sand_weight(graph.hazard_csr, native_eta_lookup(graph.transform, graph.shape), float(sand_weight)) if sand_weight else graph.hazard_csr
    if mode == "fastest":
        objective, matrix = "time", graph.time_csr
    elif mode == "safest":
        objective, matrix = "hazard", hazard_csr
    else:
        objective, matrix = "balanced", blended_cost(graph.time_csr, hazard_csr, float(hazard_weight))
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
        "id":f"{stop_id}_{mode}_dynamic_c{crew}_l{load:g}_s{cap:g}_sw{sand_weight:g}_hw{hazard_weight:g}","stop":stop_id,
        "mode":mode,"preference":mode,"observed_stop_lonlat":stop["lonlat"],
        "crew":int(crew),"load_kg":float(load),"badge":"Scenario","budget_l":pnr.budget_l,
        "constants_hash":base["constants_hash"],**arrays,"distance_m":distance_m,
        "goal_access":{"badge":"Derived","status":"approach_only","offset_m":access["offset_m"],
                        "access_bound_m":ACCESS_BOUND_M,"last_leg_modeled":False,
                        "observed_stop_lonlat":stop["lonlat"],"route_goal_lonlat":arrays["coords"][-1]},
        "routing":{"slope_cap_deg":float(cap),"hard_max_deg":MAX_SLOPE_DEG,
                    "native_resolution_m":graph.resolution_m,"objective":objective,
                    "objective_cost":float(distances[goal_node]),
                    "sand_weight":float(sand_weight),"hazard_weight":float(hazard_weight),
                    "sand_model":{"badge":"Scenario","source":"THEMIS thermal inertia 100 m (Derived proxy) mapped to a terrain factor; weight is an operator Scenario",
                                  "ti_firm_tiu":SAND_TI_FIRM_TIU,"ti_loose_tiu":SAND_TI_LOOSE_TIU,"applies_to":"safest and balanced objectives; fastest ignores hazard"},
                    "balanced_definition":"equal-weight min-max normalized per-edge modeled time and mapped slope-hazard cost; summed by directed Dijkstra; bounded native corridor",
                    "data_class":"Scenario","body_mass_kg":float(body_mass),"load_kg_per_astronaut":float(load),
                    "sample_kg_per_stop":float(samples),"sample_mass_applied_to_return":True,
                    "return_model":"same_path_only; alternate fastest-return geometry unavailable"},
        "status_summary":{"destination_id":stop_id,"endpoint_class":"Derived approach endpoint","last_leg_modeled":False}}}


def return_request(request: dict) -> dict:
    """Least modeled time from an exact native vertex to habitat, carrying samples.

    No nearest-cell connector is invented. Interpolated replay positions must be
    settled on a known route vertex before this request is made.
    """
    ranges = {'slope_cap_deg': (0,15,15), 'crew_count': (1,2,2),
              'body_mass_kg': (43,110,82), 'load_kg': (0,40,15),
              'sample_kg_per_stop': (0,10,0)}
    values = {}
    for key, (lo, hi, default) in ranges.items():
        v = request.get(key, default)
        if isinstance(v, bool) or not isinstance(v, (int,float)) or not math.isfinite(v) or not lo <= v <= hi or (key == 'crew_count' and int(v) != v):
            return {'status':'error', 'code':'invalid_return_input', 'message':f'{key} must be within {lo}–{hi}.'}
        values[key] = float(v)
    point = request.get('start_lonlat')
    if not isinstance(point, (list,tuple)) or len(point) != 2 or any(isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) for v in point):
        return {'status':'error', 'code':'invalid_start', 'message':'A finite current longitude/latitude is required.'}
    try:
        base = _load_base()
    except Exception:
        return {'status':'unavailable', 'code':'native_terrain_unavailable', 'message':'Hash-checked native terrain is unavailable; no return was fabricated.'}
    old = base['native']
    c = dict(base['constants'])
    load = values['load_kg'] + values['sample_kg_per_stop']
    c.update(slope_limit_foot_deg=values['slope_cap_deg'], body_mass_kg=values['body_mass_kg'],
             carried_load_kg=load, return_load_kg=load)
    graph = build_native_routing_graph(old['elevation_m'], old['slope_deg'],
        transform=old['transform'], crs=old['crs'], resolution_m=old['resolution_m'],
        slope_limit_deg=values['slope_cap_deg'], body_mass_kg=values['body_mass_kg'], load_kg=load,
        return_load_kg=load, kappa=c['suit_factor_kappa'], watts_to_o2_ml_per_min=c['watts_to_o2_ml_per_min'],
        max_speed_mps=c['walk_speed_kmh']/3.6, source_row0=old['source_row0'], source_col0=old['source_col0'])
    x,y = transform(MARS_GEOGRAPHIC_CRS, graph.crs, [point[0]], [point[1]])
    col,row = ~graph.transform @ (x[0],y[0])
    def exact_cell(lonlat):
        if not isinstance(lonlat,(list,tuple)) or len(lonlat)!=2 or any(isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) for v in lonlat):
            return None
        xx,yy=transform(MARS_GEOGRAPHIC_CRS,graph.crs,[lonlat[0]],[lonlat[1]])
        cc,rr=~graph.transform @ (xx[0],yy[0])
        r,k=int(math.floor(rr)),int(math.floor(cc))
        if not (0<=r<graph.shape[0] and 0<=k<graph.shape[1]) or abs(rr-r-.5)>1e-5 or abs(cc-k-.5)>1e-5:
            return None
        return r,k
    goal=tuple(old['habitat_cell'])
    if not graph.walkable[goal]:
        return {'status':'no_route','code':'no_matching_route','message':'Habitat is blocked under the requested cap; it was not relaxed.'}
    start=exact_cell(point)
    partial=None
    if start is None:
        edge=request.get('start_edge_lonlat')
        cells=[exact_cell(p) for p in edge] if isinstance(edge,(list,tuple)) and len(edge)==2 else [None,None]
        a,b=cells
        if a is None or b is None or a==b or not graph.walkable[a] or not graph.walkable[b] or graph.time_csr[graph.node(a),graph.node(b)]<=0 or graph.time_csr[graph.node(b),graph.node(a)]<=0:
            return {'status':'no_route','code':'start_not_native_edge','message':'Current position needs a connected native vertex or legal adjacent edge; no unmodeled connector was drawn.'}
        av=np.array([a[1]+.5,a[0]+.5]);bv=np.array([b[1]+.5,b[0]+.5]);pv=np.array([col,row])
        ratio=float(np.dot(pv-av,bv-av)/np.dot(bv-av,bv-av))
        if not 0<ratio<1 or np.linalg.norm(pv-(av+ratio*(bv-av)))>1e-5:
            return {'status':'no_route','code':'start_not_on_edge','message':'Current position does not lie on the supplied native edge.'}
        dist,pred=fastest_home_field(graph,home=goal)
        choices=[]
        # The exact partial edge retains the native directed grade and speed;
        # time/O2 scale with traveled distance in the existing segment model.
        for source,target,fraction in [(b,a,ratio),(a,b,1-ratio)]:
            full=native_route_arrays(graph,[graph.node(source),graph.node(target)],constants=c)
            segment=dict(full['seg'][0]);segment['cost_terms']=dict(segment['cost_terms'])
            for key in ['t_s','o2_l']:segment[key]*=fraction
            for key in ['distance_m','hazard_score']:segment['cost_terms'][key]*=fraction
            cost=float(dist[graph.node(target)])+segment['t_s']
            if math.isfinite(cost):choices.append((cost,target,segment))
        if not choices:
            return {'status':'no_route','code':'no_matching_route','message':'No connected return satisfies the current constraints.'}
        _,start,partial=min(choices,key=lambda item:item[0])
    if not graph.walkable[start]:
        return {'status':'no_route','code':'no_matching_route','message':'Current position is blocked under the requested cap; it was not relaxed.'}
    if start==goal:
        from rasterio.transform import xy
        xx,yy=xy(graph.transform,*start,offset='center')
        lon,lat=transform(graph.crs,MARS_GEOGRAPHIC_CRS,[xx],[yy])
        arrays={'coords':[[lon[0],lat[0]]],'cum':{'t_s':[0.0],'o2_l':[0.0]},'seg':[]}
    else:
        distances,predecessors=dijkstra(graph.time_csr,directed=True,indices=graph.node(start),return_predecessors=True)
        if not np.isfinite(distances[graph.node(goal)]):
            return {'status':'no_route','code':'no_matching_route','message':'No connected return satisfies the current constraints; no fallback was substituted.'}
        arrays=path_from_field(graph,start=start,goal=goal,objective='time',distances=distances,predecessors=predecessors,constants=c).arrays
    if partial is not None:
        arrays['coords']=[point]+arrays['coords']
        arrays['seg']=[partial]+arrays['seg']
        for key,metric in [('t_s','t_s'),('o2_l','o2_l')]:
            arrays['cum'][key]=[0.0]+[v+partial[metric] for v in arrays['cum'][key]]
    return {'status':'ok','return_route':{'coords':arrays['coords'], 'cum':arrays['cum'], 'seg':arrays['seg'],
        'time_s':arrays['cum']['t_s'][-1], 'oxygen_l':arrays['cum']['o2_l'][-1],
        'distance_m':sum(s['cost_terms']['distance_m'] for s in arrays['seg']),
        'badge':'Scenario', 'objective':'least modeled time within bounded native corridor',
        'slope_cap_deg':values['slope_cap_deg'], 'carried_load_kg':load,
        'native_resolution_m':graph.resolution_m, 'constants_hash':base['constants_hash'],
        'connector_modeled':partial is not None}}
