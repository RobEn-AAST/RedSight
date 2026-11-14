import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PlayCircle, ScanEye } from 'lucide-react'

import { PANORAMAS } from '@/hud/panoramas'
const StopHud = lazy(() => import('@/hud/StopHud').then((m) => ({ default: m.StopHud })))
import { fastPathFrom, type Timeline } from '@/replay/replay-core.js'

import { markerSprite } from '@/lib/dataUrl'
import type { EngineConstants } from '@/lib/engineDataContext'
import { useEngineData } from '@/lib/useEngineData'
import { usePlan } from '@/map/usePlan'
import { ErrorBoundary } from '@/ui/ErrorBoundary'
import { Panel } from '@/ui/Panel'

/** Fired by the stop list's "Look around" button; the replay opens its 360° view + HUD. */
export const OPEN_360_EVENT = 'redsight:open-360'
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

/** `bare`: no card frame, for embedding inside another panel (the routes screen's plan steps). */
export function MissionReplay({ bare = false }: { bare?: boolean } = {}) {
  const engine = useEngineData()
  const { map, activeRoute, routesStatus, o2BudgetL, mode, memberFactors } = usePlan()
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
  // On arrival at a stop with a panorama, pause the walk and open the 360° view + HUD. Kept in a ref so the
  // replay (created once per map) always calls the current version.
  const onArrive = useRef<() => void>(() => {})
  useEffect(() => {
    const open = () => replayRef.current && setHud(replayRef.current.timeline as unknown as Timeline)
    window.addEventListener(OPEN_360_EVENT, open)
    return () => window.removeEventListener(OPEN_360_EVENT, open)
  }, [])

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
      figure: markerSprite('astronaut'),
      roverFigure: markerSprite('rover'),
      onEvent: (e: { type: string }) => {
        if (e.type === 'arrive') onArrive.current()
      },
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

  // Body mass per astronaut: each member's O₂ runs at their own rate (lib/memberFactor.ts).
  const factorsKey = memberFactors.map((f) => f.toFixed(6)).join(',')
  useEffect(() => {
    replayRef.current?.setMemberFactors(factorsKey.split(',').map(Number))
  }, [factorsKey, map, hasRoute])

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
  // Lines for the fixed route drawn in the 360 view: the way out, and the way home from the stop
  // (the fastest-way-home path when the replay switched to it, else the route walked back).
  const wayOut = useMemo(() => (activeRoute?.coords ?? []) as [number, number][], [activeRoute])
  const lastI = (activeRoute?.coords.length ?? 1) - 1
  const bfPath = useMemo(() => (activeRoute ? fastPathFrom(activeRoute, lastI) ?? undefined : undefined), [activeRoute, lastI])
  const fastFromStop = hud?.fastHome ? bfPath : undefined
  const bf = activeRoute?.back_fast
  const bfFaster = !!bf && !!activeRoute && bf.t_s[lastI] < activeRoute.back.t_s[lastI]
  const fastestHome = useMemo(
    () => (bfFaster && bfPath?.length ? bfPath : wayOut.slice().reverse()) as [number, number][],
    [bfFaster, bfPath, wayOut],
  )
  // Cost of the fastest way home from the stop: back_fast if it beats the route back, else the route back.
  const fastHomeCost = useMemo(() => {
    const back = activeRoute?.back
    if (!back) return null
    const b = { t_s: back.t_s[lastI], o2_l: back.o2_l[lastI] }
    const f = bf ? { t_s: bf.t_s[lastI], o2_l: bf.o2_l[lastI] } : null
    return f && f.t_s < b.t_s ? f : b
  }, [activeRoute, bf, lastI])
  const wayHome = useMemo(
    () => (fastFromStop?.length ? fastFromStop : wayOut.slice().reverse()) as [number, number][],
    [fastFromStop, wayOut],
  )

  useEffect(() => {
    onArrive.current = () => {
      const replay = replayRef.current
      if (!replay || !pano || !stop || !habitat || !activeRoute) return
      replay.pause()
      setHud(replay.timeline as unknown as Timeline)
    }
  })

  const content = (
    <>
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
              <ScanEye size={14} aria-hidden /> 360° view at {stop.id} + HUD
            </button>
          </div>
        )}
        {hud && pano && stop && habitat && activeRoute && (
          <ErrorBoundary
            fallback={(reset) => (
              <p role="alert" className="flex flex-wrap items-center gap-2 p-3 text-xs text-caution">
                The 360° view could not load. Reload the page to try again.
                <button type="button" className="underline underline-offset-2" onClick={() => { reset(); closeHud() }}>
                  Close
                </button>
              </p>
            )}
          >
          <Suspense fallback={<p role="status" className="p-4 text-ink-dim">Loading panorama…</p>}><StopHud
            pano={pano}
            stopName={stop.name}
            sols={stop.sols.length ? `${Math.min(...stop.sols)}–${Math.max(...stop.sols)}` : undefined}
            timeline={hud}
            routeMode={activeRoute.mode}
            stopLonLat={[stop.lon, stop.lat]}
            habitatLonLat={habitat}
            cards={engine.cards}
            wayOut={wayOut}
            wayHome={wayHome}
            fastestHome={fastestHome}
            fastHomeCost={fastHomeCost}
            onClose={closeHud}
          /></Suspense>
          </ErrorBoundary>
        )}
      </>
  )

  if (bare) return <div>{content}</div>
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
      {content}
    </Panel>
  )
}
