"""Real native terrain integration checks; skipped when the ignored pilot cache is absent."""
from pathlib import Path

import numpy as np
import pytest

from engine.routing_api import route_request


MANIFEST = Path("data/raw/engine-pilot/input-manifest.json")
pytestmark = pytest.mark.skipif(not MANIFEST.is_file(), reason="ignored hash-checked native terrain bundle is not installed")

BASE = {"destination_id":"D1","crew_count":2,"body_mass_kg":82,"load_kg":15,"sample_kg_per_stop":2}


def test_real_fastest_route_has_complete_directed_same_path_return_and_no_alternate_claim():
    result = route_request({**BASE,"mode":"fastest","slope_cap_deg":15})
    assert result["status"] == "ok", result
    route = result["route"]
    n = len(route["coords"])
    assert n >= 2
    for block in (route["cum"],route["back"]):
        for key in ("t_s","o2_l"):
            values = np.asarray(block[key],dtype=float)
            assert len(values) == n and np.isfinite(values).all()
            assert np.all(np.diff(values) >= -1e-9)
    assert route["back"]["t_s"][-1] > 0 and route["back"]["o2_l"][-1] > 0
    assert route["routing"]["sample_mass_applied_to_return"] is True
    assert route["routing"]["return_model"].startswith("same_path_only")
    assert "back_fast" not in route
    assert route["goal_access"]["badge"] == "Derived"
    assert route["goal_access"]["last_leg_modeled"] is False
    assert max(abs(s["slope_deg"]) for s in route["seg"]) <= 15.0 + 1e-8


def test_real_balanced_request_runs_composite_dijkstra_on_native_edges():
    result = route_request({**BASE,"mode":"balanced","slope_cap_deg":15})
    assert result["status"] == "ok", result
    route = result["route"]
    assert route["mode"] == route["preference"] == "balanced"
    assert route["routing"]["objective"] == "balanced"
    assert "equal-weight min-max normalized" in route["routing"]["balanced_definition"]
    assert "back_fast" not in route


@pytest.mark.parametrize("cap",[0,10])
def test_real_terrain_does_not_relax_unreachable_slope_caps(cap):
    result = route_request({**BASE,"mode":"fastest","slope_cap_deg":cap})
    assert result["status"] == "no_route"
    assert result["code"] == "no_matching_route"
    assert result["constraints"]["slope_cap_deg"] == cap
