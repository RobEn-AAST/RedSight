"""Read and validate the stable JSON constants contract."""

import json
import math
from pathlib import Path


REQUIRED_CONSTANTS = (
    "suit_factor_kappa",
    "reserve_fraction",
    "slope_limit_foot_deg",
    "watts_to_o2_ml_per_min",
    "o2_usable_primary_l",
    "walk_speed_kmh",
    "crew_size_default",
    "body_mass_kg",
    "carried_load_kg",
    "reserve_minutes",
    "walkback_o2_lpm",
    "return_cost_margin",
    "sample_mass_per_stop_kg",
)


def read_constants(path: str | Path):
    raw = json.loads(Path(path).read_text())
    missing = [key for key in REQUIRED_CONSTANTS if key not in raw]
    if missing:
        raise ValueError(f"constants file missing stable keys: {', '.join(missing)}")
    values = {}
    for key in REQUIRED_CONSTANTS:
        value = raw[key].get("value")
        if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value):
            raise ValueError(f"constant {key} must have a finite numeric value")
        values[key] = float(value)
    if not 0 < values["suit_factor_kappa"] or not 0 <= values["reserve_fraction"] < 1:
        raise ValueError("kappa must be positive and reserve fraction must be in [0, 1)")
    if not 0 < values["slope_limit_foot_deg"] <= 90:
        raise ValueError("foot slope limit must be in (0, 90]")
    if not 0 < values["o2_usable_primary_l"]:
        raise ValueError("primary O₂ capacity must be positive")
    if values["walk_speed_kmh"] <= 0 or values["body_mass_kg"] <= 0:
        raise ValueError("walk speed and body mass must be positive")
    if values["carried_load_kg"] < 0 or values["sample_mass_per_stop_kg"] < 0:
        raise ValueError("load and sample mass must be non-negative")
    if values["reserve_minutes"] < 0 or values["walkback_o2_lpm"] < 0:
        raise ValueError("reserve time and walkback rate must be non-negative")
    if not 1.0 <= values["return_cost_margin"] <= 1.5:
        raise ValueError("return margin must be within the constants range [1, 1.5]")
    return raw, values
