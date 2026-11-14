/**
 * Per-astronaut O₂ factors for a pair with different body masses.
 *
 * The shipped plans are modeled for one reference body mass (constants.json `body_mass_kg`). Walking speed
 * in the engine's model does not depend on body mass, so each segment's time stays the same; only the
 * Pandolf et al. (1977) metabolic power changes. A member's factor is their modeled O₂ for the walk (out and
 * back) divided by the reference walker's, which is what the engine's turn rule, the turn-back slider and the
 * replay already accept as `memberFactors` (engine/route/pnr.py: factor × (out + margin × back)).
 * Scenario: the same model as the routes, not a measurement.
 */

/** Pandolf standing-with-load terms, W (engine/model/metabolism.py `pandolf_standing_power_w`). */
export function pandolfStandingW(bodyMassKg: number, loadKg: number): number {
  return 1.5 * bodyMassKg + 2.0 * (bodyMassKg + loadKg) * (loadKg / bodyMassKg) ** 2
}

/** Pandolf power with the standing floor (engine/model/metabolism.py `pandolf_power_w`). */
export function pandolfPowerW(bodyMassKg: number, loadKg: number, speedMps: number, gradeDeg: number, terrain = 1): number {
  const standing = pandolfStandingW(bodyMassKg, loadKg)
  const gradePercent = 100 * Math.tan((gradeDeg * Math.PI) / 180)
  const power = standing + terrain * (bodyMassKg + loadKg) * (1.5 * speedMps ** 2 + 0.35 * speedMps * gradePercent)
  return Math.max(standing, power)
}

interface FactorSeg {
  t_s: number
  slope_deg: number
  /** Plan files store it here; engine route files keep it in cost_terms. */
  distance_m?: number
  cost_terms?: { distance_m?: number; terrain_factor?: number }
}
export interface FactorRoute {
  seg: FactorSeg[]
  /** Cumulative way-home time from each route point (same path back). */
  back?: { t_s: number[] }
}

/** Energy (W·s, up to the shared κ and O₂ conversion) to walk the route out and back the same way. */
function routeEnergy(route: FactorRoute, bodyMassKg: number, loadKg: number): number {
  let total = 0
  const back = route.back?.t_s
  route.seg.forEach((s, i) => {
    const terrain = s.cost_terms?.terrain_factor ?? 1
    const d = s.distance_m ?? s.cost_terms?.distance_m ?? 0
    if (!(s.t_s > 0) || !(d > 0)) return
    total += pandolfPowerW(bodyMassKg, loadKg, (d * terrain) / s.t_s, s.slope_deg, terrain) * s.t_s
    const backT = back && back.length === route.seg.length + 1 ? back[i + 1] - back[i] : s.t_s
    if (backT > 0) total += pandolfPowerW(bodyMassKg, loadKg, (d * terrain) / backT, -s.slope_deg, terrain) * backT
  })
  return total
}

/**
 * O₂ factor per member relative to the plan's reference body mass. Returns 1 for the reference mass,
 * more than 1 for a heavier astronaut. Falls back to 1 when the route carries no usable segments.
 */
export function memberO2Factors(
  route: FactorRoute | null,
  bodyMassesKg: number[],
  referenceMassKg: number,
  loadKg: number,
): number[] {
  if (!route || !Array.isArray(route.seg) || route.seg.length === 0 || !(referenceMassKg > 0)) return bodyMassesKg.map(() => 1)
  const ref = routeEnergy(route, referenceMassKg, loadKg)
  if (!(ref > 0)) return bodyMassesKg.map(() => 1)
  return bodyMassesKg.map((w) => (Number.isFinite(w) && w > 0 ? routeEnergy(route, w, loadKg) / ref : 1))
}
