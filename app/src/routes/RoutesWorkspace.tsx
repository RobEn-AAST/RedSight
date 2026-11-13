import { useState } from 'react'
import { Route, Gauge, Timer, Wind, Radio } from 'lucide-react'

import { Panel } from '@/ui/Panel'
import { EmptyState } from '@/ui/EmptyState'
import { EvidenceBadge } from '@/ui/Badge'
import { cn } from '@/lib/cn'
import { useMission } from '@/lib/useMission'
import { useEngineData } from '@/lib/useEngineData'
import {
  nearestLoadBucket,
  perAstronautLoadKg,
  totalLoadKg,
} from '@/types/mission'
import type { RouteMode, BudgetKind } from '@/types/copilot'

const MODES: { id: RouteMode; label: string; caption: string }[] = [
  {
    id: 'fastest',
    label: 'Fastest',
    caption: 'Out_fast field — minimizes modeled EVA time under hard slope/terrain constraints.',
  },
  {
    id: 'safest',
    label: 'Lowest hazard',
    caption: 'Back_safest field — “lowest modeled hazard-score within available data”; prefers radio-covered ground. Not a guarantee.',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    caption: 'Normalized weighted sum of time and hazard; weights exposed in the UI.',
  },
]

const BUDGETS: { id: BudgetKind; label: string; icon: typeof Timer }[] = [
  { id: 'time', label: 'Time budget', icon: Timer },
  { id: 'oxygen', label: 'O₂ budget', icon: Wind },
]

/**
 * Route planning workspace (Tier 1, B3/B4/B4b/B4c) — mode/budget selections are
 * real interface state that selects precomputed engine outputs
 * (routes/{stop}_{mode}_{crew}_{load}.json, §15); no polyline or numbers render
 * until those files ship. Browser-side math is limited to the allowed
 * threshold/lookup operations (plan §4).
 */
export function RoutesWorkspace() {
  const { state } = useMission()
  const engine = useEngineData()
  const [mode, setMode] = useState<RouteMode>('balanced')
  const [budget, setBudget] = useState<BudgetKind>('time')

  const bucket = nearestLoadBucket(perAstronautLoadKg(state.config))
  const routeFilesPresent = engine.probed && engine.meta !== null

  return (
    <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[19rem_1fr]">
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
        <Panel
          title={
            <span className="flex items-center gap-2">
              <Gauge size={13} aria-hidden /> Route mode
            </span>
          }
          bodyClassName="p-3"
        >
          <div role="radiogroup" aria-label="Route mode" className="flex flex-col gap-2">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={mode === m.id}
                onClick={() => setMode(m.id)}
                className={cn(
                  'flex flex-col gap-1 border p-3 text-left transition-colors',
                  mode === m.id
                    ? 'border-signal/60 bg-signal-soft/50'
                    : 'border-seam bg-inset/40 hover:border-seam-lit',
                )}
              >
                <span className="label-console text-ink">{m.label}</span>
                <span className="text-xs leading-relaxed text-ink-dim">{m.caption}</span>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Budget type" bodyClassName="p-3">
          <div role="radiogroup" aria-label="Budget type" className="grid grid-cols-2 gap-2">
            {BUDGETS.map((b) => (
              <button
                key={b.id}
                type="button"
                role="radio"
                aria-checked={budget === b.id}
                onClick={() => setBudget(b.id)}
                className={cn(
                  'label-console flex items-center justify-center gap-2 border px-3 py-2.5 transition-colors',
                  budget === b.id
                    ? 'border-signal/60 bg-signal-soft/50 text-signal'
                    : 'border-seam bg-inset/40 text-ink-dim hover:border-seam-lit',
                )}
              >
                <b.icon size={13} aria-hidden /> {b.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
            The turn-back marker and green/amber/red return zones (B4/B4b) are checked against the
            budget type you select — the O₂-based backward field for O₂ budgets, the time-based field
            for time. They are scenario estimates, never a guarantee.
          </p>
        </Panel>

        <Panel title="Lookup key (§15)" bodyClassName="p-3">
          <dl className="data-readout flex flex-col gap-2 text-xs text-ink-dim">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-faint">Crew</dt>
              <dd>{state.config.crewCount}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-faint">Load bucket</dt>
              <dd className="text-signal">{bucket} kg</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-faint">Manifest</dt>
              <dd>
                {totalLoadKg(state.config).toFixed(1)} kg total ·{' '}
                {perAstronautLoadKg(state.config).toFixed(1)} kg each
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-faint">Rover</dt>
              <dd>{state.config.roverAvailable ? 'available (T2 mode)' : 'on foot'}</dd>
            </div>
          </dl>
          <div className="rule-seam my-3" />
          <p className="data-readout text-[10px] leading-relaxed text-ink-faint">
            routes/&#123;stop&#125;_{mode}_{state.config.crewCount}_{bucket}.json
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
            The app picks the nearest precomputed crew × load bucket. Edit mission inputs in{' '}
            <span className="text-ink-dim">Mission</span>.
          </p>
        </Panel>
      </div>

      <div className="flex min-h-0 flex-col gap-4">
        <Panel
          title={
            <span className="flex items-center gap-2">
              <Route size={13} aria-hidden /> Route comparison
            </span>
          }
          className="min-h-64"
        >
          <EmptyState
            icon={<Route size={28} strokeWidth={1.5} />}
            title={routeFilesPresent ? 'No route files for this lookup key yet' : 'Routing engine not connected'}
            detail={
              <>
                Fastest vs lowest-hazard polylines, modeled time/O₂, the turn-back slider, the
                green/amber/red return zones, the “don’t go beyond” line and the walk-along slider
                (B3/B4/B4b) all read the engine’s precomputed JSON (§15). Until those files land,
                this build shows no polylines, times, O₂ figures or markers. Hard constraints when
                they ship: <EvidenceBadge evidence="scenario" /> 15° max planning slope and 25%
                return reserve — labeled team assumptions.
              </>
            }
          />
        </Panel>

        <Panel
          title={
            <span className="flex items-center gap-2">
              <Radio size={13} aria-hidden /> Radio coverage (B4c)
            </span>
          }
          bodyClassName="p-4"
        >
          <p className="text-xs leading-relaxed text-ink-dim">
            A <span className="text-ink">Derived</span> viewshed layer from the habitat mast shows
            where ridges block direct line of sight (radio shadow); each route card will report %
            out of contact and the longest blackout. Inside the ≈5.9 km box the limit is terrain,
            not distance (radio horizon ≈11.9 km for a 10 m mast + 2 m helmet antenna —{' '}
            <span className="text-scenario">Scenario</span> heights). The coverage mask ships as{' '}
            <span className="data-readout">fields/coverage.png</span> + <span className="data-readout">coverage.json</span>{' '}
            (§15); Earth can’t relay in time — one-way delay up to ≈22 min.
          </p>
        </Panel>
      </div>
    </div>
  )
}
