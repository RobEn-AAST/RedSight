/**
 * In-browser STT worker — whisper-tiny.en via transformers.js (ONNX).
 *
 * The offline/no-key fallback of voice-copilot-plan §3 row 3: English-only
 * tuned, ~40 MB q8 download cached by the browser, WASM on CPU with WebGPU
 * when available. Runs in a Worker so the console never blocks (the main-
 * thread stall is the documented failure mode of browser Whisper).
 */

type LoadProgress = { status: string; progress?: number; file?: string }

let transcriber: Awaited<ReturnType<typeof loadPipeline>> | null = null
let loadError: string | null = null

async function loadPipeline(onProgress: (p: LoadProgress) => void) {
  const { pipeline, env } = await import('@huggingface/transformers')
  // Model weights come from the HF hub; keep everything else same-origin.
  env.allowLocalModels = false
  const device = (typeof navigator !== 'undefined' && 'gpu' in navigator) ? 'webgpu' : 'wasm'
  return pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny.en', {
    dtype: 'q8',
    device,
    progress_callback: onProgress,
  })
}

self.onmessage = async (e: MessageEvent) => {
  const { type } = e.data

  if (type === 'load') {
    try {
      transcriber = await loadPipeline((p) => {
        if (p.status === 'progress' && typeof p.progress === 'number') {
          self.postMessage({ type: 'progress', progress: Math.round(p.progress), file: p.file })
        } else if (p.status === 'ready') {
          self.postMessage({ type: 'progress', progress: 100 })
        }
      })
      self.postMessage({ type: 'ready' })
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err)
      self.postMessage({ type: 'load-error', message: loadError })
    }
    return
  }

  if (type === 'transcribe') {
    if (!transcriber) {
      self.postMessage({ type: 'error', message: loadError ?? 'Model not loaded.' })
      return
    }
    try {
      const out = await transcriber(e.data.pcm as Float32Array, {
        chunk_length_s: 30,
        stride_length_s: 5,
      })
      const text = typeof out === 'string' ? out : (out?.text ?? '')
      self.postMessage({ type: 'result', text: text.trim() })
    } catch (err) {
      self.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }
}
