import { useCallback, useEffect, useRef, useState } from 'react'
import { PlayCircle, ScanEye } from 'lucide-react'

import { PANORAMAS } from '@/hud/panoramas'
import { StopHud } from '@/hud/StopHud'
import type { Timeline } from '@/replay/replay-core.js'

import type { EngineConstants } from '@/lib/engineDataContext'
import { useEngineData } from '@/lib/useEngineData'
import { usePlan } from '@/map/usePlan'
import { Panel } from '@/ui/Panel'
import { createReplay, type Replay, type ReplayOptions } from '@/replay/replay.js'
import '@/replay/replay.css'

/**
 * Mission Replay in the React app (Marwan). Plays plan.activeRoute on plan.map;
 * the player panel is docked in this card. Model numbers come only from
 * constants.json; a missing key falls back to replay-core's documented defaults.
 */
function modelFromConstants(c: EngineConstants | null): Omit<ReplayOptions, 'route'> {
  const v = (key: string) => c?.[key]?.value
  return {
    capacityL: v('o2_usable_primary_l'),
    reserveFraction: v('reserve_fraction'),
    reserveMin: v('reserve_minutes'),
    walkbackLpm: v('walkback_o2_lpm'),
    returnMargin: v('return_cost_margin'),
    emergencyMin: v('emergency_supply_min'),
    statusStep: v('o2_status_step'),
  }
}

export function MissionReplay() {
  const engine = useEngineData()
  const { map, activeRoute, routesStatus, o2BudgetL, mode } = usePlan()
  const hostRef = useRef<HTMLDivElement>(null)
  const replayRef = useRef<Replay | null>(null)
  // Tier 2 prototype: 360° stop view + HUD, opened with the replay's own timeline (same numbers).
  const [hud, setHud] = useState<Timeline | null>(null)
  const routeRef = useRef(activeRoute)
  // Runs before the creation effect below (effects run in order).
  useEffect(() => {
    routeRef.current = activeRoute
  }, [activeRoute])
  const hasRoute = !!activeRoute
  const closeHud = useCallback(() => setHud(null), [])

  // One replay per map + constants; the route is swapped in place.
  useEffect(() => {
    const host = hostRef.current
    const route = routeRef.current
    if (!map || !host || !route) return
    const replay = createReplay(map, {
      ...modelFromConstants(engine.constants),
      route,
      panelContainer: host,
      showEnds: false,
    })
    replayRef.current = replay
    if (import.meta.env.DEV) (window as unknown as { __replay?: Replay }).__replay = replay // for headless checks
    return () => {
      replay.destroy()
      replayRef.current = null
    }
    // Route changes are handled by setRoute below; only the first route is needed here.
  }, [map, engine.constants, hasRoute])

  useEffect(() => {
    if (activeRoute) replayRef.current?.setRoute(activeRoute)
  }, [activeRoute])

  // The map redraws the chosen route on top when the mode changes; keep the replay above it.
  useEffect(() => {
    replayRef.current?.raise()
  }, [mode, activeRoute, hasRoute])

  // Follow the turn-back slider so both show the same turn-back point.
  const capacityL = engine.constants?.o2_usable_primary_l?.value
  useEffect(() => {
    const replay = replayRef.current
    if (!replay) return
    if (o2BudgetL != null) replay.setBudget(o2BudgetL)
    else if (capacityL != null) replay.setCapacity(capacityL)
  }, [o2BudgetL, capacityL, map, hasRoute])

  const stopId = activeRoute?.stop
  const pano = stopId ? PANORAMAS[stopId] : undefined
  const stop = engine.stops?.find((x) => x.id === stopId)
  const habitat = engine.meta?.habitat?.lonlat as [number, number] | undefined

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <PlayCircle size={13} aria-hidden /> Mission Replay
        </span>
      }
      className="flex-none"
      bodyClassName="p-0"
    >
      {!activeRoute && (
        <p className="p-3 text-xs leading-relaxed text-ink-faint">
          {routesStatus === 'loading'
            ? 'Loading the route…'
            : 'Pick a stop to play the modeled walk: crew markers, O₂ tank, turn-back moment.'}
        </p>
      )}
      <div ref={hostRef} />
      {activeRoute && pano && stop && habitat && (
        <div className="p-3 pt-0">
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 border border-observed/60 px-3 py-2 text-xs text-observed hover:bg-observed/10"
            onClick={() => replayRef.current && setHud(replayRef.current.timeline as unknown as Timeline)}
          >
            <ScanEye size={14} aria-hidden /> 360° view at {stop.id} + HUD (Tier 2 preview)
          </button>
        </div>
      )}
      {hud && pano && stop && habitat && activeRoute && (
        <StopHud
          pano={pano}
          stopName={stop.name}
          sols={stop.sols.length ? `${Math.min(...stop.sols)}–${Math.max(...stop.sols)}` : undefined}
          timeline={hud}
          routeMode={activeRoute.mode}
          stopLonLat={[stop.lon, stop.lat]}
          habitatLonLat={habitat}
          cards={engine.cards}
          onClose={closeHud}
        />
      )}
    </Panel>
  )
}
