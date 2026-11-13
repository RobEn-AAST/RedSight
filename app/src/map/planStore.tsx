import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'

import { fetchData } from '@/lib/dataUrl'
import type { EngineRoute, EngineRouteIndexEntry, EngineRouteMode } from '@/lib/engineDataContext'
import { useEngineData } from '@/lib/useEngineData'
import { useMission } from '@/lib/useMission'
import { PlanContext, type PlanPreset, type PlanStore } from '@/map/planContext'
import { nearestLoadBucket, perAstronautLoadKg } from '@/types/mission'

const MODES: EngineRouteMode[] = ['fastest', 'safest']

/**
 * Picks the route files to show for a stop. The engine ships routes only for
 * some crew × load presets (§15), so if the mission's own preset has no files
 * the first preset that does is shown, and the UI says so.
 */
function pickRouteFiles(
  index: EngineRouteIndexEntry[],
  stopId: string,
  crew: number,
  loadKg: number,
): { preset: PlanPreset; files: Partial<Record<EngineRouteMode, string>> } | null {
  const forStop = index.filter((r) => r.stop === stopId)
  if (forStop.length === 0) return null
  const exact = forStop.filter((r) => r.crew === crew && r.load_kg === loadKg)
  const chosen = exact.length > 0 ? exact : forStop.filter(
    (r) => r.crew === forStop[0].crew && r.load_kg === forStop[0].load_kg,
  )
  const files: Partial<Record<EngineRouteMode, string>> = {}
  for (const r of chosen) files[r.mode] = r.file
  return {
    preset: { crew: chosen[0].crew, load_kg: chosen[0].load_kg, matchesMission: exact.length > 0 },
    files,
  }
}

function isRoute(raw: unknown): raw is EngineRoute {
  const r = raw as Partial<EngineRoute> | null
  return (
    !!r &&
    Array.isArray(r.coords) &&
    r.coords.length > 1 &&
    Array.isArray(r.seg) &&
    Array.isArray(r.cum?.t_s) &&
    Array.isArray(r.cum?.o2_l) &&
    Array.isArray(r.back?.t_s) &&
    Array.isArray(r.back?.o2_l)
  )
}

interface Loaded {
  key: string
  routes: Partial<Record<EngineRouteMode, EngineRoute>>
}

export function PlanProvider({ children }: { children: ReactNode }) {
  const engine = useEngineData()
  const { state } = useMission()
  const [selectedStopId, selectStop] = useState<string | null>(null)
  const [mode, setMode] = useState<EngineRouteMode>('fastest')
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [o2BudgetL, setO2BudgetL] = useState<number | null>(null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  const crew = state.config.crewCount
  const loadKg = nearestLoadBucket(perAstronautLoadKg(state.config))

  const pick = useMemo(
    () =>
      selectedStopId && engine.routeIndex
        ? pickRouteFiles(engine.routeIndex, selectedStopId, crew, loadKg)
        : null,
    [engine.routeIndex, selectedStopId, crew, loadKg],
  )
  const key = pick ? `${selectedStopId}|${pick.preset.crew}|${pick.preset.load_kg}` : null

  useEffect(() => {
    if (!pick || !key) return
    let cancelled = false
    void Promise.all(
      MODES.map(async (m) => [m, pick.files[m] ? await fetchData<unknown>(pick.files[m]) : null] as const),
    ).then((results) => {
      if (cancelled) return
      const routes: Partial<Record<EngineRouteMode, EngineRoute>> = {}
      for (const [m, raw] of results) if (isRoute(raw)) routes[m] = raw
      setLoaded({ key, routes })
    })
    return () => {
      cancelled = true
    }
  }, [pick, key])

  const store = useMemo<PlanStore>(() => {
    const current = loaded && loaded.key === key ? loaded.routes : null
    const routes = current ?? {}
    const routesStatus = !selectedStopId
      ? 'idle'
      : !pick
        ? 'missing'
        : !current
          ? 'loading'
          : Object.keys(current).length > 0
            ? 'ready'
            : 'missing'
    return {
      selectedStopId,
      selectStop,
      mode,
      setMode,
      routes,
      routesStatus,
      // If only one mode's file exists, show that one instead of nothing.
      activeRoute: routes[mode] ?? routes.fastest ?? routes.safest ?? null,
      preset: pick?.preset ?? null,
      o2BudgetL,
      setO2BudgetL,
      map,
      setMap,
    }
  }, [selectedStopId, mode, loaded, key, pick, map, o2BudgetL])

  return <PlanContext.Provider value={store}>{children}</PlanContext.Provider>
}
