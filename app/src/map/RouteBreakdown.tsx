import { useId, useMemo, useState } from 'react'
import { ChevronDown, Compass, Mountain, Route } from 'lucide-react'

import { cn } from '@/lib/cn'
import type { EngineRoute, EngineRouteMode, PlanMember } from '@/lib/engineDataContext'
import { useEngineData } from '@/lib/useEngineData'
import { compareRouteWithCuriosity } from '@/map/curiosityPath'
import { MODE_COLOR, MODE_LABEL, NO_RETURN_COLOR, formatDistance } from '@/map/format'
import {
  buildElevationProfile,
  buildWhyRoute,
  sampleAtDistance,
  summarizeCostTerms,
  type ElevationProfile,
  type ProfileRouteInput,
} from '@/map/routeProfile'
import { usePlan } from '@/map/usePlan'
import { SourceCard } from '@/provenance/SourceCard'
import { o2PlanFromConstants, turnBackPoint } from '@/turnback/turnback'
import { EvidenceBadge } from '@/ui/Badge'

/**
 * Elevation profile + "why this route" breakdown (Tier 1, B6c — Derived).
 *
 * Reads seg[].cost_terms and seg[].slope_deg from the engine's route contract
 * (or PlanMember when cost_terms are carried there) and renders an honest
 * Derived breakdown + interactive terrain profile synced with the turn-back slider.
 */

const SVG_W = 340
const SVG_H = 114
const PAD_L = 42
const PAD_R = 10
const PAD_T = 12
const PAD_B = 20

function hasExtraCostTerms(seg: { cost_terms?: Record<string, number> }[] | undefined): boolean {
  if (!seg || seg.length === 0) return false
  return seg.some((s) => s.cost_terms && Object.keys(s.cost_terms).some((k) => k !== 'distance_m'))
}

function memberToProfileInput(m: PlanMember): ProfileRouteInput {
  return { coords: m.coords, seg: m.seg, elev_m: m.elev_m }
}

function routeToProfileInput(r: EngineRoute): ProfileRouteInput {
  return { coords: r.coords, seg: r.seg, elev_m: r.elev_m }
}

function formatElev(m: number, signed: boolean): string {
  const rounded = Math.abs(m) >= 100 ? Math.round(m) : Number(m.toFixed(1))
  if (!signed) return `${rounded} m`
  const prefix = rounded > 0 ? '+' : rounded < 0 ? '−' : ''
  return `${prefix}${Math.abs(rounded)} m`
}

function buildSvgPath(
  profile: ElevationProfile,
  maxDist: number,
  minY: number,
  maxY: number,
): { line: string; area: string } {
  const plotW = SVG_W - PAD_L - PAD_R
  const plotH = SVG_H - PAD_T - PAD_B
  const xOf = (d: number) => PAD_L + (maxDist > 0 ? (d / maxDist) * plotW : 0)
  const ySpan = maxY - minY || 1
  const yOf = (e: number) => PAD_T + plotH - ((e - minY) / ySpan) * plotH

  const pts = profile.sampled
  if (pts.length === 0) return { line: '', area: '' }
  const cmds = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.distanceM).toFixed(1)},${yOf(p.elevM).toFixed(1)}`)
  const firstX = xOf(pts[0].distanceM).toFixed(1)
  const lastX = xOf(pts[pts.length - 1].distanceM).toFixed(1)
  const baseY = (PAD_T + plotH).toFixed(1)
  return {
    line: cmds.join(' '),
    area: `${cmds.join(' ')} L${lastX},${baseY} L${firstX},${baseY} Z`,
  }
}

export function RouteBreakdown() {
  const engine = useEngineData()
  const {
    selectedTargetId,
    mode,
    plans,
    contractRoutes,
    activePlan,
    activeMembers,
    activeRoute,
    crewMode,
    o2BudgetL,
    status,
    goalTargets,
    showCuriosityPath,
    setShowCuriosityPath,
    map,
  } = usePlan()
  const [memberIdx, setMemberIdx] = useState(0)
  const [hoverDistM, setHoverDistM] = useState<number | null>(null)
  const [sourceOpen, setSourceOpen] = useState(false)
  const sourceId = useId()
  const gradId = useId()

  const otherMode: EngineRouteMode = mode === 'safest' ? 'fastest' : 'safest'
  const safeMemberIdx = memberIdx < activeMembers.length ? memberIdx : 0
  const activeMember = activeMembers[safeMemberIdx] ?? null

  // Cost summary: prefer activeMember if it carries cost_terms, otherwise §15 contractRoutes.
  const activeContract = contractRoutes[mode] ?? null
  const otherContract = contractRoutes[otherMode] ?? null

  const activeSegSource = useMemo(() => {
    if (activeMember && hasExtraCostTerms(activeMember.seg)) {
      return { seg: activeMember.seg, fromContract: false }
    }
    if (activeContract) {
      return { seg: activeContract.seg, fromContract: true }
    }
    if (activeMember) {
      return { seg: activeMember.seg, fromContract: false }
    }
    return null
  }, [activeMember, activeContract])

  const otherSegSource = useMemo(() => {
    const otherMember = plans[otherMode]?.together?.[0]
    if (otherMember && hasExtraCostTerms(otherMember.seg)) return otherMember.seg
    if (otherContract) return otherContract.seg
    return otherMember?.seg ?? null
  }, [plans, otherMode, otherContract])

  const why = useMemo(() => {
    if (!activeSegSource) return null
    const activeSum = summarizeCostTerms(activeSegSource.seg)
    if (!activeSum) return null
    const otherSum = otherSegSource ? summarizeCostTerms(otherSegSource) : null
    return {
      activeSum,
      otherSum,
      fromContract: activeSegSource.fromContract,
      ...buildWhyRoute(mode, activeSum, otherSum),
    }
  }, [activeSegSource, otherSegSource, mode])

  // Elevation profile: use the active member's own geometry so distance & markers align.
  const profile = useMemo(() => {
    if (activeMember) return buildElevationProfile(memberToProfileInput(activeMember))
    if (activeContract) return buildElevationProfile(routeToProfileInput(activeContract))
    return null
  }, [activeMember, activeContract])

  // Ghost comparison profile when walking together on foot so the two curves match the same target.
  const otherProfile = useMemo(() => {
    if (crewMode === 'split' || activePlan?.rover) return null
    const otherMember = plans[otherMode]?.together?.[0]
    if (otherMember) return buildElevationProfile(memberToProfileInput(otherMember))
    if (otherContract) return buildElevationProfile(routeToProfileInput(otherContract))
    return null
  }, [crewMode, activePlan?.rover, plans, otherMode, otherContract])

  // Sync live turn-back distance with Jana's turn-back slider.
  const { plan: o2Plan } = useMemo(() => o2PlanFromConstants(engine.constants), [engine.constants])
  const turnBackDistM = useMemo(() => {
    if (!activeRoute || !o2Plan) return null
    const effBudget = o2BudgetL == null ? o2Plan.maxBudgetL : Math.min(Math.max(o2BudgetL, 0), o2Plan.maxBudgetL)
    const res = turnBackPoint(activeRoute, effBudget, o2Plan.returnMargin)
    return res && res.status === 'turns-back' ? res.distanceM : null
  }, [activeRoute, o2Plan, o2BudgetL])

  const parkDistM =
    profile && activeMember?.park_index != null
      ? (profile.points[activeMember.park_index]?.distanceM ?? null)
      : null

  const stopTargetId = activeMember?.targets[0] ?? selectedTargetId
  const stopObserved = engine.stops?.find((s) => s.id === stopTargetId) ?? null
  const goalTarget = goalTargets.find((t) => t.id === stopTargetId) ?? null

  const curiosityComparison = useMemo(() => {
    const cPath = engine.curiosityPath
    if (!cPath) return null
    const refPoint: [number, number] | undefined = stopObserved
      ? [stopObserved.lon, stopObserved.lat]
      : goalTarget?.site ?? activeMember?.coords[activeMember.coords.length - 1]
    if (!refPoint) return null
    return compareRouteWithCuriosity(cPath, refPoint, activeMember?.coords)
  }, [engine.curiosityPath, stopObserved, goalTarget, activeMember])

  const fitCuriosityTraverse = () => {
    const cPath = engine.curiosityPath
    if (!cPath) return
    setShowCuriosityPath(true)
    if (!map || cPath.waypoints.length === 0) return
    let w = Infinity
    let s = Infinity
    let e = -Infinity
    let n = -Infinity
    for (const wp of cPath.waypoints) {
      w = Math.min(w, wp.lon)
      e = Math.max(e, wp.lon)
      s = Math.min(s, wp.lat)
      n = Math.max(n, wp.lat)
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    map.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      { padding: 48, duration: reduced ? 0 : 600 },
    )
  }

  if (status !== 'ready' || (!why && !profile)) return null

  // Shared chart bounds across active + comparison profile.
  const maxDist = Math.max(profile?.totalDistanceM ?? 0, otherProfile?.totalDistanceM ?? 0, 1)
  const rawMinY = Math.min(profile?.minElevM ?? 0, otherProfile?.minElevM ?? 0)
  const rawMaxY = Math.max(profile?.maxElevM ?? 0, otherProfile?.maxElevM ?? 0)
  const spanY = Math.max(rawMaxY - rawMinY, 4)
  const padY = spanY * 0.12
  const minY = rawMinY - padY
  const maxY = rawMaxY + padY
  const plotW = SVG_W - PAD_L - PAD_R
  const plotH = SVG_H - PAD_T - PAD_B
  const xOf = (d: number) => PAD_L + (d / maxDist) * plotW
  const yOf = (e: number) => PAD_T + plotH - ((e - minY) / (maxY - minY || 1)) * plotH

  const activePaths = profile ? buildSvgPath(profile, maxDist, minY, maxY) : null
  const otherPaths = otherProfile ? buildSvgPath(otherProfile, maxDist, minY, maxY) : null
  const hoverSample =
    profile && hoverDistM != null
      ? sampleAtDistance(profile, Math.min(Math.max(hoverDistM, 0), profile.totalDistanceM))
      : null

  const color = MODE_COLOR[mode]
  const isSignedElev = profile?.elevSource === 'route-elev'
  const terrainTerm = why?.activeSum.terms.terrain_factor ?? why?.activeSum.terms.terrain
  const hazTerm = why?.activeSum.terms.hazard_score
  const slopeTerm = why?.activeSum.terms.slope
  const powTerm = why?.activeSum.terms.power_w

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!profile) return
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width <= 0) return
    const svgX = ((e.clientX - rect.left) / rect.width) * SVG_W
    const frac = Math.min(1, Math.max(0, (svgX - PAD_L) / plotW))
    setHoverDistM(Math.min(frac * maxDist, profile.totalDistanceM))
  }

  return (
    <div className="flex flex-col gap-3 border border-seam bg-inset/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="label-console flex items-center gap-1.5 text-ink">
          <Route size={12} aria-hidden className="text-derived" />
          Why this route &amp; elevation
        </span>
        <div className="flex items-center gap-2">
          <EvidenceBadge evidence="derived" />
          <button
            type="button"
            aria-expanded={sourceOpen}
            aria-controls={sourceId}
            onClick={() => setSourceOpen((o) => !o)}
            className="label-console flex items-center gap-1 text-[10px] text-ink-dim hover:text-ink"
          >
            Source
            <ChevronDown size={11} aria-hidden className={cn('transition-transform', sourceOpen && 'rotate-180')} />
          </button>
        </div>
      </div>

      {/* Why this route (from seg[].cost_terms) */}
      {why && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium leading-relaxed text-ink">{why.headline}</p>
          <ul className="flex flex-col gap-1 text-[11px] leading-relaxed text-ink-dim">
            {why.reasons.map((r) => (
              <li key={r.label} className="flex gap-1.5">
                <span aria-hidden className="mt-1.5 size-1 flex-none bg-derived" />
                <span>
                  <span className="text-ink">{r.label}:</span> {r.detail}
                </span>
              </li>
            ))}
          </ul>

          {/* Aggregated cost_terms readout */}
          <dl className="grid grid-cols-2 gap-1.5 pt-0.5">
            <div className="border border-seam bg-panel/70 px-2 py-1.5">
              <dt className="label-console text-[9px] text-ink-faint">Path length</dt>
              <dd className="data-readout text-xs text-ink">{formatDistance(why.activeSum.distanceM)}</dd>
            </div>
            {hazTerm ? (
              <div className="border border-seam bg-panel/70 px-2 py-1.5">
                <dt className="label-console text-[9px] text-ink-faint">Hazard score</dt>
                <dd className="data-readout text-xs text-ink">
                  {hazTerm.mean.toFixed(2)} avg · {hazTerm.max.toFixed(2)} max
                </dd>
              </div>
            ) : slopeTerm ? (
              <div className="border border-seam bg-panel/70 px-2 py-1.5">
                <dt className="label-console text-[9px] text-ink-faint">Slope cost term</dt>
                <dd className="data-readout text-xs text-ink">
                  {slopeTerm.mean.toFixed(2)} avg · {slopeTerm.max.toFixed(2)} max
                </dd>
              </div>
            ) : (
              <div className="border border-seam bg-panel/70 px-2 py-1.5">
                <dt className="label-console text-[9px] text-ink-faint">Steepest grade</dt>
                <dd className="data-readout text-xs text-ink">{why.activeSum.maxAbsSlopeDeg.toFixed(1)}°</dd>
              </div>
            )}
            {powTerm && (
              <div className="border border-seam bg-panel/70 px-2 py-1.5">
                <dt className="label-console text-[9px] text-ink-faint">Metabolic power</dt>
                <dd className="data-readout text-xs text-ink">
                  {powTerm.mean.toFixed(0)} W avg · {powTerm.max.toFixed(0)} W peak
                </dd>
              </div>
            )}
            {terrainTerm && (
              <div className="border border-seam bg-panel/70 px-2 py-1.5">
                <dt className="label-console text-[9px] text-ink-faint">Terrain factor</dt>
                <dd className="data-readout text-xs text-ink">
                  {terrainTerm.mean.toFixed(2)}× avg · {terrainTerm.max.toFixed(2)}× max
                </dd>
              </div>
            )}
          </dl>
          {activePlan?.rover && why.fromContract && (
            <p className="text-[11px] leading-relaxed text-ink-faint">
              Cost terms reflect the underlying on-foot terrain route contract for {selectedTargetId}.
            </p>
          )}
        </div>
      )}

      {activeRoute?.routing && (
        <p className="border border-scenario/30 bg-scenario-soft/30 px-3 py-2 text-[11px] leading-relaxed text-ink-dim">
          Scenario route computed on the native DTM at {activeRoute.routing.native_resolution_m.toFixed(2)} m resolution,
          with a {activeRoute.routing.slope_cap_deg}° hard cap (model ceiling {activeRoute.routing.hard_max_deg}°).
          {activeRoute.routing.sample_kg_per_stop != null && ` Return load includes ${activeRoute.routing.sample_kg_per_stop} kg of samples per stop.`}{' '}
          Separate fastest-return geometry is unavailable for this route; the return estimate follows the same modeled path.
        </p>
      )}

      {/* Elevation profile */}
      {profile && activePaths && (
        <div className="flex flex-col gap-1.5 border-t border-seam pt-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="label-console flex items-center gap-1.5 text-[10px] text-ink-dim">
              <Mountain size={12} aria-hidden className="text-derived" />
              {profile.elevSource === 'route-elev' ? 'Elevation profile (m)' : 'Elevation change Δh from habitat'}
            </span>
            {activeMembers.length > 1 && (
              <div className="flex gap-1">
                {activeMembers.map((m, i) => (
                  <button
                    key={m.member}
                    type="button"
                    onClick={() => setMemberIdx(i)}
                    className={cn(
                      'label-console border px-1.5 py-0.5 text-[9px]',
                      safeMemberIdx === i
                        ? 'border-signal/60 bg-signal-soft/50 text-signal'
                        : 'border-seam text-ink-faint hover:text-ink',
                    )}
                  >
                    {m.member}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative border border-seam bg-void/70 p-1">
            <svg
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              role="img"
              aria-label={`Elevation profile for ${MODE_LABEL[mode]} route: ${formatDistance(profile.totalDistanceM)} total, net change ${formatElev(profile.netM, true)}`}
              onPointerMove={handlePointerMove}
              onPointerLeave={() => setHoverDistM(null)}
              className="block h-28 w-full touch-none select-none"
            >
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={color} stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {/* Horizontal reference lines (top, 0 m if in range, bottom) */}
              {[rawMaxY, ...(rawMinY < 0 && rawMaxY > 0 ? [0] : []), rawMinY].map((val, idx) => {
                const y = yOf(val)
                const isZero = Math.abs(val) < 1e-6 && rawMinY < 0 && rawMaxY > 0
                return (
                  <g key={idx}>
                    <line
                      x1={PAD_L}
                      x2={SVG_W - PAD_R}
                      y1={y}
                      y2={y}
                      stroke={isZero ? '#2c3947' : '#1e2733'}
                      strokeDasharray={isZero ? '2 2' : undefined}
                      strokeWidth="1"
                    />
                    <text
                      x={PAD_L - 4}
                      y={y + 3}
                      textAnchor="end"
                      fill="#7d8895"
                      fontSize="8.5"
                      fontFamily="var(--font-data)"
                    >
                      {formatElev(val, !isSignedElev)}
                    </text>
                  </g>
                )
              })}

              {/* Comparison ghost curve */}
              {otherPaths && (
                <path
                  d={otherPaths.line}
                  fill="none"
                  stroke="#7d8895"
                  strokeWidth="1.25"
                  strokeDasharray="3 3"
                  opacity="0.55"
                />
              )}

              {/* Active route area + line */}
              <path d={activePaths.area} fill={`url(#${gradId})`} />
              <path d={activePaths.line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />

              {/* Rover park marker */}
              {parkDistM != null && (
                <g>
                  <line
                    x1={xOf(parkDistM)}
                    x2={xOf(parkDistM)}
                    y1={PAD_T}
                    y2={PAD_T + plotH}
                    stroke="#56d8f4"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                  />
                  <text
                    x={xOf(parkDistM)}
                    y={PAD_T + 8}
                    textAnchor="middle"
                    fill="#56d8f4"
                    fontSize="8"
                    fontFamily="var(--font-data)"
                  >
                    P
                  </text>
                </g>
              )}

              {/* Live turn-back marker */}
              {turnBackDistM != null && (
                <g>
                  <line
                    x1={xOf(turnBackDistM)}
                    x2={xOf(turnBackDistM)}
                    y1={PAD_T}
                    y2={PAD_T + plotH}
                    stroke={NO_RETURN_COLOR}
                    strokeWidth="1.5"
                    strokeDasharray="3 2"
                  />
                  <text
                    x={Math.min(SVG_W - PAD_R - 14, Math.max(PAD_L + 14, xOf(turnBackDistM)))}
                    y={PAD_T + 8}
                    textAnchor="middle"
                    fill={NO_RETURN_COLOR}
                    fontSize="8"
                    fontFamily="var(--font-data)"
                  >
                    TURN
                  </text>
                </g>
              )}

              {/* Hover scrub cursor */}
              {hoverSample && (
                <g>
                  <line
                    x1={xOf(hoverSample.distanceM)}
                    x2={xOf(hoverSample.distanceM)}
                    y1={PAD_T}
                    y2={PAD_T + plotH}
                    stroke="#e9edf3"
                    strokeOpacity="0.45"
                    strokeWidth="1"
                  />
                  <circle
                    cx={xOf(hoverSample.distanceM)}
                    cy={yOf(hoverSample.elevM)}
                    r="3.2"
                    fill={color}
                    stroke="#06080b"
                    strokeWidth="1.5"
                  />
                </g>
              )}

              {/* X-axis distance labels */}
              <text
                x={PAD_L}
                y={SVG_H - 4}
                textAnchor="start"
                fill="#7d8895"
                fontSize="8.5"
                fontFamily="var(--font-data)"
              >
                0 m (Hab)
              </text>
              <text
                x={SVG_W - PAD_R}
                y={SVG_H - 4}
                textAnchor="end"
                fill="#7d8895"
                fontSize="8.5"
                fontFamily="var(--font-data)"
              >
                {formatDistance(maxDist)}
              </text>
            </svg>

            {hoverSample && (
              <div className="data-readout pointer-events-none flex items-center justify-between border-t border-seam bg-hull/90 px-2 py-1 text-[10px] text-ink">
                <span>At {formatDistance(hoverSample.distanceM)}</span>
                <span>
                  {formatElev(hoverSample.elevM, !isSignedElev)} · {hoverSample.slopeDeg >= 0 ? '+' : '−'}
                  {Math.abs(hoverSample.slopeDeg).toFixed(1)}° slope
                </span>
              </div>
            )}
          </div>

          {/* Elevation stats strip */}
          <div className="data-readout flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-dim">
            <span>Gain +{Math.round(profile.gainM)} m</span>
            {profile.lossM > 0.5 && <span>Loss −{Math.round(profile.lossM)} m</span>}
            <span>Net {formatElev(profile.netM, true)}</span>
            <span>Steepest {profile.maxAbsSlopeDeg.toFixed(1)}°</span>
          </div>

          {stopObserved?.elevM != null && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-dim">
              <span>
                Stop elevation ({stopObserved.id}):{' '}
                <span className="data-readout text-ink">{stopObserved.elevM.toFixed(1)} m</span>
              </span>
              <EvidenceBadge evidence="observed" />
            </div>
          )}

          {otherProfile && (
            <p className="text-[10px] text-ink-faint">
              Solid line: {MODE_LABEL[mode]} · dashed line: {MODE_LABEL[otherMode]}.
              {!profile.signedSlopes &&
                profile.elevSource === 'slope-integrated' &&
                ' Segment slopes here are unsigned magnitudes, so the curve shows climb size, not direction.'}
            </p>
          )}
        </div>
      )}

      {engine.curiosityPath && curiosityComparison && (
        <div className="flex flex-col gap-1.5 border-t border-seam pt-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="label-console flex items-center gap-1.5 text-ink-dim">
              <Compass size={11} aria-hidden className="text-observed" />
              Vs Curiosity&apos;s real path
            </span>
            <EvidenceBadge evidence="observed" />
          </div>
          <p className="text-[11px] leading-relaxed text-ink-dim">
            <span className="data-readout text-ink">
              Sols {engine.curiosityPath.solStart}–{engine.curiosityPath.solEnd}
            </span>{' '}
            ({engine.curiosityPath.waypointCount} MMGIS waypoints ·{' '}
            {(engine.curiosityPath.inBoxOdomKm ?? engine.curiosityPath.inBoxLengthKm).toFixed(1)} km rover odometry in
            ops box). Nearest rover station to {stopTargetId ?? 'target'}:{' '}
            <span className="data-readout text-ink">
              sol {curiosityComparison.nearestToTarget.waypoint.sol}
            </span>{' '}
            (RMC {curiosityComparison.nearestToTarget.waypoint.rmc}
            {curiosityComparison.nearestToTarget.waypoint.elevM != null
              ? `, ${curiosityComparison.nearestToTarget.waypoint.elevM.toFixed(0)} m`
              : ''}
            , {formatDistance(curiosityComparison.nearestToTarget.distanceM)} away).
            {curiosityComparison.closestApproach &&
              ` Modeled route passes within ${formatDistance(curiosityComparison.closestApproach.distanceM)} of the rover traverse.`}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-ink-faint">
            <span>
              Curiosity&apos;s multi-year traverse followed rover tilt/slip limits and science stops; our route links
              the Scenario habitat to {stopTargetId ?? 'target'}.
            </span>
            <button
              type="button"
              onClick={fitCuriosityTraverse}
              className="flex-none text-observed underline underline-offset-2 hover:text-ink"
            >
              {showCuriosityPath ? 'Fit traverse on map' : 'Show traverse on map'}
            </button>
          </div>
        </div>
      )}

      {sourceOpen && (
        <div id={sourceId}>
          <SourceCard
            info={{
              badge: 'Derived',
              source: (
                <>
                  Per-segment <span className="data-readout">cost_terms</span> and{' '}
                  <span className="data-readout">slope_deg</span> from route file{' '}
                  <span className="data-readout">{activeContract?.id ?? activePlan?.id ?? 'route'}</span> (HiRISE 1 m
                  DTM + THEMIS thermal inertia proxy).
                  {stopObserved?.elevM != null && ' Stop elevation from NASA MMGIS Curiosity waypoints (Observed).'}
                  {engine.curiosityPath && ' Rover traverse from NASA MMGIS Curiosity waypoints (Observed).'}
                </>
              ),
              note:
                profile?.elevSource === 'route-elev'
                  ? 'Per-vertex elevations come directly from the route file. Cost breakdown is aggregated by segment length.'
                  : 'Elevation profile integrates segment distance_m × tan(slope_deg) from the habitat; cost breakdown aggregates per-segment cost_terms.',
            }}
          />
        </div>
      )}
    </div>
  )
}
