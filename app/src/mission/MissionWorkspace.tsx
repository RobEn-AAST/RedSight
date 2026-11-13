import { Pencil, RotateCcw, Satellite } from 'lucide-react'

import { MissionSetup } from '@/mission/MissionSetup'
import { Button } from '@/ui/Button'
import { LedDot } from '@/ui/LedDot'
import { scienceGoalOptions } from '@/lib/materials'
import { useMission } from '@/lib/useMission'
import { nearestLoadBucket, perAstronautLoadKg, totalLoadKg } from '@/types/mission'

/** Mission workspace: the setup stepper until confirmed, then an editable review. */
export function MissionWorkspace() {
  const { state, reopenMission, resetMission } = useMission()
  const { config, status } = state

  if (status === 'setup') return <MissionSetup />

  const goal =
    scienceGoalOptions.find((g) => g.id === config.scienceGoalId)?.label ??
    (config.scienceGoalId === 'custom' ? `Custom — “${config.scienceGoalNote.trim()}”` : '—')

  const rows: [string, string][] = [
    ['Crew', `${config.crewCount} astronaut${config.crewCount === 1 ? '' : 's'} · ${config.bodyMassKg} kg each`],
    [
      'Carried mass',
      `${config.loadKg} kg ${config.loadBasis === 'perAstronaut' ? 'per astronaut' : 'mission total'} → ${totalLoadKg(config).toFixed(1)} kg total · ${perAstronautLoadKg(config).toFixed(1)} kg each · engine bucket ${nearestLoadBucket(perAstronautLoadKg(config))} kg`,
    ],
    ['Samples', `${config.sampleKgPerStop} kg per stop (added after each stop)`],
    [
      'Rover',
      config.roverAvailable ? 'Available — mode executes in Tier 2 (E0)' : 'On foot only (Tier 1 baseline)',
    ],
    ['Science goal', goal],
    ['Confirmed', config.confirmedAt ? new Date(config.confirmedAt).toLocaleString() : '—'],
  ]

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <LedDot tone="green" pulse />
        <h3 className="font-display text-lg font-semibold tracking-wide text-ink">Mission active</h3>
        <span className="label-console flex items-center gap-1.5 border border-go/40 bg-go-soft px-2 py-0.5 text-[10px] text-go">
          <Satellite size={11} aria-hidden /> shared state live
        </span>
      </div>

      <dl className="flex flex-col border border-seam bg-inset/40">
        {rows.map(([term, value], i) => (
          <div
            key={term}
            className={`grid grid-cols-[8rem_1fr] gap-3 px-4 py-3 ${i > 0 ? 'border-t border-seam' : ''}`}
          >
            <dt className="label-console pt-0.5 text-ink-faint">{term}</dt>
            <dd className="text-sm leading-relaxed text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      <p className="text-xs leading-relaxed text-ink-faint">
        This is the editable shared mission state that route functions will consume once the engine
        ships. All figures above are operator inputs — no measurements, no modeled estimates.
      </p>

      <div className="flex flex-wrap gap-3">
        <Button onClick={reopenMission}>
          <Pencil size={13} aria-hidden /> Edit mission
        </Button>
        <Button
          variant="quiet"
          onClick={() => {
            resetMission()
          }}
        >
          <RotateCcw size={13} aria-hidden /> Reset to defaults
        </Button>
      </div>
    </div>
  )
}
