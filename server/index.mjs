/**
 * RedSight copilot backend — one zero-dependency Node process (plan §6).
 *
 *   GET  /api/copilot/health  → which provider is configured (never the key)
 *   POST /api/copilot/stt     → audio in (≤12MB) → {text} via Groq Whisper
 *   POST /api/copilot/chat    → SSE stream: token | tool | notice | done | error
 *   POST /api/copilot/reset   → forget a session's server-side memory
 *
 * Security posture (plan §6 + assistant-system-prompt enforcement notes):
 * - Keys live only in server/.env / the environment; nothing key-shaped is
 *   ever echoed, logged, or sent to the client.
 * - CORS allowlist (dev origins + ALLOWED_ORIGINS); no open proxy.
 * - Per-IP token-bucket rate limit; STT costs extra tokens (cost guard).
 * - Body caps, session-id pattern check, message length caps, upstream
 *   timeouts, SSE heartbeat, abort passthrough on client disconnect.
 * - The system prompt is built here; the client cannot override it.
 * - Request bodies are never logged (privacy default). Access log lines carry
 *   method/path/status/duration only.
 *
 * Static mode: if ../app/dist exists it is served (single-process demo), with
 * a path-traversal guard and SPA fallback. In dev, run Vite separately —
 * vite.config.ts proxies /api here.
 */

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { config, bannedPhrases } from './config.mjs'
import { buildSystemPrompt } from './prompt.mjs'
import { getHistory, addMessage, resetSession } from './memory.mjs'
import { streamChat, runTool, ProviderError } from './providers.mjs'
import { searchToolSchema } from './search.mjs'

const serverDir = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(serverDir, '../app/dist')
const hasDist = existsSync(path.join(distDir, 'index.html'))

const SESSION_RE = /^[A-Za-z0-9_-]{8,64}$/
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
}

/* ------------------------------------------------------------- utilities -- */

function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' ? body : JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  })
  res.end(data)
}

function readBody(req, cap) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > cap) {
        reject(Object.assign(new Error('payload too large'), { statusCode: 413 }))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/* Rate limit: token bucket per IP. No shared state across processes needed. */
const buckets = new Map()
function rateCheck(ip, cost = 1) {
  const now = Date.now()
  let b = buckets.get(ip)
  if (!b || now - b.last > 10 * 60_000) b = { tokens: config.rate.capacity, last: now }
  const refill = ((now - b.last) / 60_000) * config.rate.refillPerMinute
  b.tokens = Math.min(config.rate.capacity, b.tokens + refill)
  b.last = now
  if (b.tokens < cost) {
    buckets.set(ip, b)
    return false
  }
  b.tokens -= cost
  buckets.set(ip, b)
  return true
}

function corsHeaders(req) {
  const origin = req.headers.origin
  if (origin && config.allowedOrigins.has(origin.replace(/\/$/, ''))) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Copilot-Session',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    }
  }
  return {}
}

function originAllowed(req) {
  const origin = req.headers.origin
  if (!origin) return true // same-origin navigation / non-browser client
  if (config.allowedOrigins.has(origin.replace(/\/$/, ''))) return true
  // Same-origin fetches (module scripts carry `crossorigin`, so they send an
  // Origin header even same-origin): allow when Origin host === Host header.
  try {
    const host = req.headers.host
    return Boolean(host) && new URL(origin).host === host
  } catch {
    return false
  }
}

/* ------------------------------------------------------------- endpoints -- */

function health() {
  return {
    ok: true,
    provider: config.provider,
    sttConfigured: Boolean(config.groqApiKey),
    model: config.provider === 'groq' ? config.groqModel : config.provider === 'gemini' ? config.geminiModel : null,
    webSearch: config.provider === 'gemini' && config.geminiWebSearch,
    tool: searchToolSchema.name,
  }
}

async function handleStt(req, res, ip) {
  if (!config.groqApiKey) {
    return send(res, 503, { error: 'stt-not-configured', message: 'No GROQ_API_KEY on the server — use local transcription.' })
  }
  if (!rateCheck(ip, config.rate.sttCost)) {
    return send(res, 429, { error: 'rate-limited', message: 'Too many transcription requests — wait a moment.' }, { 'Retry-After': '10' })
  }
  const audio = await readBody(req, config.maxAudioBytes)
  if (audio.length === 0) return send(res, 400, { error: 'empty-audio', message: 'Empty audio body.' })

  const contentType = String(req.headers['content-type'] || 'audio/webm')
  const fd = new FormData()
  fd.append('file', new Blob([audio], { type: contentType.split(';')[0] }), 'audio.webm')
  fd.append('model', config.sttModel)
  fd.append('response_format', 'json')
  fd.append('language', 'en') // English-only console (plan §1); pinned for accuracy
  fd.append('temperature', '0')

  try {
    const upstream = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.groqApiKey}` },
      body: fd,
      signal: AbortSignal.timeout(config.sttUpstreamTimeoutMs),
    })
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '')
      console.error(`[stt] upstream ${upstream.status}: ${detail.slice(0, 300)}`)
      const msg =
        upstream.status === 401 || upstream.status === 403
          ? 'The server-side Groq key was rejected — check server/.env.'
          : upstream.status === 413
            ? 'Audio clip too large — record a shorter utterance.'
            : 'Transcription service error — retry, or type instead.'
      return send(res, 502, { error: 'stt-upstream', message: msg })
    }
    const out = await upstream.json()
    send(res, 200, { text: (out.text ?? '').trim() })
  } catch (e) {
    if (e.name === 'TimeoutError') return send(res, 504, { error: 'stt-timeout', message: 'Transcription timed out — retry, or type.' })
    console.error(`[stt] ${e.message}`)
    send(res, 502, { error: 'stt-failed', message: 'Transcription failed — retry, or type instead.' })
  }
}

function sseWrite(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`)
}

async function handleChat(req, res, ip) {
  if (!config.provider) {
    return send(res, 503, { error: 'llm-not-configured', message: 'No GROQ_API_KEY or GEMINI_API_KEY in server/.env — replies unavailable.' })
  }
  if (!rateCheck(ip, 1)) {
    return send(res, 429, { error: 'rate-limited', message: 'Too many messages — wait a moment.' }, { 'Retry-After': '5' })
  }

  let body
  try {
    body = JSON.parse((await readBody(req, config.maxJsonBytes)).toString('utf8') || '{}')
  } catch {
    return send(res, 400, { error: 'bad-json', message: 'Request body is not valid JSON.' })
  }

  const sessionId = String(req.headers['x-copilot-session'] ?? body.sessionId ?? '')
  if (!SESSION_RE.test(sessionId)) return send(res, 400, { error: 'bad-session', message: 'Missing or malformed session id.' })

  const message = String(body.message ?? '').trim()
  if (!message) return send(res, 400, { error: 'empty-message', message: 'Empty message.' })
  if (message.length > config.maxMessageChars) {
    return send(res, 413, { error: 'message-too-long', message: `Message exceeds ${config.maxMessageChars} characters.` })
  }

  // Context blocks: data only, size-capped, injected server-side.
  let context = {}
  try {
    const raw = JSON.stringify({ missionState: body.missionState ?? null, availableData: body.availableData ?? [] })
    context = raw.length > 12_000 ? {} : { missionState: body.missionState ?? null, availableData: body.availableData ?? [] }
  } catch {
    context = {}
  }
  const system = buildSystemPrompt({
    missionState: context.missionState,
    availableData: Array.isArray(context.availableData) ? context.availableData.slice(0, 40) : [],
    webSearchActive: config.provider === 'gemini' && config.geminiWebSearch,
  })

  addMessage(sessionId, 'user', message)
  const history = getHistory(sessionId)

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    ...corsHeaders(req),
  })
  sseWrite(res, { t: 'meta', provider: config.provider, model: health().model })

  const abort = new AbortController()
  const timeout = AbortSignal.timeout(config.llmUpstreamTimeoutMs)
  const onUpstreamAbort = () => abort.abort()
  timeout.addEventListener('abort', onUpstreamAbort, { once: true })
  req.on('close', () => abort.abort())
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000)
  heartbeat.unref?.()

  let finalText = ''
  try {
    finalText =
      (await streamChat({
        system,
        messages: history,
        runTool,
        signal: AbortSignal.any?.([abort.signal, timeout]) ?? abort.signal,
        onEvent: (ev) => {
          if (ev.t === 'token') sseWrite(res, { t: 'token', v: ev.v })
          else if (ev.t === 'tool')
            sseWrite(res, { t: 'tool', name: ev.name, resultCount: ev.result?.matchCount ?? 0 })
        },
      })) ?? ''

    // Honesty filter (AGENTS rule 3): flag banned claims; the strict prompt is
    // the primary defense, this is the belt-and-suspenders detector. We flag
    // rather than regenerate — a voice loop must stay single-pass (see README).
    const hit = bannedPhrases.find((p) => finalText.toLowerCase().includes(p))
    if (hit) {
      console.error(`[chat] honesty-filter hit: "${hit}"`)
      sseWrite(res, { t: 'notice', v: `honesty-filter: reply flagged for "${hit}"` })
    }

    if (finalText) addMessage(sessionId, 'assistant', finalText)
    sseWrite(res, { t: 'done' })
  } catch (e) {
    const msg = e instanceof ProviderError ? e.message : 'Copilot provider error — retry in a moment.'
    if (!(e instanceof ProviderError)) console.error(`[chat] ${e.stack ?? e.message}`)
    sseWrite(res, { t: 'error', message: msg })
  } finally {
    clearInterval(heartbeat)
    timeout.removeEventListener('abort', onUpstreamAbort)
    res.end()
  }
}

async function handleReset(req, res) {
  let body = {}
  try {
    body = JSON.parse((await readBody(req, 4096)).toString('utf8') || '{}')
  } catch { /* treat as empty */ }
  const sessionId = String(req.headers['x-copilot-session'] ?? body.sessionId ?? '')
  if (!SESSION_RE.test(sessionId)) return send(res, 400, { error: 'bad-session' })
  resetSession(sessionId)
  send(res, 200, { ok: true })
}

/* ----------------------------------------------------------- static files -- */

async function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? 'index.html' : pathname.slice(1)
  const resolved = path.normalize(path.join(distDir, rel))
  if (!resolved.startsWith(distDir)) return send(res, 403, 'Forbidden')
  try {
    const info = await stat(resolved)
    const file = info.isDirectory() ? path.join(resolved, 'index.html') : resolved
    const data = await readFile(file)
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream',
      'Cache-Control': path.extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600',
    })
    res.end(data)
  } catch {
    if (path.extname(resolved) === '') {
      // SPA fallback
      try {
        const data = await readFile(path.join(distDir, 'index.html'))
        return send(res, 200, data, { 'Content-Type': MIME['.html'] })
      } catch { /* fall through */ }
    }
    send(res, 404, 'Not found')
  }
}

/* ---------------------------------------------------------------- server --- */

const server = createServer(async (req, res) => {
  const started = Date.now()
  const url = new URL(req.url, 'http://localhost')
  const ip = req.socket.remoteAddress ?? '?'
  const cors = corsHeaders(req)

  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors)
    return res.end()
  }
  if (!originAllowed(req)) return send(res, 403, { error: 'origin-not-allowed' })

  try {
    if (url.pathname === '/api/copilot/health' && req.method === 'GET') {
      send(res, 200, health(), cors)
    } else if (url.pathname === '/api/copilot/stt' && req.method === 'POST') {
      await handleStt(req, res, ip)
    } else if (url.pathname === '/api/copilot/chat' && req.method === 'POST') {
      await handleChat(req, res, ip)
    } else if (url.pathname === '/api/copilot/reset' && req.method === 'POST') {
      await handleReset(req, res)
    } else if (url.pathname.startsWith('/api/')) {
      send(res, 404, { error: 'not-found' })
    } else if (hasDist && req.method === 'GET') {
      await serveStatic(req, res, url.pathname)
    } else if (req.method === 'GET') {
      send(res, 200, {
        ok: true,
        hint: 'Copilot backend up. App not built (no app/dist) — run the Vite dev server, it proxies /api here.',
      })
    } else {
      send(res, 404, { error: 'not-found' })
    }
  } catch (e) {
    if (e.statusCode === 413) return send(res, 413, { error: 'payload-too-large', message: 'Body exceeds the size cap.' })
    console.error(`[http] ${req.method} ${url.pathname}: ${e.message}`)
    if (!res.headersSent) send(res, 500, { error: 'internal', message: 'Unexpected server error.' })
    else res.end()
  } finally {
    console.log(`${new Date().toISOString()} ${req.method} ${url.pathname} → ${res.statusCode} (${Date.now() - started}ms)`)
  }
})

server.listen(config.port, config.host, () => {
  console.log(`Copilot backend on http://${config.host}:${config.port}`)
  console.log(
    config.provider
      ? `Provider: ${config.provider} (${health().model}); STT: ${config.groqApiKey ? config.sttModel : 'not configured (local fallback)'}; knowledge records indexed.`
      : 'No provider key found — health reports not-configured; STT/chat return 503 until server/.env sets GROQ_API_KEY or GEMINI_API_KEY.',
  )
  if (hasDist) console.log('Serving app/dist (production mode).')
})
