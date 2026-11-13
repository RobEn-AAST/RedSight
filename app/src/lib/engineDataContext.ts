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
  /** [[lon, lat], …] habitat → stop, N points. */
  coords: [number, number][]
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
  mock: false,
  probed: false,
}

export const EngineDataContext = createContext<EngineDataState>(emptyEngineData)
