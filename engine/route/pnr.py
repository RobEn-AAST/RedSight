"""Default O₂ point-of-no-return rule from the current replay consumer."""

from dataclasses import dataclass
import math


@dataclass(frozen=True)
class PnrResult:
    pnr_index: int
    budget_l: float
    capacity_l: float


def point_of_no_return(
    used_o2_l,
    home_o2_l,
    *,
    capacity_l,
    reserve_fraction,
    reserve_minutes,
    walkback_o2_lpm,
    return_margin,
    member_factors=(1.0, 1.0),
):
    used = list(map(float, used_o2_l))
    home = list(map(float, home_o2_l))
    factors = list(map(float, member_factors))
    if len(used) == 0 or len(used) != len(home):
        raise ValueError("used and home O₂ arrays must be non-empty and the same length")
    if not factors or any(not math.isfinite(f) or f <= 0 for f in factors):
        raise ValueError("member factors must be positive finite values")
    if any(not math.isfinite(v) or v < 0 for v in used + home):
        raise ValueError("O₂ arrays must contain finite non-negative values")
    if any(used[i] < used[i - 1] for i in range(1, len(used))):
        raise ValueError("used O₂ must be cumulative and non-decreasing")
    if any(home[i] < home[i - 1] for i in range(1, len(home))):
        raise ValueError("home O₂ must be non-decreasing along the outbound route")
    if not math.isfinite(capacity_l) or capacity_l <= 0:
        raise ValueError("capacity must be positive and finite")
    if not math.isfinite(reserve_fraction) or not 0 <= reserve_fraction < 1:
        raise ValueError("reserve fraction must be finite in [0, 1)")
    if not math.isfinite(reserve_minutes) or reserve_minutes < 0:
        raise ValueError("reserve minutes must be finite and non-negative")
    if not math.isfinite(walkback_o2_lpm) or walkback_o2_lpm < 0:
        raise ValueError("walkback O₂ rate must be finite and non-negative")
    if not math.isfinite(return_margin) or return_margin <= 0:
        raise ValueError("return margin must be positive and finite")
    reserve = max(reserve_fraction * capacity_l, reserve_minutes * walkback_o2_lpm)
    budget = capacity_l - reserve
    factor = max(factors)
    pnr = -1
    for index, (spent, return_cost) in enumerate(zip(used, home)):
        if factor * (spent + return_margin * return_cost) <= budget:
            pnr = index
        else:
            break
    return PnrResult(pnr, budget, capacity_l)
