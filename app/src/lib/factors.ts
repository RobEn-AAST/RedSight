/**
 * Mission factors — pure evaluation + validation (docs/superpowers/specs/2026-11-14-mission-factors-design.md).
 * Everything here is a Scenario estimate over an engine route; nothing is measured along the route.
 * Constants and ranges come from public/data/factors.json so the UI, copilot and tests share one source.
 */
import { SOL_S } from './mars24.ts'
import type { Daylight } from './mars24.ts'

export interface FactorSettings {
  radiationBudgetMsv: number
  sepEvent: boolean
  startLocalHour: number
  daylightRequired: boolean
  coldLimitK: number | null
  stopMinutes: number
}

export interface FactorDef {
  id: string
  label: string
  kind: string
  field: string
  type: 'number' | 'boolean' | 'nullableNumber' | 'group' | 'goal'
  unit?: string
  min?: number
  max?: number
  step?: number
  default?: number | boolean | null
  requires?: string
  badge: string
  effect: string
  source: string
}

export interface FactorDefs {
  constants: Record<string, { value: number }>
  factors: FactorDef[]
  phase2: { id: string; label: string; reason: string }[]
}

export type VerdictStatus = 'within' | 'over' | 'off' | 'unavailable'

export interface FactorVerdict {
  id: 'radiation' | 'daylight' | 'cold'
  label: string
  status: VerdictStatus
  /** Modeled value in `unit`, or null when the check is off/unavailable. */
  value: number | null
  limit: number | null
  unit: string
  detail: string
  badge: 'Scenario'
}

const constant = (defs: FactorDefs, key: string): number => defs.constants[key].value
const fixed = (n: number, digits = 2) => n.toFixed(digits)

/** Modeled EVA duration in Earth seconds: engine round trip plus on-site time. */
const evaSeconds = (route: { total_s: number }, f: FactorSettings) => route.total_s + f.stopMinutes * 60

function radiation(route: { total_s: number }, f: FactorSettings, defs: FactorDefs): FactorVerdict {
  const sols = evaSeconds(route, f) / (constant(defs, 'mars_sol_hours') * 3600)
  const dose = constant(defs, 'rad_msv_per_day') * sols + (f.sepEvent ? constant(defs, 'sep_event_msv') : 0)
  const over = dose > f.radiationBudgetMsv
  return {
    id: 'radiation',
    label: 'Radiation dose',
    status: over ? 'over' : 'within',
    value: dose,
    limit: f.radiationBudgetMsv,
    unit: 'mSv',
    detail:
      `Modeled estimate ${fixed(dose, 3)} mSv vs ${fixed(f.radiationBudgetMsv, 2)} mSv budget` +
      (f.sepEvent ? ' (includes the Sept 2017 solar particle event scenario)' : '') +
      '. RAD surface rate × EVA time; suit and terrain shielding not modeled.',
    badge: 'Scenario',
  }
}

function daylight(route: { total_s: number }, f: FactorSettings, sun: Daylight | null): FactorVerdict {
  const off = (status: VerdictStatus, detail: string): FactorVerdict => ({
    id: 'daylight', label: 'Daylight window', status, value: null, limit: null, unit: 'LTST h', detail, badge: 'Scenario',
  })
  if (!f.daylightRequired) return off('off', 'Daylight is not required for this Scenario.')
  if (!sun || sun.sunrise === null || sun.sunset === null) return off('unavailable', 'No sunrise/sunset available for this date.')
  const end = f.startLocalHour + evaSeconds(route, f) / (SOL_S / 24)
  const within = f.startLocalHour >= sun.sunrise && end <= sun.sunset
  return {
    id: 'daylight',
    label: 'Daylight window',
    status: within ? 'within' : 'over',
    value: end,
    limit: sun.sunset,
    unit: 'LTST h',
    detail:
      `Modeled EVA ${fixed(f.startLocalHour, 1)}–${fixed(end, 1)} LTST vs daylight ${fixed(sun.sunrise, 1)}–${fixed(sun.sunset, 1)} LTST (Mars24, flat horizon).`,
    badge: 'Scenario',
  }
}

/** Modeled air temperature (K): sinusoid between the REMS reported daily min and max (Scenario shape). */
export function modeledAirTempK(ltstHour: number, defs: FactorDefs): number {
  const lo = constant(defs, 'rems_air_min_k')
  const hi = constant(defs, 'rems_air_max_k')
  const peak = constant(defs, 'temperature_peak_ltst_hour')
  return (lo + hi) / 2 + ((hi - lo) / 2) * Math.cos((2 * Math.PI * (ltstHour - peak)) / 24)
}

function cold(route: { total_s: number }, f: FactorSettings, defs: FactorDefs): FactorVerdict {
  if (f.coldLimitK === null) {
    return { id: 'cold', label: 'Cold exposure', status: 'off', value: null, limit: null, unit: 'K', detail: 'No cold limit set.', badge: 'Scenario' }
  }
  const hours = evaSeconds(route, f) / (SOL_S / 24)
  let minK = Infinity
  for (let h = 0; h <= hours + 1e-9; h += 5 / 60) minK = Math.min(minK, modeledAirTempK(f.startLocalHour + h, defs))
  minK = Math.min(minK, modeledAirTempK(f.startLocalHour + hours, defs))
  return {
    id: 'cold',
    label: 'Cold exposure',
    status: minK < f.coldLimitK ? 'over' : 'within',
    value: minK,
    limit: f.coldLimitK,
    unit: 'K',
    detail:
      `Modeled minimum air temperature ${fixed(minK, 0)} K vs ${fixed(f.coldLimitK, 0)} K limit. Scenario sinusoid between REMS reported daily min/max; rover-local, not a forecast.`,
    badge: 'Scenario',
  }
}

/** Evaluate the limit-type factors (radiation, daylight, cold) for one engine route. */
export function evaluateFactors(
  route: { total_s: number },
  settings: FactorSettings,
  defs: FactorDefs,
  sun: Daylight | null,
): FactorVerdict[] {
  return [radiation(route, settings, defs), daylight(route, settings, sun), cold(route, settings, defs)]
}

/** Fields the copilot's set_mission_factors tool may change (derived from factors.json). */
export function factorPatchFields(defs: FactorDefs): FactorDef[] {
  const out: FactorDef[] = []
  for (const def of defs.factors) {
    if (def.type === 'group' || def.type === 'goal' || def.id === 'slope') continue
    out.push(def)
    if (def.requires) out.push({ ...def, id: `${def.id}-requires`, field: def.requires, type: 'boolean', min: undefined, max: undefined })
  }
  return out
}

/** App-side validation; the model never decides whether values are admissible. */
export function validateFactorPatch(args: Record<string, unknown>, defs: FactorDefs): string | null {
  const fields = new Map(factorPatchFields(defs).map((d) => [d.field, d]))
  for (const [key, value] of Object.entries(args)) {
    const def = fields.get(key)
    if (!def) return `Unsupported factor field: ${key}.`
    if (def.type === 'boolean') {
      if (typeof value !== 'boolean') return `${key} must be true or false.`
      continue
    }
    if (def.type === 'nullableNumber' && value === null) continue
    if (typeof value !== 'number' || !Number.isFinite(value)) return `${key} must be a finite number${def.type === 'nullableNumber' ? ' or null' : ''}.`
    if (def.min !== undefined && value < def.min) return `${key} must be ${def.min}–${def.max}.`
    if (def.max !== undefined && value > def.max) return `${key} must be ${def.min}–${def.max}.`
  }
  return null
}

/** Plain-language lines explaining what shaped a route (shown on the route card, spoken by the copilot). */
export function describeRouting(routing: {
  objective: string
  slope_cap_deg: number
  sand_weight?: number
  hazard_weight?: number
}): string[] {
  const lines = [`Objective: ${routing.objective}; every edge is within the ${routing.slope_cap_deg}° slope cap.`]
  if (routing.objective === 'fastest') lines.push('Fastest ignores hazard and sand weights.')
  else {
    if (routing.sand_weight !== undefined) lines.push(`Sand avoidance weight ${routing.sand_weight}× on THEMIS-derived loose-ground cost (Derived proxy, Scenario weight).`)
    if (routing.objective === 'balanced' && routing.hazard_weight !== undefined) lines.push(`Hazard share ${Math.round(routing.hazard_weight * 100)}% vs time ${Math.round((1 - routing.hazard_weight) * 100)}% (Scenario).`)
  }
  return lines
}
