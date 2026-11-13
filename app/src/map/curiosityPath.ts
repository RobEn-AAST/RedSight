import type { Feature, FeatureCollection } from 'geojson'

/**
 * Curiosity's Observed rover traverse inside the D11 ops box, parsed from
 * app/public/data/curiosity_path.geojson (NASA MMGIS waypoints).
 *
 * Pure module with no React or bundler-alias imports so it runs under both
 * Vite and `node --test`.
 */

const MARS_RADIUS_M = 3_396_190

export interface CuriosityWaypoint {
  lon: number
  lat: number
  sol: number
  rmc: string
  elevM: number | null
  distKm: number | null
}

export interface CuriositySegment {
  segment: number
  coords: [number, number][]
  solStart: number
  solEnd: number
  rmcStart: string
  rmcEnd: string
  distKmStart: number | null
  distKmEnd: number | null
  waypoints: CuriosityWaypoint[]
}

export interface CuriosityPathData {
  segments: CuriositySegment[]
  waypoints: CuriosityWaypoint[]
  solStart: number
  solEnd: number
  waypointCount: number
  /** Mars surface chord length across the ops-box traverse segments (km). */
  inBoxLengthKm: number
  /** Rover odometry difference inside the ops box when dist_km is present (km). */
  inBoxOdomKm: number | null
  /** Latest reported total mission odometry (km). */
  totalOdomKm: number | null
  badge: 'Observed'
  source: string
  sourceUrl: string
}

export interface CuriosityComparison {
  nearestToTarget: {
    waypoint: CuriosityWaypoint
    distanceM: number
  }
  closestApproach: {
    waypoint: CuriosityWaypoint
    distanceM: number
  } | null
}

type Json = Record<string, unknown>
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Mars spherical distance (m) using the IAU 2015 mean radius from meta.json. */
export function marsDistanceM(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLon = toRad(b[0] - a[0])
  const lat1 = toRad(a[1])
  const lat2 = toRad(b[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * MARS_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

function parseCoords(raw: unknown): [number, number][] | null {
  if (!Array.isArray(raw) || raw.length < 2) return null
  const coords: [number, number][] = []
  for (const pt of raw) {
    if (!Array.isArray(pt) || pt.length < 2 || !isNumber(pt[0]) || !isNumber(pt[1])) return null
    coords.push([pt[0], pt[1]])
  }
  return coords
}

export function parseCuriosityPath(raw: unknown): CuriosityPathData | null {
  if (!isObject(raw) || raw.type !== 'FeatureCollection' || !Array.isArray(raw.features)) return null

  const segments: CuriositySegment[] = []
  let source = 'NASA/JPL MSL MMGIS Waypoints'
  let sourceUrl = 'https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json'

  for (const feat of raw.features) {
    if (!isObject(feat) || !isObject(feat.geometry) || !isObject(feat.properties)) continue
    if (feat.geometry.type !== 'LineString') continue
    const coords = parseCoords(feat.geometry.coordinates)
    if (!coords) continue

    const p = feat.properties
    const solsRaw = Array.isArray(p.sols) && p.sols.length === coords.length ? p.sols : null
    const rmcsRaw = Array.isArray(p.rmcs) && p.rmcs.length === coords.length ? p.rmcs : null
    const elevsRaw = Array.isArray(p.elev_m) && p.elev_m.length === coords.length ? p.elev_m : null
    const distsRaw = Array.isArray(p.dist_km) && p.dist_km.length === coords.length ? p.dist_km : null

    const solStart = isNumber(p.sol_start) ? p.sol_start : solsRaw && isNumber(solsRaw[0]) ? solsRaw[0] : 0
    const solEnd = isNumber(p.sol_end)
      ? p.sol_end
      : solsRaw && isNumber(solsRaw[solsRaw.length - 1])
        ? solsRaw[solsRaw.length - 1]
        : solStart

    const waypoints: CuriosityWaypoint[] = coords.map(([lon, lat], i) => ({
      lon,
      lat,
      sol: solsRaw && isNumber(solsRaw[i]) ? solsRaw[i] : solStart,
      rmc: rmcsRaw && typeof rmcsRaw[i] === 'string' ? rmcsRaw[i] : `${solStart}`,
      elevM: elevsRaw && isNumber(elevsRaw[i]) ? elevsRaw[i] : null,
      distKm: distsRaw && isNumber(distsRaw[i]) ? distsRaw[i] : null,
    }))

    if (typeof p.source === 'string' && p.source) source = p.source
    if (typeof p.source_url === 'string' && p.source_url) sourceUrl = p.source_url

    segments.push({
      segment: isNumber(p.segment) ? p.segment : segments.length + 1,
      coords,
      solStart,
      solEnd,
      rmcStart: typeof p.rmc_start === 'string' ? p.rmc_start : waypoints[0].rmc,
      rmcEnd: typeof p.rmc_end === 'string' ? p.rmc_end : waypoints[waypoints.length - 1].rmc,
      distKmStart: isNumber(p.dist_km_start) ? p.dist_km_start : waypoints[0].distKm,
      distKmEnd: isNumber(p.dist_km_end) ? p.dist_km_end : waypoints[waypoints.length - 1].distKm,
      waypoints,
    })
  }

  if (segments.length === 0) return null

  segments.sort((a, b) => a.solStart - b.solStart || a.segment - b.segment)
  const waypoints = segments.flatMap((s) => s.waypoints)
  let inBoxLengthM = 0
  for (const seg of segments) {
    for (let i = 1; i < seg.coords.length; i++) {
      inBoxLengthM += marsDistanceM(seg.coords[i - 1], seg.coords[i])
    }
  }

  const firstDistKm = segments[0].distKmStart
  const lastDistKm = segments[segments.length - 1].distKmEnd

  return {
    segments,
    waypoints,
    solStart: Math.min(...segments.map((s) => s.solStart)),
    solEnd: Math.max(...segments.map((s) => s.solEnd)),
    waypointCount: waypoints.length,
    inBoxLengthKm: inBoxLengthM / 1000,
    inBoxOdomKm: firstDistKm != null && lastDistKm != null ? Math.max(0, lastDistKm - firstDistKm) : null,
    totalOdomKm: lastDistKm,
    badge: 'Observed',
    source,
    sourceUrl,
  }
}

export function curiosityLineCollection(path: CuriosityPathData): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: path.segments.map(
      (s): Feature => ({
        type: 'Feature',
        properties: {
          segment: s.segment,
          sol_start: s.solStart,
          sol_end: s.solEnd,
          badge: path.badge,
        },
        geometry: {
          type: 'LineString',
          coordinates: s.coords,
        },
      }),
    ),
  }
}

export function curiosityWaypointCollection(path: CuriosityPathData): FeatureCollection {
  const lastIdx = path.waypoints.length - 1
  return {
    type: 'FeatureCollection',
    features: path.waypoints.map(
      (w, idx): Feature => ({
        type: 'Feature',
        properties: {
          sol: w.sol,
          rmc: w.rmc,
          elev_m: w.elevM,
          dist_km: w.distKm,
          is_latest: idx === lastIdx,
          badge: path.badge,
        },
        geometry: {
          type: 'Point',
          coordinates: [w.lon, w.lat],
        },
      }),
    ),
  }
}

/**
 * Finds the nearest Observed Curiosity MMGIS waypoint to `targetPoint`, plus
 * the closest geometric approach between `routeCoords` and Curiosity's waypoints.
 */
export function compareRouteWithCuriosity(
  path: CuriosityPathData,
  targetPoint: [number, number],
  routeCoords?: [number, number][],
): CuriosityComparison | null {
  if (path.waypoints.length === 0) return null

  let nearestTargetWp = path.waypoints[0]
  let minTargetDist = marsDistanceM([nearestTargetWp.lon, nearestTargetWp.lat], targetPoint)
  for (let i = 1; i < path.waypoints.length; i++) {
    const wp = path.waypoints[i]
    const d = marsDistanceM([wp.lon, wp.lat], targetPoint)
    if (d < minTargetDist) {
      minTargetDist = d
      nearestTargetWp = wp
    }
  }

  let closestApproach: CuriosityComparison['closestApproach'] = null
  if (routeCoords && routeCoords.length > 0) {
    let bestWp = path.waypoints[0]
    let bestDist = Infinity
    for (const pt of routeCoords) {
      for (const wp of path.waypoints) {
        const d = marsDistanceM([wp.lon, wp.lat], pt)
        if (d < bestDist) {
          bestDist = d
          bestWp = wp
        }
      }
    }
    if (Number.isFinite(bestDist)) {
      closestApproach = { waypoint: bestWp, distanceM: bestDist }
    }
  }

  return {
    nearestToTarget: { waypoint: nearestTargetWp, distanceM: minTargetDist },
    closestApproach,
  }
}
