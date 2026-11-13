/**
 * Spoken replies (TTS) — added 2026-11-13 at the user's request; the plan had
 * deferred TTS (voice-copilot-plan §1 note).
 *
 * Engine ladder, best-first:
 * 1. Kokoro-82M in-browser via kokoro-js (Apache-2.0, q8 ≈ 80 MB, cached) —
 *    best lightweight English quality, ~5× real-time on CPU, WebGPU when
 *    available, fully local (nothing leaves the device).
 * 2. Browser speechSynthesis — zero download, instant, decent English on
 *    desktop Chrome/Edge; the honest fallback if the model can't load.
 *
 * One utterance at a time; markdown stripped before speech; every call is
 * cancellable so the operator can always interrupt.
 */

export type TtsEngine = 'kokoro' | 'speech-synthesis' | 'unavailable'

export type TtsState = 'idle' | 'loading' | 'speaking'

type KokoroTts = {
  generate: (text: string, opts: { voice: string }) => Promise<{ toWav: () => Blob }>
}

let kokoro: KokoroTts | null = null
let kokoroFailed = false
let loadingPromise: Promise<KokoroTts | null> | null = null

let audioEl: HTMLAudioElement | null = null
let audioUrl: string | null = null

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

/** Strip markdown/symbols that sound wrong when read aloud. */
function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_#>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function ensureKokoro(): Promise<KokoroTts | null> {
  if (kokoro) return kokoro
  if (kokoroFailed) return null
  loadingPromise ??= (async () => {
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
      loadingPromise = null
    }
  })()
  return loadingPromise
}

function speakWithSynthesis(text: string, onDone: () => void): boolean {
  if (!('speechSynthesis' in window)) return false
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-US'
  u.rate = 1.05
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith('en'))
  if (voice) u.voice = voice
  u.onend = onDone
  u.onerror = onDone
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(u)
  return true
}

/**
 * Speak one utterance (cancels whatever is playing). Reports which engine
 * was used so the UI can label it honestly.
 */
export async function ttsSpeak(
  text: string,
  onState?: (state: TtsState, engine: TtsEngine) => void,
): Promise<TtsEngine> {
  ttsStop()
  const clean = speakable(text)
  if (!clean) return 'unavailable'

  const engine = await ensureKokoro()
  if (engine) {
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
      return 'kokoro'
    } catch {
      ttsStop()
    }
  }

  onState?.('speaking', 'speech-synthesis')
  if (speakWithSynthesis(clean, () => onState?.('idle', 'speech-synthesis'))) {
    return 'speech-synthesis'
  }
  onState?.('idle', 'unavailable')
  return 'unavailable'
}
