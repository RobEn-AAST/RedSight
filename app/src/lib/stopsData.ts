/**
 * Fallback stop list — real Curiosity positions documented in
 * docs/demo-focus-plan.md §6 (from NASA MMGIS waypoint files, accessed
 * 2026-11-13). Used only until the engine's stops.json (§15) ships; the app
 * replaces this list with engine data when present. Coordinates are Observed
 * rover positions; the habitat is a Scenario point chosen at the pilot gate.
 */

export interface FallbackStop {
  id: string
  name: string
  detail: string
  sol: string
  lon: number
  lat: number
  badge: 'observed' | 'scenario'
}

/** Proposed ops box (D11 — team choice, confirm at pilot gate). */
export const opsBox = {
  west: 137.335,
  east: 137.435,
  south: -4.85,
  north: -4.75,
} as const

export const fallbackStops: FallbackStop[] = [
  {
    id: 's1',
    name: 'S1 — First boxwork 360°',
    detail: 'PIA26559 (Mastcam, 2025-05-15…18), site 116',
    sol: '4539–4541',
    lon: 137.38592,
    lat: -4.79782,
    badge: 'observed',
  },
  {
    id: 's2',
    name: 'S2 — Nevado Sajama 360°',
    detail: 'PIA26696 (2025-11-09…12-07), site 120',
    sol: '4711 / 4741',
    lon: 137.381,
    lat: -4.808,
    badge: 'observed',
  },
  {
    id: 's3',
    name: 'S3 — Current rover position',
    detail: 'MMGIS current waypoint, site 125',
    sol: '5070',
    lon: 137.38915,
    lat: -4.82568,
    badge: 'observed',
  },
]

export const habitatNote =
  'Habitat: a Scenario (fictional) point placed on flat ground downslope of S1 at the pilot gate — no coordinates exist yet.'
