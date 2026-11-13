import { GitBranch } from 'lucide-react'

import { cn } from '@/lib/cn'
import type { EngineRoute, EngineRouteMode } from '@/lib/engineDataContext'
import {
  MODE_CAPTION,
  MODE_COLOR,
  MODE_LABEL,
  badgeToEvidence,
  formatDistance,
  formatDuration,
  summarizeRoute,
  type RouteSummary,
} from '@/map/format'
import { usePlan } from '@/map/usePlan'
import { EvidenceBadge } from '@/ui/Badge'
import { Panel } from '@/ui/Panel'

const MODES: EngineRouteMode[] = ['fastest', 'safest']
const LETTER: Record<EngineRouteMode, string> = { fastest: 'A', safest: 'B' }

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="label-console text-[9px] text-ink-faint">{label}</dt>
      <dd className="data-readout text-sm text-ink">{value}</dd>
      {note && <dd className="data-readout text-[10px] text-ink-faint">{note}</dd>}
    </div>
  )
}

function RouteCard({
  mode,
  route,
  summary,
  active,
  onSelect,
}: {
  mode: EngineRouteMode
  route: EngineRoute
  summary: RouteSummary
  active: boolean
  onSelect: () => void
}) {
  const budgetPct = Math.round((summary.roundTripO2L / summary.budgetL) * 100)
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={cn(
        'flex w-full flex-col gap-3 border p-3 text-left transition-colors',
        active ? 'border-signal/60 bg-signal-soft/40' : 'border-seam bg-inset/40 hover:border-seam-lit',
      )}
    >
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-1 w-6 flex-none"
          style={{ backgroundColor: MODE_COLOR[mode] }}
        />
        <span className="label-console text-ink">
          {LETTER[mode]} · {MODE_LABEL[mode]}
        </span>
        <EvidenceBadge evidence={badgeToEvidence(route.badge)} className="ml-auto" />
      </span>
      <span className="text-xs leading-relaxed text-ink-dim">{MODE_CAPTION[mode]}</span>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Stat label="Round trip" value={formatDuration(summary.roundTripS)} note="modeled walking time" />
        <Stat label="Distance" value={formatDistance(summary.distanceM)} note="one way" />
        <Stat
          label="O₂ per person"
          value={`${Math.round(summary.roundTripO2L)} L`}
          note={`${budgetPct}% of ${Math.round(summary.budgetL)} L budget`}
        />
        <Stat label="Steepest step" value={`${summary.maxSlopeDeg.toFixed(1)}°`} />
      </dl>
      <span
        className={cn(
          'border-t border-seam pt-2.5 text-[11px] leading-relaxed',
          summary.reachesStop ? 'text-ink-dim' : 'text-caution',
        )}
      >
        {summary.reachesStop
          ? 'The stop is inside the modeled return budget.'
          : `Modeled turn-back point is ${formatDistance(summary.turnBackDistanceM)} out, before the stop.`}
      </span>
    </button>
  )
}

/** One line comparing B against A, so the trade-off is stated, not left to the reader. */
function comparison(a: RouteSummary, b: RouteSummary): string {
  const dMin = Math.round((b.roundTripS - a.roundTripS) / 60)
  const dSlope = b.maxSlopeDeg - a.maxSlopeDeg
  const time = dMin === 0 ? 'the same time' : `${Math.abs(dMin)} min ${dMin > 0 ? 'longer' : 'shorter'}`
  const slope =
    Math.abs(dSlope) < 0.05
      ? 'the same steepest step'
      : `a steepest step ${Math.abs(dSlope).toFixed(1)}° ${dSlope < 0 ? 'gentler' : 'steeper'}`
  return `B is ${time} than A, with ${slope}.`
}

export function RouteCards() {
  const { selectedStopId, routes, routesStatus, setMode, activeRoute, preset } = usePlan()
  const summaries = {
    fastest: routes.fastest ? summarizeRoute(routes.fastest) : null,
    safest: routes.safest ? summarizeRoute(routes.safest) : null,
  }

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <GitBranch size={13} aria-hidden /> Routes{selectedStopId ? ` to ${selectedStopId}` : ''}
        </span>
      }
      className="flex-none"
      bodyClassName="p-3"
    >
      {routesStatus === 'idle' && (
        <p className="px-1 text-xs leading-relaxed text-ink-faint">
          Pick a stop to compare the fastest route with the lowest-hazard route.
        </p>
      )}
      {routesStatus === 'loading' && <p className="px-1 text-xs text-ink-faint">Loading routes…</p>}
      {routesStatus === 'missing' && (
        <p className="px-1 text-xs leading-relaxed text-ink-faint">
          No route files exist for {selectedStopId}. Nothing is drawn in their place.
        </p>
      )}
      {routesStatus === 'ready' && (
        <div className="flex flex-col gap-3">
          <div role="radiogroup" aria-label="Route" className="flex flex-col gap-2">
            {MODES.map((m) => {
              const route = routes[m]
              const summary = summaries[m]
              return route && summary ? (
                <RouteCard
                  key={m}
                  mode={m}
                  route={route}
                  summary={summary}
                  active={activeRoute?.mode === m}
                  onSelect={() => setMode(m)}
                />
              ) : (
                <p key={m} className="border border-dashed border-seam-lit px-3 py-2.5 text-xs text-ink-faint">
                  {LETTER[m]} · {MODE_LABEL[m]}: no route file.
                </p>
              )
            })}
          </div>
          {summaries.fastest && summaries.safest && (
            <p className="px-1 text-xs leading-relaxed text-ink-dim">
              {comparison(summaries.fastest, summaries.safest)}
            </p>
          )}
          {preset && (
            <p className="data-readout px-1 text-[11px] leading-relaxed text-ink-faint">
              Computed for crew {preset.crew}, {preset.load_kg} kg carried each.
              {!preset.matchesMission && ' Your mission setup has no route files yet, so this preset is shown.'}            </p>
          )}
          {activeRoute?._mock && (
            <p className="border border-scenario/40 bg-scenario-soft/30 px-3 py-2 text-[11px] leading-relaxed text-scenario">
              Mock route: placeholder numbers until the engine output lands.
            </p>
          )}
        </div>
      )}
    </Panel>
  )
}
