import { Footprints, Gauge, Home, Microscope, Pencil, PlayCircle, ScanEye, Truck, TriangleAlert, Users } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'

import { cn } from '@/lib/cn'
import { validateDynamicRoute } from '@/copilot/actions'
import type { EngineRoutePreference, PlanFile, PlanMember } from '@/lib/engineDataContext'
import { scienceGoalOptions } from '@/lib/materials'
import { nearestLoadBucket, perAstronautLoadKg } from '@/types/mission'
import { useMission } from '@/lib/useMission'
import {
  MEMBER_B_COLOR,
  MODE_COLOR,
  NO_RETURN_COLOR,
  formatDistance,
  formatDuration,
  summarizeCrew,
  summarizeMember,
} from '@/map/format'
import { PANORAMAS } from '@/hud/panoramas'
import { DaylightNote } from '@/map/DaylightNote'
import { EvaRadiationCard } from '@/map/EvaRadiationCard'
import { RouteBreakdown } from '@/map/RouteBreakdown'
import { Fold } from '@/map/Fold'
import { usePlan } from '@/map/usePlan'
import { MissionReplay, OPEN_360_EVENT } from '@/replay/MissionReplay'
import { TurnBackPanel } from '@/turnback/TurnBackPanel'
import { Button } from '@/ui/Button'


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
  const { goalTargets, goalUnmatched, selectedTargetId, selectTarget, activeRoute } = usePlan()
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
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-medium text-ink">{t.name}</span>
                  {PANORAMAS[t.id] && (
                    <span className="label-console border border-observed/50 px-1.5 py-0.5 text-[9px] text-observed">
                      360° view
                    </span>
                  )}
                </span>
                <span className="text-xs leading-relaxed text-ink-dim">
                  {t.substances.map((x) => x.replace(/\s*\([^)]*\)\s*$/, '')).join(' · ')}
                </span>
              </span>
            </button>
          )
        })}
      </div>
      {selectedTargetId && PANORAMAS[selectedTargetId] && activeRoute?.stop === selectedTargetId && (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_360_EVENT))}
          className="flex min-h-11 items-center gap-3 border border-observed/60 bg-observed-soft/30 px-3 py-2 text-left transition-[background-color,transform] duration-150 active:scale-[0.98] motion-reduce:active:scale-100 hover:bg-observed/10"
        >
          <ScanEye size={18} aria-hidden className="flex-none text-observed" />
          <span className="flex flex-col">
            <span className="text-sm font-medium text-ink">360° view + helmet HUD for {selectedTargetId}</span>
            <span className="text-[11px] leading-relaxed text-ink-dim">
              A real Curiosity panorama stands in for the site; readings are this walk's modeled numbers.
            </span>
          </span>
        </button>
      )}
    </div>
  )
}

/* -- 2. Pick a route --------------------------------------------------------------- */

const ROUTE_MODES = {
  fastest: { label: 'Fastest', hint: 'Least time' },
  safest: { label: 'Lowest hazard', hint: 'Easier ground' },
  balanced: { label: 'Balanced', hint: 'A bit of both' },
} as const

function RouteChoice() {
  const plan = usePlan()
  const mission = useMission()
  const [cap, setCap] = useState(mission.state.config.routeSlopeCapDeg)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const latest = useRef({config:mission.state.config,target:plan.selectedTargetId})
  useEffect(() => { latest.current = {config:mission.state.config,target:plan.selectedTargetId} }, [mission.state.config, plan.selectedTargetId])
  // Balanced and custom slope limits need the terrain service (same server as the copilot). Check once, so
  // a static deploy says so up front instead of failing after a tap.
  const [service, setService] = useState<'checking' | 'up' | 'down'>('checking')
  useEffect(() => {
    let alive = true
    fetch('/api/copilot/health')
      .then((r) => alive && setService(r.ok && (r.headers.get('content-type') ?? '').includes('json') ? 'up' : 'down'))
      .catch(() => alive && setService('down'))
    return () => { alive = false }
  }, [])
  const calculate = async (mode: EngineRoutePreference) => {
    if (!Number.isFinite(cap) || cap < 0 || cap > 15) { setError('Slope limit must be 0–15°.'); return }
    // Default 15° fastest / lowest-hazard: use the precomputed engine plans shipped in public/data, so the
    // static deploy works without the routing service. Only balanced or a tighter cap needs the service.
    if (cap === 15 && (mode === 'fastest' || mode === 'safest')) {
      setError('')
      mission.patchConfig({routePreference:mode,routeSlopeCapDeg:15,routeSlopeCapExplicit:false})
      plan.setMode(mode)
      return
    }
    const snapshot = latest.current
    if (snapshot.config.roverAvailable) { setError('Terrain calculations currently support foot travel only.'); return }
    setPending(true); setError('')
    try {
      const c = snapshot.config
      const res = await fetch('/api/routing/route', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        destination_id:snapshot.target,mode,slope_cap_deg:cap,crew_count:c.crewCount,
        body_mass_kg:c.bodyMassKg,load_kg:perAstronautLoadKg(c),sample_kg_per_stop:c.sampleKgPerStop,
      })})
      const out = await res.json().catch(() => ({ message: 'Routing service unavailable on this deployment; balanced and custom-slope routes need the local terrain service.' }))
      if (!res.ok || out.status !== 'ok') throw new Error(out.message ?? out.detail?.message ?? 'No matching route; the constraint was not relaxed.')
      if (latest.current.config !== snapshot.config || latest.current.target !== snapshot.target) throw new Error('Mission changed during calculation. Please calculate again.')
      if (!validateDynamicRoute(out.route,mode,plan.goalTargets.map(t=>t.id),cap)) throw new Error('Incomplete route or return costs; route discarded.')
      mission.patchConfig({routePreference:mode,routeSlopeCapDeg:cap,routeSlopeCapExplicit:true})
      plan.applyDynamicRoute(out.route)
    } catch (e) { setError(`${e instanceof Error ? e.message : 'Route calculation failed.'} The previous route and its stated constraints were retained.`) }
    finally { setPending(false) }
  }
  const live = service === 'up'
  const capChanged = live && Number.isFinite(cap) && cap !== (plan.activeRoute?.routing?.slope_cap_deg ?? 15)
  return <div className="space-y-3">
    <div role="radiogroup" aria-label="Route preference" className="grid grid-cols-3 gap-2">
      {(['fastest','safest','balanced'] as const).map(mode=>{
        const needsService = mode === 'balanced' && !live
        return <button key={mode} type="button" role="radio"
          aria-checked={plan.mode===mode} disabled={pending || !plan.selectedTargetId || needsService}
          onClick={()=>void calculate(mode)}
          className={cn('flex min-h-14 flex-col items-center justify-center gap-0.5 border px-2 py-2 text-sm transition-[color,border-color,transform] duration-150 active:scale-[0.97] motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',plan.mode===mode ? 'border-signal text-signal' : 'border-seam text-ink-dim')}>
          <span>{ROUTE_MODES[mode].label}</span>
          <span className="text-[11px] leading-tight text-ink-faint">{needsService ? 'Not on this site' : ROUTE_MODES[mode].hint}</span>
        </button>})}
    </div>
    <label className="flex items-center justify-between gap-3 text-sm text-ink-dim">
      <span>
        Steepest slope allowed
        <span className="block text-[11px] text-ink-faint">
          {live ? '15° uses the ready-made routes; lower limits are calculated.' : 'Fixed at 15° here (the ready-made routes).'}
        </span>
      </span>
      <span className="flex items-center gap-1.5">
        <input aria-label="Steepest slope allowed, in degrees" type="number" min={0} max={15} step={0.5} disabled={pending || !live} value={Number.isFinite(cap) ? cap : ''}
          onChange={e=>setCap(e.target.value === '' ? NaN : Number(e.target.value))}
          className="w-16 border border-seam bg-inset p-2 text-ink disabled:opacity-60" />
        <span aria-hidden>°</span>
      </span>
    </label>
    {capChanged && !pending && <p className="text-xs text-signal">Tap a route type above to recalculate at {cap}°.</p>}
    {service === 'down' && (
      <p className="text-xs leading-relaxed text-ink-faint">
        Balanced routes and other slope limits need the terrain service, which isn't running on this site.
      </p>
    )}
    <p role="status" className="text-xs text-ink-dim">{pending ? 'Calculating on native terrain…' : plan.activeRoute?.routing ? `Scenario estimate · ${plan.activeRoute.routing.slope_cap_deg}° cap · same-path return only` : plan.activeRoute ? 'Scenario estimate · precomputed engine route · 15° cap' : 'Calculate a route using the selected slope constraint.'}</p>
    {error && <p role="alert" className="text-sm text-ink">{error}</p>}
  </div>
}

/* -- 3. Who goes where (pair only) ---------------------------------------------------- */

function CrewChoice({ plan }: { plan: PlanFile }) {
  const { crewMode, setCrewMode } = usePlan()
  const split = plan.split
  // NASA plans surface EVAs in buddy pairs that stay together (Tenets of Lunar EVAs for Artemis III,
  // tenet 2) and gives no walker-to-walker separation limit, so there are no split plans to offer.
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
      title: `Modeled endpoint for ${member.targets.join(', ')}`,
      detail: `Approach reached after ${formatDuration(member.cum.t_s[last])}; any final leg is unmodeled.`,
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

/** The no-return line and Jana's turn-back slider: one place for "how far can we go on this O₂". */
function OxygenFold({ plan, members }: { plan: PlanFile; members: PlanMember[] }) {
  const { map, noReturnLine } = usePlan()
  const s = summarizeCrew(members, plan.budget_l)
  return (
    <Fold
      icon={<Gauge size={14} />}
      title="O₂ and turn-back"
      defaultOpen
      tone={s.reachesAll ? 'plain' : 'caution'}
      answer={s.reachesAll ? `${Math.round(s.spareO2L)} L spare each` : 'Turns back early'}
    >
      <p className="flex gap-2.5 text-xs leading-relaxed text-ink-dim">
        <span
          aria-hidden
          className="mt-1.5 h-[3px] w-5 flex-none"
          style={{ backgroundImage: `repeating-linear-gradient(90deg, ${NO_RETURN_COLOR} 0 6px, transparent 6px 10px)` }}
        />
        <span>
          {noReturnLine ? (
            <>
              The red dashed line is where walking out any further leaves too little O₂ to get home.
              {s.reachesAll
                ? ' This route stays inside it.'
                : ' This route reaches it before the target, so the plan turns back there.'}{' '}
            </>
          ) : s.reachesAll ? (
            'This route gets there and back on the modeled O₂. '
          ) : (
            'Partway out, too little modeled O₂ is left to get home, so the plan turns back there. '
          )}
          Drag the budget below to see where you would turn with less O₂.
          {map && noReturnLine && (
            <button
              type="button"
              onClick={() => showWholeLine(map, noReturnLine)}
              className="mt-1 block text-ink underline underline-offset-2 hover:text-signal"
            >
              Show the whole line on the map
            </button>
          )}
        </span>
      </p>
      <TurnBackPanel bare />
    </Fold>
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
  const { activePlan, activeMembers, activeRoute, crewMode, mode, preset } = usePlan()
  const hasPano = !!(activeRoute?.stop && PANORAMAS[activeRoute.stop])
  const { config } = state
  const wantLoad = nearestLoadBucket(perAstronautLoadKg(config))
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
        <RouteBreakdown />
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
          <OxygenFold plan={activePlan} members={activeMembers} />
          <DaylightNote plan={activePlan} members={activeMembers} />
          <EvaRadiationCard />
          <Fold
            icon={<PlayCircle size={14} />}
            title={hasPano ? 'Replay + 360° view' : 'Replay the walk'}
            answer={hasPano ? `Play · look around ${activeRoute?.stop}` : 'Play bar on the map'}
          >
            <p className="text-xs leading-relaxed text-ink-dim">
              Plays the modeled walk on the map: crew position, O₂ tank, the turn-back moment. Drills raise O₂ use from
              any point to test the plan.
            </p>
            <div className="-mx-3 -mb-3">
              <MissionReplay bare />
            </div>
          </Fold>
          {preset && (preset.crew !== config.crewCount || preset.load_kg !== wantLoad) && (
            <p className="text-xs leading-relaxed text-scenario">
              No plan exists yet for your exact setup. Showing crew {preset.crew}, {preset.load_kg} kg,{' '}
              {preset.rover ? 'with rover' : 'on foot'} instead.
            </p>
          )}
          {config.roverAvailable && !preset?.rover && (
            <p className="text-xs leading-relaxed text-scenario">
              No rover plan for this stop (the route is too short to drive). This plan is on foot.
            </p>
          )}
        </Section>
      )}

      <footer className="flex flex-col gap-2 px-4 py-4 text-xs leading-relaxed text-ink-dim">
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
