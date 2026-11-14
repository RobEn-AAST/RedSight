from pathlib import Path

import numpy as np
import pytest
from scipy.sparse import csr_matrix

from engine.routing_api import (
    apply_sand_weight,
    blended_cost,
    route_request,
    ti_to_eta,
)

MANIFEST = Path("data/raw/engine-pilot/input-manifest.json")
BASE = {"destination_id": "S2", "slope_cap_deg": 15, "crew_count": 2,
        "body_mass_kg": 82, "load_kg": 15, "sample_kg_per_stop": 2}


def test_ti_to_eta_maps_firm_loose_and_linear_between():
    eta = ti_to_eta(np.array([700.0, 450.0, 325.0, 200.0, 100.0]))
    assert eta[0] == pytest.approx(1.0) and eta[1] == pytest.approx(1.0)
    assert eta[2] == pytest.approx(1.55)
    assert eta[3] == pytest.approx(2.1) and eta[4] == pytest.approx(2.1)


def test_apply_sand_weight_scales_hazard_by_destination_eta_only_when_weighted():
    hazard = csr_matrix(np.array([[0, 10.0], [10.0, 0]], dtype=np.float32))
    eta = np.array([1.0, 2.1])
    unchanged = apply_sand_weight(hazard, eta, 0.0)
    assert unchanged[0, 1] == pytest.approx(10.0)
    scaled = apply_sand_weight(hazard, eta, 2.0)
    assert scaled[0, 1] == pytest.approx(10.0 * (1 + 2.0 * 1.1))
    assert scaled[1, 0] == pytest.approx(10.0)  # destination cell 0 is firm


def test_blended_cost_extremes_match_normalized_inputs():
    t = csr_matrix(np.array([[0, 2, 4], [2, 0, 6], [4, 6, 0]], dtype=np.float32))
    h = csr_matrix(np.array([[0, 8, 2], [8, 0, 6], [2, 6, 0]], dtype=np.float32))
    assert blended_cost(t, h, 0.5)[0, 1] == np.float32(0.5)
    assert blended_cost(t, h, 0.0)[0, 1] == np.float32(0.0)
    assert blended_cost(t, h, 1.0)[0, 1] == np.float32(1.0)


@pytest.mark.parametrize("key,value,code", [
    ("sand_weight", -1, "invalid_sand_weight"),
    ("sand_weight", 3.5, "invalid_sand_weight"),
    ("hazard_weight", 1.5, "invalid_hazard_weight"),
    ("hazard_weight", True, "invalid_hazard_weight"),
])
def test_invalid_factor_values_are_rejected(key, value, code):
    result = route_request({**BASE, "mode": "balanced", key: value})
    assert result["status"] == "error" and result["code"] == code


@pytest.mark.skipif(not MANIFEST.is_file(), reason="native terrain manifest not installed")
def test_sand_weight_changes_the_safest_route_objective_and_is_echoed():
    plain = route_request({**BASE, "mode": "safest", "sand_weight": 0})
    sandy = route_request({**BASE, "mode": "safest", "sand_weight": 3})
    assert plain["status"] == sandy["status"] == "ok"
    p, s = plain["route"]["routing"], sandy["route"]["routing"]
    assert p["sand_weight"] == 0 and s["sand_weight"] == 3
    assert s["objective_cost"] > p["objective_cost"]
    assert s["sand_model"]["badge"] == "Scenario"


@pytest.mark.skipif(not MANIFEST.is_file(), reason="native terrain manifest not installed")
def test_hazard_weight_changes_balanced_objective():
    a = route_request({**BASE, "mode": "balanced", "hazard_weight": 0.0})
    b = route_request({**BASE, "mode": "balanced", "hazard_weight": 1.0})
    assert a["status"] == b["status"] == "ok"
    assert a["route"]["routing"]["hazard_weight"] == 0.0
    assert a["route"]["routing"]["objective_cost"] != b["route"]["routing"]["objective_cost"]
