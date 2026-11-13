import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { createPanoViewer, type PanoViewer } from '@/hud/panoViewer'
import { createRouteOverlay, type RouteOverlay } from '@/hud/routeOverlay'
import { CommsPanel, type CommsHandle } from '@/hud/CommsPanel'
import type { StopPanorama } from '@/hud/panoramas'
import type { EngineCard } from '@/lib/engineDataContext'
import {
  distanceM,
  formatClock,
  formatDuration,
  sampleAt,
  type Frame,
  type Timeline,
} from '@/replay/replay-core.js'
import '@/hud/hud.css'

/**
 * 360° view at a stop with a film-style helmet HUD (Tier 2 prototype, demo-focus-plan §10). Owner: Marwan.
 * Honesty rules: the photo is real (Observed). O₂, route and timing are the replay model's values at the
 * moment of arrival (Scenario): the same timeline as Mission Replay and the turn-back slider. Radiation and
 * weather are Curiosity's RAD/REMS card values (Observed, rover-local). No invented vitals (no data exists).
 */

type LonLat = [number, number]

function bearingDeg(a: LonLat, b: LonLat): number {
  const r = (d: number) => (d * Math.PI) / 180
  const y = Math.sin(r(b[0] - a[0])) * Math.cos(r(b[1]))
  const x = Math.cos(r(a[1])) * Math.sin(r(b[1])) - Math.sin(r(a[1])) * Math.cos(r(b[1])) * Math.cos(r(b[0] - a[0]))
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

const numValue = (card: EngineCard | null | undefined, match: RegExp) => {
  const v = card?.values.find((x) => match.test(x.label))
  return v ? { value: v.value, unit: v.unit ?? '' } : null
}

/** North-up route map: way out, way home, switch and turn-back points, crew at the stop. */
function MiniMap({ frames, habitat, stop, switchPt, turnPt }: {
  frames: Frame[]
  habitat: LonLat
  stop: LonLat
  switchPt: LonLat | null
  turnPt: LonLat | null
}) {
  const pts = [...frames.map((f) => f.pt), habitat, stop]
  const lat0 = pts.reduce((s, p) => s + p[1], 0) / pts.length
  const k = Math.cos((lat0 * Math.PI) / 180)
  const xs = pts.map((p) => p[0] * k)
  const ys = pts.map((p) => -p[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const span = Math.max(x1 - x0, y1 - y0) || 1e-6
  const S = 168
  const pad = 24
  const P = (p: LonLat) =>
    [pad + ((p[0] * k - x0) / span) * (S - 2 * pad) + ((span - (x1 - x0)) / span) * (S - 2 * pad) / 2,
     pad + ((-p[1] - y0) / span) * (S - 2 * pad) + ((span - (y1 - y0)) / span) * (S - 2 * pad) / 2] as const
  const line = (fs: Frame[]) => fs.map((f) => P(f.pt).join(',')).join(' ')
  const out = frames.filter((f) => f.phase === 'out' || f.phase === 'stop')
  const back = frames.filter((f) => f.phase === 'back')
  if (back.length && out.length) back.unshift(out[out.length - 1])
  const [hx, hy] = P(habitat)
  const [sx, sy] = P(stop)
  const scaleM = distanceM(habitat, stop)
  return (
    <svg className="hud-map" viewBox={`0 0 ${S} ${S}`} role="img" aria-label="Route map, north up">
      <defs>
        <pattern id="hudgrid" width="21" height="21" patternUnits="userSpaceOnUse">
          <path d="M21 0H0V21" fill="none" stroke="rgba(120,230,255,0.12)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={S} height={S} fill="url(#hudgrid)" />
      <circle cx={S / 2} cy={S / 2} r={S / 2 - 3} fill="none" stroke="rgba(120,230,255,0.25)" />
      <polyline points={line(out)} fill="none" stroke="#f4f1ea" strokeWidth="2.5" strokeLinejoin="round" />
      <polyline points={line(back)} fill="none" stroke="#4cc9f0" strokeWidth="2.5" strokeDasharray="5 3" strokeLinejoin="round" />
      {switchPt && <circle cx={P(switchPt)[0]} cy={P(switchPt)[1]} r="4" fill="#ffb347" stroke="#000" />}
      {turnPt && <circle cx={P(turnPt)[0]} cy={P(turnPt)[1]} r="4" fill="#ef476f" stroke="#fff" />}
      <rect x={hx - 5} y={hy - 5} width="10" height="10" fill="#0b1014" stroke="#ffb224" strokeWidth="2" />
      <text x={hx > S / 2 ? hx - 9 : hx + 9} y={hy + 4} textAnchor={hx > S / 2 ? 'end' : 'start'} className="hud-map-t">HAB</text>
      <circle cx={sx} cy={sy} r="7" fill="none" stroke="#ff5fd2" strokeWidth="2" className="hud-pulse" />
      <circle cx={sx} cy={sy} r="3" fill="#ff5fd2" />
      <text x={S / 2} y="11" textAnchor="middle" className="hud-map-t">N</text>
      <text x="4" y={S - 4} className="hud-map-t">{(scaleM / 1000).toFixed(2)} km straight HAB↔stop</text>
    </svg>
  )
}

/** O₂ ring: fill = O₂ left (worst suit); striped red = reserve (never planned); amber = needed to get home. */
function O2Ring({ leftL, tankL, reserveL, homeL }: { leftL: number; tankL: number; reserveL: number; homeL: number }) {
  const R = 46
  const C = 2 * Math.PI * R
  const arc = (from: number, to: number, color: string, w = 7, extra = {}) => (
    <circle cx="60" cy="60" r={R} fill="none" stroke={color} strokeWidth={w}
      strokeDasharray={`${Math.max(0, (to - from) / tankL) * C} ${C}`}
      strokeDashoffset={-(from / tankL) * C} transform="rotate(-90 60 60)" {...extra} />
  )
  const left = Math.max(0, leftL)
  return (
    <svg className="hud-ring" viewBox="0 0 120 120" aria-hidden>
      <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="7" />
      {arc(0, left, left - reserveL - homeL < 0.1 * tankL ? '#ffd166' : '#06d6a0')}
      {arc(reserveL, Math.min(left, reserveL + homeL), 'rgba(255,179,71,0.9)', 3)}
      {arc(0, reserveL, '#ef476f', 3)}
      <text x="60" y="58" textAnchor="middle" className="hud-ring-big">{Math.round((left / tankL) * 100)}%</text>
      <text x="60" y="76" textAnchor="middle" className="hud-ring-small">O₂ · {left.toFixed(0)} L</text>
    </svg>
  )
}

export function StopHud({
  pano,
  stopName,
  sols,
  timeline,
  routeMode,
  stopLonLat,
  habitatLonLat,
  cards,
  wayOut,
  wayHome,
  fastestHome,
  fastHomeCost,
  onClose,
}: {
  pano: StopPanorama
  stopName: string
  sols?: string
  timeline: Timeline
  routeMode: string
  stopLonLat: LonLat
  habitatLonLat: LonLat
  cards: { rad: EngineCard | null; rems: EngineCard | null }
  /** Way out (habitat → stop) and the way home from the stop, as lon/lat lines. */
  wayOut: LonLat[]
  wayHome: LonLat[]
  /** Fastest way home from the stop (back_fast path, or the route back if none) and its model cost. */
  fastestHome: LonLat[]
  fastHomeCost: { t_s: number; o2_l: number } | null
  onClose: () => void
}) {
  const commsRef = useRef<CommsHandle>(null)
  const homeEdgeRef = useRef<HTMLDivElement>(null)
  // Emergency: return now on the fastest way home, view turns to it, a message goes to habitat + Earth.
  const [emergency, setEmergency] = useState(false)
  const fovRef = useRef(58)
  const hostRef = useRef<HTMLDivElement>(null)
  const tapeRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const viewerRef = useRef<PanoViewer | null>(null)
  const overlayRef = useRef<RouteOverlay | null>(null)
  // Which leg is drawn in yellow: the next walk from here (way home, arrows lead away from the viewer, default)
  // or the route already walked to this stop (shown without arrows, so nothing moves toward the viewer).
  const [leg, setLeg] = useState<'to' | 'home'>('home')
  // Bearing the view faces at start. Unverified estimate; [ and ] rotate the drawn route to align it.
  const [northDeg, setNorthDeg] = useState(pano.northOffsetDeg)
  const northRef = useRef(northDeg)
  const habBearingRef = useRef(bearingDeg(stopLonLat, habitatLonLat))
  const yawRef = useRef(0)
  const setTape = () => {
    const heading = (((northRef.current - yawRef.current) % 360) + 360) % 360
    if (tapeRef.current) tapeRef.current.style.transform = `translateX(${-heading * 4}px)`
    // Home finder: when the habitat is outside the view, an arrow at the screen edge points the way to turn.
    const el = homeEdgeRef.current
    const host = hostRef.current
    if (el && host) {
      const aspect = (host.clientWidth || 1) / (host.clientHeight || 1)
      const hfov = (2 * Math.atan(Math.tan((fovRef.current * Math.PI) / 360) * aspect) * 180) / Math.PI
      const rel = ((habBearingRef.current - heading + 540) % 360) - 180
      const out = Math.abs(rel) > hfov / 2 - 4
      el.hidden = !out
      el.dataset.side = rel < 0 ? 'left' : 'right'
      const turn = el.querySelector('[data-turn]')
      if (turn) turn.textContent = `TURN ${rel < 0 ? 'LEFT' : 'RIGHT'} ${Math.abs(Math.round(rel))}°`
    }
  }

  useEffect(() => {
    if (!hostRef.current) return
    const viewer = createPanoViewer(hostRef.current, `${import.meta.env.BASE_URL}${pano.url}`, {
      horizonDeg: pano.horizonDeg,
      onReady: () => setStatus('ready'),
      onError: () => setStatus('error'),
      // Heading tape follows the view directly (no React re-render per frame).
      onView: (yawDeg, fovDeg) => {
        yawRef.current = yawDeg
        fovRef.current = fovDeg
        setTape()
      },
    })
    viewerRef.current = viewer
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === '[') setNorthDeg((d) => d - 2)
      if (e.key === ']') setNorthDeg((d) => d + 2)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      overlayRef.current?.dispose()
      overlayRef.current = null
      viewerRef.current = null
      viewer.destroy()
    }
  }, [pano.url, pano.horizonDeg, onClose])

  // The fixed route on the ground: drawn once per leg (no tracking); only its arrows animate.
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    const yellow = { color: '#ffd400', opacity: 0.7, widthM: 1.2, arrows: true }
    const faint = { color: '#7fe3ff', opacity: 0.35, widthM: 0.8, arrows: false }
    // Arrows only on the walk ahead, so they always lead away from where the viewer stands.
    const paths = emergency
      ? [{ ...faint, coords: wayOut }, { ...yellow, color: '#ff4d4d', coords: fastestHome }]
      : leg === 'to'
        ? [{ ...faint, coords: wayHome }, { ...yellow, arrows: false, coords: wayOut }]
        : [{ ...faint, coords: wayOut }, { ...yellow, coords: wayHome }]
    const overlay = createRouteOverlay(viewer.scene, viewer.onFrame, {
      stop: stopLonLat,
      habitat: habitatLonLat,
      paths,
      northOffsetDeg: northRef.current,
    })
    overlayRef.current = overlay
    // Face the walk ahead: turn to the bearing of the yellow line ~40 m out from the stop.
    const ahead = paths[1].coords.find((c) => distanceM(stopLonLat, c) > 40)
    if (ahead) viewer.setYaw(northRef.current - bearingDeg(stopLonLat, ahead))
    return () => {
      overlay.dispose()
      if (overlayRef.current === overlay) overlayRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leg, emergency, fastestHome, wayOut, wayHome, stopLonLat[0], stopLonLat[1], habitatLonLat[0], habitatLonLat[1]])

  useEffect(() => {
    northRef.current = northDeg
    overlayRef.current?.setNorthOffset(northDeg)
    setTape()
  }, [northDeg])

  const tl = timeline
  const arrive = tl.events.find((e) => e.type === 'arrive')
  const tAt = arrive?.t ?? tl.events.find((e) => e.type === 'turnback' || e.type === 'forced-return')?.t ?? 0
  const s = sampleAt(tl, tAt)
  const T = tl.tankL ?? tl.capacityL
  const pct = (l: number) => `${Math.round((l / T) * 100)}%`
  const homeS = tl.totalS - tAt
  const spareL = s.o2Left - tl.reserveL - s.homeL
  const ret =
    routeMode === 'fastest' ? 'FASTEST ROUTE BACK' : tl.fastHome ? 'FASTEST WAY HOME' : 'BACK ALONG ROUTE'
  const habKm = distanceM(stopLonLat, habitatLonLat) / 1000
  const habBearing = bearingDeg(stopLonLat, habitatLonLat)
  const log = tl.events.filter((e) => e.t <= tAt + 1e-6 && e.type !== 'status').slice(-5).reverse()

  const f = tl.worstFactor ?? 1
  const emNeedL = fastHomeCost ? fastHomeCost.o2_l * f : s.homeL
  const emTimeS = fastHomeCost ? fastHomeCost.t_s : homeS
  const emMarginL = s.o2Left - tl.reserveL - emNeedL
  const startEmergency = () => {
    setEmergency(true)
    commsRef.current?.send(
      `EMERGENCY at ${pano.stopId}: returning to habitat by fastest way, O₂ ${pct(s.o2Left)}, ETA ${formatDuration(emTimeS)}`,
      true,
    )
  }

  const rate = numValue(cards.rad, /dose equivalent rate|dose rate/i)
  // Walk dose = the card's daily rate × walk time, in the card's own unit (mSv or µGy per day).
  const doseUnit = rate?.unit.replace(/\/\s*day$/i, '') ?? ''
  const dose = typeof rate?.value === 'number' && /\/\s*day$/i.test(rate.unit) ? (rate.value * tl.totalS) / 86400 : null
  const pressure = numValue(cards.rems, /pressure/i)
  const airT = numValue(cards.rems, /air temperature/i)

  const ticks = useMemo(() => {
    const out: { deg: number; label: string }[] = []
    const card: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }
    for (let d = -360; d <= 720; d += 15) {
      const n = ((d % 360) + 360) % 360
      out.push({ deg: d, label: d % 45 === 0 ? (card[n] ?? String(n)) : '' })
    }
    return out
  }, [])
  const marks = [
    { t: 0, label: 'DEPART', c: '#9fd3ff' },
    ...(tl.switchT != null ? [{ t: tl.switchT, label: 'SWITCH', c: '#ffb347' }] : []),
    ...(arrive ? [{ t: arrive.t, label: 'STOP', c: '#ff5fd2' }] : [{ t: tAt, label: 'TURN', c: '#ef476f' }]),
    { t: tl.totalS, label: 'HOME', c: '#9fd3ff' },
  ]

  // Portal to <body>: panels with backdrop-filter/containment would otherwise trap the full-screen view.
  return createPortal(
    <div
      className="hud-root"
      data-emergency={emergency || undefined}
      role="dialog"
      aria-modal="true"
      aria-label={`360° view at ${stopName} with HUD`}
    >
      <div ref={hostRef} className="hud-pano" />
      {status !== 'ready' && (
        <div className="hud-status">{status === 'error' ? 'Panorama failed to load.' : 'LOADING NASA PANORAMA…'}</div>
      )}
      <div className="hud-scan" aria-hidden />
      <div className="hud-visor" aria-hidden />
      <div className="hud-reticle" aria-hidden />

      {/* Home finder: shows only when the habitat is out of view; the 3D HOME beacon is drawn in the scene. */}
      <div ref={homeEdgeRef} className="hud-home-edge" hidden>
        <span className="hud-home-arrow" aria-hidden />
        <b>⌂ HOME {habKm.toFixed(2)} km</b>
        <span data-turn />
      </div>

      {/* Heading tape: compass heading = start bearing (unverified estimate, so marked ≈) − view yaw. */}
      <div className="hud-tape hud-in" style={{ animationDelay: '0.05s' }} aria-hidden>
        <div ref={tapeRef} className="hud-tape-inner">
          {ticks.map((t) => (
            <span key={t.deg} className="hud-tick" style={{ left: `calc(50% + ${t.deg * 4}px)` }}>
              {t.label}
            </span>
          ))}
          {[-360, 0, 360].map((k) => (
            <span key={k} className="hud-tape-home" style={{ left: `calc(50% + ${(habBearing + k) * 4}px)` }}>
              ⌂
            </span>
          ))}
        </div>
        <span className="hud-tape-caret" />
        <span className="hud-tape-rel">{pano.northCalibrated ? 'HDG' : '≈ HDG'}</span>
      </div>

      <div className="hud-top hud-in" style={{ animationDelay: '0.1s' }}>
        <span className="hud-chip hud-obs">OBSERVED</span>
        <span className="hud-title">
          {pano.stopId} · {stopName.toUpperCase()}
          {sols ? ` · SOL ${sols}` : ''}
        </span>
        <span className="hud-seg" role="group" aria-label="Route drawn on the ground">
          <button aria-pressed={leg === 'home'} onClick={() => setLeg('home')}>NEXT: WAY HOME ▸</button>
          <button aria-pressed={leg === 'to'} onClick={() => setLeg('to')}>ROUTE WALKED</button>
        </span>
        <button className="hud-close" onClick={onClose} aria-label="Close 360 view">✕</button>
      </div>

      <div className="hud-tl hud-glass hud-in" style={{ animationDelay: '0.2s' }}>
        <div className="hud-label">MISSION CLOCK</div>
        <div className="hud-mono hud-xl">T+{formatClock(tAt)}</div>
        <div className="hud-row"><span>Walked</span><b>{(s.distM / 1000).toFixed(2)} km</b></div>
        <div className="hud-row"><span>Crew</span><b>{tl.members.length} · {routeMode === 'fastest' ? 'fastest' : 'lowest hazard'}</b></div>
        <div className="hud-row"><span>Earth delay</span><b>≤ 22 min</b></div>
      </div>

      <div className="hud-left hud-glass hud-in" style={{ animationDelay: '0.3s' }}>
        <div className="hud-label">SUIT O₂ · WORST SUIT</div>
        <O2Ring leftL={s.o2Left} tankL={T} reserveL={tl.reserveL} homeL={s.homeL} />
        {s.members.map((l, i) => (
          <div key={i} className="hud-member">
            <span>{'AB'[i] ?? i + 1}</span>
            <span className="hud-mbar"><span style={{ width: pct(Math.max(0, l)) }} /></span>
            <b>{pct(Math.max(0, l))}</b>
          </div>
        ))}
        <div className="hud-row"><span>Time left</span><b>≈{formatDuration(s.minutesLeft * 60)}</b></div>
        <div className="hud-row"><span>Reserve</span><b>{pct(tl.reserveL)}</b></div>
      </div>

      <div className="hud-right hud-glass hud-in" style={{ animationDelay: '0.4s' }}>
        {arrive ? (
          <>
            <div className="hud-label">WAY HOME</div>
            <div className={`hud-ret ${tl.fastHome ? 'hud-amber' : ''}`}>{ret}</div>
            {tl.fastHome && <div className="hud-alert">O₂ LOW · SWITCHED AT T+{formatClock(tl.switchT ?? 0)}</div>}
            <div className="hud-row"><span>Time home</span><b>{formatDuration(homeS)}</b></div>
            <div className="hud-row"><span>O₂ needed</span><b>{pct(s.homeL)} · {s.homeL.toFixed(0)} L</b></div>
            <div className="hud-row"><span>Spare after it</span><b className={spareL < 0.1 * T ? 'hud-amber' : ''}>{pct(Math.max(0, spareL))}</b></div>
            <div className="hud-row"><span>Habitat</span><b>{habKm.toFixed(2)} km · {habBearing.toFixed(0)}° true</b></div>
          </>
        ) : (
          <>
            <div className="hud-label">OUT OF REACH</div>
            <div className="hud-ret hud-red">TURN-BACK BEFORE THIS STOP</div>
            <div className="hud-small">On this O₂ budget the modeled walk turns back at T+{formatClock(tAt)}. The photo shows what is there.</div>
          </>
        )}
        <div className="hud-sep" />
        <div className="hud-label">ENVIRONMENT · CURIOSITY</div>
        {dose != null && (
          <div className="hud-row"><span>EVA dose (unshielded)</span><b>{dose < 10 ? dose.toFixed(3) : dose.toFixed(0)} {doseUnit}</b></div>
        )}
        {rate && <div className="hud-row hud-dim"><span>RAD surface rate</span><span>{String(rate.value)} {rate.unit}</span></div>}
        {pressure && <div className="hud-row hud-dim"><span>Pressure (yr range)</span><span>{String(pressure.value)} {pressure.unit}</span></div>}
        {airT && <div className="hud-row hud-dim"><span>Air temp (day range)</span><span>{String(airT.value)} {airT.unit}</span></div>}
      </div>

      <div className="hud-bl hud-glass hud-in" style={{ animationDelay: '0.5s' }}>
        <div className="hud-label">LOG</div>
        <ul className="hud-log">
          {log.map((e, i) => (
            <li key={i} data-type={e.type}><b>T+{formatClock(e.t)}</b> {e.label}</li>
          ))}
        </ul>
      </div>

      <div className="hud-cm hud-glass hud-in" style={{ animationDelay: '0.5s' }}>
        <CommsPanel ref={commsRef} />
      </div>

      {emergency && (
        <div className="hud-emergency" role="alert">
          <div className="hud-em-title">⚠ EMERGENCY · RETURN TO HABITAT NOW</div>
          <div className="hud-em-grid">
            <span>Fastest way home</span>
            <b>{formatDuration(emTimeS)}</b>
            <span>O₂ needed</span>
            <b>{pct(emNeedL)}</b>
            <span>O₂ left</span>
            <b>{pct(s.o2Left)}</b>
            <span>Above reserve after</span>
            <b className={emMarginL < 0 ? 'hud-red' : ''}>{emMarginL < 0 ? 'INTO RESERVE' : pct(emMarginL)}</b>
          </div>
          <div className="hud-small">
            Follow the red line · habitat {habBearing.toFixed(0)}° · message sent to the habitat and Earth (see COMMS).
            Modeled estimate (Scenario).
          </div>
          <button className="hud-em-cancel" onClick={() => setEmergency(false)}>
            Cancel emergency
          </button>
        </div>
      )}

      {!emergency && (
        <button className="hud-em-btn" onClick={startEmergency} aria-label="Emergency: return to habitat now">
          ⚠ EMERGENCY
        </button>
      )}

      <div className="hud-br hud-glass hud-in" style={{ animationDelay: '0.6s' }}>
        <div className="hud-label">ROUTE · NORTH UP</div>
        <MiniMap frames={tl.frames} habitat={habitatLonLat} stop={stopLonLat} switchPt={tl.switchPoint} turnPt={tl.turnPoint} />
      </div>

      <div className="hud-bottom hud-in" style={{ animationDelay: '0.7s' }}>
        <div className="hud-progress">
          <span className="hud-progress-done" style={{ width: `${(tAt / tl.totalS) * 100}%` }} />
          {marks.map((m) => (
            <span key={m.label} className="hud-mark" data-low={m.label === 'SWITCH' || undefined} style={{ left: `${(m.t / tl.totalS) * 100}%`, color: m.c }}>
              <i style={{ background: m.c }} />
              {m.label}
            </span>
          ))}
        </div>
        <div className="hud-foot">
          <span className="hud-chip hud-scn">SCENARIO</span> O₂, route and times are modeled estimates, not
          measurements · RAD/REMS: Curiosity rover-local values · Photo: {pano.pia}, {pano.credit}, {pano.taken} ·
          Real imagery only at stops; moving between stops is a jump. · Yellow route: drawn from the route's coordinates onto the photo (flat ground, no hills; photo
          heading {pano.northCalibrated ? 'aligned' : `≈${northDeg}° at centre, ${pano.headingNote}; [ ] adjust`}), not tracking.
        </div>
      </div>
    </div>,
    document.body,
  )
}
