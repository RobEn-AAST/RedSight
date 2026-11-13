/**
 * Mic capture + audio decoding for the copilot (voice-copilot-plan §2).
 *
 * One recording, two consumers:
 * - cloud path: the webm/opus Blob goes verbatim to /api/copilot/stt;
 * - local path: the same Blob is decoded + resampled to 16 kHz mono Float32
 *   PCM for the in-browser Whisper worker (Web Speech API is rejected per
 *   plan §3 — hidden cloud service, no cross-browser contract).
 */

export interface CapturedAudio {
  blob: Blob
  /** 16 kHz mono PCM for local STT (undefined if decode fails — cloud path only). */
  pcm?: Float32Array
}

/** A live recording session; `stop()` finishes capture and returns the audio. */
export interface MicSession {
  stop: () => Promise<CapturedAudio>
  /** Hard-cancel without producing audio (mic released either way). */
  abort: () => void
}

const TARGET_SAMPLE_RATE = 16_000

export async function startMicRecording(): Promise<MicSession> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
  })

  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) =>
    MediaRecorder.isTypeSupported(m),
  )
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
  const chunks: BlobPart[] = []
  recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)

  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve()
  })
  recorder.start()

  const release = () => stream.getTracks().forEach((t) => t.stop())

  return {
    stop: async () => {
      if (recorder.state !== 'inactive') recorder.stop()
      release()
      await stopped
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
      let pcm: Float32Array | undefined
      try {
        pcm = await decodeTo16kMono(blob)
      } catch {
        /* decode failure — cloud path still works */
      }
      return { blob, pcm }
    },
    abort: () => {
      if (recorder.state !== 'inactive') recorder.stop()
      release()
    },
  }
}

/** Decode any browser-audio Blob to 16 kHz mono Float32Array. */
async function decodeTo16kMono(blob: Blob): Promise<Float32Array> {
  const buf = await blob.arrayBuffer()
  const ctx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
  try {
    const decoded = await ctx.decodeAudioData(buf)
    const chCount = Math.min(decoded.numberOfChannels, 2)
    const mono = new Float32Array(decoded.length)
    for (let c = 0; c < chCount; c++) {
      const data = decoded.getChannelData(c)
      for (let i = 0; i < data.length; i++) mono[i] += data[i] / chCount
    }
    if (Math.abs(decoded.sampleRate - TARGET_SAMPLE_RATE) < 1) return mono

    // Resample via OfflineAudioContext (source rate → 16 kHz).
    const len = Math.ceil(mono.length * (TARGET_SAMPLE_RATE / decoded.sampleRate))
    const off = new OfflineAudioContext(1, len, TARGET_SAMPLE_RATE)
    const srcBuf = off.createBuffer(1, mono.length, decoded.sampleRate)
    srcBuf.getChannelData(0).set(mono)
    const src = off.createBufferSource()
    src.buffer = srcBuf
    src.connect(off.destination)
    src.start()
    const rendered = await off.startRendering()
    return rendered.getChannelData(0)
  } finally {
    void ctx.close()
  }
}
