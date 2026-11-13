import { createContext } from 'react'

/**
 * Engine data contract (demo-focus-plan §15): the engine writes static JSON to
 * app/public/data/. Types + context live here; the provider is in engineData.tsx.
 * The UI never computes model values — only threshold/lookup operations on
 * precomputed fields are allowed (plan §4 design rule).
 */

export interface EngineMeta {
  opsBox: { west: number; east: number; south: number; north: number }
  grid: { origin: [number, number]; resolution: number; size: [number, number] }
  crs: string
  nodata: number
  buildDate: string
  constantsHash: string
}

export interface EngineLayer {
  id: string
  name: string
  tileUrlTemplate?: string
  zoomRange?: [number, number]
  legend?: string
  provenance?: {
    source: string
    url?: string
    resolution?: string
    date?: string
    badge?: string
  }
}

export interface EngineStop {
  id: string
  name: string
  lon: number
  lat: number
  sol?: number | string
  evidence?: string
  approx?: boolean
  photos?: string[]
  panorama?: string
  scienceText?: string
  badge?: string
}

export interface EngineDataState {
  meta: EngineMeta | null
  layers: EngineLayer[] | null
  stops: EngineStop[] | null
  /** true once the initial presence probe finished (found or not) */
  probed: boolean
}

export const EngineDataContext = createContext<EngineDataState>({
  meta: null,
  layers: null,
  stops: null,
  probed: false,
})
