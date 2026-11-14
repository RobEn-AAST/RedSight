import { Check, Minus, Plus, Rocket, Footprints } from 'lucide-react'

import { Field } from '@/ui/Field'
import { EvidenceBadge } from '@/ui/Badge'
import { cn } from '@/lib/cn'
import { scienceGoalOptions } from '@/lib/materials'
import { useMission } from '@/lib/useMission'
import {
  bodyMassText,
  missionLimits,
  perAstronautLoadKg,
  totalLoadKg,
  type LoadBasis,
} from '@/types/mission'

/* -- Step 1: crew + body mass (plan §8, D19) --------------------------------- */

/** One astronaut's body mass: − / number / + (44 px targets). */
function MassStepper({
  label,
  who,
  value,
  onChange,
}: {
  label: string
  who: string
  value: number
  onChange: (kg: number) => void
}) {
  const L = missionLimits
  return (
    <Field label={label} hint={`${L.bodyMassMin}–${L.bodyMassMax} kg, without the suit.`}>
      {({ describedBy, invalid }) => (
        <div className="flex max-w-xs items-center gap-3">
          <button
            type="button"
            onClick={() => onChange(Math.max(L.bodyMassMin, value - 1))}
            aria-label={`Decrease ${who}'s body mass by one kilogram`}
            className="flex size-11 items-center justify-center border border-seam-lit text-ink hover:border-signal/60 hover:text-signal"
          >
            <Minus size={16} aria-hidden />
          </button>
          <input
            type="number"
            inputMode="decimal"
            min={L.bodyMassMin}
            max={L.bodyMassMax}
            step={1}
            value={Number.isFinite(value) ? value : ''}
            aria-label={label}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            onChange={(e) => onChange(Number.parseFloat(e.target.value))}
            className="data-readout w-24 border border-seam-lit bg-inset px-3 py-2 text-center text-xl text-ink focus:border-signal/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => onChange(Math.min(L.bodyMassMax, value + 1))}
            aria-label={`Increase ${who}'s body mass by one kilogram`}
            className="flex size-11 items-center justify-center border border-seam-lit text-ink hover:border-signal/60 hover:text-signal"
          >
            <Plus size={16} aria-hidden />
          </button>
          <span className="text-sm text-ink-dim">kg</span>
        </div>
      )}
    </Field>
  )
}

export function CrewStep() {
  const { state, patchConfig } = useMission()
  const { crewCount, bodyMassKg, bodyMassKgB } = state.config

  return (
    <div className="flex flex-col gap-6">
      <Field
        label="Astronauts on this EVA"
        hint="NASA plans Mars walks in pairs (buddy system). The pair walks the route together."
      >
        {() => (
          <div role="radiogroup" aria-label="Crew size" className="flex gap-3">
            {[1, 2].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={crewCount === n}
                onClick={() => patchConfig({ crewCount: n })}
                className={cn(
                  'flex items-center gap-3 border px-5 py-3 transition-colors',
                  crewCount === n
                    ? 'border-signal/60 bg-signal-soft/50'
                    : 'border-seam bg-inset/40 hover:border-seam-lit',
                )}
              >
                <span className="data-readout text-2xl text-ink">{n}</span>
                <span className="label-console text-ink-dim">{n === 1 ? 'solo' : 'pair'}</span>
                {crewCount === n && <Check size={14} aria-hidden className="text-signal" />}
              </button>
            ))}
          </div>
        )}
      </Field>

      {crewCount === 2 ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <MassStepper
            label="Astronaut A body mass (kg)"
            who="astronaut A"
            value={bodyMassKg}
            onChange={(v) => patchConfig({ bodyMassKg: v })}
          />
          <MassStepper
            label="Astronaut B body mass (kg)"
            who="astronaut B"
            value={bodyMassKgB}
            onChange={(v) => patchConfig({ bodyMassKgB: v })}
          />
        </div>
      ) : (
        <MassStepper label="Body mass (kg)" who="the astronaut" value={bodyMassKg} onChange={(v) => patchConfig({ bodyMassKg: v })} />
      )}
    </div>
  )
}

/* -- Step 2: carried load + samples (plan §8, §15 buckets) ------------------- */

export function LoadStep() {
  const { state, patchConfig } = useMission()
  const { loadKg, loadBasis, sampleKgPerStop, crewCount } = state.config
  const L = missionLimits
  const maxTotal = L.loadPerAstronautMax * crewCount

  return (
    <fieldset className="flex flex-col gap-6">
      <legend className="sr-only">Carried load and samples</legend>

      <Field
        label="Is the mass per person or for the whole crew?"
        
      >
        {() => (
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ['perAstronaut', 'Per astronaut', `Each crew member carries the entered mass (0–${L.loadPerAstronautMax} kg).`],
                ['total', 'Mission total', `The entered mass is the whole manifest (0–${maxTotal} kg for ${crewCount}).`],
              ] as [LoadBasis, string, string][]
            ).map(([value, title, desc]) => (
              <label
                key={value}
                className={cn(
                  'flex cursor-pointer items-start gap-3 border p-3 transition-colors',
                  loadBasis === value
                    ? 'border-signal/60 bg-signal-soft/60'
                    : 'border-seam bg-inset/40 hover:border-seam-lit',
                )}
              >
                <input
                  type="radio"
                  name="load-basis"
                  value={value}
                  checked={loadBasis === value}
                  onChange={() => patchConfig({ loadBasis: value })}
                  className="mt-0.5 accent-[#ffb224]"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="label-console text-ink">{title}</span>
                  <span className="text-xs text-ink-dim">{desc}</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </Field>

      <Field
        label="Tools and kit to carry (kg)"
        hint="Not counting the suit."
      >
        {({ describedBy, invalid }) => (
          <div className="flex max-w-xs items-center gap-3">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={loadBasis === 'perAstronaut' ? L.loadPerAstronautMax : maxTotal}
              step={0.5}
              value={Number.isFinite(loadKg) ? loadKg : ''}
              aria-invalid={invalid}
              aria-describedby={describedBy}
              onChange={(e) => patchConfig({ loadKg: Number.parseFloat(e.target.value) })}
              className="data-readout w-28 border border-seam-lit bg-inset px-3 py-2 text-xl text-ink focus:border-signal/60 focus:outline-none"
            />
            <span className="text-sm text-ink-dim">
              kg {loadBasis === 'perAstronaut' ? 'per astronaut' : 'mission total'}
            </span>
          </div>
        )}
      </Field>

      <Field
        label="Samples to collect at each stop (kg)"
        hint="The way home is harder with samples on your back. With a rover, they ride on the rover."
      >
        {({ describedBy, invalid }) => (
          <div className="flex max-w-xs items-center gap-3">
            <input
              type="number"
              inputMode="decimal"
              min={L.sampleMin}
              max={L.sampleMax}
              step={0.5}
              value={Number.isFinite(sampleKgPerStop) ? sampleKgPerStop : ''}
              aria-invalid={invalid}
              aria-describedby={describedBy}
              onChange={(e) => patchConfig({ sampleKgPerStop: Number.parseFloat(e.target.value) })}
              className="data-readout w-24 border border-seam-lit bg-inset px-3 py-2 text-center text-xl text-ink focus:border-signal/60 focus:outline-none"
            />
            <span className="text-sm text-ink-dim">kg / stop</span>
          </div>
        )}
      </Field>
    </fieldset>
  )
}

/* -- Step 3: rover ---------------------------------------------------------------- */

/** plan/*_rover.json ships (build-plans.mjs + rover_model.json: Apollo LRV speed and riding O₂ rate). */
const ROVER_PLANS_MODELED = true

export function RoverStep() {
  const { state, patchConfig } = useMission()
  const available = state.config.roverAvailable

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="sr-only">Rover availability</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            [
              true,
              'Rover available',
              'Drive most of the way, park about 100 m before the stop, walk the rest. Modeled on Apollo rover data (Scenario).',
              Rocket,
            ],
            [
              false,
              'On foot only',
              'Walk the whole way, about 1–2 km per hour in a suit.',
              Footprints,
            ],
          ] as [boolean, string, string, typeof Rocket][]
        ).map(([value, title, desc, Icon]) => (
          <button
            key={String(value)}
            type="button"
            aria-pressed={available === value}
            disabled={value && !ROVER_PLANS_MODELED}
            onClick={() => patchConfig({ roverAvailable: value })}
            className={cn(
              'flex flex-col items-start gap-2 border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              available === value
                ? 'border-signal/60 bg-signal-soft/50'
                : 'border-seam bg-inset/40 hover:border-seam-lit',
            )}
          >
            <span className="flex w-full items-center gap-2">
              <Icon size={16} aria-hidden className={available === value ? 'text-signal' : 'text-ink-dim'} />
              <span className="label-console text-ink">{title}</span>
              {available === value && <Check size={14} aria-hidden className="ml-auto text-signal" />}
            </span>
            <span className="text-xs leading-relaxed text-ink-dim">{desc}</span>
          </button>
        ))}
      </div>
    </fieldset>
  )
}

/* -- Step 4: science goal ------------------------------------------------------- */

export function GoalStep() {
  const { state, patchConfig } = useMission()
  const selected = state.config.scienceGoalId

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="sr-only">Science or material goal</legend>
      {scienceGoalOptions.map((goal) => (
        <label
          key={goal.id}
          className={cn(
            'flex cursor-pointer flex-col gap-2 border p-4 transition-colors',
            selected === goal.id
              ? 'border-signal/60 bg-signal-soft/50'
              : 'border-seam bg-inset/40 hover:border-seam-lit',
          )}
        >
          <span className="flex w-full items-center gap-2">
            <input
              type="radio"
              name="science-goal"
              value={goal.id}
              checked={selected === goal.id}
              onChange={() => patchConfig({ scienceGoalId: goal.id })}
              className="accent-[#ffb224]"
            />
            <span className="label-console text-ink">{goal.label}</span>
            <EvidenceBadge evidence={goal.evidence} className="ml-auto" />
          </span>
          <span className="text-xs leading-relaxed text-ink-dim">{goal.summary}</span>
          {goal.caveat && <span className="text-[11px] leading-relaxed text-ink-faint">{goal.caveat}</span>}
          {selected === goal.id && (
            <span className="text-[11px] leading-relaxed text-ink-faint">Source: {goal.sourceName}</span>
          )}
        </label>
      ))}


    </fieldset>
  )
}

/* -- Step 5: review --------------------------------------------------------------- */

export function ReviewStep() {
  const { state } = useMission()
  const { config } = state
  const goal =
    scienceGoalOptions.find((g) => g.id === config.scienceGoalId) ??
    (config.scienceGoalId === 'custom' ? null : undefined)

  const rows: [string, string][] = [
    ['Crew', `${config.crewCount} astronaut${config.crewCount === 1 ? '' : 's'}`],
    ['Body mass', bodyMassText(config)],
    [
      'Carried mass',
      `${perAstronautLoadKg(config).toFixed(1)} kg each · ${totalLoadKg(config).toFixed(1)} kg in total`,
    ],
    ['Samples', `${config.sampleKgPerStop} kg per stop`],
    ['Rover', config.roverAvailable ? 'Yes: drive, then walk' : 'No: on foot'],
    [
      'Science goal',
      goal ? goal.label : config.scienceGoalId === 'custom' ? `Custom: ${config.scienceGoalNote}` : '—',
    ],
  ]

  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-col gap-0 border border-seam bg-inset/40">
        {rows.map(([term, value], i) => (
          <div
            key={term}
            className={cn('grid grid-cols-[7rem_1fr] gap-3 px-4 py-3', i > 0 && 'border-t border-seam')}
          >
            <dt className="label-console pt-0.5 text-ink-faint">{term}</dt>
            <dd className="text-sm leading-relaxed text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
