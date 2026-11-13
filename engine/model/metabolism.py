"""Scenario movement costs: Pandolf load carriage transferred to Mars conditions."""

from dataclasses import dataclass
import math


PANDOLF_1977_SOURCE = (
    "Pandolf KB, Givoni B, Goldman RF (1977) Predicting energy expenditure with loads while "
    "standing or walking very slowly. J Appl Physiol 43(4):577-581. "
    "https://doi.org/10.1152/jappl.1977.43.4.577"
)
"""Primary source of the load-carriage equation and of its standing-with-load terms."""


def pandolf_standing_power_w(body_mass_kg: float, load_kg: float) -> float:
    """Standing-with-load terms of Pandolf et al. (1977): ``1.5*M + 2*(M+L)*(L/M)**2`` in watts.

    These are the first two terms of the same equation, i.e. its own estimate of the cost of standing
    still while carrying the load. They are used as the downhill floor: on steep negative grades the
    linear grade term of the full equation drives the total below this value (and below zero), which
    would mean walking downhill costs less than standing. Scenario model assumption: the floor is a
    lower bound, not a measured downhill walking cost.
    """
    if not (math.isfinite(body_mass_kg) and math.isfinite(load_kg)) or body_mass_kg <= 0 or load_kg < 0:
        raise ValueError("mass must be positive and load non-negative")
    return 1.5 * body_mass_kg + 2.0 * (body_mass_kg + load_kg) * (load_kg / body_mass_kg) ** 2


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
    slope_tolerance_deg = 1e-10
    if grade_deg < -15 - slope_tolerance_deg or grade_deg > 15 + slope_tolerance_deg:
        raise ValueError("grade is outside the 15 degree foot limit")
    grade_deg = min(15.0, max(-15.0, grade_deg))
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
    """Pandolf et al. 1977 power, with grade expressed as percent.

    Never below the equation's own standing-with-load terms (:func:`pandolf_standing_power_w`).
    """
    values = (body_mass_kg, load_kg, speed_mps, grade_deg, terrain_factor)
    if not all(math.isfinite(v) for v in values):
        raise ValueError("movement inputs must be finite")
    if body_mass_kg <= 0 or load_kg < 0 or speed_mps <= 0 or terrain_factor < 1:
        raise ValueError("mass, speed, load, or terrain factor is outside its valid range")
    grade_percent = 100 * math.tan(math.radians(grade_deg))
    standing = pandolf_standing_power_w(body_mass_kg, load_kg)
    power = (
        standing
        + terrain_factor
        * (body_mass_kg + load_kg)
        * (1.5 * speed_mps**2 + 0.35 * speed_mps * grade_percent)
    )
    return max(standing, power)


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
