import numpy as np
from affine import Affine
from scipy.sparse.csgraph import dijkstra
from rasterio.crs import CRS

from engine.model.native_grid import build_native_routing_graph
from engine.route.native import native_route_arrays, path_from_field
from engine.routing_api import normalized_balanced_cost, route_request


def constants(slope):
    return {"slope_limit_foot_deg":slope,"body_mass_kg":82,"carried_load_kg":15,
            "suit_factor_kappa":1.0,"watts_to_o2_ml_per_min":0.003,"walk_speed_kmh":3.6}


def test_zero_degree_graph_keeps_only_flat_edges_and_has_no_slope_violation():
    c = constants(0)
    graph = build_native_routing_graph(np.zeros((3,3),np.float32), np.zeros((3,3),np.float32),
        transform=Affine(1,0,0,0,-1,3), crs=CRS.from_string("+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +R=3396190 +units=m +no_defs"), resolution_m=1, slope_limit_deg=0,
        body_mass_kg=82,load_kg=15,kappa=1,watts_to_o2_ml_per_min=0.003,max_speed_mps=1)
    dist,pred = dijkstra(graph.time_csr,directed=True,indices=graph.node((0,0)),return_predecessors=True)
    path = path_from_field(graph,start=(0,0),goal=(2,2),objective="time",distances=dist,
                           predecessors=pred,constants=c)
    assert all(abs(segment["slope_deg"]) == 0 for segment in path.arrays["seg"])
    assert path.arrays["coords"][-1] != path.arrays["coords"][0]


def test_directed_same_path_return_cost_uses_return_sample_load():
    c = {**constants(15), "return_load_kg":5}
    elev = np.array([[0.0, 0.1],[0.0, 0.1]],dtype=np.float32)
    graph = build_native_routing_graph(elev,np.zeros((2,2),np.float32),
        transform=Affine(1,0,0,0,-1,2),crs=CRS.from_string("+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +R=3396190 +units=m +no_defs"),resolution_m=1,slope_limit_deg=15,
        body_mass_kg=82,load_kg=0,return_load_kg=5,kappa=1,
        watts_to_o2_ml_per_min=0.003,max_speed_mps=1)
    arrays = native_route_arrays(graph,[graph.node((0,0)),graph.node((0,1))],constants=c)
    assert len(arrays["cum"]["o2_l"]) == len(arrays["back"]["o2_l"]) == 2
    assert arrays["cum"]["o2_l"][1] != arrays["back"]["o2_l"][1]
    assert "back_fast" not in arrays


def test_balanced_cost_uses_equal_weight_minmax_edge_normalization():
    from scipy.sparse import csr_matrix
    time = csr_matrix([[0, 2, 4],[2,0,6],[4,6,0]],dtype=np.float32)
    hazard = csr_matrix([[0, 8, 2],[8,0,6],[2,6,0]],dtype=np.float32)
    balanced = normalized_balanced_cost(time,hazard)
    assert balanced[0,1] == np.float32(0.5)
    assert balanced[0,2] == np.float32(0.25)
    assert np.isclose(balanced[1,2], np.float32(5/6))


def test_api_rejects_over_limit_and_zero_is_not_silently_raised():
    base = {"destination_id":"S1","mode":"fastest","crew_count":2,"body_mass_kg":82,"load_kg":15}
    assert route_request({**base,"slope_cap_deg":15.01})["code"] == "invalid_slope_cap"
    # The real terrain cache shows the current habitat is blocked by 0 degrees; it reports no route,
    # rather than raising the cap or substituting a preset.
    result = route_request({**base,"slope_cap_deg":0})
    assert result["status"] == "no_route"
    assert result["code"] == "no_matching_route"
