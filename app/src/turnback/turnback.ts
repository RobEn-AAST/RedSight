import { hasCompleteAlternateReturn } from '../replay/replay-core.js'

/**
 * Turn-back slider logic (Tier 1, B4). Owner: Jana. Pure functions, no React,
 * no imports, so it runs under `node --test` and in the browser alike.
 *
 * Every number comes from an engine route file or constants.json (contract,
 * demo-focus-plan §15). This module only compares precomputed values against
 * a budget and interpolates between route points — the threshold/lookup work
 * the plan's design rule allows in the browser (§4). It never models O₂.
 *
 * O₂ model (demo-focus-plan §9c, decision D27), identical to Mission Replay
 * (app/src/replay/replay-core.js) so the slider and the replay always agree:
 *   capacity C = constants.o2_usable_primary_l
 *   reserve  R = max(reserve_fraction × C, reserve_minutes × walkback_o2_lpm)
 *                never spent by a plan
 *   budget   B = C − R (the slider moves B between 0 and C − R)
 *   turn rule: keep walking while f × (cum.o2_l + m × back.o2_l) ≤ B
 *              m = return_cost_margin, f = the hungrier suit in a pair (1 here)
 * All outputs are Scenario estimates: modeled guidance, never a guarantee.
 */

export interface ConstantLike {
  value: number
}

/** The constants.json keys this module reads. Names must stay stable (§4b). */
export const TURNBACK_CONSTANT_KEYS = [
  'o2_usable_primary_l',
  'reserve_fraction',
  'reserve_minutes',
  'walkback_o2_lpm',
  'return_cost_margin',
] as const

export type TurnBackConstantKey = (typeof TURNBACK_CONSTANT_KEYS)[number]

export interface O2Plan {
  capacityL: number
  reserveL: number
  /** Which rule set the reserve: the tank fraction or the walkback minutes. */
  reserveRule: 'fraction' | 'minutes'
  /** Largest usable budget, C − R. */
  maxBudgetL: number
  returnMargin: number
  walkbackLpm: number
}

/**
 * Builds the O₂ plan from constants.json. Returns the keys that are missing
 * instead of guessing a default: the UI must say what it can't compute.
 */
export function o2PlanFromConstants(
  constants: Partial<Record<string, ConstantLike>> | null | undefined,
): { plan: O2Plan | null; missing: TurnBackConstantKey[] } {
  const missing = TURNBACK_CONSTANT_KEYS.filter((k) => !Number.isFinite(constants?.[k]?.value))
  if (!constants || missing.length > 0) return { plan: null, missing }
  const v = (k: TurnBackConstantKey) => (constants[k] as ConstantLike).value
  const capacityL = v('o2_usable_primary_l')
  const byFraction = v('reserve_fraction') * capacityL
  const byMinutes = v('reserve_minutes') * v('walkback_o2_lpm')
  const reserveL = Math.max(byFraction, byMinutes)
  return {
    plan: {
      capacityL,
      reserveL,
      reserveRule: byFraction >= byMinutes ? 'fraction' : 'minutes',
      maxBudgetL: Math.max(0, capacityL - reserveL),
      returnMargin: v('return_cost_margin'),
      walkbackLpm: v('walkback_o2_lpm'),
    },
    missing: [],
  }
}

/** The route-file fields this module reads (subset of the §15 route file). */
export interface TurnBackRoute {
  coords: [number, number][]
  seg?: { cost_terms?: { distance_m?: number } }[]
  cum: { t_s: number[]; o2_l: number[] }
  back?: { t_s?: number[]; o2_l?: number[] }
  /** Optional fastest way home from each vertex (demo-focus-plan §9 Back_fast); ignored on a fastest route. */
  back_fast?: { t_s?: number[]; o2_l?: number[]; path?: [number, number][][] }
  mode?: string
}

export type TurnBackStatus = 'reaches-stop' | 'turns-back' | 'no-go'

export interface TurnBackResult {
  status: TurnBackStatus
  /** Turn point lies between coords[index] and coords[index + 1], at fraction `frac`. */
  index: number
  frac: number
  lonlat: [number, number]
  /** Modeled walking time from the habitat to the turn point (s). */
  outTimeS: number
  /** Modeled O₂ per crew member used to get there (L). */
  outO2L: number
  /** Expected O₂ (no margin) to walk home from the turn point (L). */
  homeO2L: number
  /** Expected time to walk home from the turn point (s). */
  homeTimeS: number
  /** Distance along the route to the turn point (m); null without seg distances. */
  distanceM: number | null
  /** Whole one-way route length (m); null without seg distances. */
  routeDistanceM: number | null
  /** Share of the route walked before turning, 0–1 (by distance; by point count without seg distances). */
  routeFraction: number
  /**
   * O₂ expected to be left above the reserve on arriving home:
   * B − f × (out + home). The return margin is why this is > 0.
   */
  spareAtHomeL: number
}

const lerp = (a: number, b: number, f: number) => a + (b - a) * f

/**
 * Cost of the way home from each vertex. With back_fast (§9), whichever modeled way home is cheaper is
 * used — the same rule as Mission Replay, so the slider and the replay keep agreeing.
 */
function wayHome(route: TurnBackRoute, ownO: number[], ownT: number[]): { BO: number[]; BT: number[] } {
  const n = ownO.length
  const bf = route.back_fast
  const fo = bf?.o2_l
  const ft = bf?.t_s
  if (!hasCompleteAlternateReturn(route) || fo?.length !== n || ft?.length !== n) return { BO: ownO, BT: ownT }
  return {
    BO: ownO.map((o, i) => Math.min(o, fo[i])),
    BT: ownT.map((t, i) => (fo[i] < ownO[i] ? ft[i] : t)),
  }
}

/** Returns null when the route arrays are not usable (wrong lengths, < 2 points). */
export function turnBackPoint(
  route: TurnBackRoute,
  budgetL: number,
  returnMargin: number,
  memberFactor = 1,
): TurnBackResult | null {
  const n = route.coords?.length ?? 0
  const U = route.cum?.o2_l
  const T = route.cum?.t_s
  if (n < 2 || U?.length !== n || T?.length !== n) return null
  const hasBack = route.back?.o2_l?.length === n && route.back?.t_s?.length === n
  if (!hasBack) return null
  const { BO, BT } = wayHome(route, route.back!.o2_l as number[], route.back!.t_s as number[])
  const f = memberFactor
  const m = returnMargin
  const need = (i: number) => f * (U[i] + m * BO[i])

  // Distance along the route, summed from the engine's per-segment distances.
  const segD = route.seg?.length === n - 1 ? route.seg.map((s) => s.cost_terms?.distance_m) : null
  const cumD: number[] | null =
    segD && segD.every((d) => Number.isFinite(d))
      ? segD.reduce<number[]>((acc, d) => [...acc, acc[acc.length - 1] + (d as number)], [0])
      : null

  const build = (status: TurnBackStatus, index: number, frac: number): TurnBackResult => {
    const j = Math.min(index + 1, n - 1)
    const at = (arr: number[]) => lerp(arr[index], arr[j], frac)
    const outO2L = at(U)
    const homeO2L = at(BO)
    return {
      status,
      index,
      frac,
      lonlat: [at(route.coords.map((c) => c[0])), at(route.coords.map((c) => c[1]))],
      outTimeS: at(T),
      outO2L,
      homeO2L,
      homeTimeS: at(BT),
      distanceM: cumD ? at(cumD) : null,
      routeDistanceM: cumD ? cumD[n - 1] : null,
      routeFraction:
        cumD && cumD[n - 1] > 0 ? at(cumD) / cumD[n - 1] : (index + frac) / (n - 1),
      spareAtHomeL: budgetL - f * (outO2L + homeO2L),
    }
  }

  if (!(budgetL >= need(0))) return build('no-go', 0, 0)
  if (need(n - 1) <= budgetL) return build('reaches-stop', n - 1, 0)

  // Walk out until the next point no longer fits (first crossing, as the replay does).
  let j = 0
  while (j + 1 < n && need(j + 1) <= budgetL) j++
  const d = need(j + 1) - need(j)
  const frac = d > 0 ? Math.min(1, Math.max(0, (budgetL - need(j)) / d)) : 0
  return build('turns-back', j, frac)
}

/** Smallest budget at which the planned walk reaches the stop (max of need along the route). */
export function budgetToReachStop(route: TurnBackRoute, returnMargin: number, memberFactor = 1): number | null {
  const n = route.coords?.length ?? 0
  const U = route.cum?.o2_l
  if (n < 2 || U?.length !== n || route.back?.o2_l?.length !== n || route.back.t_s?.length !== n) return null
  const own = route.back.o2_l
  const { BO } = wayHome(route, own, own)
  let worst = 0
  for (let i = 0; i < n; i++) worst = Math.max(worst, memberFactor * (U[i] + returnMargin * BO[i]))
  return worst
}
