import { useEffect, useRef, useState } from 'react'

import { createPanoViewer } from '@/hud/panoViewer'
import type { StopPanorama } from '@/hud/panoramas'
import { distanceM, formatClock, formatDuration, sampleAt, type Timeline } from '@/replay/replay-core.js'
import '@/hud/hud.css'

/**
 * 360° view at a stop with a helmet-style HUD (Tier 2 prototype, demo-focus-plan §10). Owner: Marwan.
 * The photo is real (Observed). Every HUD number is the replay model's value at the moment of arrival
 * (Scenario): same timeline as Mission Replay and the turn-back slider, nothing computed separately.
 */
function bearingDeg(a: [number, number], b: [number, number]): number {
  const r = (d: number) => (d * Math.PI) / 180
  const y = Math.sin(r(b[0] - a[0])) * Math.cos(r(b[1]))
  const x = Math.cos(r(a[1])) * Math.sin(r(b[1])) - Math.sin(r(a[1])) * Math.cos(r(b[1])) * Math.cos(r(b[0] - a[0]))
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

export function StopHud({
  pano,
  stopName,
  sols,
  timeline,
  routeMode,
  stopLonLat,
  habitatLonLat,
  onClose,
}: {
  pano: StopPanorama
  stopName: string
  sols?: string
  timeline: Timeline
  routeMode: string
  stopLonLat: [number, number]
  habitatLonLat: [number, number]
  onClose: () => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    if (!hostRef.current) return
    const viewer = createPanoViewer(hostRef.current, `${import.meta.env.BASE_URL}${pano.url}`, {
      onReady: () => setStatus('ready'),
      onError: () => setStatus('error'),
    })
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      viewer.destroy()
    }
  }, [pano.url, onClose])

  const tl = timeline
  const arrive = tl.events.find((e) => e.type === 'arrive')
  const C = tl.tankL ?? tl.capacityL
  const pct = (l: number) => `${Math.round((l / C) * 100)}%`
  const s = arrive ? sampleAt(tl, arrive.t) : null
  const homeS = arrive ? tl.totalS - arrive.t : 0
  const spareL = s ? s.o2Left - tl.reserveL - s.homeL : 0
  const ret =
    routeMode === 'fastest'
      ? 'Fastest route back'
      : tl.fastHome
        ? 'Fastest way home (switched: O₂ low)'
        : 'Back the way you came (lowest hazard)'
  const habKm = distanceM(stopLonLat, habitatLonLat) / 1000
  const habBearing = bearingDeg(stopLonLat, habitatLonLat)

  return (
    <div className="hud-root" role="dialog" aria-modal="true" aria-label={`360° view at ${stopName} with HUD`}>
      <div ref={hostRef} className="hud-pano" />
      {status !== 'ready' && (
        <div className="hud-status">{status === 'error' ? 'Panorama failed to load.' : 'Loading NASA panorama…'}</div>
      )}

      <div className="hud-visor" aria-hidden />

      <div className="hud-top">
        <span className="hud-chip hud-obs">Observed</span>
        <span>
          {pano.stopId} · {stopName}
          {sols ? ` · sol ${sols}` : ''}
        </span>
        <button className="hud-close" onClick={onClose} aria-label="Close 360 view">
          ✕
        </button>
      </div>

      {s ? (
        <>
          <div className="hud-left">
            <div className="hud-label">O₂ on arrival</div>
            <div className="hud-big">{pct(s.o2Left)}</div>
            <div>
              {s.o2Left.toFixed(0)} L · ≈{formatDuration(s.minutesLeft * 60)} at walkback rate
            </div>
            <div className="hud-bar">
              <span className="hud-bar-res" style={{ width: pct(tl.reserveL) }} />
              <span
                className="hud-bar-fill"
                style={{ width: pct(Math.max(0, s.o2Left)) }}
                data-level={spareL < 0.1 * C ? 'tight' : 'ok'}
              />
            </div>
            <div className="hud-small">T+{formatClock(arrive!.t)} since leaving the habitat</div>
          </div>

          <div className="hud-right">
            <div className="hud-label">Way home</div>
            <div className="hud-mid">{ret}</div>
            <div>
              {formatDuration(homeS)} · needs {pct(s.homeL)} ({s.homeL.toFixed(0)} L)
            </div>
            <div>
              Spare above reserve after it: <b>{pct(Math.max(0, spareL))}</b>
            </div>
            <div className="hud-small">
              Habitat {habKm.toFixed(2)} km straight-line, bearing {habBearing.toFixed(0)}°
              {pano.northCalibrated ? '' : ' (photo not north-aligned yet)'}
            </div>
          </div>
        </>
      ) : (
        <div className="hud-right hud-warn">
          <div className="hud-label">Out of reach</div>
          <div className="hud-mid">This stop is past the modeled turn-back point on this O₂ budget.</div>
          <div>The photo is still shown so you know what is there.</div>
        </div>
      )}

      <div className="hud-bottom">
        <span className="hud-chip hud-scn">Scenario</span>
        <span>HUD numbers are modeled estimates, not measurements.</span>
        <span className="hud-credit">
          Photo: {pano.pia} · {pano.credit} · {pano.taken}. Real imagery exists only at stops: moving between
          stops is a jump.
        </span>
      </div>
    </div>
  )
}
