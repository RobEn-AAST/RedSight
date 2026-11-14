import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { createPanoViewer, type PanoViewer } from '@/hud/panoViewer'
import { createRouteOverlay, nextTurn, parseTerrain, type RouteOverlay, type Terrain } from '@/hud/routeOverlay'
import { CommsPanel, type CommsHandle } from '@/hud/CommsPanel'
import { oneWayDelayS } from '@/hud/earthDelay'
import { STANDIN_PANORAMA, type StopPanorama } from '@/hud/panoramas'
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
 * 360° view at a stop with a helmet AR HUD (Tier 2 prototype, demo-focus-plan §10). Owner: Marwan.
 * Honesty rules: the photo is real (Observed): either the NASA photo taken at this stop, or (demo default, user
 * request 2026-11-14) a full-sphere NASA Curiosity photo from elsewhere on Mount Sharp, labelled on screen as a
 * stand-in, with the route drawn on flat ground (Scenario), never matched to its landforms. O₂, route and timing are the replay model's values at the
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

/** Route radar, heading up: you at the centre, the map turns as you look around (the view direction is always up).
 *  The rotation is applied directly to the SVG by `turnRadar` (no React re-render per frame). */
const RADAR_S = 180
const RADAR_C = RADAR_S / 2
function MiniMap({ frames, habitat, stop, switchPt, turnPt, svgRef }: {
  frames: Frame[]
  habitat: LonLat
  stop: LonLat
  switchPt: LonLat | null
  turnPt: LonLat | null
  svgRef: React.RefObject<SVGSVGElement | null>
}) {
  const r = Math.PI / 180
  const kx = 3_389_500 * Math.cos(stop[1] * r) * r
  const ky = 3_389_500 * r
  const pts = [...frames.map((f) => f.pt), habitat]
  const far = Math.max(50, ...pts.map((p) => Math.hypot((p[0] - stop[0]) * kx, (p[1] - stop[1]) * ky)))
  const R = RADAR_C - 14
  const sc = R / far
  const P = (p: LonLat) => [RADAR_C + (p[0] - stop[0]) * kx * sc, RADAR_C - (p[1] - stop[1]) * ky * sc] as const
  const line = (fs: Frame[]) => fs.map((f) => P(f.pt).join(',')).join(' ')
  const out = frames.filter((f) => f.phase === 'out' || f.phase === 'stop')
  const back = frames.filter((f) => f.phase === 'back')
  if (back.length && out.length) back.unshift(out[out.length - 1])
  const [hx, hy] = P(habitat)
  // Range ring at a round distance about half the radius.
  const ringM = [100, 200, 250, 500, 1000, 2000].reduce((b, m) => (Math.abs(m - far / 2) < Math.abs(b - far / 2) ? m : b))
  return (
    <svg ref={svgRef} className="hud-map" viewBox={`0 0 ${RADAR_S} ${RADAR_S}`} role="img" aria-label="Route radar, the direction you face is up">
      <circle cx={RADAR_C} cy={RADAR_C} r={RADAR_C - 3} fill="rgba(4,18,26,0.25)" stroke="rgba(120,230,255,0.3)" />
      <circle cx={RADAR_C} cy={RADAR_C} r={ringM * sc} fill="none" stroke="rgba(120,230,255,0.18)" strokeDasharray="3 3" />
      {/* View cone (fixed, points up); its width follows the zoom. */}
      <path data-cone d="" fill="rgba(127,227,255,0.16)" stroke="rgba(127,227,255,0.45)" strokeWidth="1" />
      <g data-rot>
        <polyline points={line(out)} fill="none" stroke="#f4f1ea" strokeWidth="2.5" strokeLinejoin="round" opacity="0.7" />
        <polyline points={line(back)} fill="none" stroke="#2fb8ff" strokeWidth="3" strokeLinejoin="round" />
        {switchPt && <circle cx={P(switchPt)[0]} cy={P(switchPt)[1]} r="4" fill="#ffb347" stroke="#000" />}
        {turnPt && <circle cx={P(turnPt)[0]} cy={P(turnPt)[1]} r="4" fill="#ef476f" stroke="#fff" />}
        <rect x={hx - 6} y={hy - 6} width="12" height="12" fill="#0b1014" stroke="#ffb224" strokeWidth="2.5" />
        <text data-up x={hx} y={hy - 10} textAnchor="middle" className="hud-map-t hud-map-hab">HOME</text>
        <text data-up x={RADAR_C} y="13" textAnchor="middle" className="hud-map-t hud-map-n">N</text>
      </g>
      <path d={`M${RADAR_C} ${RADAR_C - 8} L${RADAR_C + 6} ${RADAR_C + 6} L${RADAR_C} ${RADAR_C + 2} L${RADAR_C - 6} ${RADAR_C + 6} Z`} fill="#ff5fd2" stroke="#fff" strokeWidth="1" />
      <text x="6" y={RADAR_S - 5} className="hud-map-t">ring {ringM >= 1000 ? `${ringM / 1000} km` : `${ringM} m`}</text>
    </svg>
  )
}

/** Turn the radar: map rotated by −heading around you; labels kept upright; cone width = horizontal field of view. */
function turnRadar(svg: SVGSVGElement | null, heading: number, hfov: number) {
  if (!svg) return
  svg.querySelector('[data-rot]')?.setAttribute('transform', `rotate(${-heading} ${RADAR_C} ${RADAR_C})`)
  svg.querySelectorAll<SVGTextElement>('[data-up]').forEach((t) => {
    t.setAttribute('transform', `rotate(${heading} ${t.getAttribute('x')} ${t.getAttribute('y')})`)
  })
  const half = (Math.min(170, hfov) / 2) * (Math.PI / 180)
  const L = RADAR_C - 6
  const x = (a: number) => RADAR_C + Math.sin(a) * L
  const y = (a: number) => RADAR_C - Math.cos(a) * L
  svg
    .querySelector('[data-cone]')
    ?.setAttribute('d', `M${RADAR_C} ${RADAR_C} L${x(-half)} ${y(-half)} A${L} ${L} 0 0 1 ${x(half)} ${y(half)} Z`)
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
  /** Displayed return geometry from the stop and its matching model cost. */
  fastestHome: LonLat[]
  fastHomeCost: { t_s: number; o2_l: number } | null
  onClose: () => void
}) {
  const commsRef = useRef<CommsHandle>(null)
  const navArrowRef = useRef<HTMLSpanElement>(null)
  const navTurnRef = useRef<HTMLSpanElement>(null)
  // Emergency: return on the displayed modeled route, turn toward the habitat, message habitat + Earth.
  const [emergency, setEmergency] = useState(false)
  // Clean view by default (photo first); Details opens the full instrument panels.
  const [details, setDetails] = useState(false)
  const [gaps, setGaps] = useState(false)
  const [hint, setHint] = useState(true)
  // Guided demo tour (hackathon showcase): scripted camera moves + captions, ~48 s. The user can stop it any time.
  const [tour, setTour] = useState(false)
  // Which photo: the full-sphere stand-in (demo default, user's choice) or the real photo taken at this stop.
  // Demo uses the full-sphere NASA stand-in photo only (Marwan, 2026-11-14: real stop photos removed from the HUD).
  const standin = true
  const active: StopPanorama = standin ? STANDIN_PANORAMA : pano
  // Terrain grid around the stop (Derived, Trek 2.5 m DEM) so the AR route sits on the real ground. Only with the
  // stop's own photo: on the stand-in photo the route is drawn on flat ground (its landforms are elsewhere).
  const [terrain, setTerrain] = useState<Terrain | null>(null)
  useEffect(() => {
    let live = true
    fetch(`${import.meta.env.BASE_URL}hud/terrain-${pano.stopId}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && d && setTerrain(parseTerrain(d)))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [pano.stopId])
  const [caption, setCaption] = useState<{ title: string; text: string } | null>(null)
  const [earthMin] = useState(() => Math.round(oneWayDelayS(new Date()) / 60))
  const fovRef = useRef(58)
  const hostRef = useRef<HTMLDivElement>(null)
  const tapeRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const viewerRef = useRef<PanoViewer | null>(null)
  const overlayRef = useRef<RouteOverlay | null>(null)
  // Which leg is drawn: the next walk from here (way home, chevrons lead away from the viewer, default) or the
  // route already walked to this stop (no chevrons, so nothing moves toward the viewer).
  const [leg, setLeg] = useState<'to' | 'home'>('home')
  // Stand-in photo: turn the route so the walk ahead faces the photo's centre (down the open channel).
  const aheadPt = wayHome.find((c) => distanceM(stopLonLat, c) > 40) ?? habitatLonLat
  const standinNorth = Math.round(bearingDeg(stopLonLat, aheadPt))
  // Bearing the view faces at start. On the stop photo it is the Mastcam-derived estimate; [ and ] nudge it.
  const [stopNorth, setStopNorth] = useState(pano.northOffsetDeg)
  const northDeg = standin ? standinNorth : stopNorth
  const northRef = useRef(northDeg)
  northRef.current = northDeg
  const habBearingRef = useRef(bearingDeg(stopLonLat, habitatLonLat))
  const yawRef = useRef(0)
  const radarRef = useRef<SVGSVGElement | null>(null)
  const setTape = () => {
    const heading = (((northRef.current - yawRef.current) % 360) + 360) % 360
    if (tapeRef.current) tapeRef.current.style.transform = `translateX(${-heading * 4}px)`
    // Home arrow in the navigation card: points to the habitat relative to where the view faces.
    const rel = ((habBearingRef.current - heading + 540) % 360) - 180
    if (navArrowRef.current) navArrowRef.current.style.transform = `rotate(${rel}deg)`
    const host = hostRef.current
    if (host) {
      const aspect = (host.clientWidth || 1) / (host.clientHeight || 1)
      const hfov = (2 * Math.atan(Math.tan((fovRef.current * Math.PI) / 360) * aspect) * 180) / Math.PI
      turnRadar(radarRef.current, heading, hfov)
      if (!navTurnRef.current) return
      navTurnRef.current.textContent =
        Math.abs(rel) < Math.min(12, hfov / 4) ? 'ahead' : `${Math.abs(Math.round(rel))}° ${rel < 0 ? 'left' : 'right'}`
    }
  }

  useEffect(() => {
    if (!hostRef.current) return
    setStatus('loading')
    const viewer = createPanoViewer(hostRef.current, `${import.meta.env.BASE_URL}${active.url}`, {
      horizonDeg: active.horizonDeg,
      projection: active.projection,
      onReady: () => {
        setStatus('ready')
        window.setTimeout(() => setHint(false), 6000)
      },
      onError: () => setStatus('error'),
      // Heading tape and home arrow follow the view directly (no React re-render per frame).
      onView: (yawDeg, fovDeg) => {
        yawRef.current = yawDeg
        fovRef.current = fovDeg
        setTape()
      },
    })
    viewerRef.current = viewer
    return () => {
      overlayRef.current?.dispose()
      overlayRef.current = null
      viewerRef.current = null
      viewer.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.url, active.horizonDeg, active.projection])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (!standin && e.key === '[') setStopNorth((d) => d - 2)
      if (!standin && e.key === ']') setStopNorth((d) => d + 2)
      if (e.key === 'h' || e.key === 'H') setDetails((d) => !d)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, standin])

  // The fixed route on the ground: drawn once per leg (no tracking); only its chevrons animate.
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    const guide = { color: '#2fb8ff', opacity: 0.95, widthM: 1.2, arrows: true }
    const faint = { color: '#d8f3ff', opacity: 0.4, widthM: 0.8, arrows: false }
    // Chevrons only on the walk ahead, so they always lead away from where the viewer stands.
    const paths = emergency
      ? [{ ...faint, coords: wayOut }, { ...guide, color: '#ff3b3b', coords: fastestHome }]
      : leg === 'to'
        ? [{ ...faint, coords: wayHome }, { ...guide, color: '#9ad8ff', arrows: false, coords: wayOut }]
        : [{ ...faint, coords: wayOut }, { ...guide, coords: wayHome }]
    const overlay = createRouteOverlay(viewer.scene, viewer.onFrame, {
      stop: stopLonLat,
      habitat: habitatLonLat,
      paths,
      northOffsetDeg: northRef.current,
      terrain: standin ? null : terrain,
    })
    overlayRef.current = overlay
    // Face the walk ahead: turn to the bearing of the guided line ~40 m out from the stop.
    const ahead = paths[1].coords.find((c) => distanceM(stopLonLat, c) > 40)
    if (ahead) viewer.setYaw(northRef.current - bearingDeg(stopLonLat, ahead))
    return () => {
      overlay.dispose()
      if (overlayRef.current === overlay) overlayRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leg, emergency, terrain, standin, status, fastestHome, wayOut, wayHome, stopLonLat[0], stopLonLat[1], habitatLonLat[0], habitatLonLat[1]])

  useEffect(() => {
    viewerRef.current?.showGaps(gaps)
  }, [gaps, status])

  useEffect(() => {
    overlayRef.current?.setNorthOffset(northDeg)
    setTape()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    tl.fastHome ? 'ALTERNATE RETURN' : 'BACK ALONG MODELED ROUTE'
  const habKm = distanceM(stopLonLat, habitatLonLat) / 1000
  const habBearing = bearingDeg(stopLonLat, habitatLonLat)
  const log = tl.events.filter((e) => e.t <= tAt + 1e-6 && e.type !== 'status').slice(-5).reverse()
  const guidePath = emergency ? fastestHome : wayHome
  const turn = useMemo(() => nextTurn(guidePath, stopLonLat), [guidePath, stopLonLat])

  const f = tl.worstFactor ?? 1
  const emNeedL = fastHomeCost ? fastHomeCost.o2_l * f : s.homeL
  const emTimeS = fastHomeCost ? fastHomeCost.t_s : homeS
  const emMarginL = s.o2Left - tl.reserveL - emNeedL
  const startEmergency = () => {
    setEmergency(true)
    commsRef.current?.send(
      `EMERGENCY at ${pano.stopId}: returning to habitat on the modeled return path, O₂ ${pct(s.o2Left)}, ETA ${formatDuration(emTimeS)}`,
      true,
    )
  }

  // Yaw that faces a ground point from the stop (same convention as the route overlay).
  const yawTo = (c: [number, number]) => northRef.current - bearingDeg(stopLonLat, c)
  const startEmergencyRef = useRef(startEmergency)
  startEmergencyRef.current = startEmergency
  useEffect(() => {
    if (!tour) return
    const v = () => viewerRef.current
    const ahead = wayHome.find((c) => distanceM(stopLonLat, c) > 40) ?? habitatLonLat
    const aheadYaw = yawTo(ahead)
    const homeYaw = yawTo(habitatLonLat)
    const km = habKm.toFixed(2)
    const where = standin
      ? `Background: a real NASA Curiosity photo from ${STANDIN_PANORAMA.place} (a stand-in, not ${pano.stopId}). On a real walk it is the live visor camera.`
      : `Background: the real NASA photo taken at ${pano.stopId}. On a real walk it is the live visor camera.`
    const steps: [number, () => void][] = [
      [0, () => {
        setEmergency(false)
        setDetails(false)
        setLeg('home')
        setHint(false)
        v()?.panTo(aheadYaw + 70, 4, 0.1)
        setCaption({ title: 'HELMET AR · SIMULATION', text: `What an astronaut would see through the visor. ${where}` })
      }],
      [600, () => v()?.panTo(aheadYaw + 25, 4, 5)],
      [6000, () => {
        v()?.panTo(aheadYaw, -16, 3.5)
        setCaption({ title: 'THE ROUTE ON THE GROUND', text: 'Blue line = the modeled way home, pinned to the plan’s coordinates (no GPS). The chevrons show which way to walk; the sign shows the next turn.' })
      }],
      [13000, () => {
        v()?.panTo(homeYaw, 3, 4)
        setCaption({ title: 'HOME', text: `Habitat ${km} km away: the light pillar and ring. The arrow at the top always points home, even when it is out of view.` })
      }],
      [20000, () => {
        setDetails(true)
        setCaption({ title: 'SUIT AND ROUTE DATA', text: 'Oxygen per suit, walk time home, reserve, Curiosity’s radiation and weather. Oxygen and times are modeled estimates (Scenario).' })
      }],
      [27500, () => {
        setDetails(false)
        commsRef.current?.send('Arrived at the stop')
        setCaption({ title: 'MESSAGE TO EARTH', text: `The habitat hears it now. Earth hears it in ${earthMin} min (light-time today); a reply takes at least twice that.` })
      }],
      [34000, () => {
        startEmergencyRef.current()
        setCaption({ title: 'EMERGENCY', text: 'One button: the modeled return path in red, an oxygen check against the reserve, and an alert to the habitat and Earth.' })
      }],
      [42000, () => {
        setEmergency(false)
        v()?.panTo(aheadYaw, -8, 3)
        setCaption({ title: 'PLAN ON THE MAP · WALK WITH THE HUD', text: 'RedSight: the same route and oxygen model drive the map and the helmet.' })
      }],
      [48000, () => setTour(false)],
    ]
    const ids = steps.map(([t, fn]) => window.setTimeout(fn, t))
    return () => {
      ids.forEach((id) => window.clearTimeout(id))
      setCaption(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour])

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
  const o2Low = spareL < 0.1 * T
  const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`)
  const turnWord = turn ? `${turn.angleDeg > 60 ? 'turn' : 'bear'} ${turn.dir}` : ''
  const nextLine = !turn
    ? `Straight on for ${km(habKm * 1000)}`
    : turn.distM > 400
      ? `Straight on for ${km(turn.distM)}, then ${turnWord}`
      : `${turnWord[0].toUpperCase()}${turnWord.slice(1)} in ${turn.distM} m`

  // Portal to <body>: panels with backdrop-filter/containment would otherwise trap the full-screen view.
  return createPortal(
    <div
      className="hud-root"
      data-emergency={emergency || undefined}
      data-details={details || undefined}
      role="dialog"
      aria-modal="true"
      aria-label={`360° view at ${stopName} with helmet HUD`}
    >
      <div ref={hostRef} className="hud-pano" />
      {status !== 'ready' && (
        <div className="hud-status">{status === 'error' ? 'Photo failed to load.' : 'LOADING NASA PHOTO…'}</div>
      )}
      <div className="hud-visor" aria-hidden />
      <div className="hud-reticle" aria-hidden />
      {caption && (
        <div className="hud-caption" key={caption.title} role="status">
          <b>{caption.title}</b>
          <span>{caption.text}</span>
        </div>
      )}
      {hint && !tour && status === 'ready' && (
        <div className="hud-hint" aria-hidden>
          Drag to look around · scroll to zoom · H = details
        </div>
      )}

      {/* Top left: what this is, where the photo is from, view options. */}
      <div className="hud-id hud-in">
        <div className="hud-kicker">
          <span className="hud-chip hud-sim">AR HELMET · SIMULATION</span>
        </div>
        <div className="hud-title">
          {pano.stopId} · {stopName}
          {sols && !standin ? <span className="hud-sub"> · sol {sols}</span> : null}
        </div>
        {standin ? (
          <div className="hud-photo-note" data-standin>
            <b>PHOTO STAND-IN</b> Curiosity, {STANDIN_PANORAMA.place} (not {pano.stopId})
          </div>
        ) : (
          <div className="hud-photo-note">
            <b>PHOTO TAKEN HERE</b> NASA {pano.pia}, Mastcam
          </div>
        )}
        <div className="hud-opts">
          <span className="hud-seg" role="group" aria-label="Route drawn on the ground">
            <button aria-pressed={leg === 'home'} onClick={() => setLeg('home')}>Way home</button>
            <button aria-pressed={leg === 'to'} onClick={() => setLeg('to')}>Walked</button>
          </span>
        </div>
      </div>

      {/* Top right: actions. */}
      <div className="hud-actions hud-in">
        <button className="hud-btn hud-tour" aria-pressed={tour} disabled={status !== 'ready'} onClick={() => setTour((t) => !t)}>
          {tour ? '■ Stop tour' : '▶ Demo tour'}
        </button>
        <button className="hud-btn" aria-pressed={details} onClick={() => setDetails((d) => !d)} title="Show or hide the instrument panels (H)">
          {details ? 'Hide details' : 'Details'}
        </button>
        <button className="hud-close" onClick={onClose} aria-label="Close 360 view">✕</button>
      </div>

      {/* Top centre: navigation card (heading tape, home arrow, next turn). */}
      <div className="hud-nav hud-in" data-emergency={emergency || undefined}>
        <div className="hud-tape" aria-hidden>
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
        </div>
        <div className="hud-nav-main">
          <span className="hud-nav-arrow" aria-hidden><span ref={navArrowRef}>➤</span></span>
          <div className="hud-nav-text">
            <div className="hud-nav-home">
              <b>Home {habKm.toFixed(2)} km</b>
              <span ref={navTurnRef} className="hud-nav-dir" />
            </div>
            <div className="hud-nav-next">{emergency ? `Red line · ${nextLine.toLowerCase()}` : nextLine}</div>
          </div>
        </div>
      </div>

      {/* Bottom: the key numbers, large, plain labels. */}
      <div className="hud-strip hud-in">
        <span className="hud-cell">
          <i>Oxygen left</i>
          <b className={o2Low ? 'hud-amber' : ''}>{pct(s.o2Left)}</b>
        </span>
        <span className="hud-cell">
          <i>Walk home</i>
          <b>{formatDuration(emergency ? emTimeS : homeS)}</b>
        </span>
        <span className="hud-cell">
          <i>Spare O₂ at home</i>
          <b className={o2Low ? 'hud-amber' : ''}>{pct(Math.max(0, emergency ? emMarginL : spareL))}</b>
        </span>
        <span className="hud-cell hud-cell-der">
          <i>Earth delay</i>
          <b>{earthMin} min</b>
        </span>
      </div>
      <div className="hud-foot">
        <span><span className="hud-chip hud-scn">SCENARIO</span> <em>oxygen and times </em>modeled</span>
        <span><span className="hud-chip hud-der">DERIVED</span> light-time</span>
        <span>
          <span className="hud-chip hud-obs">OBSERVED</span> <em>NASA </em>photo {active.pia}
          <span className="hud-foot-more">
            , {active.credit}
            {standin ? ' · sky and rover deck colour-filled (not photographed)' : ' · blurred areas not photographed '}
            {!standin && (
              <button className="hud-link" onClick={() => setGaps((g) => !g)}>{gaps ? 'fill gaps' : 'show gaps'}</button>
            )}
          </span>
        </span>
      </div>

      {!emergency && (
        <button className="hud-em-btn hud-in" onClick={startEmergency} aria-label="Emergency: return to habitat now">
          <span aria-hidden>⚠</span> EMERGENCY
        </button>
      )}

      {emergency && (
        <div className="hud-emergency" role="alert">
          <div className="hud-em-title">⚠ RETURN TO HABITAT NOW</div>
          <div className="hud-em-grid">
            <span>Return path (modeled)</span>
            <b>{formatDuration(emTimeS)}</b>
            <span>Oxygen needed</span>
            <b>{pct(emNeedL)}</b>
            <span>Oxygen left</span>
            <b>{pct(s.o2Left)}</b>
            <span>Spare at home</span>
            <b className={emMarginL < 0 ? 'hud-red' : ''}>{emMarginL < 0 ? 'INTO RESERVE' : pct(emMarginL)}</b>
          </div>
          <div className="hud-small">
            Follow the red line. Alert sent to the habitat and Earth. Modeled estimate (Scenario).
          </div>
          <button className="hud-em-cancel" onClick={() => setEmergency(false)}>
            Cancel emergency
          </button>
        </div>
      )}

      {/* DETAILS: instrument panels. */}
      <div hidden={!details} className="hud-left hud-glass hud-in">
        <div className="hud-label">SUIT OXYGEN</div>
        {s.members.map((l, i) => (
          <div key={i} className="hud-member">
            <span>{'AB'[i] ?? i + 1}</span>
            <span className="hud-mbar"><span style={{ width: pct(Math.max(0, l)) }} /></span>
            <b>{pct(Math.max(0, l))}</b>
          </div>
        ))}
        <div className="hud-row"><span>Lasts at walking pace</span><b>≈{formatDuration(s.minutesLeft * 60)}</b></div>
        <div className="hud-row"><span>Reserve (untouched)</span><b>{pct(tl.reserveL)}</b></div>
        <div className="hud-sep" />
        <div className="hud-small">
          T+{formatClock(tAt)} · {(s.distM / 1000).toFixed(2)} km walked · crew {tl.members.length} ·{' '}
          {routeMode === 'fastest' ? 'fastest' : 'lowest-hazard'} route
        </div>
      </div>

      <div hidden={!details} className="hud-right hud-glass hud-in">
        {arrive ? (
          <>
            <div className="hud-label">WAY HOME</div>
            <div className={`hud-ret ${tl.fastHome ? 'hud-amber' : ''}`}>{ret}</div>
            {tl.fastHome && <div className="hud-alert">O₂ LOW · SWITCHED AT T+{formatClock(tl.switchT ?? 0)}</div>}
            <div className="hud-row"><span>Oxygen it needs</span><b>{pct(s.homeL)} · {s.homeL.toFixed(0)} L</b></div>
          </>
        ) : (
          <>
            <div className="hud-label">OUT OF REACH</div>
            <div className="hud-ret hud-red">TURN-BACK BEFORE THIS STOP</div>
            <div className="hud-small">On this O₂ budget the modeled walk turns back at T+{formatClock(tAt)}. The photo shows what is there.</div>
          </>
        )}
        <div className="hud-sep" />
        <div className="hud-label">ENVIRONMENT · CURIOSITY <span className="hud-chip hud-obs">OBSERVED</span></div>
        {dose != null && (
          <div className="hud-row"><span>Walk dose (unshielded)</span><b>{dose < 10 ? dose.toFixed(3) : dose.toFixed(0)} {doseUnit}</b></div>
        )}
        {pressure && <div className="hud-row hud-dim"><span>Air pressure (year)</span><span>{String(pressure.value)} {pressure.unit}</span></div>}
        {airT && <div className="hud-row hud-dim"><span>Air temp (day)</span><span>{String(airT.value)} {airT.unit}</span></div>}
      </div>

      <div hidden={!details && !emergency} className="hud-cm hud-glass hud-in">
        <CommsPanel ref={commsRef} />
      </div>

      <div hidden={!details} className="hud-bl hud-glass hud-in">
        <div className="hud-label">LOG</div>
        <ul className="hud-log">
          {log.map((e, i) => (
            <li key={i} data-type={e.type}><b>T+{formatClock(e.t)}</b> {e.label}</li>
          ))}
        </ul>
        <div className="hud-progress">
          <span className="hud-progress-done" style={{ width: `${(tAt / tl.totalS) * 100}%` }} />
          {marks.map((m) => (
            <span key={m.label} className="hud-mark" data-low={m.label === 'SWITCH' || undefined} style={{ left: `${(m.t / tl.totalS) * 100}%`, color: m.c }}>
              <i style={{ background: m.c }} />
              {m.label}
            </span>
          ))}
        </div>
      </div>

      <div hidden={!details} className="hud-br hud-glass hud-in">
        <div className="hud-label">RADAR · FACING UP</div>
        <MiniMap svgRef={radarRef} frames={tl.frames} habitat={habitatLonLat} stop={stopLonLat} switchPt={tl.switchPoint} turnPt={tl.turnPoint} />
        <div className="hud-small">
          {standin
            ? 'Stand-in photo: route drawn on flat ground.'
            : `AR line from the route’s coordinates on Trek DEM ground; photo heading ≈${northDeg}° at centre (${pano.headingNote}; [ ] adjust).`}
        </div>
      </div>
    </div>,
    document.body,
  )
}
