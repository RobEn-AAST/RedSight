/**
 * Dictation hook — one mic button, two STT paths (voice-copilot-plan §3):
 * - cloud: Groq whisper-large-v3-turbo via the backend when a key is set —
 *   best English accuracy, no local compute;
 * - local: in-browser whisper-tiny.en worker when the backend is keyless —
 *   fully offline after the first model load, audio never leaves the device.
 * The transcript always lands in the editable composer (nothing sends on
 * voice alone).
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { copilotTranscribe } from '@/lib/copilotClient'
import { startMicRecording, type MicSession } from '@/lib/copilotAudio'
import type { CopilotHealth, DictationMode, DictationState } from '@/types/copilot'

export interface Dictation {
  state: DictationState
  mode: DictationMode
  elapsed: number
  modelProgress: number | null
  error: string | null
  toggle: () => void
  cancel: () => void
}

const MAX_SECONDS = 30 // hard cap per utterance — short clips, snappy turns

/* ------------------------------------------------------------ stt worker -- */

interface SttWorker {
  worker: Worker
  ready: Promise<true | null> // null = failed to load
}

/** Minimal shape of worker messages we wait on. */
interface WorkerMsg {
  type?: string
  [key: string]: unknown
}

let sttWorker: SttWorker | null = null

function onceMessage<T extends WorkerMsg>(worker: Worker, match: (data: WorkerMsg) => boolean): Promise<T> {
  return new Promise((resolve) => {
    const handler = (e: MessageEvent) => {
      const data = e.data as WorkerMsg
      if (match(data)) {
        worker.removeEventListener('message', handler)
        resolve(data as T)
      }
    }
    worker.addEventListener('message', handler)
  })
}

/** Lazily create + warm the local Whisper worker; resolves null on failure. */
function ensureSttWorker(onProgress: (p: number | null) => void): Promise<Worker | null> {
  if (sttWorker) return sttWorker.ready.then((ok) => (ok ? sttWorker!.worker : null))

  const worker = new Worker(new URL('./stt.worker.ts', import.meta.url), { type: 'module' })
  const handle: SttWorker = {
    worker,
    ready: new Promise<true | null>((resolve) => {
      const progressListener = (e: MessageEvent) => {
        if (e.data?.type === 'progress') onProgress(e.data.progress as number)
      }
      worker.addEventListener('message', progressListener)
      onceMessage<{ type: string }>(worker, (d) => d?.type === 'ready' || d?.type === 'load-error').then(
        (msg) => {
          worker.removeEventListener('message', progressListener)
          resolve(msg.type === 'ready' ? true : null)
        },
      )
      worker.onerror = () => {
        worker.removeEventListener('message', progressListener)
        resolve(null)
      }
      worker.postMessage({ type: 'load' })
    }),
  }
  sttWorker = handle
  return handle.ready.then((ok) => (ok ? handle.worker : null))
}

function transcribeWithWorker(worker: Worker, pcm: Float32Array): Promise<string> {
  const result = onceMessage<{ type: string; text?: string; message?: string }>(
    worker,
    (d) => d?.type === 'result' || d?.type === 'error',
  ).then((msg) => {
    if (msg.type === 'result') return (msg.text ?? '').trim()
    throw new Error(msg.message ?? 'Local transcription failed.')
  })
  worker.postMessage({ type: 'transcribe', pcm })
  return result
}

/* ------------------------------------------------------------------ hook --- */

export interface DictationOptions {
  /** Auto-stop recording after this much silence (call mode) — transcription
   *  starts the instant the operator pauses. Undefined = manual stop only. */
  autoStopOnSilenceMs?: number
}

export function useDictation(
  health: CopilotHealth | null,
  onTranscript: (text: string) => void,
  options?: DictationOptions,
): Dictation {
  const [state, setState] = useState<DictationState>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [modelProgress, setModelProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const micRef = useRef<MicSession | null>(null)
  const timerRef = useRef<number | null>(null)
  const cloudAbort = useRef<AbortController | null>(null)

  // Refs keep toggle() stable while health/transcript stay fresh (synced in
  // an effect — never assigned during render). Cloud STT when the server has
  // a key; otherwise the local Whisper worker (fully in-browser — works even
  // with the backend down).
  const healthRef = useRef(health)
  const transcriptRef = useRef(onTranscript)
  const modeRef = useRef<DictationMode>('local')
  const optsRef = useRef(options)
  const finishRef = useRef<() => void>(() => undefined)
  useEffect(() => {
    healthRef.current = health
    transcriptRef.current = onTranscript
    modeRef.current = health?.sttConfigured ? 'cloud' : 'local'
    optsRef.current = options
  }, [health, onTranscript, options])

  /** Cloud when the server has an STT key; local Whisper otherwise. */
  const mode: DictationMode = health?.sttConfigured ? 'cloud' : 'local'

  const stopTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }
  useEffect(() => stopTimer, [])

  const finish = useCallback(async () => {
    stopTimer()
    const mic = micRef.current
    micRef.current = null
    if (!mic) return
    setState('transcribing')
    try {
      const audio = await mic.stop()
      if (modeRef.current === 'cloud') {
        cloudAbort.current = new AbortController()
        const text = await copilotTranscribe(audio.blob, cloudAbort.current.signal)
        if (text) transcriptRef.current(text)
      } else if (audio.pcm) {
        const worker = await ensureSttWorker(setModelProgress)
        if (!worker) throw new Error('Local speech model unavailable — start the backend, or type.')
        const text = await transcribeWithWorker(worker, audio.pcm)
        if (text) transcriptRef.current(text)
      } else {
        throw new Error('No cloud key on the server and audio decode failed — type instead.')
      }
      setState('idle')
      setElapsed(0)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setState('error')
    }
  }, [])
  useEffect(() => {
    finishRef.current = finish
  }, [finish])

  const start = useCallback(async () => {
    setError(null)
    setElapsed(0)
    setState('requesting-permission')
    if (modeRef.current === 'local') {
      setState('loading-model')
      const worker = await ensureSttWorker(setModelProgress)
      if (!worker) {
        setError('Local speech model failed to load — start the backend for cloud STT, or type.')
        setState('error')
        return
      }
    }
    try {
      const opts = optsRef.current
      micRef.current = await startMicRecording(
        opts?.autoStopOnSilenceMs
          ? { silenceAutoStopMs: opts.autoStopOnSilenceMs, onAutoStop: () => void finishRef.current() }
          : {},
      )
      setState('recording')
      const startedAt = Date.now()
      stopTimer()
      timerRef.current = window.setInterval(() => {
        const s = Math.floor((Date.now() - startedAt) / 1000)
        setElapsed(s)
        if (s >= MAX_SECONDS) void finish()
      }, 250)
    } catch {
      setState('permission-denied')
      setError('Microphone permission denied — check browser settings, or type instead.')
    }
  }, [finish])

  const toggle = useCallback(() => {
    if (state === 'recording') void finish()
    else if (state === 'idle' || state === 'error' || state === 'permission-denied') void start()
  }, [state, finish, start])

  const cancel = useCallback(() => {
    stopTimer()
    micRef.current?.abort()
    micRef.current = null
    cloudAbort.current?.abort()
    setState('idle')
    setElapsed(0)
  }, [])

  return { state, mode, elapsed, modelProgress, error, toggle, cancel }
}
