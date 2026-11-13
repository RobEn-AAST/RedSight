/**
 * Spoken replies (TTS) — engine ladder, fastest-first (reworked 2026-11-13):
 *
 * 1. Groq cloud TTS (Orpheus) via the backend — high quality, key stays
 *    server-side; per-sentence requests synthesize in parallel.
 * 2. Browser speechSynthesis — zero download, starts in milliseconds.
 * 3. Kokoro-82M in-browser — explicit offline opt-in only (the ~80 MB model
 *    download is never sprung on the operator mid-call).
 *
 * Latency architecture (the voice loop must overlap its stages):
 * `ttsSpeakStream()` consumes LLM tokens as they arrive, cuts them into
 * sentence-sized chunks, synthesizes each chunk the moment it is complete
 * (parallel, in flight while the LLM keeps generating), and plays them in
 * order — first audio typically starts seconds before the reply finishes
 * streaming (sub-sentence chunking, the NEO/realtime-voice-agent pattern).
 */

import type { CopilotHealth } from '@/types/copilot'

export type TtsEngine = 'groq-cloud' | 'speech-synthesis' | 'kokoro' | 'unavailable'

export type TtsState = 'idle' | 'loading' | 'speaking'

type KokoroTts = {
  generate: (text: string, opts: { voice: string }) => Promise<{ toWav: () => Blob }>
}

let kokoro: KokoroTts | null = null
let kokoroFailed = false
let kokoroLoading: Promise<KokoroTts | null> | null = null
/** Explicit offline opt-in — never auto-loaded. */
let kokoroEnabled = localStorage.getItem('copilot-tts-kokoro') === 'on'

let health: CopilotHealth | null = null
let currentEngine: TtsEngine = 'unavailable'
/** The active streaming player (if any) — ttsStop() cancels it too. */
let activeStream: { stop: () => void } | null = null

export function setTtsHealth(h: CopilotHealth | null) {
  health = h
}

export function ttsStop() {
  activeStream?.stop()
  activeStream = null
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}

export function isKokoroEnabled() {
  return kokoroEnabled
}

/** Opt in/out of the offline HD voice (Kokoro). Loading starts eagerly on opt-in. */
export function setKokoroEnabled(on: boolean, onProgress?: (ready: boolean) => void) {
  kokoroEnabled = on
  localStorage.setItem('copilot-tts-kokoro', on ? 'on' : 'off')
  if (!on) {
    kokoroFailed = false
    return
  }
  void ensureKokoro().then((tts) => onProgress?.(Boolean(tts)))
}

async function ensureKokoro(): Promise<KokoroTts | null> {
  if (kokoro) return kokoro
  if (kokoroFailed) return null
  kokoroLoading ??= (async () => {
    try {
      const mod = await import('kokoro-js')
      const device = 'gpu' in navigator ? 'webgpu' : 'wasm'
      const tts = await mod.KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
        dtype: 'q8',
        device,
      })
      kokoro = tts as unknown as KokoroTts
      return kokoro
    } catch {
      kokoroFailed = true
      return null
    } finally {
      kokoroLoading = null
    }
  })()
  return kokoroLoading
}

function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_#>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/* --------------------------------------------------------- one-shot speak -- */

export async function cloudSynthesize(clean: string): Promise<Blob | null> {
  if (!health?.ttsConfigured) return null
  try {
    const res = await fetch('/api/copilot/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: clean.slice(0, 1000) }),
    })
    if (!res.ok) return null // terms/no-key/network → fall through
    const blob = await res.blob()
    return blob.size > 0 ? blob : null
  } catch {
    return null
  }
}

export function playBlobOnce(blob: Blob): { done: Promise<void>; stop: () => void } {
  const url = URL.createObjectURL(blob)
  const el = new Audio(url)
  let settle!: () => void
  const done = new Promise<void>((resolve) => {
    settle = resolve
  })
  el.onended = settle
  el.onerror = settle
  void el.play().catch(settle)
  return {
    done: done.finally(() => URL.revokeObjectURL(url)),
    stop: () => {
      el.onended = null
      el.onerror = null
      el.pause()
      URL.revokeObjectURL(url)
      settle()
    },
  }
}

export function speakWithSynthesis(text: string, onDone?: () => void): boolean {
  if (!('speechSynthesis' in window)) return false
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-US'
  u.rate = 1.05
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith('en'))
  if (voice) u.voice = voice
  u.onend = () => onDone?.()
  u.onerror = () => onDone?.()
  window.speechSynthesis.speak(u)
  return true
}

async function kokoroSynthesize(clean: string): Promise<Blob | null> {
  if (!kokoroEnabled) return null
  const engine = await ensureKokoro()
  if (!engine) return null
  try {
    const audio = await engine.generate(clean, { voice: 'af_heart' })
    return audio.toWav()
  } catch {
    return null
  }
}

/** Synthesize one chunk with the fastest available engine (parallel-safe). */
async function synthesizeChunk(clean: string): Promise<{ blob: Blob; engine: TtsEngine } | { browserText: string } | null> {
  const kokoroBlob = await kokoroSynthesize(clean)
  if (kokoroBlob) return { blob: kokoroBlob, engine: 'kokoro' }
  const cloudBlob = await cloudSynthesize(clean)
  if (cloudBlob) return { blob: cloudBlob, engine: 'groq-cloud' }
  if ('speechSynthesis' in window) return { browserText: clean }
  return null
}

/** Speak one utterance the simple way (replay button / non-streaming path). */
export async function ttsSpeak(
  text: string,
  onState?: (state: TtsState, engine: TtsEngine) => void,
): Promise<TtsEngine> {
  ttsStop()
  const clean = speakable(text)
  if (!clean) return 'unavailable'

  // Split into sentences anyway — first audio starts sooner even here.
  const stream = beginStream(onState)
  stream.push(clean)
  stream.end()
  return stream.firstAudio
}

/* ----------------------------------------------------- streaming speeches -- */

export interface StreamingSpeech {
  /** Feed more LLM tokens; sentences are cut and synthesized as they complete. */
  push(text: string): void
  /** No more text — flush the remainder and resolve `finished` after playback. */
  end(): void
  stop(): void
  /** Engine of the first audible chunk ('unavailable' if nothing could play). */
  firstAudio: Promise<TtsEngine>
  /** Resolves when end() has flushed and every queued chunk finished playing. */
  finished: Promise<void>
}

/** Long sentences hard-split at the last space before this bound. */
const CHUNK_CHAR_CAP = 180

function splitCompleteSentences(buffer: string): { chunks: string[]; rest: string } {
  const parts = buffer.split(/(?<=[.!?])\s+/)
  const chunks: string[] = []
  if (parts.length > 1) chunks.push(...parts.slice(0, -1))
  return { chunks, rest: parts.at(-1) ?? '' }
}

function capChunk(chunk: string): string[] {
  if (chunk.length <= CHUNK_CHAR_CAP) return [chunk]
  const out: string[] = []
  let s = chunk
  while (s.length > CHUNK_CHAR_CAP) {
    const cut = s.lastIndexOf(' ', CHUNK_CHAR_CAP)
    out.push(s.slice(0, cut > 40 ? cut : CHUNK_CHAR_CAP))
    s = s.slice(cut > 40 ? cut : CHUNK_CHAR_CAP)
  }
  if (s.trim()) out.push(s)
  return out
}

function beginStream(onState?: (state: TtsState, engine: TtsEngine) => void): StreamingSpeech {
  ttsStop()
  let buffer = ''
  let ended = false
  let stopped = false
  let firstEngine: TtsEngine | null = null
  let resolveFirst!: (e: TtsEngine) => void
  let resolveFinished!: () => void
  const firstAudio = new Promise<TtsEngine>((r) => (resolveFirst = r))
  const finished = new Promise<void>((r) => (resolveFinished = r))
  let playHead: Promise<void> = Promise.resolve()
  let anyChunk = false

  const stopPlayer = { current: null as null | (() => void) }
  const stream: StreamingSpeech = {
    push(text) {
      if (stopped || ended) return
      buffer += text
      const { chunks, rest } = splitCompleteSentences(buffer)
      buffer = rest
      // Overlong sentences are hard-split so first audio never waits for a
      // wall of text (sub-sentence chunking).
      for (const c of chunks.flatMap(capChunk)) enqueue(c)
    },
    end() {
      if (ended) return
      ended = true
      const tail = speakable(buffer)
      buffer = ''
      if (tail) enqueue(tail)
      if (!anyChunk) {
        // Nothing ever became audible (empty reply) — settle the promises.
        resolveFirst('unavailable')
        resolveFinished()
      }
      playHead.then(() => {
        if (!stopped) resolveFinished()
      })
    },
    stop() {
      if (stopped) return
      stopped = true
      stopPlayer.current?.()
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
      resolveFirst(firstEngine ?? 'unavailable')
      resolveFinished()
    },
    firstAudio,
    finished,
  }
  activeStream = stream

  function enqueue(raw: string) {
    const clean = speakable(raw)
    if (!clean || stopped) return
    anyChunk = true
    if (firstEngine === null) onState?.('loading', 'groq-cloud')
    // Synthesis starts NOW (parallel with LLM streaming + other chunks);
    // playback stays strictly ordered via the playHead chain.
    const job = synthesizeChunk(clean)
    playHead = playHead.then(async () => {
      if (stopped) return
      const result = await job
      if (stopped || !result) return
      if ('blob' in result) {
        if (firstEngine === null) {
          firstEngine = result.engine
          resolveFirst(result.engine)
        }
        onState?.('speaking', result.engine)
        const player = playBlobOnce(result.blob)
        stopPlayer.current = player.stop
        await player.done
        stopPlayer.current = null
      } else {
        if (firstEngine === null) {
          firstEngine = 'speech-synthesis'
          resolveFirst('speech-synthesis')
        }
        onState?.('speaking', 'speech-synthesis')
        await new Promise<void>((resolve) => {
          if (!speakWithSynthesis(result.browserText, resolve)) resolve()
        })
      }
    })
  }

  return stream
}

/**
 * Streaming speak: create with a state callback, push LLM tokens as they
 * arrive, end() when the reply completes. First audio starts while the LLM
 * is still generating.
 */
export function ttsSpeakStream(onState?: (state: TtsState, engine: TtsEngine) => void): StreamingSpeech {
  return beginStream(onState)
}

export function currentTtsEngine(): TtsEngine {
  return currentEngine
}
