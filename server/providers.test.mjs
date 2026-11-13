import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { config } from './config.mjs'
import { ProviderError, streamChat } from './providers.mjs'

const originalProvider = config.provider
const originalFetch = globalThis.fetch
afterEach(() => {
  config.provider = originalProvider
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
