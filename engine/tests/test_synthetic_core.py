import math

import numpy as np
import pytest
from engine.model.grid import build_graph
from engine.model.metabolism import pandolf_power_w, pandolf_standing_power_w, segment_cost, walking_speed_mps
from engine.model.native_grid import _movement_arrays
from engine.route.arrays import route_arrays
from engine.route.pnr import point_of_no_return
from engine.route.solve import shortest_path


def graph(dem, *, sand=None, nodata=None, resolution=10.0):
    return build_graph(
        np.asarray(dem, dtype=float),
        resolution_m=resolution,
        terrain_factor=None if sand is None else np.asarray(sand, dtype=float),
        nodata=nodata,
    )


def test_flat_edge_matches_hand_calculated_time_and_o2():
    result = segment_cost(
        distance_m=10.0,
        grade_deg=0.0,
        body_mass_kg=80.0,
        load_kg=0.0,
        terrain_factor=1.0,
        kappa=1.0,
        watts_to_o2_ml_per_min=2.9,
        max_speed_mps=1.6 / 3.6,
    )
    # Flat Pandolf: 1.5*80 + 80*(1.5*(1.6/3.6)^2) = 143.7037 W.
    expected_power = 1.5 * 80 + 80 * (1.5 * (1.6 / 3.6) ** 2)
    expected_time = 10 / (1.6 / 3.6)
    expected_o2 = expected_power * expected_time * 2.9 / 60_000
    assert result.t_s == pytest.approx(expected_time)
    assert result.o2_l == pytest.approx(expected_o2)
    assert result.power_w == pytest.approx(expected_power)


def test_wall_forces_route_through_the_only_gap():
    z = np.zeros((5, 5))
    z[:, 2] = [0, 0, 50, 0, 0]
    g = graph(z, resolution=10)
    path = shortest_path(g, start=(2, 0), goal=(2, 4), objective="time")
    assert (2, 2) not in path.nodes
    # The high middle ridge creates a hard wall; the route passes through an edge gap.
    cells = [g.cell(node) for node in path.nodes]
    assert any(row in (0, 4) for row, _ in cells)
    assert all(g.valid[r, c] for r, c in cells)


def test_sand_factor_increases_time_and_oxygen_cost():
    firm = graph([[0, 0]], sand=[[1.0, 1.0]], resolution=10)
    sand = graph([[0, 0]], sand=[[2.1, 2.1]], resolution=10)
    e_firm = firm.edge_cost(0, 1)
    e_sand = sand.edge_cost(0, 1)
    assert e_sand.t_s > e_firm.t_s
    assert e_sand.o2_l > e_firm.o2_l


def test_nodata_cell_and_incident_edges_are_hard_blocked():
    g = graph([[0, -9999, 0]], nodata=-9999)
    assert not g.valid[0, 1]
    assert g.edge_cost((0, 0), (0, 1)) is None
    assert g.edge_cost((0, 1), (0, 2)) is None
    with pytest.raises(ValueError, match="unreachable"):
        shortest_path(g, start=(0, 0), goal=(0, 2), objective="time")


def test_diagonal_cannot_cut_between_two_blocked_orthogonal_cells():
    g = graph([[0, -9999], [-9999, 0]], nodata=-9999)
    assert g.edge_cost((0, 0), (1, 1)) is None
    with pytest.raises(ValueError, match="unreachable"):
        shortest_path(g, start=(0, 0), goal=(1, 1), objective="time")


def test_unreachable_goal_has_explicit_no_path_outcome():
    z = np.zeros((3, 5))
    z[:, 2] = [0, 50, 0]
    g = graph(z, resolution=10)
    with pytest.raises(ValueError, match="unreachable"):
        shortest_path(g, start=(1, 0), goal=(1, 4), objective="time")


def test_reverse_grade_and_cost_are_directional():
    g = graph([[0, 1]], resolution=10)
    uphill = g.edge_cost((0, 0), (0, 1))
    downhill = g.edge_cost((0, 1), (0, 0))
    assert uphill.grade_deg == pytest.approx(math.degrees(math.atan2(1, 10)))
    assert downhill.grade_deg == pytest.approx(-uphill.grade_deg)
    assert uphill.t_s != pytest.approx(downhill.t_s)
    assert uphill.o2_l != pytest.approx(downhill.o2_l)


def test_all_admissible_edge_objective_costs_are_finite_and_positive():
    g = graph([[0, 0.5], [0.2, 0.1]], sand=[[1.0, 2.1], [1.5, 1.0]])
    assert g.edge_count > 0
    assert np.all(np.isfinite(g.time_csr.data)) and np.all(g.time_csr.data > 0)
    assert np.all(np.isfinite(g.hazard_csr.data)) and np.all(g.hazard_csr.data > 0)
    assert np.all(np.isfinite(g.o2_edges)) and np.all(g.o2_edges > 0)


def test_exact_15_degree_edge_passes_but_meaningfully_steeper_edge_is_blocked():
    at_15 = 10 * math.tan(math.radians(15))
    below = graph([[0, at_15]], resolution=10)
    above = graph([[0, 10 * math.tan(math.radians(15.0001))]], resolution=10)
    assert below.edge_cost((0, 0), (0, 1)) is not None
    assert above.edge_cost((0, 0), (0, 1)) is None


def test_external_conservative_hard_slope_grid_masks_flat_mean_elevation_cells():
    dem = np.zeros((2, 3))
    hard_slope = np.zeros_like(dem)
    hard_slope[0, 1] = 18.0
    g = build_graph(dem, resolution_m=10.0, hard_slope_deg=hard_slope)
    assert g.valid[0, 0]
    assert not g.valid[0, 1]
    assert g.slope_max_deg[0, 1] == pytest.approx(18.0)


def test_external_hard_slope_nodata_is_blocked_without_filling():
    dem = np.array([[0.0, -9999.0, 0.0]])
    hard_slope = np.array([[2.0, np.nan, np.nan]])
    g = build_graph(dem, resolution_m=10.0, nodata=-9999, hard_slope_deg=hard_slope)
    assert g.valid[0, 0]
    assert not g.valid[0, 1]
    assert not g.valid[0, 2]


def test_route_arrays_sum_segments_and_backtracks_same_geometry_directionally():
    g = graph([[0, 1, 1]], resolution=10)
    outbound = shortest_path(g, start=(0, 0), goal=(0, 2), objective="time")
    arrays = route_arrays(g, outbound.nodes)
    assert len(arrays["coords"]) == 3
    assert len(arrays["seg"]) == 2
    assert arrays["cum"]["t_s"][-1] == pytest.approx(sum(s["t_s"] for s in arrays["seg"]))
    assert arrays["cum"]["o2_l"][-1] == pytest.approx(sum(s["o2_l"] for s in arrays["seg"]))
    assert arrays["back"]["t_s"][0] == 0
    assert arrays["back"]["o2_l"][0] == 0
    assert arrays["back"]["t_s"][-1] == pytest.approx(
        g.edge_cost((0, 2), (0, 1)).t_s + g.edge_cost((0, 1), (0, 0)).t_s
    )
    assert arrays["back"]["o2_l"][-1] == pytest.approx(
        g.edge_cost((0, 2), (0, 1)).o2_l + g.edge_cost((0, 1), (0, 0)).o2_l
    )
    assert arrays["back"]["o2_l"][-1] != pytest.approx(arrays["cum"]["o2_l"][-1])
    assert arrays["total_s"] == pytest.approx(arrays["cum"]["t_s"][-1] + arrays["back"]["t_s"][-1])


def test_fastest_is_no_slower_than_any_admissible_candidate():
    g = graph([[0, 0, 0], [0, 2, 0], [0, 0, 0]], resolution=10)
    fastest = shortest_path(g, start=(1, 0), goal=(1, 2), objective="time")
    candidate = [(1, 0), (0, 1), (0, 2), (1, 2)]
    candidate_time = sum(g.edge_cost(a, b).t_s for a, b in zip(candidate, candidate[1:]))
    assert fastest.time_s <= candidate_time


def test_pnr_includes_exact_budget_equality():
    result = point_of_no_return(
        [0.0, 20.0, 40.0], [0.0, 20.0, 40.0], capacity_l=100.0,
        reserve_fraction=0.2, reserve_minutes=0, walkback_o2_lpm=0,
        return_margin=1.0, member_factors=[1.0],
    )
    assert result.budget_l == 80.0
    assert result.pnr_index == 2


def test_pnr_with_monotone_same_path_costs_stops_at_last_feasible_prefix_point():
    result = point_of_no_return(
        [0.0, 20.0, 30.0, 40.0], [0.0, 20.0, 25.0, 30.0], capacity_l=100.0,
        reserve_fraction=0.25, reserve_minutes=0, walkback_o2_lpm=0,
        return_margin=1.0, member_factors=[1.0, 1.2],
    )
    assert result.pnr_index == 2


def test_pnr_rejects_decreasing_same_path_home_costs():
    with pytest.raises(ValueError, match="home O₂ must be non-decreasing"):
        point_of_no_return(
            [0.0, 30.0, 60.0], [0.0, 35.0, 20.0], capacity_l=100.0,
            reserve_fraction=0.0, reserve_minutes=0, walkback_o2_lpm=0,
            return_margin=1.2, member_factors=[1.0, 1.0],
        )


@pytest.mark.parametrize("margin", [0.5, 1.6, float("nan"), float("inf")])
def test_pnr_rejects_margin_outside_scenario_range(margin):
    with pytest.raises(ValueError, match="return margin"):
        point_of_no_return(
            [0.0, 1.0], [0.0, 1.0], capacity_l=100.0,
            reserve_fraction=0.2, reserve_minutes=0, walkback_o2_lpm=0,
            return_margin=margin, member_factors=[1.0],
        )


def test_pnr_rejects_reserve_that_consumes_the_full_capacity():
    with pytest.raises(ValueError, match="leave positive usable capacity"):
        point_of_no_return(
            [0.0], [0.0], capacity_l=100.0,
            reserve_fraction=0.2, reserve_minutes=100, walkback_o2_lpm=1.0,
            return_margin=1.2, member_factors=[1.0],
        )


def test_downhill_power_never_drops_below_pandolf_standing_with_load():
    # Pandolf et al. 1977 standing terms for 82 kg + 15 kg: 1.5*82 + 2*97*(15/82)**2 W.
    standing = 1.5 * 82 + 2 * 97 * (15 / 82) ** 2
    assert pandolf_standing_power_w(82, 15) == pytest.approx(standing)
    assert standing == pytest.approx(129.49, abs=0.01)
    flat = pandolf_power_w(82, 15, walking_speed_mps(0.0), 0.0, 1.0)
    assert flat == pytest.approx(158.2, abs=0.1)
    for grade in (-2.0, -5.0, -10.0, -12.0, -14.0, -15.0):
        power = pandolf_power_w(82, 15, walking_speed_mps(grade), grade, 1.0)
        assert power >= standing - 1e-9
        assert power <= flat
    # The old 30 W floor sat far below standing metabolism.
    assert pandolf_power_w(82, 15, walking_speed_mps(-10.0), -10.0, 1.0) == pytest.approx(standing)


def test_native_grid_movement_arrays_use_the_same_downhill_floor():
    grades = np.array([-15.0, -10.0, -5.0, -1.0, 0.0, 5.0, 15.0])
    distance = 1.0117
    kwargs = dict(body_mass_kg=82.0, load_kg=15.0, kappa=1.3, watts_to_o2_ml_per_min=2.9,
                  max_speed_mps=1.6 / 3.6)
    times, o2 = _movement_arrays(distance, grades, **kwargs)
    for grade, t_s, o2_l in zip(grades, times, o2):
        scalar = segment_cost(distance_m=distance, grade_deg=float(grade), terrain_factor=1.0, **kwargs)
        assert t_s == pytest.approx(scalar.t_s)
        assert o2_l == pytest.approx(scalar.o2_l)
        assert scalar.power_w >= 1.3 * pandolf_standing_power_w(82.0, 15.0) - 1e-9
