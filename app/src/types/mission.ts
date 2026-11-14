/** Shared mission types — the editable shared state later route functions consume.
 *  Model ranges follow docs/demo-focus-plan.md §8 (D19) — team model choices,
 *  NOT NASA competition rules. The engine consumes crew ∈ {1,2} × load buckets
 *  {5,15,30} kg (§15); the UI snaps entered values to the nearest bucket.
 */

export interface MissionConfig {
  /** EVA crew size. Range 1–2, default 2. NASA DRA 5.0 buddy rule informs the
   *  default; solo is allowed by the team model with a buddy-rule warning. */
  crewCount: number
  /** Body mass of astronaut A (or the solo astronaut), W in kg. Range 43–110, default 82 (ICES-2026-127). */
  bodyMassKg: number
  /** Body mass of astronaut B when the crew is a pair (kg). Same range and default. */
  bodyMassKgB: number
  /** Carried package/equipment mass in kilograms, interpreted per `loadBasis`.
 *  Per-astronaut range 0–40 kg, default 15 (Scenario slider, plan §8). */
  loadKg: number
  /** Whether `loadKg` is per astronaut or the whole-mission total. */
  loadBasis: LoadBasis
  /** Sample mass picked up per stop (kg), added to carried load on legs after
   *  each stop. Range 0–10, default 2 (Scenario, plan §8). */
  sampleKgPerStop: number
  /** Whether a rover is available for the excursion. Input is recorded now
   *  (user-authorized); rover-vs-foot route execution is Tier 2 (E0). */
  roverAvailable: boolean
  /** Selected science-goal id (see lib/materials.ts). */
  scienceGoalId: string
  /** Free-text operator note (used when scienceGoalId === 'custom'). */
  scienceGoalNote: string
  /** ISO timestamp when the operator confirmed the mission; null while in setup. */
  confirmedAt: string | null
  /** Copilot-selected route objective and explicit Scenario slope preference. */
  routePreference: 'fastest' | 'safest' | 'balanced'
  routeSlopeCapDeg: number
  /** true only when the operator explicitly selected the Scenario cap. */
  routeSlopeCapExplicit: boolean
  /** Mission factors (public/data/factors.json). All Scenario inputs; see lib/factors.ts. */
  /** THEMIS-derived loose-ground cost weight on lowest-hazard/balanced routes (0–3). */
  sandWeight: number
  /** Share of hazard vs time in balanced routes (0–1). */
  hazardWeight: number
  /** Modeled radiation dose budget per EVA (mSv). */
  radiationBudgetMsv: number
  /** Add the September 2017 solar particle event dose to the modeled EVA dose. */
  sepEvent: boolean
  /** EVA start, local true solar time hour (0–24). */
  startLocalHour: number
  /** Require the modeled EVA to fit inside daylight. */
  daylightRequired: boolean
  /** Minimum acceptable modeled air temperature (K); null = no limit. */
  coldLimitK: number | null
  /** On-site time at the stop (minutes). */
  stopMinutes: number
}

export type LoadBasis = 'perAstronaut' | 'total'

export type MissionStatus = 'setup' | 'active'

export interface MissionState {
  config: MissionConfig
  status: MissionStatus
}

/** Plan §8 / §15 defaults — team model choices. */
/** "82 kg" for one astronaut, "A 82 kg · B 90 kg" for a pair. */
export function bodyMassText(config: Pick<MissionConfig, 'crewCount' | 'bodyMassKg' | 'bodyMassKgB'>): string {
  return config.crewCount === 2 ? `A ${config.bodyMassKg} kg · B ${config.bodyMassKgB} kg` : `${config.bodyMassKg} kg`
}

export const defaultMissionConfig: MissionConfig = {
  crewCount: 2,
  bodyMassKg: 82,
  bodyMassKgB: 82,
  loadKg: 15,
  loadBasis: 'perAstronaut',
  sampleKgPerStop: 2,
  roverAvailable: false,
  scienceGoalId: '',
  scienceGoalNote: '',
  confirmedAt: null,
  routePreference: 'fastest',
  routeSlopeCapDeg: 15,
  routeSlopeCapExplicit: false,
  sandWeight: 0,
  hazardWeight: 0.5,
  radiationBudgetMsv: 0.5,
  sepEvent: false,
  startLocalHour: 8,
  daylightRequired: true,
  coldLimitK: null,
  stopMinutes: 30,
}

/** Model limits (team choices, plan §8) — keep in one place for validation + UI. */
export const missionLimits = {
  crewMin: 1,
  crewMax: 2,
  bodyMassMin: 43,
  bodyMassMax: 110,
  /** Per-astronaut carried load range in kg. */
  loadPerAstronautMin: 0,
  loadPerAstronautMax: 40,
  /** Sample mass picked up per stop, kg. */
  sampleMin: 0,
  sampleMax: 10,
  /** Engine load buckets the UI snaps to (plan §15). */
  loadBuckets: [5, 15, 30],
} as const

/** Per-astronaut carried mass in kg (the value the model uses). */
export function perAstronautLoadKg(config: MissionConfig): number {
  return config.loadBasis === 'perAstronaut'
    ? config.loadKg
    : config.crewCount > 0
      ? config.loadKg / config.crewCount
      : 0
}

/** Total carried mass across the crew, in kg. */
export function totalLoadKg(config: MissionConfig): number {
  return perAstronautLoadKg(config) * config.crewCount
}

/** Nearest engine load bucket for a per-astronaut load (threshold lookup, §15). */
export function nearestLoadBucket(perAstronaut: number): number {
  const buckets = [...missionLimits.loadBuckets] as number[]
  return buckets.reduce((best, b) =>
    Math.abs(b - perAstronaut) < Math.abs(best - perAstronaut) ? b : best,
  )
}
