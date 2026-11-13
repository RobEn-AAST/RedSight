import { createContext } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'

import type { EngineRoute, EngineRouteMode } from '@/lib/engineDataContext'

/**
 * Shared plan state: which stop and route the operator is looking at, the two
 * route files for that stop, and the live MapLibre map.
 *
 * Other features plug in here instead of reaching into the map workspace:
 * the replay calls `createReplay(plan.map, { route: plan.activeRoute })`, and
 * the turn-back slider reads `plan.activeRoute`.
 */

export type RoutesStatus = 'idle' | 'loading' | 'ready' | 'missing'

export interface PlanPreset {
  crew: number
  load_kg: number
  /** false when the mission's crew/load has no route files and another preset is shown. */
  matchesMission: boolean
}

export interface PlanStore {
  selectedStopId: string | null
  selectStop: (id: string | null) => void
  mode: EngineRouteMode
  setMode: (mode: EngineRouteMode) => void
  /** Route files for the selected stop, by mode. */
  routes: Partial<Record<EngineRouteMode, EngineRoute>>
  routesStatus: RoutesStatus
  /** The route for the selected stop and mode, if loaded. */
  activeRoute: EngineRoute | null
  preset: PlanPreset | null
  /**
   * Usable O₂ budget per crew member set by the turn-back slider (L), shared so
   * the slider and Mission Replay use the same number. null = full budget C − R.
   */
  o2BudgetL: number | null
  setO2BudgetL: (l: number | null) => void
  /** The MapLibre map once it has loaded; null before that and off the map workspace. */
  map: MapLibreMap | null
  setMap: (map: MapLibreMap | null) => void
}

export const PlanContext = createContext<PlanStore | null>(null)
