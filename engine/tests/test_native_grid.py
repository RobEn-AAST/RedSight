import math

import numpy as np
import pytest
from rasterio.transform import from_origin

from engine.model.metabolism import segment_cost
from engine.model.native_grid import build_native_routing_graph, select_access_goal


def test_native_graph_blocks_diagonal_corner_cut_and_over_limit_grade():
    elevation = np.zeros((2, 2), dtype=np.float32)
    slope = np.zeros((2, 2), dtype=np.float32)
    slope[0, 1] = 16.0
    slope[1, 0] = 16.0
    graph = build_native_routing_graph(
        elevation, slope, transform=from_origin(0, 2, 1, 1), resolution_m=1.0,
        slope_limit_deg=15.0, body_mass_kg=82, load_kg=15, kappa=1.3,
        watts_to_o2_ml_per_min=2.9, max_speed_mps=1.6 / 3.6,
    )

    assert graph.walkable.tolist() == [[True, False], [False, True]]
    assert graph.time_csr.nnz == 0


def test_native_graph_applies_the_existing_directional_movement_cost():
    elevation = np.array([[0.0, 0.0], [0.0, -0.1]], dtype=np.float32)
    slope = np.zeros((2, 2), dtype=np.float32)
    graph = build_native_routing_graph(
        elevation, slope, transform=from_origin(0, 2, 1, 1), resolution_m=1.0,
        slope_limit_deg=15.0, body_mass_kg=82, load_kg=15, kappa=1.3,
        watts_to_o2_ml_per_min=2.9, max_speed_mps=1.6 / 3.6,
    )

    grade = math.degrees(math.atan2(-0.1, math.sqrt(2)))
    expected = segment_cost(
        distance_m=math.sqrt(2), grade_deg=grade, body_mass_kg=82, load_kg=15,
        terrain_factor=1.0, kappa=1.3, watts_to_o2_ml_per_min=2.9,
        max_speed_mps=1.6 / 3.6,
    )
    source, destination = 0, 3
    assert graph.time_csr[source, destination] == pytest.approx(expected.t_s, rel=1e-6)
    assert graph.time_csr[destination, source] == pytest.approx(
        segment_cost(
            distance_m=math.sqrt(2), grade_deg=-grade, body_mass_kg=82, load_kg=15,
            terrain_factor=1.0, kappa=1.3, watts_to_o2_ml_per_min=2.9,
            max_speed_mps=1.6 / 3.6,
        ).t_s,
        rel=1e-6,
    )


@pytest.mark.parametrize("grade", [-14.999, -12.0, -11.9, -0.1, 0.0, 0.1, 14.999])
def test_native_graph_cost_matches_scalar_model_at_speed_breaks(grade):
    elevation = np.array([[0.0, math.tan(math.radians(grade))]], dtype=np.float32)
    graph = build_native_routing_graph(
        elevation, np.zeros_like(elevation), transform=from_origin(0, 1, 1, 1), resolution_m=1.0,
        slope_limit_deg=15.0, body_mass_kg=82, load_kg=15, kappa=1.3,
        watts_to_o2_ml_per_min=2.9, max_speed_mps=1.6 / 3.6,
    )
    actual_grade = math.degrees(math.atan2(float(elevation[0, 1] - elevation[0, 0]), 1.0))
    expected = segment_cost(
        distance_m=1.0, grade_deg=actual_grade, body_mass_kg=82, load_kg=15,
        terrain_factor=1.0, kappa=1.3, watts_to_o2_ml_per_min=2.9,
        max_speed_mps=1.6 / 3.6,
    )
    assert graph.time_csr[0, 1] == pytest.approx(expected.t_s, rel=1e-6)
    assert graph.time_csr[1, 0] == pytest.approx(
        segment_cost(
            distance_m=1.0, grade_deg=-actual_grade, body_mass_kg=82, load_kg=15,
            terrain_factor=1.0, kappa=1.3, watts_to_o2_ml_per_min=2.9,
            max_speed_mps=1.6 / 3.6,
        ).t_s,
        rel=1e-6,
    )


def test_access_goal_must_be_in_habitat_component_and_within_ten_metres():
    walkable = np.ones((30, 30), dtype=bool)
    labels = np.ones((30, 30), dtype=np.int32)
    labels[5, 5] = 2
    transform = from_origin(0, 30, 1, 1)
    target_xy = (15.5, 14.5)

    goal = select_access_goal(
        walkable, labels, component_id=1, target_xy=target_xy,
        transform=transform, max_offset_m=10.0,
    )

    assert goal["row_col"] == [15, 15]
    assert goal["offset_m"] == pytest.approx(0.0)
    assert select_access_goal(
        walkable, labels, component_id=2, target_xy=target_xy,
        transform=transform, max_offset_m=10.0,
    ) is None
