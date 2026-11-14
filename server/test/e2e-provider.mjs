/** Deterministic provider protocol fixture for browser/app integration checks.
 *  Run only with REDSIGHT_TEST_PROVIDER=1 and a fake gsk_* key. All non-Groq
 *  fetches (including the real FastAPI route request) pass through unchanged.
 */
if (process.env.REDSIGHT_TEST_PROVIDER !== '1') {
  throw new Error('Refusing to load the E2E provider fixture without REDSIGHT_TEST_PROVIDER=1')
}

const realFetch = globalThis.fetch
const groqEndpoint = 'https://api.groq.com/openai/v1/chat/completions'
const requestText = (messages) => [...messages].reverse().find((message) => message.role === 'user')?.content ?? ''

globalThis.fetch = async (input, options) => {
  const url = typeof input === 'string' ? input : input?.url
  if (url !== groqEndpoint) return realFetch(input, options)

  const request = JSON.parse(options.body)
  const toolResult = request.messages.find((message) => message.role === 'tool')
  let chunk
  if (!toolResult) {
    // Intentionally fixed to a real-cache D1 route for an end-to-end browser smoke.
    const call = {
      id: 'e2e-route-call',
      type: 'function',
      function: { name:'set_route_preference', arguments:JSON.stringify({mode:'fastest',destinationId:'D1',slopeCapDeg:15}) },
    }
    chunk = {choices:[{delta:{tool_calls:[{index:0,...call}]},finish_reason:'tool_calls'}]}
  } else {
    let outcome = {}
    try { outcome = JSON.parse(toolResult.content) } catch {}
    const content = outcome.applied
      ? `Applied the route returned by the app: ${outcome.route?.id ?? 'route result'}.`
      : `The app did not apply the route: ${outcome.error ?? 'no acknowledged result'}.`
    chunk = {choices:[{delta:{content},finish_reason:'stop'}]}
  }
  return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, {
    status:200,
    headers:{'content-type':'text/event-stream'},
  })
}
