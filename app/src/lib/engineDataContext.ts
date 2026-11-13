import { createContext } from 'react'

/**
 * Engine data contract (demo-focus-plan §15, shapes as committed in
 * app/public/data/README.md). The engine writes static JSON to
 * app/public/data/. Types + context live here; the provider is in
 * engineData.tsx. The UI never computes model values: it only reads, sums and
 * thresholds what these files contain.
 */

export type ContractBadge = 'Observed' | 'Derived' | 'Scenario' | 'Unavailable'

export interface EngineMeta {
  _mock?: boolean
  ops_box: { west: number; east: number; south: number; north: number }
  crs: string
  grid: {
    resolution_m: number
    width: number
    height: number
    origin_lonlat: [number, number]
  }
  nodata: number
  habitat: { lonlat: [number, number]; badge: ContractBadge; note?: string }
  build_date: string
  constants_hash: string
}

export interface EngineLayer {
  id: string
  name: string
  /** Tile URL template, relative to app/public/data/ unless absolute. */
  tiles: string
  minzoom: number
  maxzoom: number
  badge: ContractBadge
  provenance: { source: string; resolution?: string; date?: string; license?: string }
  legend: string | null
  /** false until the tiles exist; the app must not request unavailable layers. */
  available: boolean
}

export interface EngineStop {
  id: string
  name: string
  kind: string
  lon: number
  lat: number
  sols: number[]
  evidence?: string
  approx: boolean
  photos: string[]
  panorama?: string | null
  science?: string
  badge: ContractBadge
}

export interface EngineConstant {
  value: number
  unit: string
  range: [number, number] | null
  source: string
  badge: ContractBadge
}

export type EngineConstants = Record<string, EngineConstant>

export type EngineRouteMode = 'fastest' | 'safest'

export interface EngineGoalAccess {
  badge: 'Derived'
  status: 'approach_only'
  observed_stop_lonlat: [number, number]
  endpoint_lonlat: [number, number]
  offset_m: number
  access_bound_m: number
  native_cell_rc: [number, number]
  reason: string
  last_leg_modeled: false
}

export interface EngineRouteIndexEntry {
  id: string
  stop: string
  mode: EngineRouteMode
  crew: number
  load_kg: number
  /** Path relative to app/public/data/. */
  file: string
  total_s: number
}

export interface EngineRoute {
  _mock?: boolean
  id: string
  stop: string
  mode: EngineRouteMode
  crew: number
  load_kg: number
  badge: ContractBadge
  /** Usable O2 per crew member after reserve, litres. */
  budget_l: number
  constants_hash: string
  /** [[lon, lat], …] habitat → exported route endpoint, N points. */
  coords: [number, number][]
  /** Present when the route ends at a Derived access point short of the Observed stop. */
  goal_access?: EngineGoalAccess
  /** Observed stop coordinate, kept separate from coords when goal_access is present. */
  observed_stop_lonlat?: [number, number]
  /** N−1 segments. */
  seg: {
    t_s: number
    o2_l: number
    slope_deg: number
    cost_terms: { distance_m: number } & Record<string, number>
  }[]
  /** Cumulative from the habitat to each point (N values). */
  cum: { t_s: number[]; o2_l: number[] }
  /** Cost to walk home from each point (N values). */
  back: { t_s: number[]; o2_l: number[] }
  /** Optional fastest way home from each point (app/public/data/README.md); drives the switch to it. */
  back_fast?: { t_s: number[]; o2_l: number[]; path?: [number, number][][]; via?: string }
  /** Last point where cum.o2_l + back.o2_l ≤ budget_l. */
  pnr_index: number
}

export interface EngineHazards {
  type: 'FeatureCollection'
  _mock?: boolean
  features: {
    type: 'Feature'
    properties: { reason: string; label?: string }
    geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown }
  }[]
}

export interface EngineCard {
  _mock?: boolean
  title: string
  badge: ContractBadge
  values: { label: string; value: number | string; unit?: string; pm?: number }[]
  limits?: { label: string; value: number | string; unit?: string; source?: string }[]
  note?: string
  source: string
  date_range?: string
}

/**
 * A single preview image of the ops box (app/public/preview/basemap.json).
 * Not part of the §15 contract: it fills the map until real tiles exist.
 */
export interface PreviewBasemap {
  /** Absolute-path URL of the image. */
  url: string
  bounds: { west: number; east: number; south: number; north: number }
  name: string
  badge: ContractBadge
  resolution: string
  source: string
  source_url?: string
  retrieved?: string
  alignment?: string
  /** A wider, coarser image around the ops box, so the map has no hard edge. */
  context: { url: string; bounds: PreviewBasemap['bounds']; resolution: string } | null
}

/* ---- Proposed plan files (docs/app-redesign.md §4) ------------------------- */

/** An area worth sampling, drawn around a real rover-visited site. */
export interface PlanTarget {
  id: string
  name: string
  /** The real site the area is drawn around. */
  site: [number, number]
  /** Outer ring of the area, [lon, lat] pairs. */
  ring: [number, number][]
  substances: string[]
  /** Science-goal ids (lib/materials.ts) this target serves. */
  goals: string[]
  evidence: string | null
  badge: ContractBadge
  extentNote?: string
}

export type LegKind = 'drive' | 'walk'

export interface PlanLeg {
  kind: LegKind
  /** Point indices into the member's coords: the leg runs from → to. */
  from: number
  to: number
  t_s: number
  o2_l: number
  distance_m: number
}

/** One astronaut's (or the pair's) route out to its targets. */
export interface PlanMember {
  member: string
  label: string
  targets: string[]
  coords: [number, number][]
  /** Preserve route endpoint semantics when a legacy engine route is wrapped as a plan member. */
  goal_access?: EngineGoalAccess
  observed_stop_lonlat?: [number, number]
  legs: PlanLeg[]
  seg: { t_s: number; o2_l: number; slope_deg: number; distance_m: number }[]
  cum: { t_s: number[]; o2_l: number[] }
  back: { t_s: number[]; o2_l: number[] }
  /** Optional fastest way home from each point (app/public/data/README.md); drives the switch to it. */
  back_fast?: { t_s: number[]; o2_l: number[]; path?: [number, number][][]; via?: string }
  pnr_index: number
  /** Where the rover parks and the walk starts; null on foot. */
  park_index: number | null
}

export interface PlanSplit {
  rule: string
  max_separation_limit_m: number
  planned_max_separation_m: number
  members: PlanMember[]
}

export interface PlanFile {
  _mock?: boolean
  id: string
  target: string
  mode: EngineRouteMode
  crew: number
  load_kg: number
  rover: boolean
  badge: ContractBadge
  budget_l: number
  /** The crew walking together (one member entry for the pair). */
  together: PlanMember[]
  /** Two astronauts to two targets, staying in reach. Crew of 2 only. */
  split: PlanSplit | null
}

export interface PlanIndexEntry {
  id: string
  target: string
  mode: EngineRouteMode
  crew: number
  load_kg: number
  rover: boolean
  file: string
}

export interface EngineDataState {
  meta: EngineMeta | null
  layers: EngineLayer[] | null
  stops: EngineStop[] | null
  constants: EngineConstants | null
  routeIndex: EngineRouteIndexEntry[] | null
  hazards: EngineHazards | null
  cards: { rad: EngineCard | null; rems: EngineCard | null }
  preview: PreviewBasemap | null
  targets: PlanTarget[] | null
  planIndex: PlanIndexEntry[] | null
  planIndexMock: boolean
  routeIndexMock: boolean
  /** true when any loaded file carries the `_mock` flag. */
  mock: boolean
  /** true once the initial load finished (found or not). */
  probed: boolean
}

export const emptyEngineData: EngineDataState = {
  meta: null,
  layers: null,
  stops: null,
  constants: null,
  routeIndex: null,
  hazards: null,
  cards: { rad: null, rems: null },
  preview: null,
  targets: null,
  planIndex: null,
  planIndexMock: false,
  routeIndexMock: false,
  mock: false,
  probed: false,
}

export const EngineDataContext = createContext<EngineDataState>(emptyEngineData)
