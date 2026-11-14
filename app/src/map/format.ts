import type {
  ContractBadge,
  EngineRoutePreference,
  PlanMember,
} from '@/lib/engineDataContext'
import type { EvidenceClass } from '@/types/layers'

/** Contract badges are capitalised; the badge component uses lowercase classes. */
export function badgeToEvidence(badge: ContractBadge | undefined): EvidenceClass {
  switch (badge) {
    case 'Observed':
      return 'observed'
    case 'Derived':
      return 'derived'
    case 'Unavailable':
      return 'unavailable'
    default:
      // An unlabeled number is treated as the weakest claim, never the strongest.
      return 'scenario'
  }
}

/** Mode names shown to the crew. "Safe"/"safest" is never shown (AGENTS rule 3). */
export const MODE_LABEL: Record<EngineRoutePreference, string> = {
  fastest: 'Fastest',
  safest: 'Lowest modeled hazard',
  balanced: 'Balanced',
}

export const MODE_CAPTION: Record<EngineRoutePreference, string> = {
  fastest: 'Least walking time, inside the slope limit.',
  safest: 'Gentlest ground and fewest modeled hazards. Takes longer.',
  balanced: 'Equal-weight time and mapped slope-hazard cost within the modeled corridor.',
}

/** Route colours on the map and the cards. */
export const MODE_COLOR: Record<EngineRoutePreference, string> = {
  fastest: '#ffb224',
  safest: '#4fd08a',
  balanced: '#7ca9ff',
}

/** In a split, astronaut B is drawn in white so the two lines never read as two modes. */
export const MEMBER_B_COLOR = '#e9edf3'

export const NO_RETURN_COLOR = '#ff6d6d'

/** Blocked ground (hazards.geojson). Must match `--color-hazard` in tokens.css. */
export const HAZARD_COLOR = '#b98cff'

/** Ground the engine cannot judge (no elevation data, map edge): routes avoid it too. */
export const UNKNOWN_GROUND_COLOR = '#9aa3b2'

/** Short map label for a hazards.geojson `reason` (codes from demo-focus-plan §15). */
export function hazardLabel(reason: unknown): string {
  switch (reason) {
    case 'slope':
      return 'Too steep'
    case 'nodata':
      return 'No elevation data'
    case 'edge':
      return 'Map edge'
    case 'rover_step':
      return 'Rover: step too high'
    case 'rover_sand':
      return 'Rover: soft sand'
    case 'rover_width':
      return 'Rover: too narrow'
    default:
      return 'No-go'
  }
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60))
  const h = Math.floor(total / 60)
  const m = total % 60
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`
}

export function formatDistance(metres: number): string {
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres / 10) * 10} m`
}

export interface MemberSummary {
  /** One-way path length. */
  distanceM: number
  /** Out to the target and back home. */
  roundTripS: number
  roundTripO2L: number
  maxSlopeDeg: number
  /** true when the target sits inside the modeled return budget. */
  reachesTarget: boolean
  /** Index of the modeled no-return point on the way out. */
  pnrIndex: number
  /** Distance and time out to the no-return point. */
  pnrDistanceM: number
  pnrTimeS: number
  /** O2 left over after the whole round trip (negative when it does not fit). */
  spareO2L: number
}

/** O₂ scaling for a crew with a non-reference body mass (lib/memberFactor.ts). */
export interface O2Scale {
  /** Worst member's O₂ factor (1 = the plan's reference astronaut). */
  factor: number
  /** constants.json return_cost_margin, used to move the no-return point when factor ≠ 1. */
  returnMargin: number
}

/**
 * Reads the totals a route card shows. Sums and maxima of engine values only, plus the optional body-mass
 * factor; with a factor ≠ 1 the no-return point is recomputed with the engine's rule
 * (engine/route/pnr.py: factor × (out + margin × back) ≤ budget).
 */
export function summarizeMember(m: PlanMember, budgetL: number, scale?: O2Scale): MemberSummary {
  const last = m.coords.length - 1
  const f = scale?.factor ?? 1
  let pnr = Math.min(Math.max(m.pnr_index, 0), last)
  if (scale && f !== 1) {
    pnr = -1
    for (let i = 0; i <= last; i++) {
      if (f * (m.cum.o2_l[i] + scale.returnMargin * m.back.o2_l[i]) <= budgetL) pnr = i
      else break
    }
    pnr = Math.max(pnr, 0)
  }
  let distanceM = 0
  let pnrDistanceM = 0
  let maxSlopeDeg = 0
  m.seg.forEach((s, i) => {
    distanceM += s.distance_m
    if (i < pnr) pnrDistanceM += s.distance_m
    maxSlopeDeg = Math.max(maxSlopeDeg, Math.abs(s.slope_deg))
  })
  const roundTripO2L = f * (m.cum.o2_l[last] + m.back.o2_l[last])
  return {
    distanceM,
    roundTripS: m.cum.t_s[last] + m.back.t_s[last],
    roundTripO2L,
    maxSlopeDeg,
    reachesTarget: pnr >= last,
    pnrIndex: pnr,
    pnrDistanceM,
    pnrTimeS: m.cum.t_s[pnr],
    spareO2L: budgetL - roundTripO2L,
  }
}

/**
 * A crew's plan is as long as its slowest member and as tight as its
 * hungriest one: both leave and come home together (demo-focus-plan §8).
 */
export function summarizeCrew(members: PlanMember[], budgetL: number, scale?: O2Scale) {
  const each = members.map((m) => summarizeMember(m, budgetL, scale))
  return {
    each,
    roundTripS: Math.max(...each.map((s) => s.roundTripS)),
    roundTripO2L: Math.max(...each.map((s) => s.roundTripO2L)),
    spareO2L: Math.min(...each.map((s) => s.spareO2L)),
    maxSlopeDeg: Math.max(...each.map((s) => s.maxSlopeDeg)),
    reachesAll: each.every((s) => s.reachesTarget),
  }
}
