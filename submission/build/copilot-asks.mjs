// Two astronaut voice prompts for the copilot slide (AI voice: Kokoro-82M, disclose in AI/SI).
// The copilot's REPLIES come from a real test of the live copilot (teammate), saved as
// out/copilot/reply-normal.(wav|mp3) and reply-emergency.(wav|mp3); deck.mjs embeds them when present.
import { KokoroTTS } from 'kokoro-js'
import { mkdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
const D = new URL('../out/copilot/', import.meta.url).pathname
await mkdir(D, { recursive: true })
export const ASKS = {
  normal: 'Copilot, how much oxygen do I have left?',
  emergency: 'Copilot, I fell. I think my leg is broken. I need help.',
}
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' })
for (const [k, text] of Object.entries(ASKS)) {
  const a = await tts.generate(text, { voice: 'am_michael', speed: k === 'emergency' ? 1.1 : 1.0 })
  await a.save(`${D}ask-${k}.wav`)
  // light "helmet radio" colour so it reads as an astronaut on comms
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${D}ask-${k}.wav`, '-af', 'highpass=f=250,lowpass=f=3800,acompressor,loudnorm=I=-16', '-b:a', '128k', `${D}ask-${k}.mp3`])
  console.log(k, execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `${D}ask-${k}.mp3`]).toString().trim(), 's')
}
