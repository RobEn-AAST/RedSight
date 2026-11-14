import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { config } from './config.mjs'
import { ProviderError, streamChat } from './providers.mjs'

const originalProvider = config.provider
const originalKey = config.groqApiKey
const originalFetch = globalThis.fetch
afterEach(() => {
  config.provider = originalProvider
  config.groqApiKey = originalKey
  globalThis.fetch = originalFetch
})

const opts = (onEvent = () => {}, signal) => ({
  system: 'test', messages: [{ role: 'user', content: 'hello' }],
  runTool: async () => ({}), onEvent, signal,
})

for (const provider of ['groq', 'gemini']) {
  test(`${provider} recovers once from a connection failure before streaming`, async () => {
    config.provider = provider
    let attempts = 0
    globalThis.fetch = async () => {
      if (++attempts === 1) throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } })
      const chunk = provider === 'groq'
        ? { choices: [{ delta: { content: 'Hello' }, finish_reason: 'stop' }] }
        : { candidates: [{ content: { parts: [{ text: 'Hello' }] } }] }
      return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`)
    }
    const events = []
    assert.equal(await streamChat(opts((e) => events.push(e))), 'Hello')
    assert.deepEqual(events, [{ t: 'token', v: 'Hello' }])
    assert.equal(attempts, 2)
  })
}

test('persistent connection failure has an actionable, client-safe error', async () => {
  config.provider = 'groq'
  let attempts = 0
  globalThis.fetch = async () => {
    attempts++
    throw new TypeError('fetch failed: private detail')
  }
  await assert.rejects(streamChat(opts()), (error) => {
    assert.ok(error instanceof ProviderError)
    assert.match(error.message, /connect|connection/i)
    assert.doesNotMatch(error.message, /private detail/)
    return true
  })
  assert.equal(attempts, 2)
})

test('cancellation is propagated without a retry', async () => {
  config.provider = 'groq'
  const controller = new AbortController()
  let attempts = 0
  globalThis.fetch = async () => {
    attempts++
    controller.abort()
    throw controller.signal.reason
  }
  await assert.rejects(streamChat(opts(undefined, controller.signal)), { name: 'AbortError' })
  assert.equal(attempts, 1)
})

test('HTTP provider rejection is not retried', async () => {
  config.provider = 'groq'
  let attempts = 0
  globalThis.fetch = async () => {
    attempts++
    return new Response('{"error":{"message":"unauthorized"}}', { status: 401 })
  }
  await assert.rejects(streamChat(opts()), ProviderError)
  assert.equal(attempts, 1)
})

for (const provider of ['groq','gemini']) {
  test(`${provider} executes an app function and feeds its acknowledged result into the next model turn`, async () => {
    config.provider = provider
    const requests = []
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(options.body)
      requests.push(body)
      const first = requests.length === 1
      if (provider === 'groq') {
        const chunk = first
          ? {choices:[{delta:{tool_calls:[{index:0,id:'call-1',type:'function',function:{name:'set_mission',arguments:'{"crewCount":1}'}}]},finish_reason:'tool_calls'}]}
          : {choices:[{delta:{content:'Crew set to one.'},finish_reason:'stop'}]}
        return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`)
      }
      const chunk = first
        ? {candidates:[{content:{parts:[{functionCall:{name:'set_mission',args:{crewCount:1}}}]}}]}
        : {candidates:[{content:{parts:[{text:'Crew set to one.'}]}}]}
      return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`)
    }
    const calls = []
    const events = []
    const final = await streamChat({ ...opts((event) => events.push(event)), runTool:async (name,args) => {
      calls.push([name,args])
      return {applied:true,mission:{crewCount:1},status:'setup'}
    } })
    assert.equal(final,'Crew set to one.')
    assert.deepEqual(calls,[['set_mission',{crewCount:1}]])
    assert.ok(events.some((event) => event.t === 'tool' && event.result.applied === true))
    if (provider === 'groq') {
      const toolResult = requests[1].messages.find((m) => m.role === 'tool')
      assert.deepEqual(JSON.parse(toolResult.content),{applied:true,mission:{crewCount:1},status:'setup'})
      assert.ok(requests[0].tools.some((tool) => tool.function.name === 'set_mission'))
    } else {
      const toolResult = requests[1].contents.find((m) => m.parts?.[0]?.functionResponse)
      assert.equal(toolResult.parts[0].functionResponse.response.result.applied,true)
      assert.ok(requests[0].tools[0].functionDeclarations.some((tool) => tool.name === 'set_mission'))
    }
  })
}

test('set_mission_factors and the route weights are exposed to the model with ranges from factors.json', async () => {
  const { runTool } = await import('./providers.mjs')
  const sent = []
  config.provider = 'groq'
  config.groqApiKey = 'gsk_test'
  globalThis.fetch = async (_url, init) => {
    sent.push(JSON.parse(init.body))
    return new Response('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { status: 200 })
  }
  await streamChat(opts())
  const tools = Object.fromEntries(sent[0].tools.map((t) => [t.function.name, t.function]))
  const factors = tools.set_mission_factors.parameters.properties
  assert.deepEqual(Object.keys(factors).sort(), ['coldLimitK', 'daylightRequired', 'radiationBudgetMsv', 'sepEvent', 'startLocalHour', 'stopMinutes'])
  assert.equal(factors.radiationBudgetMsv.maximum, 5)
  assert.equal(tools.set_route_preference.parameters.properties.sandWeight.maximum, 3)
  assert.equal(tools.set_route_preference.parameters.properties.hazardWeight.maximum, 1)
  assert.deepEqual(await runTool('set_mission_factors', { sepEvent: true }), { clientAction: true, name: 'set_mission_factors', args: { sepEvent: true } })
})

test('mission controller and data queries are exposed as acknowledged app tools', async () => {
  const {runTool}=await import('./providers.mjs')
  assert.deepEqual(await runTool('mission_control',{op:'report_incident',kind:'injury',member:'A'}),{clientAction:true,name:'mission_control',args:{op:'report_incident',kind:'injury',member:'A'}})
  assert.deepEqual(await runTool('read_app_data',{section:'oxygen'}),{clientAction:true,name:'read_app_data',args:{section:'oxygen'}})
})
