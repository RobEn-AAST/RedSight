import { createContext } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'

import type {
  EngineRoute,
  EngineRouteMode,
  EngineRoutePreference,
  PlanFile,
  PlanMember,
  PlanTarget,
} from '@/lib/engineDataContext'

/**
 * Shared plan state for the routes screen: which target, which of the two
 * routes, whether a pair walks together or splits, the plan files behind them
 * and the live MapLibre map.
 *
 * Other features plug in here instead of reaching into the map: the replay
 * calls `createReplay(plan.map, { route: plan.activeMembers[0] })`, and the
 * turn-back slider reads `plan.activePlan`.
 */

export type PlanStatus = 'idle' | 'loading' | 'ready' | 'missing'
export type CrewMode = 'together' | 'split'

export interface PlanPreset {
  crew: number
  load_kg: number
  rover: boolean
  /** false when the mission's own setup has no plan files and another preset is shown. */
  matchesMission: boolean
}

export interface PlanStore {
  /** Targets that serve the mission's science goal (all targets if none match). */
  goalTargets: PlanTarget[]
  /** true when no target serves the goal, so every target is offered instead. */
  goalUnmatched: boolean
  selectedTargetId: string | null
  selectTarget: (id: string) => void
  mode: EngineRoutePreference
  setMode: (mode: EngineRoutePreference) => void
  applyDynamicRoute: (route: EngineRoute) => void
  clearDynamicRoute: () => void
  layerVisibility: Record<string, boolean>
  setLayerVisibility: (id: string, visible: boolean) => void
  crewMode: CrewMode
  setCrewMode: (mode: CrewMode) => void
  /** Plan files for the selected target, by mode. */
  plans: Partial<Record<EngineRouteMode, PlanFile>>
  /** §15 route contract files for the selected target (carry seg[].cost_terms). */
  contractRoutes: Partial<Record<EngineRoutePreference, EngineRoute>>
  status: PlanStatus
  /** The plan for the selected target and mode, if loaded. */
  activePlan: PlanFile | null
  /** Who walks where under the current crew mode. */
  activeMembers: PlanMember[]
  /** The modeled no-return line for the current crew/load/rover setup. */
  noReturnLine: FeatureCollection | null
  preset: PlanPreset | null
  /** true when plans come from the older single-route files (no legs, no split). */
  legacy: boolean
  /**
   * The first active member as a §15 route (coords, seg, cum, back, pnr_index,
   * budget_l), for the turn-back slider and Mission Replay. null with no plan.
   */
  activeRoute: EngineRoute | null
  /** Same as `status`, under the name the slider and replay read. */
  routesStatus: PlanStatus
  /**
   * Usable O₂ budget per crew member set by the turn-back slider (L), shared so
   * the slider and Mission Replay use the same number. null = full budget C − R.
   */
  o2BudgetL: number | null
  setO2BudgetL: (l: number | null) => void
  /** Whether Curiosity's Observed MMGIS traverse overlay is visible on the map. */
  showCuriosityPath: boolean
  setShowCuriosityPath: (show: boolean) => void
  map: MapLibreMap | null
  setMap: (map: MapLibreMap | null) => void
}

export const PlanContext = createContext<PlanStore | null>(null)
