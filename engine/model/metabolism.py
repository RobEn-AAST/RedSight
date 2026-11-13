"""Scenario movement costs: Pandolf load carriage transferred to Mars conditions."""

from dataclasses import dataclass
import math


MIN_METABOLIC_POWER_W = 30.0
"""Positive downhill floor; conservative model assumption, not physiology evidence."""


@dataclass(frozen=True)
class SegmentCost:
    t_s: float
    o2_l: float
    power_w: float
    grade_deg: float
    distance_m: float
    terrain_factor: float
    speed_mps: float


def walking_speed_mps(grade_deg: float, max_speed_mps: float = 1.6 / 3.6) -> float:
    """Piecewise F5 speed model; angles are degrees and downhill is capped."""
    if not math.isfinite(grade_deg) or not math.isfinite(max_speed_mps) or max_speed_mps <= 0:
        raise ValueError("grade and positive max speed must be finite")
    if grade_deg < -15 or grade_deg > 15:
        raise ValueError("grade is outside the 15 degree foot limit")
    if grade_deg <= -12:
        factor = max(0.3, 1.1 - (abs(grade_deg) - 12) * (0.8 / 3.0))
    elif grade_deg < 0:
        factor = 1.1
    else:
        factor = max(0.3, math.cos(math.radians(2 * grade_deg)))
    return max_speed_mps * factor


def pandolf_power_w(
    body_mass_kg: float,
    load_kg: float,
    speed_mps: float,
    grade_deg: float,
    terrain_factor: float,
) -> float:
    """Pandolf et al. 1977 power, with grade expressed as percent."""
    values = (body_mass_kg, load_kg, speed_mps, grade_deg, terrain_factor)
    if not all(math.isfinite(v) for v in values):
        raise ValueError("movement inputs must be finite")
    if body_mass_kg <= 0 or load_kg < 0 or speed_mps <= 0 or terrain_factor < 1:
        raise ValueError("mass, speed, load, or terrain factor is outside its valid range")
    grade_percent = 100 * math.tan(math.radians(grade_deg))
    power = (
        1.5 * body_mass_kg
        + 2.0 * (body_mass_kg + load_kg) * (load_kg / body_mass_kg) ** 2
        + terrain_factor
        * (body_mass_kg + load_kg)
        * (1.5 * speed_mps**2 + 0.35 * speed_mps * grade_percent)
    )
    return max(MIN_METABOLIC_POWER_W, power)


def segment_cost(
    *,
    distance_m: float,
    grade_deg: float,
    body_mass_kg: float,
    load_kg: float,
    terrain_factor: float,
    kappa: float = 1.3,
    watts_to_o2_ml_per_min: float = 2.9,
    max_speed_mps: float = 1.6 / 3.6,
) -> SegmentCost:
    """Return modeled time and raw expected per-member O₂ liters for one edge."""
    if not math.isfinite(distance_m) or distance_m <= 0:
        raise ValueError("distance must be positive and finite")
    if not math.isfinite(kappa) or kappa <= 0:
        raise ValueError("kappa must be positive and finite")
    if not math.isfinite(watts_to_o2_ml_per_min) or watts_to_o2_ml_per_min <= 0:
        raise ValueError("O₂ conversion must be positive and finite")
    speed = walking_speed_mps(grade_deg, max_speed_mps)
    time_s = distance_m / speed * terrain_factor
    power = pandolf_power_w(body_mass_kg, load_kg, speed, grade_deg, terrain_factor)
    o2_l = power * kappa * time_s * watts_to_o2_ml_per_min / 60_000
    return SegmentCost(time_s, o2_l, power * kappa, grade_deg, distance_m, terrain_factor, speed)
