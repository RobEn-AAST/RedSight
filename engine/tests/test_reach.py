import math

import numpy as np
import pytest
from scipy.sparse.csgraph import dijkstra

from engine.model.metabolism import segment_cost
from engine.model.native_grid import build_native_routing_graph
from engine.route.reach import (
    _accumulate_along_tree,
    budget_levels,
    reach_mask,
    ring_lines,
    round_trip_o2_field,
    touches_edge,
    usable_budget_l,
)

CONSTANTS = {
    "suit_factor_kappa": 1.2,
    "watts_to_o2_ml_per_min": 2.87,
    "walk_speed_kmh": 3.6,
    "body_mass_kg": 82.0,
    "carried_load_kg": 15.0,
    "return_cost_margin": 1.2,
    "o2_usable_primary_l": 385.0,
    "reserve_fraction": 0.25,
    "reserve_minutes": 30.0,
    "walkback_o2_lpm": 1.22,
}


def _graph(elevation, *, slope=None, res=2.0):
    elevation = np.asarray(elevation, dtype=np.float32)
    slope = np.zeros_like(elevation) if slope is None else np.asarray(slope, dtype=np.float32)
    from affine import Affine

    return build_native_routing_graph(
        elevation, slope, transform=Affine(res, 0, 0, 0, -res, 0), resolution_m=res, slope_limit_deg=15.0,
        body_mass_kg=CONSTANTS["body_mass_kg"], load_kg=CONSTANTS["carried_load_kg"],
        kappa=CONSTANTS["suit_factor_kappa"], watts_to_o2_ml_per_min=CONSTANTS["watts_to_o2_ml_per_min"],
        max_speed_mps=CONSTANTS["walk_speed_kmh"] / 3.6,
    )


def test_pointer_jumping_matches_walking_the_tree():
    rng = np.random.default_rng(3)
    n = 400
    parent = np.full(n, -1)
    for i in range(1, n):
        parent[i] = rng.integers(0, i)
    parent[rng.choice(np.arange(1, n), 20, replace=False)] = -1  # unreached nodes / extra roots
    edge = rng.random(n)
    expected = np.zeros(n)
    for i in range(n):
        node, total = i, 0.0
        while parent[node] >= 0:
            total += edge[node]
            node = parent[node]
        expected[i] = total
    assert np.allclose(_accumulate_along_tree(parent, edge), expected)


def test_field_equals_route_rule_along_the_fastest_path():
    # Gentle slope so out and back differ; check one far cell against a hand-summed path.
    rows, cols = 25, 25
    elevation = np.add.outer(np.arange(rows) * 0.3, np.arange(cols) * 0.1)
    graph = _graph(elevation)
    home = (12, 12)
    field = round_trip_o2_field(graph, home_node=graph.node(home), constants=CONSTANTS)
    assert field[home] == 0.0
    _, pred = dijkstra(graph.time_csr, directed=True, indices=graph.node(home), return_predecessors=True)
    target = graph.node((0, 24))
    out = back = 0.0
    node = target
    while node != graph.node(home):
        up = pred[node]
        (r0, c0), (r1, c1) = divmod(up, cols), divmod(node, cols)
        step = graph.resolution_m * math.hypot(r1 - r0, c1 - c0)
        grade = math.degrees(math.atan2(elevation[r1, c1] - elevation[r0, c0], step))
        # The routes' own per-edge model (engine.route.native._edge -> segment_cost).
        model = dict(distance_m=step, body_mass_kg=82.0, load_kg=15.0, terrain_factor=1.0,
                     kappa=1.2, watts_to_o2_ml_per_min=2.87, max_speed_mps=1.0)
        out += segment_cost(grade_deg=grade, **model).o2_l
        back += segment_cost(grade_deg=-grade, **model).o2_l
        node = up
    assert field[0, 24] == pytest.approx(out + 1.2 * back, rel=1e-5)


def test_field_grows_with_distance_and_blocked_cells_are_unreachable():
    elevation = np.zeros((31, 31))
    slope = np.zeros((31, 31))
    slope[:, 20] = 30.0  # a wall the crew cannot cross
    graph = _graph(elevation, slope=slope)
    field = round_trip_o2_field(graph, home_node=graph.node((15, 10)), constants=CONSTANTS)
    assert field[15, 12] < field[15, 15] < field[15, 19]
    assert np.isinf(field[15, 25])


def test_reach_mask_fills_gaps_and_ring_wraps_the_reachable_area():
    elevation = np.zeros((60, 60))
    slope = np.zeros((60, 60))
    slope[28:32, 38:42] = 30.0  # a small blocked patch inside the reachable area
    graph = _graph(elevation, slope=slope)
    home = (30, 30)
    field = round_trip_o2_field(graph, home_node=graph.node(home), constants=CONSTANTS)
    budget = float(np.nanmax(np.where(np.isfinite(field), field, np.nan)[30, :])) * 0.6
    mask = reach_mask(field, home, budget)
    assert mask[home] and mask[30, 40]  # the blocked patch is filled
    assert not touches_edge(mask)
    lines = ring_lines(mask, block=4)
    assert len(lines) == 1
    ring = lines[0]
    assert np.allclose(ring[0], ring[-1])  # a closed outline
    assert ring[:, 0].min() < home[0] < ring[:, 0].max()


def test_budget_levels_and_usable_budget():
    full = usable_budget_l(CONSTANTS)
    assert full == pytest.approx(385.0 - max(0.25 * 385.0, 30 * 1.22))
    levels = budget_levels(full)
    assert levels[0] == 25.0 and levels[-1] == pytest.approx(full)
    assert all(b > a for a, b in zip(levels, levels[1:]))
