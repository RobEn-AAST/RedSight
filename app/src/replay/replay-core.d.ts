// Types for the plain-JS replay model (replay-core.js), the parts the HUD reads. Owner: Marwan.
export interface TimelineEvent { t: number; type: string; label: string }
export interface Frame { t: number; o2: number; pt: [number, number]; d: number; phase: 'out' | 'stop' | 'back' | 'home' }
export interface Timeline {
  frames: Frame[]
  switchPoint: [number, number] | null
  members: number[]
  worstFactor: number
  events: TimelineEvent[]
  totalS: number
  tankL?: number
  capacityL: number
  reserveL: number
  budgetL: number
  walkbackLpm: number
  reachStop: boolean
  fastHome: boolean
  switchT: number | null
  turnPoint: [number, number] | null
  arrivalL: number
}
export interface Sample {
  t: number
  pt: [number, number]
  o2Left: number
  members: number[]
  usableLeft: number
  homeL: number
  minutesLeft: number
  distM: number
  phase: 'out' | 'stop' | 'back' | 'home'
}
export function buildTimeline(route: unknown, opts?: Record<string, unknown>): Timeline
export function sampleAt(tl: Timeline, t: number): Sample
export function formatDuration(s: number): string
export function formatClock(s: number): string
export function distanceM(a: [number, number], b: [number, number]): number

export function hasCompleteAlternateReturn(route: unknown): boolean
