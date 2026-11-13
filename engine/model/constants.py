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

TEAM_MODEL_DOC = "https://github.com/RobEn-AAST/RedSight/blob/main/docs/demo-focus-plan.md"
CONSTANT_SOURCE_URLS = {
    "suit_factor_kappa": "https://www.lpi.usra.edu/lunar/artemis/NorcrossEtAl_NASA-TP-2010-216115_PlanetarySuitMetabolicCosts.pdf",
    "reserve_fraction": TEAM_MODEL_DOC,
    "slope_limit_foot_deg": TEAM_MODEL_DOC,
    "slope_limit_rover_deg": "https://ntrs.nasa.gov/citations/20250011301",
    "watts_to_o2_ml_per_min": "https://pmc.ncbi.nlm.nih.gov/articles/PMC2129144/",
    "o2_usable_primary_l": "https://nlsp.nasa.gov/search/data/details/IDP-LSDA_HARDWARE-0000000000000562?dataType=HARDWARE",
    "gravity_mars": "https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html",
    "walk_speed_kmh": "https://www.nasa.gov/wp-content/uploads/static/history/alsj/a11/a11.gaits.html",
    "crew_size_default": "https://www.nasa.gov/pdf/373665main_NASA-SP-2009-566.pdf",
    "body_mass_kg": "https://ntrs.nasa.gov/citations/20260003038",
    "carried_load_kg": TEAM_MODEL_DOC,
    "sample_mass_per_stop_kg": TEAM_MODEL_DOC,
    "reserve_minutes": "https://www.nasa.gov/wp-content/uploads/static/history/alsj/19790073512_1979073512.pdf",
    "walkback_o2_lpm": "https://www.nasa.gov/wp-content/uploads/static/history/alsj/19790073512_1979073512.pdf",
    "return_cost_margin": TEAM_MODEL_DOC,
    "emergency_supply_min": "https://www.nasa.gov/wp-content/uploads/2009/07/188963main_extravehicular_mobility_unit.pdf",
    "o2_status_step": TEAM_MODEL_DOC,
    "radio_mast_height_m": TEAM_MODEL_DOC,
    "blackout_warn_min": TEAM_MODEL_DOC,
}


def add_source_urls(raw):
    """Add the §15 citation field while preserving existing keys and descriptive source text."""
    enriched = {}
    for key, value in raw.items():
        if isinstance(value, dict):
            enriched[key] = dict(value)
        else:
            enriched[key] = value
    for key, record in enriched.items():
        if not isinstance(record, dict):
            continue
        if not record.get("source_url"):
            url = CONSTANT_SOURCE_URLS.get(key)
            if not url:
                raise ValueError(f"constant {key} has no source_url mapping")
            record["source_url"] = url
    return enriched


def read_constants(path: str | Path):
    raw = add_source_urls(json.loads(Path(path).read_text()))
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
