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
  /** Astronaut sprite drawn on each crew dot (lib/dataUrl markerSprite); without it, plain dots. */
  figure?: { url: string; pixelRatio?: number }
  /** Put the player panel here instead of over the map. */
  panelContainer?: HTMLElement
  /** Docked mode only: show the small play/clock/O₂ bar over the map (default true). */
  mapHud?: boolean
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
  /** Move the replay layers back on top of the host map's layers. */
  raise(): void
  /** The current model timeline (shape in replay-core.d.ts). */
  readonly timeline: unknown
  destroy(): void
}

export function createReplay(map: MapLibreMap, opts: ReplayOptions): Replay
