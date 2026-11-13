import { useEffect, useRef } from 'react'
import { PlayCircle } from 'lucide-react'

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
  const { map, activeRoute, routesStatus } = usePlan()
  const hostRef = useRef<HTMLDivElement>(null)
  const replayRef = useRef<Replay | null>(null)

  // One replay per map + constants; the route is swapped in place.
  useEffect(() => {
    const host = hostRef.current
    if (!map || !host || !activeRoute) return
    const replay = createReplay(map, {
      ...modelFromConstants(engine.constants),
      route: activeRoute,
      panelContainer: host,
      showEnds: false,
    })
    replayRef.current = replay
    return () => {
      replay.destroy()
      replayRef.current = null
    }
    // activeRoute is handled by the effect below; only a first route is needed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, engine.constants, !!activeRoute])

  useEffect(() => {
    if (activeRoute) replayRef.current?.setRoute(activeRoute)
  }, [activeRoute])

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
    </Panel>
  )
}
