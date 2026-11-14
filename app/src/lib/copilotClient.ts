/**
 * Copilot API client — the client knows ONLY these same-origin endpoints
 * (Vite proxies /api to the backend in dev; the backend serves the app in
 * production). No provider names, keys, or URLs live here.
 */

import type { CopilotHealth, CopilotRequestContext } from '@/types/copilot'

/** Stable per-tab session id (validated server-side: /^[A-Za-z0-9_-]{8,64}$/). */
export function copilotSessionId(): string {
  const key = 'copilot-session-id'
  let id = sessionStorage.getItem(key)
  if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
    id = crypto.randomUUID()
    sessionStorage.setItem(key, id)
  }
  return id
}

/** Health probe. null = backend unreachable (panel shows its degraded state). */
export async function copilotHealth(signal?: AbortSignal): Promise<CopilotHealth | null> {
  try {
    const res = await fetch('/api/copilot/health', { signal, headers: { 'X-Copilot-Session': copilotSessionId() } })
    if (!res.ok) return null
    return (await res.json()) as CopilotHealth
  } catch {
    return null
  }
}

/** Cloud STT (Groq whisper). Throws Error with a readable message on failure. */
export async function copilotTranscribe(
  audio: Blob,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch('/api/copilot/stt', {
    method: 'POST',
    headers: { 'Content-Type': audio.type || 'audio/webm', 'X-Copilot-Session': copilotSessionId() },
    body: audio,
    signal,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.message ?? 'Transcription failed.')
  return (body.text ?? '') as string
}

export async function copilotReset(): Promise<void> {
  await fetch('/api/copilot/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Copilot-Session': copilotSessionId() },
    body: JSON.stringify({ sessionId: copilotSessionId() }),
  }).catch(() => undefined)
}

export async function copilotActionResult(callId: string, result: Record<string, unknown>): Promise<void> {
  const res = await fetch('/api/copilot/action-result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Copilot-Session': copilotSessionId() },
    body: JSON.stringify({ callId, result }),
  })
  if (!res.ok) throw new Error('Action result was stale or not accepted by the copilot server.')
}

/** Server → client SSE event types for /api/copilot/chat. */
export type ChatStreamEvent =
  | { t: 'meta'; provider: string; model: string }
  | { t: 'token'; v: string }
  | { t: 'tool'; name: string; resultCount: number }
  | { t: 'action'; callId: string; name: string; args: Record<string, unknown>; route?: Record<string, unknown> }
  | { t: 'notice'; v: string }
  | { t: 'done' }
  | { t: 'error'; message: string }

/**
 * Streaming chat. Resolves when the stream ends (done or error event);
 * rejects only on transport failure before/while streaming. Cancel with the
 * AbortSignal — the server aborts its upstream call on disconnect.
 */
export async function copilotChatStream(
  message: string,
  context: CopilotRequestContext,
  onEvent: (ev: ChatStreamEvent) => void,
  signal?: AbortSignal,
  /** Voice-call turns use the server's faster small-model profile. */
  voice = false,
): Promise<void> {
  const res = await fetch('/api/copilot/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Copilot-Session': copilotSessionId() },
    body: JSON.stringify({ sessionId: copilotSessionId(), message, voice, ...context }),
    signal,
  })

  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message ?? `Copilot backend error (${res.status}).`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let sep
    while ((sep = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, sep)
      buf = buf.slice(sep + 2)
      const line = frame.split('\n').find((l) => l.startsWith('data:'))
      if (!line) continue // heartbeat comment or keepalive
      try {
        onEvent(JSON.parse(line.slice(5).trim()) as ChatStreamEvent)
      } catch {
        /* skip malformed frame */
      }
    }
  }
}
