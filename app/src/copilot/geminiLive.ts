/**
 * Gemini Live voice call, lowest-latency path: the browser streams microphone PCM straight to Google over one
 * WebSocket, using a single-use token from our server (POST /api/copilot/live/token). The server locks the model,
 * system prompt, tools and voice-activity settings into that token; the API key never reaches the browser.
 *
 * Audio: 16 kHz mono PCM16 up (20 ms frames from an AudioWorklet), 24 kHz PCM16 down, scheduled gap-free on one
 * AudioContext. Barge-in: Google's VAD interrupts the model when the operator speaks; queued audio is dropped.
 * Tool calls are handed to `onToolCall`, whose result goes back as the function response.
 */

const WS_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained'

export type LiveStatus = 'connecting' | 'listening' | 'speaking' | 'thinking' | 'closed' | 'error'

export interface LiveHandlers {
  onStatus: (s: LiveStatus, detail?: string) => void
  /** Streaming transcripts: who, text delta, and whether that side's turn ended. */
  onTranscript: (who: 'operator' | 'copilot', delta: string, final: boolean) => void
  onToolCall: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>
}

// AudioWorklet: resample the mic to 16 kHz and post 20 ms PCM16 frames.
const WORKLET = `
class Pcm16 extends AudioWorkletProcessor {
  constructor() { super(); this.ratio = sampleRate / 16000; this.acc = 0; this.buf = new Int16Array(320); this.n = 0 }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (!ch) return true
    for (let i = 0; i < ch.length; i++) {
      this.acc += 1
      if (this.acc >= this.ratio) {
        this.acc -= this.ratio
        const s = Math.max(-1, Math.min(1, ch[i]))
        this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff
        if (this.n === this.buf.length) { this.port.postMessage(this.buf.buffer.slice(0)); this.n = 0 }
      }
    }
    return true
  }
}
registerProcessor('pcm16-capture', Pcm16)
`

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

function fromBase64Pcm16(b64: string): Float32Array {
  const bin = atob(b64)
  const n = bin.length >> 1
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8)
    if (v >= 0x8000) v -= 0x10000
    out[i] = v / 0x8000
  }
  return out
}

export class GeminiLiveCall {
  private ws: WebSocket | null = null
  private ctx: AudioContext | null = null
  private mic: MediaStream | null = null
  private node: AudioWorkletNode | null = null
  private playAt = 0
  private sources = new Set<AudioBufferSourceNode>()
  private closed = false
  private h: LiveHandlers

  constructor(handlers: LiveHandlers) {
    this.h = handlers
  }

  async start(token: string, model: string): Promise<void> {
    this.h.onStatus('connecting')
    // One context for capture and playback; the mic starts while the socket opens (parallel, not serial).
    this.ctx = new AudioContext({ latencyHint: 'interactive' })
    const micP = navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    const workletP = this.ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' })))
    const ws = new WebSocket(`${WS_URL}?access_token=${encodeURIComponent(token)}`)
    this.ws = ws
    const ready = new Promise<void>((resolve, reject) => {
      ws.onopen = () => ws.send(JSON.stringify({ setup: { model } }))
      ws.onerror = () => reject(new Error('Could not connect to Gemini Live.'))
      ws.onclose = (e) => {
        if (!this.closed) this.h.onStatus(e.code === 1000 ? 'closed' : 'error', e.reason || undefined)
        reject(new Error(e.reason || 'Gemini Live closed the connection.'))
        this.teardown()
      }
      ws.onmessage = (e) => void this.onMessage(e, resolve)
    })
    const [mic] = await Promise.all([micP, workletP, ready])
    if (this.closed) {
      mic.getTracks().forEach((t) => t.stop())
      return
    }
    this.mic = mic
    const src = this.ctx.createMediaStreamSource(mic)
    this.node = new AudioWorkletNode(this.ctx, 'pcm16-capture')
    this.node.port.onmessage = (ev: MessageEvent<ArrayBuffer>) => {
      if (this.ws?.readyState === WebSocket.OPEN)
        this.ws.send(JSON.stringify({ realtimeInput: { audio: { data: toBase64(ev.data), mimeType: 'audio/pcm;rate=16000' } } }))
    }
    src.connect(this.node)
    if (this.ctx.state === 'suspended') await this.ctx.resume()
    this.h.onStatus('listening')
  }

  /** Mission state changes made outside the call reach the model as context data (no reply forced). */
  sendContext(text: string): void {
    if (this.ws?.readyState === WebSocket.OPEN)
      this.ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: false } }))
  }

  stop(): void {
    this.closed = true
    try { this.ws?.close(1000) } catch { /* already closed */ }
    this.teardown()
    this.h.onStatus('closed')
  }

  private teardown() {
    this.flushPlayback()
    this.node?.disconnect()
    this.mic?.getTracks().forEach((t) => t.stop())
    void this.ctx?.close().catch(() => undefined)
    this.node = null
    this.mic = null
    this.ctx = null
  }

  private flushPlayback() {
    for (const s of this.sources) {
      try { s.stop() } catch { /* not started */ }
    }
    this.sources.clear()
    this.playAt = 0
  }

  private play(pcm: Float32Array) {
    const ctx = this.ctx
    if (!ctx) return
    const buf = ctx.createBuffer(1, pcm.length, 24000)
    buf.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    const at = Math.max(ctx.currentTime + 0.01, this.playAt)
    src.start(at)
    this.playAt = at + buf.duration
    this.sources.add(src)
    src.onended = () => {
      this.sources.delete(src)
      if (this.sources.size === 0 && !this.closed) this.h.onStatus('listening')
    }
  }

  private async onMessage(e: MessageEvent, ready: () => void) {
    const raw = typeof e.data === 'string' ? e.data : await (e.data as Blob).text()
    let m: Record<string, any>
    try { m = JSON.parse(raw) } catch { return }
    if (m.setupComplete) return ready()
    if (m.toolCall?.functionCalls) {
      this.h.onStatus('thinking')
      const responses = await Promise.all(
        (m.toolCall.functionCalls as { id: string; name: string; args?: Record<string, unknown> }[]).map(async (c) => {
          let result: Record<string, unknown>
          try { result = await this.h.onToolCall(c.name, c.args ?? {}) } catch (err) {
            result = { applied: false, error: err instanceof Error ? err.message : 'Command failed.' }
          }
          return { id: c.id, name: c.name, response: { result } }
        }),
      )
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ toolResponse: { functionResponses: responses } }))
      return
    }
    const sc = m.serverContent
    if (!sc) {
      if (m.goAway) this.h.onStatus('error', 'Gemini Live is ending the session; start a new call.')
      return
    }
    if (sc.interrupted) this.flushPlayback()
    if (sc.inputTranscription?.text) this.h.onTranscript('operator', sc.inputTranscription.text, false)
    for (const p of sc.modelTurn?.parts ?? []) {
      if (p.inlineData?.data && String(p.inlineData.mimeType ?? '').startsWith('audio/pcm')) {
        this.h.onStatus('speaking')
        this.play(fromBase64Pcm16(p.inlineData.data))
      }
    }
    if (sc.outputTranscription?.text) this.h.onTranscript('copilot', sc.outputTranscription.text, false)
    if (sc.turnComplete || sc.interrupted) this.h.onTranscript('copilot', '', true)
  }
}

export async function fetchLiveToken(context: unknown, sessionId: string): Promise<{ token: string; model: string }> {
  const res = await fetch('/api/copilot/live/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Copilot-Session': sessionId },
    body: JSON.stringify(context),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || !j.token) throw new Error(j.message ?? 'Could not start the Gemini Live call.')
  return j
}

export async function runLiveTool(
  name: string,
  args: Record<string, unknown>,
  context: unknown,
  sessionId: string,
): Promise<{ result: Record<string, unknown>; route?: unknown }> {
  const res = await fetch('/api/copilot/live/tool', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Copilot-Session': sessionId },
    body: JSON.stringify({ name, args, ...(context as object) }),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || !j.result) throw new Error(j.message ?? 'Tool call failed.')
  return j
}
