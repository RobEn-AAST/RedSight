import { missionLimits, perAstronautLoadKg, type MissionConfig } from '@/types/mission'

/** Field-level validation results for the mission setup flow.
 *  All limits are TEAM MODEL CHOICES (demo-focus-plan §8), not NASA rules —
 *  messages say so where it matters. */
export interface FieldIssue {
  field: 'crewCount' | 'bodyMassKg' | 'loadKg' | 'sampleKgPerStop' | 'scienceGoal'
  level: 'error' | 'warning'
  message: string
}

export interface MissionValidation {
  issues: FieldIssue[]
  isValid: boolean
}

export function validateMission(config: MissionConfig): MissionValidation {
  const issues: FieldIssue[] = []
  const L = missionLimits

  if (
    !Number.isInteger(config.crewCount) ||
    config.crewCount < L.crewMin ||
    config.crewCount > L.crewMax
  ) {
    issues.push({
      field: 'crewCount',
      level: 'error',
      message: `This build models a crew of ${L.crewMin}–${L.crewMax} (team model choice, demo-focus-plan §8). NASA DRA 5.0 plans Mars surface EVAs with a buddy system, so 2 is the default.`,
    })
  } else if (config.crewCount === 1) {
    issues.push({
      field: 'crewCount',
      level: 'warning',
      message:
        'Solo EVA: NASA DRA 5.0 plans Mars surface EVAs with a minimum of two crew (buddy system). The model allows 1 as a team choice — the demo keeps the buddy-rule warning visible.',
    })
  }

  if (
    !Number.isFinite(config.bodyMassKg) ||
    config.bodyMassKg < L.bodyMassMin ||
    config.bodyMassKg > L.bodyMassMax
  ) {
    issues.push({
      field: 'bodyMassKg',
      level: 'error',
      message: `Body mass must be ${L.bodyMassMin}–${L.bodyMassMax} kg (crew mass range, NASA JSC ICES-2026-127; the worked example uses 82 kg).`,
    })
  }

  const perAstronaut = perAstronautLoadKg(config)
  const maxForBasis =
    config.loadBasis === 'perAstronaut'
      ? L.loadPerAstronautMax
      : L.loadPerAstronautMax * config.crewCount
  if (!Number.isFinite(config.loadKg) || config.loadKg < 0) {
    issues.push({
      field: 'loadKg',
      level: 'error',
      message: 'Carried mass must be a non-negative number in kilograms.',
    })
  } else if (config.loadKg > maxForBasis) {
    issues.push({
      field: 'loadKg',
      level: 'error',
      message: `Carried mass exceeds the model range: max ${L.loadPerAstronautMax} kg per astronaut (0–40 kg Scenario slider, demo-focus-plan §8)${config.loadBasis === 'total' ? ` — i.e. ${maxForBasis} kg total for ${config.crewCount}` : ''}.`,
    })
  } else if (perAstronaut > 30 && perAstronaut <= L.loadPerAstronautMax) {
    issues.push({
      field: 'loadKg',
      level: 'warning',
      message:
        'Above 30 kg per astronaut the plan falls outside the precomputed engine buckets {5, 15, 30} kg (§15) and will snap to the 30 kg bucket. Context: ICES-2026-127 cites the NIOSH carry limit of 51 lbf (227 N).',
    })
  }

  if (
    !Number.isFinite(config.sampleKgPerStop) ||
    config.sampleKgPerStop < L.sampleMin ||
    config.sampleKgPerStop > L.sampleMax
  ) {
    issues.push({
      field: 'sampleKgPerStop',
      level: 'error',
      message: `Samples per stop must be ${L.sampleMin}–${L.sampleMax} kg (team model choice, demo-focus-plan §8).`,
    })
  }

  if (config.scienceGoalId.length === 0) {
    issues.push({
      field: 'scienceGoal',
      level: 'error',
      message: 'Select a science goal — it frames the stop cards once stops.json ships.',
    })
  } else if (config.scienceGoalId === 'custom' && config.scienceGoalNote.trim().length < 3) {
    issues.push({
      field: 'scienceGoal',
      level: 'error',
      message: 'Describe the custom goal in the note field, or pick a listed target.',
    })
  }

  return { issues, isValid: issues.every((i) => i.level !== 'error') }
}
