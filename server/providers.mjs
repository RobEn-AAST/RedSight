/**
 * LLM provider adapters — Groq (default) and Gemini (second path).
 *
 * Both expose one function: `streamChat({ system, messages, runTool, signal,
 * onEvent })` which runs a full completion, streaming tokens to `onEvent`
 * ({t:'token', v}), executing at most MAX_TOOL_ROUNDS tool calls through the
 * server-supplied `runTool` (the ONLY code that executes tools — the model
 * can merely request them), and resolving with the final text.
 *
 * Model IDs verified 2026-11-13 (voice-copilot-plan §4). Errors raise
 * ProviderError with a client-safe message; upstream detail stays in the log.
 */

import { config } from './config.mjs'
import { searchToolSchema } from './search.mjs'

const MAX_TOOL_ROUNDS = 2

export class ProviderError extends Error {
  constructor(publicMessage, detail) {
    super(publicMessage)
    this.name = 'ProviderError'
    this.detail = detail // server log only
  }
}

/** Read an SSE body and yield each `data:` JSON payload. */
async function* sseEvents(res) {
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let nl
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (payload === '[DONE]') return
        try {
          yield JSON.parse(payload)
        } catch {
          /* skip malformed keepalive lines */
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

async function assertOk(res, label) {
  if (res.ok) return
  let detail = `${res.status} ${res.statusText}`
  let msg = `${label} request failed (${res.status})`
  try {
    const body = await res.text()
    detail += ` — ${body.slice(0, 500)}`
    const err = JSON.parse(body)?.error?.message
    if (err) {
      if (/API key|unauthorized|permission/i.test(err)) msg = `${label}: the server-side API key was rejected — check server/.env`
      else if (/rate limit/i.test(err)) msg = `${label}: rate limited — wait a moment and retry`
      else if (/model/i.test(err) && /not found|decommission|unsupported/i.test(err)) msg = `${label}: model not available — check the *_MODEL env value`
    }
  } catch { /* non-JSON error body */ }
  throw new ProviderError(msg, detail)
}

/** Retry only connection failures before any response is streamed. Never
 * replay a partial reply, HTTP rejection, or operator cancellation. */
async function fetchProvider(url, options, label) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetch(url, options)
    } catch (error) {
      if (options.signal?.aborted || error.name === 'AbortError' || error.name === 'TimeoutError') throw error
      if (!(error instanceof TypeError) || !/fetch failed/i.test(error.message)) throw error
      if (attempt === 0) continue
      throw new ProviderError(
        `${label}: unable to connect after retrying — check the server internet connection and try again.`,
        error.cause?.code ?? error.name,
      )
    }
  }
}

/* ------------------------------------------------------------------ Groq --- */

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions'

/** Groq/OpenAI tool schema (same declaration, function-wrapper shape). */
const groqTool = { type: 'function', function: searchToolSchema }

async function groqStreamChat({ system, messages, runTool, signal, onEvent, voice = false }) {
  const convo = [{ role: 'system', content: system }, ...messages]
  let text = ''
  const model = voice ? config.groqVoiceModel : config.groqModel
  const maxTokens = voice ? config.voiceMaxTokens : config.maxTokens

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const res = await fetchProvider(GROQ_CHAT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.groqApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: convo,
        tools: [groqTool],
        tool_choice: 'auto',
        temperature: config.temperature,
        max_tokens: maxTokens,
        // gpt-oss models reason at "medium" by default — thousands of hidden
        // thinking tokens (measured: 13s before the first visible action on a
        // trivial lookup). Low effort + hidden format keeps voice turns snappy;
        // these answers quote context, they don't need deep deliberation.
        reasoning_effort: voice ? 'low' : config.textReasoningEffort,
        ...(voice && { reasoning_format: 'hidden' }),
        stream: true,
      }),
      signal,
    }, 'Groq')
    await assertOk(res, 'Groq')

    let roundText = ''
    /** @type {Array<{id: string, name: string, args: string}>} */
    const toolCalls = []
    let finish = null

    for await (const chunk of sseEvents(res)) {
      const choice = chunk.choices?.[0]
      if (!choice) continue
      const delta = choice.delta ?? {}
      if (delta.content) {
        roundText += delta.content
        onEvent({ t: 'token', v: delta.content })
      }
      for (const tc of delta.tool_calls ?? []) {
        const i = tc.index ?? 0
        toolCalls[i] ??= { id: tc.id ?? `call_${i}`, name: '', args: '' }
        if (tc.id) toolCalls[i].id = tc.id
        if (tc.function?.name) toolCalls[i].name += tc.function.name
        if (tc.function?.arguments) toolCalls[i].args += tc.function.arguments
      }
      if (choice.finish_reason) finish = choice.finish_reason
    }

    text = roundText || text
    if (finish !== 'tool_calls' || toolCalls.length === 0) return text

    // Execute at most the first requested call (plan §7: one tool per turn).
    const call = toolCalls[0]
    convo.push({
      role: 'assistant',
      content: roundText || null,
      tool_calls: toolCalls.map((c) => ({
        id: c.id,
        type: 'function',
        function: { name: c.name, arguments: c.args || '{}' },
      })),
    })
    let result
    try {
      const args = JSON.parse(call.args || '{}')
      result = await runTool(call.name, args)
    } catch (e) {
      result = { error: e.message }
    }
    onEvent({ t: 'tool', name: call.name, args: call.args, result })
    convo.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, 6000) })
  }
  return text
}

/* ---------------------------------------------------------------- Gemini --- */

const geminiUrl = () =>
  `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:streamGenerateContent?alt=sse`

/** Gemini functionDeclarations use the proto Type enums (uppercase). */
function geminiToolSchema() {
  return {
    functionDeclarations: [
      {
        name: searchToolSchema.name,
        description: searchToolSchema.description,
        parameters: {
          type: 'OBJECT',
          properties: { query: { type: 'STRING', description: 'search terms' } },
          required: ['query'],
        },
      },
    ],
  }
}

async function geminiStreamChat({ system, messages, runTool, signal, onEvent }) {
  const webSearch = config.geminiWebSearch
  const contents = []
  for (const m of messages) {
    if (m.role === 'tool') {
      // Our own tool results from an earlier turn — replay as system-framed user data.
      contents.push({ role: 'user', parts: [{ text: `[TOOL RESULT — system-injected] ${m.content}` }] })
    } else {
      contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })
    }
  }

  let text = ''
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const tools = [{ ...geminiToolSchema() }]
    if (webSearch) tools.push({ google_search: {} })

    const res = await fetchProvider(geminiUrl(), {
      method: 'POST',
      headers: { 'x-goog-api-key': config.geminiApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        tools,
        generationConfig: { temperature: config.temperature, maxOutputTokens: config.maxTokens },
      }),
      signal,
    }, 'Gemini')
    await assertOk(res, 'Gemini')

    let roundText = ''
    let call = null

    for await (const chunk of sseEvents(res)) {
      const parts = chunk.candidates?.[0]?.content?.parts ?? []
      for (const part of parts) {
        if (part.text) {
          roundText += part.text
          onEvent({ t: 'token', v: part.text })
        }
        if (part.functionCall && !call) call = part.functionCall
      }
    }

    text = roundText || text
    if (!call) return text

    contents.push({ role: 'model', parts: [{ functionCall: call }] })
    let result
    try {
      result = await runTool(call.name, call.args ?? {})
    } catch (e) {
      result = { error: e.message }
    }
    onEvent({ t: 'tool', name: call.name, args: JSON.stringify(call.args ?? {}), result })
    contents.push({
      role: 'user',
      parts: [{ functionResponse: { name: call.name, response: { result } } }],
    })
  }
  return text
}

/* ----------------------------------------------------------------- select -- */

export function streamChat(opts) {
  if (config.provider === 'groq') return groqStreamChat(opts)
  if (config.provider === 'gemini') return geminiStreamChat(opts)
  throw new ProviderError('No provider configured — set GROQ_API_KEY or GEMINI_API_KEY in server/.env', 'no provider')
}

/** Map a tool request to the one wired executor; unknown tools are refused. */
export async function runTool(name, args) {
  if (name !== searchToolSchema.name) throw new Error(`Unknown tool: ${name}`)
  const { searchMissionKnowledge } = await import('./search.mjs')
  const query = typeof args?.query === 'string' ? args.query.slice(0, 300) : ''
  if (!query) throw new Error('Missing query')
  const results = searchMissionKnowledge(query)
  return { query, matchCount: results.length, results }
}
