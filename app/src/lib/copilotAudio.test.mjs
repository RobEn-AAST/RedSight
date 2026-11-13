import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { startMicRecording } from './copilotAudio.ts'

// Browser media APIs are replaced at the device boundary; capture lifecycle is real.
let released
beforeEach((t) => {
  released = false
  t.mock.method(navigator.mediaDevices ?? Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true, value: { getUserMedia() {} },
  }).mediaDevices, 'getUserMedia', async () => ({
    getTracks: () => [{ stop() { released = true } }],
  }))
  globalThis.MediaRecorder = class {
    static isTypeSupported() { return true }
    mimeType = 'audio/webm'
    state = 'inactive'
    start() { this.state = 'recording' }
    stop() {
      this.state = 'inactive'
      queueMicrotask(() => {
        this.ondataavailable({ data: new Blob(['recorded audio']) })
        this.onstop()
      })
    }
  }
})
afterEach(() => { delete globalThis.MediaRecorder })

test('stopping returns the recorded blob and releases the microphone', async () => {
  const mic = await startMicRecording()
  const audio = await mic.stop()
  assert.ok(audio?.blob instanceof Blob, 'stop must return captured audio')
  assert.equal(await audio.blob.text(), 'recorded audio')
  assert.equal(released, true)
})

test('overlapping stop calls share the completed recording', async () => {
  const mic = await startMicRecording()
  const first = mic.stop()
  const second = mic.stop()
  const [a, b] = await Promise.all([first, second])
  assert.ok(a?.blob instanceof Blob)
  assert.strictEqual(a, b)
})

test('stopping a cancelled recording rejects instead of returning undefined', async () => {
  const mic = await startMicRecording()
  mic.abort()
  assert.equal(released, true)
  await assert.rejects(async () => mic.stop(), /cancel/i)
})
