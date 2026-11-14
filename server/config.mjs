/**
 * Copilot backend config — keys and knobs, server-side only.
 *
 * Keys are read from the environment or `server/.env` (git-ignored; see
 * `.env.example`). They are NEVER exposed to the client: the health endpoint
 * reports only which provider is configured, never the key or its owner.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const serverDir = path.dirname(fileURLToPath(import.meta.url))

/** Minimal .env loader (KEY=VALUE lines, # comments). Real env wins. */
function loadDotEnv(file) {
  try {
    const raw = readFileSync(file, 'utf8')
    for (const line of raw.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq <= 0) continue
      const key = t.slice(0, eq).trim()
      let val = t.slice(eq + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (!(key in process.env)) process.env[key] = val
    }
  } catch {
    /* no .env — fine, keys may come from the real environment */
  }
}

loadDotEnv(path.join(serverDir, '.env'))

const env = (name, fallback = '') => process.env[name] ?? fallback

/** Dev origins of the Vite app + this server itself; extend via ALLOWED_ORIGINS. */
function allowedOrigins() {
  const extra = env('ALLOWED_ORIGINS')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean)
  const defaults = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:4173',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:4173',
  ]
  return new Set([...defaults, ...extra])
}

/** Provider priority per voice-copilot-plan §4: Groq first, Gemini second.
 *  Keys are prefix-checked so an unrelated same-named variable (e.g. some
 *  other tool's GEMINI_API_KEY) doesn't silently masquerade as a provider. */
function resolveProvider() {
  if (/^gsk_/.test(env('GROQ_API_KEY'))) return 'groq'
  if (/^AIza/.test(env('GEMINI_API_KEY'))) return 'gemini'
  return null
}

export const config = {
  port: Number(env('PORT', '8788')),
  host: env('HOST', '127.0.0.1'), // loopback by default; set 0.0.0.0 only behind a proxy
  /** Set TRUST_PROXY=1 only when a reverse proxy sets X-Real-IP (never when exposed directly). */
  trustProxy: env('TRUST_PROXY') === '1',
  allowedOrigins: allowedOrigins(),

  provider: resolveProvider(),
  groqApiKey: /^gsk_/.test(env('GROQ_API_KEY')) ? env('GROQ_API_KEY') : '',
  geminiApiKey: /^AIza/.test(env('GEMINI_API_KEY')) ? env('GEMINI_API_KEY') : '',

  /** Plan §4 verified IDs (2026-11-13). Defaults favor speed; override per env. */
  groqModel: env('GROQ_MODEL', 'openai/gpt-oss-120b'),
  /** Voice-call profile: smaller/faster model + tighter token cap — the call
   *  loop prizes time-to-first-audio over depth (text chat keeps groqModel). */
  groqVoiceModel: env('GROQ_VOICE_MODEL', 'openai/gpt-oss-20b'),
  voiceMaxTokens: 350,
  geminiModel: env('GEMINI_MODEL', 'gemini-3.6-flash'),
  /** Plan §3: cheapest dependable English STT (~216× real-time, WER ~12%). */
  sttModel: env('STT_MODEL', 'whisper-large-v3-turbo'),
  /** Cloud TTS (added 2026-11-13): Groq Orpheus — needs one-time terms
   *  acceptance in the Groq console; until then the client speaks with the
   *  browser voice (the endpoint returns 409 tts-terms-required). */
  ttsModel: env('TTS_MODEL', 'canopylabs/orpheus-v1-english'),
  ttsVoice: env('TTS_VOICE', 'tara'),
  maxTtsChars: 1000,
  /** Gemini-only: native Google Search grounding for general questions. */
  geminiWebSearch: env('GEMINI_WEB_SEARCH', 'true') === 'true',

  /** Safety limits — abuse and accidental-cost guards. */
  maxAudioBytes: 12 * 1024 * 1024,
  maxJsonBytes: 64 * 1024,
  maxMessageChars: 4000,
  maxHistoryMessages: 40,
  sessionIdleMs: 2 * 60 * 60 * 1000,
  sttUpstreamTimeoutMs: 60_000,
  llmUpstreamTimeoutMs: 120_000,
  /** Token bucket: cheap requests refill fast; each STT call costs 10. */
  rate: { capacity: 60, refillPerMinute: 60, sttCost: 10 },
  /** Server-side sampling per assistant-system-prompt.md enforcement note 3. */
  temperature: 0.3,
  maxTokens: 700,
  /** gpt-oss reasoning depth for TEXT turns ('low'|'medium'|'high'); voice is
   *  always 'low' (latency-first — measured 13s of hidden reasoning at medium). */
  textReasoningEffort: env('TEXT_REASONING_EFFORT', 'low'),
}

/** Banned honesty phrases (AGENTS rule 3) — checked post-generation. */
export const bannedPhrases = [
  'safe route',
  'safe time remaining',
  'certified',
  'flight-safe',
  'real-time',
  'validated',
]
