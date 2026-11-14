/**
 * Elevation profile & "why this route" breakdown (Tier 1, B6c — Derived).
 *
 * Pure functions, no React or bundler-alias imports, so this module runs under
 * `node --test` and in the browser alike. Every number comes from the engine's
 * route contract (`seg[].slope_deg`, `seg[].cost_terms`, optional `elev_m` or
 * 3D `coords`). The UI never invents model numbers or claims.
 */

export type RouteModeKind = 'fastest' | 'safest' | 'balanced'

export interface ProfileSegment {
  t_s: number
  o2_l: number
  slope_deg: number
  distance_m?: number
  cost_terms?: Record<string, number>
}

export interface ProfileRouteInput {
  coords: number[][]
  seg: ProfileSegment[]
  elev_m?: number[]
}

export interface ElevationPoint {
  index: number
  distanceM: number
  elevM: number
  /** Grade of the segment leading into this point (deg; 0 at origin). */
  slopeDeg: number
}

export interface ElevationProfile {
  elevSource: 'route-elev' | 'slope-integrated'
  /** true when seg[].slope_deg includes negative (downhill) grades. */
  signedSlopes: boolean
  totalDistanceM: number
  gainM: number
  lossM: number
  netM: number
  minElevM: number
  maxElevM: number
  maxAbsSlopeDeg: number
  points: ElevationPoint[]
  /** Downsampled points for crisp SVG rendering (always includes start/end). */
  sampled: ElevationPoint[]
}

export interface CostTermStats {
  mean: number
  min: number
  max: number
  sum: number
}

export interface CostSummary {
  segmentCount: number
  distanceM: number
  totalTimeS: number
  totalO2L: number
  maxAbsSlopeDeg: number
  meanAbsSlopeDeg: number
  /** Distance (m) spent on segments with |slope_deg| >= 10 deg. */
  steepDistM: number
  /** true when segments carry cost_terms beyond distance_m alone. */
  hasCostTerms: boolean
  terms: Record<string, CostTermStats>
}

export interface WhyRouteReason {
  label: string
  detail: string
}

export interface WhyRouteBreakdown {
  headline: string
  reasons: WhyRouteReason[]
}

function segDistanceM(seg: ProfileSegment): number {
  const d = seg.cost_terms?.distance_m ?? seg.distance_m
  return typeof d === 'number' && Number.isFinite(d) && d > 0 ? d : 0
}

function formatDist(metres: number): string {
  const abs = Math.abs(metres)
  if (abs >= 1000) return `${(metres / 1000).toFixed(2)} km`
  return `${Math.round(metres)} m`
}

function formatDur(seconds: number): string {
  const abs = Math.abs(seconds)
  if (abs < 90) return `${Math.round(abs)} s`
  const totalMin = Math.round(abs / 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`
}

/** Downsample while keeping start, end, and per-bucket min/max elevation extrema. */
function downsampleProfile(points: ElevationPoint[], maxSamples: number): ElevationPoint[] {
  if (points.length <= maxSamples || maxSamples < 4) return points
  const buckets = Math.max(2, Math.floor((maxSamples - 2) / 2))
  const step = (points.length - 2) / buckets
  const out: ElevationPoint[] = [points[0]]
  for (let b = 0; b < buckets; b++) {
    const start = 1 + Math.floor(b * step)
    const end = Math.min(points.length - 1, 1 + Math.floor((b + 1) * step))
    if (start >= end) continue
    let minP = points[start]
    let maxP = points[start]
    for (let i = start + 1; i < end; i++) {
      if (points[i].elevM < minP.elevM) minP = points[i]
      if (points[i].elevM > maxP.elevM) maxP = points[i]
    }
    if (minP.index === maxP.index) {
      out.push(minP)
    } else if (minP.index < maxP.index) {
      out.push(minP, maxP)
    } else {
      out.push(maxP, minP)
    }
  }
  out.push(points[points.length - 1])
  return out
}

/**
 * Builds an elevation profile along the route.
 * Uses explicit per-vertex `elev_m` or 3D `coords[i][2]` when present;
 * otherwise integrates `seg[].slope_deg` over segment `distance_m`.
 */
export function buildElevationProfile(route: ProfileRouteInput, maxSamples = 180): ElevationProfile | null {
  const n = route.coords?.length ?? 0
  if (n < 2 || !Array.isArray(route.seg) || route.seg.length !== n - 1) return null

  const hasExplicitElev = Array.isArray(route.elev_m) && route.elev_m.length === n && route.elev_m.every(Number.isFinite)
  const has3dCoords = !hasExplicitElev && route.coords.every((c) => Array.isArray(c) && c.length >= 3 && Number.isFinite(c[2]))
  const elevSource: ElevationProfile['elevSource'] = hasExplicitElev || has3dCoords ? 'route-elev' : 'slope-integrated'

  const points: ElevationPoint[] = []
  let dist = 0
  let relElev = 0
  let gainM = 0
  let lossM = 0
  let maxAbsSlopeDeg = 0
  let signedSlopes = false

  const elevAt = (i: number): number => {
    if (hasExplicitElev) return route.elev_m![i]
    if (has3dCoords) return route.coords[i][2]
    return relElev
  }

  const startElev = elevAt(0)
  let minElevM = startElev
  let maxElevM = startElev
  points.push({ index: 0, distanceM: 0, elevM: startElev, slopeDeg: 0 })

  for (let i = 0; i < route.seg.length; i++) {
    const s = route.seg[i]
    const d = segDistanceM(s)
    const slope = Number.isFinite(s.slope_deg) ? s.slope_deg : 0
    if (slope < -1e-6) signedSlopes = true
    maxAbsSlopeDeg = Math.max(maxAbsSlopeDeg, Math.abs(slope))
    dist += d

    if (elevSource === 'slope-integrated') {
      const clampedSlope = Math.max(-85, Math.min(85, slope))
      relElev += d * Math.tan((clampedSlope * Math.PI) / 180)
    }

    const nextElev = elevAt(i + 1)
    const prevElev = points[points.length - 1].elevM
    const dh = nextElev - prevElev
    if (dh > 0) gainM += dh
    else if (dh < 0) lossM += -dh

    minElevM = Math.min(minElevM, nextElev)
    maxElevM = Math.max(maxElevM, nextElev)
    points.push({ index: i + 1, distanceM: dist, elevM: nextElev, slopeDeg: slope })
  }

  return {
    elevSource,
    signedSlopes,
    totalDistanceM: dist,
    gainM,
    lossM,
    netM: points[points.length - 1].elevM - points[0].elevM,
    minElevM,
    maxElevM,
    maxAbsSlopeDeg,
    points,
    sampled: downsampleProfile(points, maxSamples),
  }
}

/** Linearly interpolates elevation and picks nearest segment slope at `distanceM`. */
export function sampleAtDistance(profile: ElevationProfile, distanceM: number): { distanceM: number; elevM: number; slopeDeg: number } {
  const pts = profile.points
  if (pts.length === 0) return { distanceM: 0, elevM: 0, slopeDeg: 0 }
  if (distanceM <= 0) return { distanceM: 0, elevM: pts[0].elevM, slopeDeg: pts[1]?.slopeDeg ?? 0 }
  const total = profile.totalDistanceM
  if (distanceM >= total) {
    const last = pts[pts.length - 1]
    return { distanceM: total, elevM: last.elevM, slopeDeg: last.slopeDeg }
  }
  let lo = 0
  let hi = pts.length - 1
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1
    if (pts[mid].distanceM <= distanceM) lo = mid
    else hi = mid
  }
  const a = pts[lo]
  const b = pts[hi]
  const span = b.distanceM - a.distanceM
  const f = span > 0 ? (distanceM - a.distanceM) / span : 0
  return {
    distanceM,
    elevM: a.elevM + (b.elevM - a.elevM) * f,
    slopeDeg: b.slopeDeg,
  }
}

/** Aggregates per-segment `cost_terms` and slope/time/O2 metrics across a route. */
export function summarizeCostTerms(seg: ProfileSegment[]): CostSummary | null {
  if (!Array.isArray(seg) || seg.length === 0) return null

  let distanceM = 0
  let totalTimeS = 0
  let totalO2L = 0
  let maxAbsSlopeDeg = 0
  let weightedSlopeSum = 0
  let steepDistM = 0

  const acc: Record<string, { wSum: number; wWeight: number; min: number; max: number; sum: number }> = {}
  let hasExtraTerms = false

  for (const s of seg) {
    const d = segDistanceM(s)
    const absSlope = Number.isFinite(s.slope_deg) ? Math.abs(s.slope_deg) : 0
    distanceM += d
    totalTimeS += Number.isFinite(s.t_s) ? s.t_s : 0
    totalO2L += Number.isFinite(s.o2_l) ? s.o2_l : 0
    maxAbsSlopeDeg = Math.max(maxAbsSlopeDeg, absSlope)
    weightedSlopeSum += absSlope * (d > 0 ? d : 1)
    if (absSlope >= 10) steepDistM += d

    if (s.cost_terms) {
      for (const [k, raw] of Object.entries(s.cost_terms)) {
        if (typeof raw !== 'number' || !Number.isFinite(raw)) continue
        if (k !== 'distance_m') hasExtraTerms = true
        const w = d > 0 ? d : 1
        const entry = acc[k]
        if (!entry) {
          acc[k] = { wSum: raw * w, wWeight: w, min: raw, max: raw, sum: raw }
        } else {
          entry.wSum += raw * w
          entry.wWeight += w
          entry.min = Math.min(entry.min, raw)
          entry.max = Math.max(entry.max, raw)
          entry.sum += raw
        }
      }
    }
  }

  const totalWeight = distanceM > 0 ? distanceM : seg.length
  const terms: Record<string, CostTermStats> = {}
  for (const [k, a] of Object.entries(acc)) {
    terms[k] = {
      mean: a.wSum / a.wWeight,
      min: a.min,
      max: a.max,
      sum: a.sum,
    }
  }

  return {
    segmentCount: seg.length,
    distanceM,
    totalTimeS,
    totalO2L,
    maxAbsSlopeDeg,
    meanAbsSlopeDeg: weightedSlopeSum / totalWeight,
    steepDistM,
    hasCostTerms: hasExtraTerms,
    terms,
  }
}

/**
 * Produces concise, data-grounded "why this route" bullets from the segment
 * `cost_terms` of the active route vs the alternative route (if present).
 */
export function buildWhyRoute(
  activeMode: RouteModeKind,
  active: CostSummary,
  other: CostSummary | null,
): WhyRouteBreakdown {
  const otherLabel = activeMode === 'safest' ? 'fastest' : 'lowest-hazard'
  const terrainTerm = active.terms.terrain_factor ?? active.terms.terrain
  const otherTerrain = other ? (other.terms.terrain_factor ?? other.terms.terrain) : undefined
  const reasons: WhyRouteReason[] = []

  if (!other) {
    const headline =
      activeMode === 'safest'
        ? `Lowest-hazard path across ${active.segmentCount} segments (${formatDist(active.distanceM)}).`
        : `Fastest path across ${active.segmentCount} segments (${formatDist(active.distanceM)}).`
    reasons.push({
      label: 'Slope profile',
      detail: `Mean grade ${active.meanAbsSlopeDeg.toFixed(1)}°, steepest step ${active.maxAbsSlopeDeg.toFixed(1)}°.`,
    })
    if (active.terms.hazard_score) {
      reasons.push({
        label: 'Hazard score',
        detail: `Mean ${active.terms.hazard_score.mean.toFixed(2)} (peak ${active.terms.hazard_score.max.toFixed(2)}) from terrain cost terms.`,
      })
    } else if (active.terms.slope) {
      reasons.push({
        label: 'Slope cost term',
        detail: `Mean ${active.terms.slope.mean.toFixed(2)} (peak ${active.terms.slope.max.toFixed(2)}) across route segments.`,
      })
    }
    if (active.terms.power_w) {
      reasons.push({
        label: 'Metabolic power',
        detail: `Mean ${active.terms.power_w.mean.toFixed(0)} W (peak ${active.terms.power_w.max.toFixed(0)} W), ${active.totalO2L.toFixed(1)} L O₂ outbound.`,
      })
    }
    if (terrainTerm) {
      reasons.push({
        label: 'Terrain factor',
        detail:
          terrainTerm.max > 1.01
            ? `Up to ${terrainTerm.max.toFixed(2)}× terrain penalty (mean ${terrainTerm.mean.toFixed(2)}×).`
            : `Uniform ${terrainTerm.mean.toFixed(2)}× across all ${active.segmentCount} segments.`,
      })
    }
    return { headline, reasons }
  }

  const deltaDistM = active.distanceM - other.distanceM
  const deltaTimeS = active.totalTimeS - other.totalTimeS
  const deltaO2L = active.totalO2L - other.totalO2L
  const haz = active.terms.hazard_score
  const otherHaz = other.terms.hazard_score
  const slopeTerm = active.terms.slope
  const otherSlopeTerm = other.terms.slope
  const pow = active.terms.power_w
  const otherPow = other.terms.power_w

  // Headline: lead with the concrete trade-off from the route's actual numbers.
  let headline: string
  if (activeMode === 'safest') {
    const distPhrase =
      deltaDistM > 15
        ? `+${formatDist(deltaDistM)} longer`
        : deltaDistM < -15
          ? `${formatDist(-deltaDistM)} shorter`
          : `${formatDur(Math.abs(deltaTimeS))} ${deltaTimeS >= 0 ? 'longer' : 'shorter'}`
    if (other.maxAbsSlopeDeg - active.maxAbsSlopeDeg >= 0.4) {
      headline = `${distPhrase} than ${otherLabel} to keep steepest grade at ${active.maxAbsSlopeDeg.toFixed(1)}° (vs ${other.maxAbsSlopeDeg.toFixed(1)}°).`
    } else if (haz && otherHaz && haz.mean < otherHaz.mean - 0.005) {
      headline = `${distPhrase} than ${otherLabel} for a lower mean hazard score (${haz.mean.toFixed(2)} vs ${otherHaz.mean.toFixed(2)}).`
    } else {
      headline = `Lowest-hazard path: ${distPhrase} than ${otherLabel} across ${active.segmentCount} segments.`
    }
  } else if (activeMode === 'balanced') {
    headline = `Balanced candidate selected by equal-weight normalized time and mapped hazard cost; ${formatDur(Math.abs(deltaTimeS))} ${deltaTimeS >= 0 ? 'slower' : 'faster'} outbound than ${otherLabel}.`
  } else {
    const timePhrase =
      deltaTimeS < -1
        ? `${formatDur(-deltaTimeS)} faster outbound than ${otherLabel}`
        : deltaTimeS > 1
          ? `${formatDur(deltaTimeS)} slower outbound than ${otherLabel}`
          : `About the same outbound time as ${otherLabel}`
    if (deltaDistM < -15) {
      headline = `${timePhrase}, ${formatDist(-deltaDistM)} shorter.`
    } else {
      headline = `${timePhrase} (minimizes travel time under the slope limit).`
    }
  }

  // 1. Distance & time comparison
  const distCmp =
    Math.abs(deltaDistM) >= 5
      ? `${deltaDistM > 0 ? '+' : '−'}${formatDist(Math.abs(deltaDistM))} (${formatDist(active.distanceM)} vs ${formatDist(other.distanceM)})`
      : `Nearly identical distance (${formatDist(active.distanceM)} vs ${formatDist(other.distanceM)})`
  const timeCmp =
    Math.abs(deltaTimeS) >= 1
      ? `${deltaTimeS > 0 ? '+' : '−'}${formatDur(Math.abs(deltaTimeS))} outbound`
      : 'same outbound time'
  reasons.push({
    label: 'Distance & time',
    detail: `${distCmp} · ${timeCmp}.`,
  })

  // 2. Slope & hazard cost terms
  if (haz && otherHaz) {
    const hazDiff = haz.mean - otherHaz.mean
    const pct = otherHaz.mean > 0 ? Math.abs((hazDiff / otherHaz.mean) * 100) : 0
    const hazCompare =
      Math.abs(hazDiff) < 0.002
        ? `Matches ${otherLabel} mean hazard (${haz.mean.toFixed(2)})`
        : `${hazDiff < 0 ? '−' : '+'}${pct.toFixed(1)}% mean hazard (${haz.mean.toFixed(2)} vs ${otherHaz.mean.toFixed(2)})`
    reasons.push({
      label: 'Hazard & slope',
      detail: `${hazCompare} · steepest ${active.maxAbsSlopeDeg.toFixed(1)}° (mean ${active.meanAbsSlopeDeg.toFixed(1)}°) vs ${other.maxAbsSlopeDeg.toFixed(1)}°.`,
    })
  } else if (slopeTerm && otherSlopeTerm) {
    reasons.push({
      label: 'Slope cost term',
      detail: `Mean ${slopeTerm.mean.toFixed(2)} vs ${otherSlopeTerm.mean.toFixed(2)} on ${otherLabel} · steepest ${active.maxAbsSlopeDeg.toFixed(1)}° vs ${other.maxAbsSlopeDeg.toFixed(1)}°.`,
    })
  } else {
    reasons.push({
      label: 'Slope profile',
      detail: `Steepest ${active.maxAbsSlopeDeg.toFixed(1)}° (mean ${active.meanAbsSlopeDeg.toFixed(1)}°) vs ${other.maxAbsSlopeDeg.toFixed(1)}° on ${otherLabel}.`,
    })
  }

  // 3. Metabolic power / O2 cost
  if (pow && otherPow) {
    const o2Sign = deltaO2L < -0.05 ? `saves ${Math.abs(deltaO2L).toFixed(1)} L O₂ outbound` : deltaO2L > 0.05 ? `+${deltaO2L.toFixed(1)} L O₂ outbound` : 'same outbound O₂'
    reasons.push({
      label: 'Power & O₂',
      detail: `Mean ${pow.mean.toFixed(0)} W vs ${otherPow.mean.toFixed(0)} W on ${otherLabel} (${o2Sign}).`,
    })
  } else if (Math.abs(deltaO2L) >= 0.1) {
    reasons.push({
      label: 'Outbound O₂',
      detail: `${active.totalO2L.toFixed(1)} L vs ${other.totalO2L.toFixed(1)} L on ${otherLabel}.`,
    })
  }

  // 4. Terrain factor (THEMIS sand proxy / surface cost)
  if (terrainTerm) {
    const otherMax = otherTerrain?.max ?? terrainTerm.max
    reasons.push({
      label: 'Terrain factor',
      detail:
        terrainTerm.max > 1.01 || otherMax > 1.01
          ? `Mean ${terrainTerm.mean.toFixed(2)}× (peak ${terrainTerm.max.toFixed(2)}×) vs peak ${otherMax.toFixed(2)}× on ${otherLabel}.`
          : `Uniform ${terrainTerm.mean.toFixed(2)}× across all ${active.segmentCount} segments (no elevated terrain penalty).`,
    })
  }

  return { headline, reasons }
}
