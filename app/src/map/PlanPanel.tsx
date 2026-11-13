import { Check, Footprints, Home, Pencil, Truck, Users, Microscope, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'

import { cn } from '@/lib/cn'
import type { EngineRouteMode, PlanFile, PlanMember } from '@/lib/engineDataContext'
import { scienceGoalOptions } from '@/lib/materials'
import { useMission } from '@/lib/useMission'
import {
  MEMBER_B_COLOR,
  MODE_CAPTION,
  MODE_COLOR,
  MODE_LABEL,
  formatDistance,
  formatDuration,
  summarizeCrew,
  summarizeMember,
} from '@/map/format'
import { DaylightNote } from '@/map/DaylightNote'
import { usePlan } from '@/map/usePlan'
import { Button } from '@/ui/Button'

const MODES: EngineRouteMode[] = ['fastest', 'safest']

function Section({ step, title, children }: { step: number; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-seam px-4 py-4">
      <h2 className="flex items-center gap-2.5">
        <span className="data-readout flex size-5 flex-none items-center justify-center border border-seam-lit text-[11px] text-ink-dim">
          {step}
        </span>
        <span className="label-console text-ink">{title}</span>
      </h2>
      {children}
    </section>
  )
}

/* -- 1. Where to sample -------------------------------------------------------- */

function TargetPicker() {
  const { goalTargets, goalUnmatched, selectedTargetId, selectTarget } = usePlan()
  const { state } = useMission()
  const goal = scienceGoalOptions.find((g) => g.id === state.config.scienceGoalId)

  if (goalTargets.length === 0) {
    return <p className="text-sm text-ink-dim">No sample areas are loaded yet.</p>
  }
  return (
    <div className="flex flex-col gap-2">
      {goalUnmatched && (
        <p className="border border-scenario/40 bg-scenario-soft/40 px-3 py-2 text-xs leading-relaxed text-scenario">
          No known site for {goal ? goal.label.toLowerCase() : 'this goal'} inside the operations area. All sites
          are shown instead.
        </p>
      )}
      <div role="radiogroup" aria-label="Sample area" className="flex flex-col gap-2">
        {goalTargets.map((t) => {
          const active = t.id === selectedTargetId
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => selectTarget(t.id)}
              className={cn(
                'flex items-start gap-3 border px-3 py-2.5 text-left transition-colors',
                active ? 'border-observed/70 bg-observed-soft/60' : 'border-seam bg-inset/40 hover:border-seam-lit',
              )}
            >
              <span
                className={cn(
                  'data-readout mt-0.5 flex-none border px-1.5 py-0.5 text-[11px] leading-none',
                  active ? 'border-observed bg-observed text-void' : 'border-observed/60 text-observed',
                )}
              >
                {t.id}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium text-ink">{t.name}</span>
                <span className="text-xs leading-relaxed text-ink-dim">{t.substances.join(' · ')}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* -- 2. Pick a route --------------------------------------------------------------- */

function RouteChoice() {
  const { plans, mode, setMode, activeMembers, crewMode, status } = usePlan()
  if (status === 'loading') return <p className="text-sm text-ink-dim">Loading routes…</p>
  if (status !== 'ready') return <p className="text-sm text-ink-dim">No routes exist for this area yet.</p>

  return (
    <div role="radiogroup" aria-label="Route" className="grid grid-cols-2 gap-2">
      {MODES.map((m) => {
        const plan = plans[m]
        const active = mode === m
        if (!plan) {
          return (
            <p key={m} className="border border-dashed border-seam-lit p-3 text-xs text-ink-dim">
              {MODE_LABEL[m]}: no route
            </p>
          )
        }
        // Totals for whatever crew mode is showing, so both cards compare like with like.
        const members = active ? activeMembers : crewMode === 'split' && plan.split ? plan.split.members : plan.together
        const s = summarizeCrew(members, plan.budget_l)
        const usedPct = Math.round((s.roundTripO2L / plan.budget_l) * 100)
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setMode(m)}
            className={cn(
              'flex flex-col gap-2 border p-3 text-left transition-colors',
              active ? 'border-signal/70 bg-signal-soft/50' : 'border-seam bg-inset/40 hover:border-seam-lit',
            )}
          >
            <span className="flex items-center gap-2">
              <span aria-hidden className="h-1 w-5 flex-none" style={{ backgroundColor: MODE_COLOR[m] }} />
              <span className="label-console text-ink">{MODE_LABEL[m]}</span>
              {active && <Check size={14} aria-hidden className="ml-auto text-signal" />}
            </span>
            <span className="data-readout text-xl leading-none text-ink">{formatDuration(s.roundTripS)}</span>
            <span className="text-xs text-ink-dim">round trip · {usedPct}% of O₂</span>
            <span className="text-xs text-ink-dim">steepest {s.maxSlopeDeg.toFixed(0)}°</span>
          </button>
        )
      })}
      <p className="col-span-2 text-xs leading-relaxed text-ink-dim">{MODE_CAPTION[mode]}</p>
    </div>
  )
}

/* -- 3. Who goes where (pair only) ---------------------------------------------------- */

function CrewChoice({ plan }: { plan: PlanFile }) {
  const { crewMode, setCrewMode } = usePlan()
  const split = plan.split
  if (!split) return null
  const within = split.planned_max_separation_m <= split.max_separation_limit_m
  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label="Crew" className="grid grid-cols-2 gap-2">
        {(
          [
            ['together', 'Walk together', `Both go to ${plan.target}`],
            ['split', 'Split up', `A → ${split.members[0].targets.join(', ')} · B → ${split.members[1].targets.join(', ')}`],
          ] as const
        ).map(([value, title, detail]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={crewMode === value}
            onClick={() => setCrewMode(value)}
            className={cn(
              'flex flex-col gap-1 border p-3 text-left transition-colors',
              crewMode === value ? 'border-signal/70 bg-signal-soft/50' : 'border-seam bg-inset/40 hover:border-seam-lit',
            )}
          >
            <span className="label-console text-ink">{title}</span>
            <span className="text-xs leading-relaxed text-ink-dim">{detail}</span>
          </button>
        ))}
      </div>
      {crewMode === 'split' && (
        <p
          className={cn(
            'border px-3 py-2 text-xs leading-relaxed',
            within ? 'border-seam bg-inset/40 text-ink-dim' : 'border-caution/50 bg-caution-soft text-caution',
          )}
        >
          Two sample areas in one trip. The routes stay at most{' '}
          <span className="data-readout text-ink">{formatDistance(split.planned_max_separation_m)}</span> apart (limit{' '}
          {formatDistance(split.max_separation_limit_m)}), so each astronaut stays in reach of the other.
        </p>
      )}
    </div>
  )
}

/* -- 4. The plan, step by step ----------------------------------------------------------- */

function MemberTimeline({
  member,
  plan,
  color,
  split,
}: {
  member: PlanMember
  plan: PlanFile
  color: string
  split: boolean
}) {
  const s = summarizeMember(member, plan.budget_l)
  const last = member.coords.length - 1
  const steps: { icon: ReactNode; title: string; detail: string; tone?: 'caution' }[] = []

  for (const leg of member.legs) {
    steps.push({
      icon: leg.kind === 'drive' ? <Truck size={14} aria-hidden /> : <Footprints size={14} aria-hidden />,
      title:
        leg.kind === 'drive'
          ? `Drive ${split ? 'together ' : ''}${formatDistance(leg.distance_m)} by rover`
          : `Walk ${formatDistance(leg.distance_m)}`,
      detail:
        leg.kind === 'drive'
          ? `${formatDuration(leg.t_s)} · park at P${split ? ', then split up' : ''} and go on foot`
          : `${formatDuration(leg.t_s)} on foot`,
    })
  }
  if (s.reachesTarget) {
    steps.push({
      icon: <Microscope size={14} aria-hidden />,
      title: `Sample at ${member.targets.join(', ')}`,
      detail: `Reached after ${formatDuration(member.cum.t_s[last])}`,
    })
  } else {
    steps.push({
      icon: <TriangleAlert size={14} aria-hidden />,
      title: `Turn back after ${formatDuration(s.pnrTimeS)}`,
      detail: `${formatDistance(s.pnrDistanceM)} out, before reaching ${member.targets.join(', ')}. Going further leaves too little O₂ to get home.`,
      tone: 'caution',
    })
  }
  const parked = member.park_index !== null
  steps.push({
    icon: <Home size={14} aria-hidden />,
    title: parked ? 'Walk back to the rover, drive home' : 'Walk home',
    detail: `${formatDuration(member.back.t_s[s.reachesTarget ? last : s.pnrIndex])} back to the habitat`,
  })

  return (
    <div className="flex flex-col gap-0">
      <p className="mb-2 flex items-center gap-2 text-sm font-medium text-ink">
        <span aria-hidden className="h-1 w-4" style={{ backgroundColor: color }} />
        {member.label}
      </p>
      <ol className="flex flex-col">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex flex-col items-center">
              <span
                className={cn(
                  'flex size-7 flex-none items-center justify-center border',
                  step.tone === 'caution' ? 'border-caution bg-caution-soft text-caution' : 'border-seam-lit bg-inset text-ink-dim',
                )}
              >
                {step.icon}
              </span>
              {i < steps.length - 1 && <span aria-hidden className="w-px flex-1 bg-seam-lit" />}
            </span>
            <span className="flex flex-col gap-0.5 pb-3 pt-1">
              <span className={cn('text-sm', step.tone === 'caution' ? 'text-caution' : 'text-ink')}>{step.title}</span>
              <span className="text-xs leading-relaxed text-ink-dim">{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function NoReturnNote({ plan, members }: { plan: PlanFile; members: PlanMember[] }) {
  const { map, noReturnLine } = usePlan()
  const s = summarizeCrew(members, plan.budget_l)
  const spare = Math.round(s.spareO2L)
  return (
    <div className="flex gap-3 border border-caution/40 bg-caution-soft/40 px-3 py-2.5">
      <span aria-hidden className="mt-1.5 h-[3px] w-5 flex-none" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #ff6d6d 0 6px, transparent 6px 10px)' }} />
      <p className="text-xs leading-relaxed text-ink">
        <span className="font-medium">No-return line.</span>{' '}
        <span className="text-ink-dim">
          The red dashed line on the map is where walking out any further leaves too little O₂ to get home.
          {s.reachesAll
            ? ` This route stays inside it, with about ${spare} L of O₂ per person to spare beyond the reserve.`
            : ' This route reaches it before the target, so the plan turns back there.'}
        </span>
        {map && noReturnLine && (
          <button
            type="button"
            onClick={() => showWholeLine(map, noReturnLine)}
            className="mt-1.5 block text-ink underline underline-offset-2 hover:text-signal"
          >
            Show the whole line on the map
          </button>
        )}
      </p>
    </div>
  )
}

function showWholeLine(map: MapLibreMap, line: FeatureCollection) {
  const pts = line.features.flatMap((f) =>
    f.geometry.type === 'LineString' ? (f.geometry.coordinates as [number, number][]) : [],
  )
  if (pts.length === 0) return
  const lons = pts.map((p) => p[0])
  const lats = pts.map((p) => p[1])
  map.fitBounds(
    [
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)],
    ],
    { padding: 40, duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 600 },
  )
}

/* -- The panel ------------------------------------------------------------------------- */

export function PlanPanel({ onOpenSources }: { onOpenSources: () => void }) {
  const { state, reopenMission } = useMission()
  const { activePlan, activeMembers, crewMode, mode, preset, legacy } = usePlan()
  const { config } = state
  const goal = scienceGoalOptions.find((g) => g.id === config.scienceGoalId)

  return (
    <div className="flex flex-col">
      <div className="flex items-start gap-3 border-b border-seam px-4 py-3">
        <Users size={16} aria-hidden className="mt-0.5 flex-none text-ink-dim" />
        <p className="min-w-0 flex-1 text-sm leading-relaxed text-ink">
          {config.crewCount === 2 ? '2 astronauts' : '1 astronaut'} · {config.loadKg} kg{' '}
          {config.loadBasis === 'perAstronaut' ? 'each' : 'total'} · {config.roverAvailable ? 'rover' : 'on foot'}
          <span className="block text-xs text-ink-dim">
            Goal: {goal?.label ?? (config.scienceGoalId === 'custom' ? config.scienceGoalNote || 'custom' : 'none set')}
          </span>
        </p>
        <Button size="sm" variant="ghost" onClick={reopenMission}>
          <Pencil size={12} aria-hidden /> Edit
        </Button>
      </div>

      <Section step={1} title="Where to sample">
        <TargetPicker />
      </Section>

      <Section step={2} title="Pick a route">
        <RouteChoice />
      </Section>

      {activePlan?.split && (
        <Section step={3} title="Who goes where">
          <CrewChoice plan={activePlan} />
        </Section>
      )}

      {activePlan && (
        <Section step={activePlan.split ? 4 : 3} title="Your plan">
          {activeMembers.map((m, i) => (
            <MemberTimeline
              key={m.member}
              member={m}
              plan={activePlan}
              color={crewMode === 'split' && i === 1 ? MEMBER_B_COLOR : MODE_COLOR[mode]}
              split={crewMode === 'split'}
            />
          ))}
          <NoReturnNote plan={activePlan} members={activeMembers} />
          <DaylightNote plan={activePlan} members={activeMembers} />
          {preset && !preset.matchesMission && (
            <p className="text-xs leading-relaxed text-scenario">
              No plan exists yet for your exact setup. Showing crew {preset.crew}, {preset.load_kg} kg,{' '}
              {preset.rover ? 'with rover' : 'on foot'} instead.
            </p>
          )}
          {legacy && config.roverAvailable && (
            <p className="text-xs leading-relaxed text-scenario">
              Rover legs are not in the engine output yet. This plan is on foot.
            </p>
          )}
        </Section>
      )}

      <footer className="flex flex-col gap-2 px-4 py-4 text-xs leading-relaxed text-ink-dim">
        {activePlan?._mock && (
          <p className="text-scenario">Mock numbers: the engine's real routes replace these.</p>
        )}
        <p>
          Times and O₂ are model estimates, not a safety guarantee.{' '}
          <button type="button" onClick={onOpenSources} className="text-ink underline underline-offset-2 hover:text-signal">
            Data sources
          </button>
        </p>
      </footer>
    </div>
  )
}
