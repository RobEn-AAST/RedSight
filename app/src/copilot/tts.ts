/**
 * Spoken replies (TTS) — engine ladder, fastest-first (reworked 2026-11-13
 * after the first Kokoro load proved too slow for a live conversation):
 *
 * 1. Groq cloud TTS (Orpheus) via the backend — ~instant, high quality, key
 *    stays server-side. Unavailable (no key / terms not accepted / offline)
 *    → falls through automatically.
 * 2. Browser speechSynthesis — zero download, starts in milliseconds. The
 *    dependable default everywhere.
 * 3. Kokoro-82M in-browser — kept ONLY as the explicit offline path (the
 *    ~80 MB model download is never sprung on the operator mid-call; it
 *    loads only when enabled while online and cached for offline use).
 *
 * One utterance at a time; markdown stripped; every call cancellable.
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

let audioEl: HTMLAudioElement | null = null
let audioUrl: string | null = null
let currentEngine: TtsEngine = 'unavailable'
/** Latest health for engine selection, updated via setTtsHealth(). */
let health: CopilotHealth | null = null

export function setTtsHealth(h: CopilotHealth | null) {
  health = h
}

export function ttsStop() {
  if (audioEl) {
    audioEl.pause()
    audioEl.onended = null
    audioEl = null
  }
  if (audioUrl) {
    URL.revokeObjectURL(audioUrl)
    audioUrl = null
  }
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

/** Preload Kokoro in the background (called when idle, never on the hot path). */
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

async function cloudSpeak(clean: string, onState?: (s: TtsState, e: TtsEngine) => void): Promise<boolean> {
  try {
    onState?.('loading', 'groq-cloud')
    const res = await fetch('/api/copilot/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: clean.slice(0, 1000) }),
    })
    if (!res.ok) return false // terms/no-key/network → fall through
    const blob = await res.blob()
    if (blob.size === 0) return false
    audioUrl = URL.createObjectURL(blob)
    audioEl = new Audio(audioUrl)
    audioEl.onended = () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
      audioUrl = null
      audioEl = null
      onState?.('idle', 'groq-cloud')
    }
    onState?.('speaking', 'groq-cloud')
    await audioEl.play()
    return true
  } catch {
    ttsStop()
    return false
  }
}

function browserSpeak(clean: string, onState?: (s: TtsState, e: TtsEngine) => void): boolean {
  if (!('speechSynthesis' in window)) return false
  const u = new SpeechSynthesisUtterance(clean)
  u.lang = 'en-US'
  u.rate = 1.05
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith('en'))
  if (voice) u.voice = voice
  u.onend = () => onState?.('idle', 'speech-synthesis')
  u.onerror = () => onState?.('idle', 'speech-synthesis')
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(u)
  onState?.('speaking', 'speech-synthesis')
  return true
}

async function kokoroSpeak(clean: string, onState?: (s: TtsState, e: TtsEngine) => void): Promise<boolean> {
  if (!kokoroEnabled) return false
  const engine = await ensureKokoro()
  if (!engine) return false
  try {
    onState?.('loading', 'kokoro')
    const audio = await engine.generate(clean, { voice: 'af_heart' })
    audioUrl = URL.createObjectURL(audio.toWav())
    audioEl = new Audio(audioUrl)
    audioEl.onended = () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
      audioUrl = null
      audioEl = null
      onState?.('idle', 'kokoro')
    }
    onState?.('speaking', 'kokoro')
    await audioEl.play()
    return true
  } catch {
    ttsStop()
    return false
  }
}

/**
 * Speak one utterance (cancels whatever is playing). Resolves with the engine
 * actually used, and `onState('idle')` when playback finishes — the voice-call
 * loop chains its next listening turn on that signal.
 */
export async function ttsSpeak(
  text: string,
  onState?: (state: TtsState, engine: TtsEngine) => void,
): Promise<TtsEngine> {
  ttsStop()
  const clean = speakable(text)
  if (!clean) return 'unavailable'

  // Explicit offline opt-in beats everything (operator chose local HD voice).
  if (await kokoroSpeak(clean, onState)) return (currentEngine = 'kokoro')
  // Cloud when the backend offers it; browser voice otherwise — both fast.
  if (health?.ttsConfigured && (await cloudSpeak(clean, onState))) return (currentEngine = 'groq-cloud')
  if (browserSpeak(clean, onState)) return (currentEngine = 'speech-synthesis')
  onState?.('idle', 'unavailable')
  return (currentEngine = 'unavailable')
}

export function currentTtsEngine(): TtsEngine {
  return currentEngine
}
