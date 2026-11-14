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

import { readFileSync } from 'node:fs'

import { config } from './config.mjs'
import { searchToolSchema } from './search.mjs'

/** Factor ranges come from app/public/data/factors.json so the tool schema, UI and validation cannot drift. */
const factorDefs = (() => {
  try { return JSON.parse(readFileSync(new URL('../app/public/data/factors.json', import.meta.url), 'utf8')) } catch { return { factors: [] } }
})()
function factorToolProperties() {
  const props = {}
  for (const d of factorDefs.factors) {
    // Sand/hazard weights ride on set_route_preference (one app-changing command per turn); slope, load and goal have their own tools.
    if (['group', 'goal'].includes(d.type) || ['slope', 'sand', 'hazardBlend'].includes(d.id)) continue
    const text = `${d.label} (${d.unit ?? 'on/off'}). ${d.effect}`
    if (d.type === 'boolean') props[d.field] = { type: 'boolean', description: text }
    else if (d.type === 'nullableNumber') props[d.field] = { type: ['number', 'null'], minimum: d.min, maximum: d.max, description: `${text} null removes the limit.` }
    else props[d.field] = { type: 'number', minimum: d.min, maximum: d.max, description: text }
    if (d.requires) props[d.requires] = { type: 'boolean', description: 'Require the modeled EVA to fit inside daylight.' }
  }
  return props
}

const actionTools = [
  { name:'set_mission_factors', description:'Set Scenario mission factors from the operator situation: radiation dose budget (mSv), solar particle event scenario, EVA start hour and daylight requirement, cold limit (K), time at the stop. Only supplied fields change; values outside the ranges are rejected. Results appear as modeled checks, never as measurements.', parameters:{type:'object',properties:factorToolProperties()} },
  { name:'set_oxygen_budget', description:'Set the modeled usable oxygen budget in litres, within the active route budget; updates the turn-back slider.', parameters:{type:'object',properties:{litres:{type:'number',minimum:0}},required:['litres']} },
  { name:'set_mission_screen', description:'Open mission setup or confirm the configured mission and open routes.', parameters:{type:'object',properties:{screen:{type:'string',enum:['setup','routes']}},required:['screen']} },
  { name: 'set_mission', description: 'Change mission setup fields. Only supplied values change.', parameters: { type: 'object', properties: { crewCount:{type:'integer'}, bodyMassKg:{type:'number'}, loadKg:{type:'number'}, loadBasis:{type:'string',enum:['perAstronaut','total']}, sampleKgPerStop:{type:'number'}, roverAvailable:{type:'boolean'}, scienceGoalId:{type:'string'} } } },
  { name: 'select_destination', description: 'Select an available mission target by exact ID.', parameters: { type:'object', properties:{ id:{type:'string'} }, required:['id'] } },
  { name: 'set_route_preference', description: 'Calculate and select a new native-terrain route using fastest, lowest-modeled-hazard (safest), or balanced optimization. Optional destinationId selects an available observed stop. Optional slopeCapDeg is a hard cap no greater than 15. Optional sandWeight (0-3) raises the cost of THEMIS-derived loose ground for safest/balanced routes; optional hazardWeight (0-1) sets the hazard share in balanced routes.', parameters:{ type:'object', properties:{ mode:{type:'string',enum:['fastest','safest','balanced']}, destinationId:{type:'string',enum:['S1','S2','S3','D1','D2']}, slopeCapDeg:{type:'number',minimum:0,maximum:15}, sandWeight:{type:'number',minimum:0,maximum:3}, hazardWeight:{type:'number',minimum:0,maximum:1} }, required:['mode'] } },
  { name:'reset_route_constraints', description:'Clear the explicit mobility slope preference, restore the documented 15 degree Scenario ceiling and fastest mode, and calculate that route again.', parameters:{type:'object',properties:{}} },
  { name: 'set_layer', description: 'Toggle an available map layer by exact ID.', parameters:{ type:'object', properties:{ id:{type:'string'}, visible:{type:'boolean'} }, required:['id','visible'] } },
]
const toolSchemas = [searchToolSchema, ...actionTools]

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
const groqTools = toolSchemas.map((s) => ({ type: 'function', function: s }))

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
        tools: groqTools,
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

    // Every requested call receives a protocol result; the action runner limits mutations.
    convo.push({
      role: 'assistant',
      content: roundText || null,
      tool_calls: toolCalls.map((c) => ({
        id: c.id,
        type: 'function',
        function: { name: c.name, arguments: c.args || '{}' },
      })),
    })
    for (const call of toolCalls.filter(Boolean)) {
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
  }
  return text
}

/* ---------------------------------------------------------------- Gemini --- */

const geminiUrl = () =>
  `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:streamGenerateContent?alt=sse`

/** Gemini functionDeclarations use the proto Type enums (uppercase). */
function geminiToolSchema() {
  return {
    functionDeclarations: toolSchemas.map((s) => ({ name:s.name, description:s.description, parameters: geminiParameters(s.parameters) })),
  }
}

function geminiParameters(schema) {
  const types = { object:'OBJECT', string:'STRING', number:'NUMBER', integer:'INTEGER', boolean:'BOOLEAN' }
  return { ...schema, type:types[schema.type] || schema.type, properties:Object.fromEntries(Object.entries(schema.properties || {}).map(([k,v]) => [k,{...v,type:types[v.type] || v.type}])) }
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
  if (name === searchToolSchema.name) {
    const { searchMissionKnowledge } = await import('./search.mjs')
    const query = typeof args?.query === 'string' ? args.query.slice(0, 300) : ''
    if (!query) throw new Error('Missing query')
    const results = searchMissionKnowledge(query)
    return { query, matchCount: results.length, results }
  }
  if (actionTools.some((t) => t.name === name)) return { clientAction: true, name, args }
  throw new Error(`Unknown tool: ${name}`)
}
