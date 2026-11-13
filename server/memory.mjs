/**
 * Server-side conversation memory — one session per operator, kept in RAM.
 *
 * The client owns the session id (validated: /^[A-Za-z0-9_-]{8,64}$/); memory
 * never persists to disk and never includes keys. Sessions idle longer than
 * config.sessionIdleMs are swept. When history outgrows maxHistoryMessages
 * the middle is trimmed (anchor messages kept) — a rolling window, not a
 * summary, so nothing is ever paraphrased into a claim the model didn't say.
 */

import { config } from './config.mjs'

/** @type {Map<string, {messages: Array<{role: string, content: string}>, lastSeen: number}>} */
const sessions = new Map()

const sweeper = setInterval(() => {
  const now = Date.now()
  for (const [id, s] of sessions) {
    if (now - s.lastSeen > config.sessionIdleMs) sessions.delete(id)
  }
}, 10 * 60 * 1000)
sweeper.unref?.()

function session(id) {
  let s = sessions.get(id)
  if (!s) {
    s = { messages: [], lastSeen: Date.now() }
    sessions.set(id, s)
  }
  s.lastSeen = Date.now()
  return s
}

/** History for the provider call (fresh array — providers must not mutate). */
export function getHistory(id) {
  return session(id).messages.map((m) => ({ ...m }))
}

/** Append one turn; trims the window when the cap is hit. */
export function addMessage(id, role, content) {
  const s = session(id)
  s.messages.push({ role, content })
  if (s.messages.length > config.maxHistoryMessages) {
    const keepHead = 2 // conversation anchor (first exchange)
    const keepTail = config.maxHistoryMessages - keepHead - 4
    const trimmed = s.messages.slice(0, keepHead)
    if (keepTail > 0) trimmed.push(...s.messages.slice(-keepTail))
    trimmed.splice(
      keepHead,
      0,
      { role: 'user', content: '[system note: earlier conversation was trimmed for length]' },
    )
    s.messages = trimmed
  }
}

export function resetSession(id) {
  sessions.delete(id)
}
