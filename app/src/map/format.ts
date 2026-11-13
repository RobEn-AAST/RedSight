import type { ContractBadge, EngineRoute, EngineRouteMode } from '@/lib/engineDataContext'
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

/** Mode names shown to the operator. "Safest" is never shown (AGENTS rule 3). */
export const MODE_LABEL: Record<EngineRouteMode, string> = {
  fastest: 'Fastest',
  safest: 'Lowest hazard',
}

export const MODE_CAPTION: Record<EngineRouteMode, string> = {
  fastest: 'Least modeled walking time inside the hard slope limit.',
  safest: 'Lowest modeled hazard score within the available data. Not a guarantee.',
}

/** Route line colours on the map and on the cards. */
export const MODE_COLOR: Record<EngineRouteMode, string> = {
  fastest: '#ffb224',
  safest: '#4fd08a',
}

export function formatDuration(seconds: number): string {
  const total = Math.round(seconds / 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`
}

export function formatDistance(metres: number): string {
  return metres >= 1000 ? `${(metres / 1000).toFixed(2)} km` : `${Math.round(metres)} m`
}

export interface RouteSummary {
  /** One-way path length, summed from the engine's per-segment distances. */
  distanceM: number
  /** Walk out along the route plus the engine's cost home from the stop. */
  roundTripS: number
  /** O2 per crew member for the same round trip, litres. */
  roundTripO2L: number
  budgetL: number
  maxSlopeDeg: number
  /** true when the engine's turn-back point is the stop itself. */
  reachesStop: boolean
  /** One-way distance to the engine's turn-back point. */
  turnBackDistanceM: number
}

/**
 * Reads the totals a route card shows. Sums and maxima of engine values only:
 * no model runs in the browser.
 */
export function summarizeRoute(route: EngineRoute): RouteSummary {
  const last = route.coords.length - 1
  const pnr = Math.min(Math.max(route.pnr_index, 0), last)
  let distanceM = 0
  let turnBackDistanceM = 0
  let maxSlopeDeg = 0
  route.seg.forEach((s, i) => {
    distanceM += s.cost_terms.distance_m
    if (i < pnr) turnBackDistanceM += s.cost_terms.distance_m
    maxSlopeDeg = Math.max(maxSlopeDeg, Math.abs(s.slope_deg))
  })
  return {
    distanceM,
    roundTripS: route.cum.t_s[last] + route.back.t_s[last],
    roundTripO2L: route.cum.o2_l[last] + route.back.o2_l[last],
    budgetL: route.budget_l,
    maxSlopeDeg,
    reachesStop: pnr >= last,
    turnBackDistanceM,
  }
}
