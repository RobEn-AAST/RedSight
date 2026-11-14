import { memo, useEffect, useRef, useState } from 'react'
import { Hand, Pause, Play, RotateCcw } from 'lucide-react'
import type { AvatarController, AvatarState } from './astronautScene'

export const Astronaut = memo(function Astronaut({ state }: { state: AvatarState }) {
  const host = useRef<HTMLDivElement>(null)
  const controller = useRef<AvatarController | null>(null)
  const latestState = useRef(state)
  const [status, setStatus] = useState('Loading astronaut…')
  const [paused, setPaused] = useState(false)
  latestState.current = state

  useEffect(() => {
    let cancelled = false
    const abort = new AbortController()
    let release: (() => void) | undefined
    void import('./astronautScene').then(async ({ createAstronaut }) => {
      if (cancelled || !host.current) return
      const scene = await createAstronaut(host.current, abort.signal)
      if (cancelled) { scene.dispose(); return }
      controller.current = scene
      scene.setState(latestState.current)
      release = () => scene.dispose()
      setStatus('')
    }).catch(() => { if (!cancelled) setStatus('3D preview unavailable. Chat is ready below.') })
    return () => { cancelled = true; abort.abort(); release?.(); controller.current = null }
  }, [])

  useEffect(() => { controller.current?.setState(state) }, [state])
  useEffect(() => { controller.current?.setPaused(paused) }, [paused, status])

  return (
    <section className="relative flex shrink-0 items-center gap-3 border-b border-seam bg-inset/40 px-4" aria-label="Astronaut copilot">
      <div ref={host} className="h-40 w-32 shrink-0 overflow-hidden sm:h-44 sm:w-36" aria-hidden="true" />
      <div className="min-w-0 py-3">
        <p className="font-display text-sm font-semibold text-ink">Your mission companion</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-dim" role="status">
          {status || ({ idle: 'Ready when you are.', listening: 'Listening to you…', thinking: 'Working on your reply…', speaking: 'Speaking…' }[state])}
        </p>
        <div className="mt-3 flex flex-wrap gap-1">
          <button type="button" disabled={!!status} onClick={() => controller.current?.wave()} className="flex min-h-9 items-center gap-1.5 px-2 text-xs text-ink-dim hover:text-signal focus-visible:outline focus-visible:outline-signal disabled:opacity-40" aria-label="Wave to astronaut">
            <Hand size={14} aria-hidden /> Wave
          </button>
          <button type="button" disabled={!!status} onClick={() => setPaused((p) => !p)} className="flex min-h-9 items-center gap-1.5 px-2 text-xs text-ink-dim hover:text-signal focus-visible:outline focus-visible:outline-signal disabled:opacity-40" aria-label={paused ? 'Resume astronaut animation' : 'Pause astronaut animation'} aria-pressed={paused}>
            {paused ? <Play size={14} aria-hidden /> : <Pause size={14} aria-hidden />} {paused ? 'Resume' : 'Pause'}
          </button>
          <button type="button" disabled={!!status} onClick={() => controller.current?.resetView()} className="flex min-h-9 items-center px-2 text-ink-dim hover:text-signal focus-visible:outline focus-visible:outline-signal disabled:opacity-40" aria-label="Reset astronaut view" title="Reset view">
            <RotateCcw size={14} aria-hidden />
          </button>
        </div>
        <p className="mt-1 text-[10px] text-ink-faint">Drag to turn · tap to wave</p>
      </div>
    </section>
  )
})
