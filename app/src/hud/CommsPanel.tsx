import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'

import { oneWayDelayS } from '@/hud/earthDelay'

/**
 * Messages to Earth with a light-time countdown (Tier 2 prototype). Owner: Marwan.
 * Delay = today's Earth–Mars distance ÷ speed of light (Derived, earthDelay.ts). A reply can't come back before
 * twice that. Not modeled (Unavailable): waiting for an orbiter relay pass, which in practice adds more time.
 * The habitat is on local radio (no light-time delay); radio coverage between ridges is not modeled.
 */

interface Msg {
  id: number
  text: string
  emergency: boolean
  elapsedS: number // simulated seconds since sending
}

export interface CommsHandle {
  send(text: string, emergency?: boolean): void
}

const PRESETS = ['Status: all OK', 'Arrived at the stop', 'Heading home now', 'Need assistance']

const mmss = (s: number) => {
  const v = Math.max(0, Math.ceil(s))
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`
}

export const CommsPanel = forwardRef<CommsHandle>(function CommsPanel(_props, ref) {
  const [delayS] = useState(() => oneWayDelayS(new Date()))
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [speed, setSpeed] = useState(1)

  useImperativeHandle(ref, () => ({
    send(text, emergency = false) {
      setMsgs((m) => [{ id: Date.now() + Math.random(), text, emergency, elapsedS: 0 }, ...m].slice(0, 4))
    },
  }))

  useEffect(() => {
    if (!msgs.some((m) => m.elapsedS < 2 * delayS)) return
    let last = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      const dt = ((now - last) / 1000) * speed
      last = now
      setMsgs((ms) => ms.map((m) => (m.elapsedS < 2 * delayS ? { ...m, elapsedS: m.elapsedS + dt } : m)))
    }, 250)
    return () => window.clearInterval(id)
  }, [msgs, speed, delayS])

  const send = (text: string) =>
    setMsgs((m) => [{ id: Date.now() + Math.random(), text, emergency: false, elapsedS: 0 }, ...m].slice(0, 4))

  return (
    <div className="hud-comms">
      <div className="hud-label">
        COMMS · EARTH DELAY {mmss(delayS)} ONE WAY
        <span className="hud-chip hud-der">DERIVED</span>
      </div>
      <div className="hud-presets">
        {PRESETS.map((p) => (
          <button key={p} onClick={() => send(p)}>
            {p}
          </button>
        ))}
      </div>
      <ul className="hud-msgs">
        {msgs.map((m) => {
          const toEarth = delayS - m.elapsedS
          const toReply = 2 * delayS - m.elapsedS
          return (
            <li key={m.id} data-emergency={m.emergency || undefined}>
              <div className="hud-msg-text">“{m.text}”</div>
              <div className="hud-row">
                <span>Habitat (local radio)</span>
                <b>delivered</b>
              </div>
              <div className="hud-row">
                <span>Reaches Earth</span>
                <b>{toEarth > 0 ? `in ${mmss(toEarth)}` : 'received'}</b>
              </div>
              <div className="hud-msg-bar">
                <span style={{ width: `${Math.min(100, (m.elapsedS / delayS) * 100)}%` }} />
              </div>
              <div className="hud-row">
                <span>Earliest reply</span>
                <b>{toReply > 0 ? `in ${mmss(toReply)}` : 'possible now'}</b>
              </div>
            </li>
          )
        })}
      </ul>
      <div className="hud-comms-foot">
        <button onClick={() => setSpeed((s) => (s === 1 ? 60 : 1))} aria-pressed={speed !== 1}>
          {speed === 1 ? 'Demo ×60' : 'Demo ×60 on'}
        </button>
        <span>
          Light time for today's Earth–Mars distance (JPL approximate orbits). Relay-pass waits not modeled.
        </span>
      </div>
    </div>
  )
})
