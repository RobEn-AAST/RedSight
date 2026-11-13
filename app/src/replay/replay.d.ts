// Types for the plain-JS Mission Replay module (replay.js). Owner: Marwan.
import type { Map as MapLibreMap } from 'maplibre-gl'

export interface ReplayEvent {
  type: string
  label: string
  atS: number
}

export interface ReplayOptions {
  route: unknown
  capacityL?: number
  reserveFraction?: number
  reserveMin?: number
  walkbackLpm?: number
  returnMargin?: number
  emergencyMin?: number
  statusStep?: number
  memberFactors?: number[]
  durationS?: number
  voice?: boolean
  /** Put the player panel here instead of over the map. */
  panelContainer?: HTMLElement
  /** Draw habitat + stop dots (default true); off when the host map has its own markers. */
  showEnds?: boolean
  onEvent?: (e: ReplayEvent) => void
}

export interface Replay {
  play(): void
  pause(): void
  seek(t: number): void
  setBudget(l: number): void
  setCapacity(l: number): void
  setRoute(route: unknown): void
  drill(factor: number, label?: string): void
  clearDrill(): void
  destroy(): void
}

export function createReplay(map: MapLibreMap, opts: ReplayOptions): Replay
