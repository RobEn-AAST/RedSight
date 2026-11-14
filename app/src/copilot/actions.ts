import { missionLimits } from '../types/mission.ts'
import { scienceGoalOptions } from '../lib/materials.ts'
import type { EngineRoutePreference, EngineRoute } from '../lib/engineDataContext.ts'

const MISSION_FIELDS = ['crewCount','bodyMassKg','loadKg','loadBasis','sampleKgPerStop','roverAvailable','scienceGoalId','scienceGoalNote']

/** Pure app-side validation; the model never decides whether values are admissible. */
export function validateMissionPatch(args: Record<string, unknown>): string | null {
  for (const key of ['bodyMassKg','loadKg','sampleKgPerStop']) {
    if (args[key] !== undefined && (typeof args[key] !== 'number' || !Number.isFinite(args[key]))) return `${key} must be a finite number.`
  }
  if (Object.keys(args).some((key) => !MISSION_FIELDS.includes(key))) return 'Unsupported mission field.'
  if (args.crewCount !== undefined && (!Number.isInteger(args.crewCount) || Number(args.crewCount) < missionLimits.crewMin || Number(args.crewCount) > missionLimits.crewMax)) return 'crewCount must be 1 or 2.'
  if (args.bodyMassKg !== undefined && (typeof args.bodyMassKg !== 'number' || args.bodyMassKg < missionLimits.bodyMassMin || args.bodyMassKg > missionLimits.bodyMassMax)) return 'bodyMassKg must be 43–110 kg.'
  if (args.loadKg !== undefined && (typeof args.loadKg !== 'number' || args.loadKg < 0 || args.loadKg > missionLimits.loadPerAstronautMax)) return 'loadKg must be 0–40 kg.'
  if (args.sampleKgPerStop !== undefined && (typeof args.sampleKgPerStop !== 'number' || args.sampleKgPerStop < missionLimits.sampleMin || args.sampleKgPerStop > missionLimits.sampleMax)) return 'sampleKgPerStop must be 0–10 kg.'
  if (args.loadBasis !== undefined && !['total','perAstronaut'].includes(String(args.loadBasis))) return 'loadBasis must be total or perAstronaut.'
  if (args.roverAvailable !== undefined && typeof args.roverAvailable !== 'boolean') return 'roverAvailable must be boolean.'
  if (args.scienceGoalId !== undefined && !scienceGoalOptions.some((goal) => goal.id === args.scienceGoalId)) return 'Unknown scienceGoalId; choose an available goal ID.'
  if (args.scienceGoalNote !== undefined && (typeof args.scienceGoalNote !== 'string' || args.scienceGoalNote.length > 500)) return 'scienceGoalNote must be text up to 500 characters.'
  return null
}

function finiteArray(values: unknown, length: number): values is number[] {
  return (
  Array.isArray(values) && values.length === length && values.every((value) => typeof value === 'number' && Number.isFinite(value))
  )
}
/** Rejects partial/misaligned route payloads before they can become the live plan. */
export function validateDynamicRoute(
  route: unknown,
  preference: EngineRoutePreference,
  availableStopIds: string[],
  expectedSlopeCapDeg?: number,
): route is EngineRoute {
  if (!route || typeof route !== 'object') return false
  const r = route as EngineRoute
  const n = Array.isArray(r.coords) ? r.coords.length : 0
  if (n < 2 || !availableStopIds.includes(r.stop) || r.preference !== preference || r.mode !== preference) return false
  if (!r.coords.every((point) => Array.isArray(point) && point.length === 2 && point.every((value) => Number.isFinite(value)))) return false
  if (!Array.isArray(r.seg) || r.seg.length !== n - 1) return false
  if (!r.cum || !r.back) return false
  for (const block of [r.cum,r.back]) {
    for (const key of ['t_s','o2_l'] as const) {
      const values = block[key]
      if (!finiteArray(values,n) || values[0] !== 0 || values.some((value,i) => i > 0 && value < values[i-1])) return false
    }
  }
  if (!Number.isFinite(r.budget_l) || r.budget_l < 0 || !Number.isFinite(r.total_s)) return false
  if (!r.routing || !Number.isFinite(r.routing.slope_cap_deg) || r.routing.slope_cap_deg < 0 || r.routing.slope_cap_deg > 15 || r.routing.hard_max_deg !== 15) return false
  if (expectedSlopeCapDeg !== undefined && r.routing.slope_cap_deg !== expectedSlopeCapDeg) return false
  if (r.badge !== 'Scenario' || r.routing.sample_mass_applied_to_return !== true) return false
  if (r.seg.some((s) => !Number.isFinite(s.slope_deg) || Math.abs(s.slope_deg) > r.routing!.slope_cap_deg + 1e-8 || !Number.isFinite(s.t_s) || s.t_s < 0 || !Number.isFinite(s.o2_l) || s.o2_l < 0 || !Number.isFinite(s.cost_terms?.distance_m) || s.cost_terms.distance_m <= 0)) return false
  if (!r.routing.return_model?.startsWith('same_path_only')) return false
  if (r.back_fast !== undefined) return false
  if (r.goal_access?.badge !== 'Derived' || r.goal_access.status !== 'approach_only' || r.goal_access.last_leg_modeled !== false) return false
  const endpoint = r.goal_access.route_goal_lonlat
  const observed = r.goal_access.observed_stop_lonlat ?? r.observed_stop_lonlat
  if (!observed || observed.length !== 2 || !observed.every(Number.isFinite)) return false
  if (!endpoint || endpoint.some((value, index) => value !== r.coords[n-1][index])) return false
  if (!Number.isFinite(r.goal_access.offset_m) || r.goal_access.offset_m < 0 || r.goal_access.offset_m > 10) return false
  const close = (a: number, b: number) => Math.abs(a-b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b))
  for (let i = 1; i < n; i++) {
    if (!close(r.cum.t_s[i]-r.cum.t_s[i-1], r.seg[i-1].t_s) || !close(r.cum.o2_l[i]-r.cum.o2_l[i-1], r.seg[i-1].o2_l)) return false
  }
  if (!close(r.total_s!, r.cum.t_s[n-1]+r.back.t_s[n-1])) return false
  if (!Number.isInteger(r.pnr_index) || r.pnr_index < -1 || r.pnr_index >= n) return false
  return true
}
