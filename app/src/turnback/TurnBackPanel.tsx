import { useEffect, useMemo } from 'react'
import { Marker } from 'maplibre-gl'
import { Undo2, RotateCcw } from 'lucide-react'

import { cn } from '@/lib/cn'
import { useEngineData } from '@/lib/useEngineData'
import { EarthDelayNote } from '@/map/EarthDelayNote'
import { formatDistance, formatDuration } from '@/map/format'
import { usePlan } from '@/map/usePlan'
import { ConstantValue, SourcedValue } from '@/provenance/SourceCard'
import type { SourceInfo } from '@/provenance/sourceInfo'
import { budgetToReachStop, o2PlanFromConstants, turnBackPoint, type TurnBackResult } from '@/turnback/turnback'
import { Panel } from '@/ui/Panel'

/**
 * Turn-back slider (Tier 1, B4). Owner: Jana.
 * Drag the usable O₂ budget; the modeled turn-back point moves along the
 * selected route on the map. Reads plan.activeRoute and plan.map (Yassin's
 * plan store) and constants.json. All outputs are Scenario estimates.
 */

/** Draws the turn-back marker on the live map; removes it when there is nothing to show. */
function useTurnBackMarker(result: TurnBackResult | null) {
  const { map } = usePlan()
  const show = !!map && !!result && result.status === 'turns-back'
  const lon = result?.lonlat[0]
  const lat = result?.lonlat[1]

  useEffect(() => {
    if (!show || !map || lon == null || lat == null) return
    const el = document.createElement('div')
    el.setAttribute('role', 'img')
    el.setAttribute('aria-label', 'Modeled turn-back point')
    el.className = 'pointer-events-none flex flex-col items-center gap-1'
    const chip = document.createElement('span')
    chip.textContent = 'TURN'
    chip.className =
      'data-readout border border-caution bg-caution-soft/95 px-1.5 py-0.5 text-[11px] font-medium leading-none text-caution'
    const dot = document.createElement('span')
    dot.className = 'size-3 rounded-full border-2 border-void bg-caution'
    el.append(chip, dot)
    const marker = new Marker({ element: el, anchor: 'bottom', offset: [0, 6] }).setLngLat([lon, lat]).addTo(map)
    return () => {
      marker.remove()
    }
  }, [show, map, lon, lat])
}

/** `bare`: no card frame, for embedding inside another panel (the routes screen's plan steps). */
export function TurnBackPanel({ bare = false }: { bare?: boolean } = {}) {
  const engine = useEngineData()
  // The budget lives in the plan store so Mission Replay plays the same budget.
  const { activeRoute, routesStatus, o2BudgetL: budget, setO2BudgetL: setBudget, o2Scale } = usePlan()
  const { plan, missing } = useMemo(() => o2PlanFromConstants(engine.constants), [engine.constants])

  // Default = the full plan budget C − R; clamp if the constants change underneath.
  const maxB = plan?.maxBudgetL ?? 0
  const budgetL = budget == null ? maxB : Math.min(Math.max(budget, 0), maxB)

  const result = useMemo(
    () => (activeRoute && plan ? turnBackPoint(activeRoute, budgetL, plan.returnMargin, o2Scale.factor) : null),
    [activeRoute, plan, budgetL, o2Scale.factor],
  )
  const reachNeed = useMemo(
    () => (activeRoute && plan ? budgetToReachStop(activeRoute, plan.returnMargin, o2Scale.factor) : null),
    [activeRoute, plan, o2Scale.factor],
  )
  useTurnBackMarker(result)

  const routeInfo = (note?: string): SourceInfo => ({
    badge: activeRoute?.badge ?? 'Scenario',
    source: (
      <>
        Engine route file <span className="data-readout">{activeRoute?.id}</span> (cum and back tables),
        compared with the budget using the turn rule in demo-focus-plan §9c.
      </>
    ),
    note: note ?? 'Modeled guidance from the walking and O₂ model, not a measurement and not a guarantee.',
  })
  const budgetInfo: SourceInfo = {
    badge: 'Scenario',
    source: plan ? (
      <>
        Capacity − reserve = {plan.capacityL} − {plan.reserveL.toFixed(1)} = {plan.maxBudgetL.toFixed(1)} L at
        full tank (constants.json; the reserve is never planned). The slider lowers it.
      </>
    ) : (
      'constants.json'
    ),
    unit: 'L',
  }

  const content = (
    <>
      {!plan && engine.probed && (
        <p className="px-1 text-xs leading-relaxed text-ink-faint">
          constants.json is missing {missing.join(', ')}, so no budget can be computed. Nothing is drawn.
        </p>
      )}
      {plan && routesStatus !== 'ready' && (
        <p className="px-1 text-xs leading-relaxed text-ink-faint">
          Pick a stop with route files to see where the modeled turn-back point falls.
        </p>
      )}
      {plan && activeRoute && !result && (
        <p role="status" className="border border-caution/40 bg-caution-soft/30 px-3 py-2 text-xs leading-relaxed text-caution">
          Complete directed return costs are unavailable for this route. The turn-back estimate and replay are disabled; no outbound-cost fallback is used.
        </p>
      )}
      {plan && activeRoute && result && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 px-1">
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="turnback-budget" className="label-console text-ink">
                Usable O₂ budget
              </label>
              <span className="data-readout text-base text-signal">{budgetL.toFixed(1)} L</span>
            </div>
            <input
              id="turnback-budget"
              type="range"
              min={0}
              max={maxB}
              step="any"
              value={budgetL}
              onChange={(e) => setBudget(Number(e.target.value))}
              aria-valuetext={`${budgetL.toFixed(1)} litres per crew member`}
              className="w-full accent-[var(--color-signal)]"
            />
            <div className="data-readout flex justify-between text-[10px] text-ink-faint">
              <span>0 L</span>
              {reachNeed != null && reachNeed <= maxB && (
                <span>endpoint needs ≥ {reachNeed.toFixed(1)} L</span>
              )}
              <span>{maxB.toFixed(1)} L (full)</span>
            </div>
            {budget != null && budget !== maxB && (
              <button
                type="button"
                onClick={() => setBudget(null)}
                className="label-console flex w-fit items-center gap-1.5 text-[10px] text-ink-dim hover:text-signal"
              >
                <RotateCcw size={11} aria-hidden /> Full budget
              </button>
            )}
          </div>

          <p
            role="status"
            className={cn(
              'border px-3 py-2 text-xs leading-relaxed',
              result.status === 'reaches-stop'
                ? 'border-go/40 bg-go-soft/40 text-go'
                : 'border-caution/40 bg-caution-soft/40 text-caution',
            )}
          >
            {result.status === 'reaches-stop' &&
              `The modeled endpoint fits inside this budget: modeled return with the ${plan.returnMargin}× margin still fits.`}
            {result.status === 'turns-back' &&
              `Modeled turn-back point: ${result.distanceM != null ? formatDistance(result.distanceM) : `${Math.round(result.routeFraction * 100)} %`} along the route, ${formatDuration(result.outTimeS)} after leaving. Turn there and head home.`}
            {result.status === 'no-go' && 'This budget does not cover leaving the habitat (modeled).'}
          </p>

          <dl className="flex flex-col gap-2.5 px-1">
            <SourcedValue label="Usable budget (slider)" value={`${budgetL.toFixed(1)} L`} info={budgetInfo} emphasis />
            {result.status !== 'no-go' && (
              <>
                <SourcedValue
                  label={result.status === 'reaches-stop' ? 'Walk out to the modeled endpoint' : 'Walk out to the turn point'}
                  value={`${formatDuration(result.outTimeS)} · ${result.outO2L.toFixed(1)} L`}
                  info={routeInfo()}
                />
                <SourcedValue
                  label="Expected walk home"
                  value={`${formatDuration(result.homeTimeS)} · ${result.homeO2L.toFixed(1)} L`}
                  info={routeInfo()}
                />
                <SourcedValue
                  label="Spare O₂ on arrival, above the reserve"
                  value={`${result.spareAtHomeL.toFixed(1)} L`}
                  info={routeInfo(
                    `Budget − (out + expected home). It is above zero because the plan prices the way home ${plan.returnMargin}× more than expected; the ${plan.reserveL.toFixed(1)} L reserve is on top of this.`,
                  )}
                />
              </>
            )}
            <div className="rule-seam my-0.5" />
            <ConstantValue k="o2_usable_primary_l" label="Tank capacity" />
            <SourcedValue
              label={`Reserve, never planned (set by the ${plan.reserveRule === 'fraction' ? 'tank share' : 'walkback minutes'})`}
              value={`${plan.reserveL.toFixed(1)} L`}
              info={{
                badge: 'Scenario',
                source: 'max(reserve_fraction × capacity, reserve_minutes × walkback_o2_lpm), all from constants.json',
                note: 'Apollo planned traverses with a 30-minute consumables reserve; the plan never spends it.',
              }}
            />
            <ConstantValue k="reserve_fraction" label="Reserve share of tank" />
            <ConstantValue k="reserve_minutes" label="Reserve walkback time" />
            <ConstantValue k="walkback_o2_lpm" label="Walkback O₂ rate" />
            <ConstantValue k="return_cost_margin" label="Return margin" />
          </dl>

          <p className="px-1 text-[11px] leading-relaxed text-ink-faint">
            Per crew member, one suit each. A modeled estimate for planning, never a guarantee: real O₂ use
            depends on the person, the suit and the ground.
          </p>
        </div>
      )}
      <EarthDelayNote className={plan && activeRoute && result ? 'mt-3' : 'mt-2'} />
    </>
  )

  if (bare) return <div className="flex flex-col gap-3">{content}</div>
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Undo2 size={13} aria-hidden /> Turn-back point
        </span>
      }
      className="flex-none"
      bodyClassName="p-3"
    >
      {content}
    </Panel>
  )
}
