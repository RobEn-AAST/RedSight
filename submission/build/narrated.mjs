// Narrated walkthrough: Kokoro TTS voice + subtitles + feature labels + generated ambient bed.
// Usage: npm run narrated   → out/video/redsight-walkthrough.mp4 (+ .srt)
// The voice is AI-generated (Kokoro-82M, Apache-2.0): disclose it in the AI/SI section of the submission.
import { chromium } from 'playwright'
import { KokoroTTS } from 'kokoro-js'
import { mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import * as C from './narrated.config.mjs'

const OUT = new URL('../out/', import.meta.url).pathname
const V = `${OUT}narrated/`
const FONTS = new URL('../../app/node_modules/@fontsource/', import.meta.url).href
await mkdir(`${V}cards`, { recursive: true })
const run = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args])
const probe = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString())
const frames = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', f]).toString()) / 30

// 1. Voice: one WAV per scene.
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' })
const audio = []
for (const [i, s] of C.scenes.entries()) {
  const a = await tts.generate(s.say, { voice: C.voice, speed: C.voiceSpeed })
  const f = `${V}say${i}.wav`; await a.save(f); audio.push(probe(f))
}
const LEAD = 0.25, TAIL = 0.3
const durs = C.scenes.map((s, i) => Math.max(audio[i] + LEAD + TAIL, 2.5) + C.xfade)

// 2. Cards, labels and subtitles as PNGs.
const base = `
@font-face{font-family:Chakra;font-weight:700;src:url(${FONTS}chakra-petch/files/chakra-petch-latin-700-normal.woff2)}
@font-face{font-family:Chakra;font-weight:600;src:url(${FONTS}chakra-petch/files/chakra-petch-latin-600-normal.woff2)}
@font-face{font-family:Plex;font-weight:400;src:url(${FONTS}ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2)}
@font-face{font-family:Plex;font-weight:500;src:url(${FONTS}ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2)}
@font-face{font-family:Mono;font-weight:500;src:url(${FONTS}ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2)}
*{margin:0;box-sizing:border-box}html,body{width:1920px;height:1080px;background:transparent}
:root{--sig:#ffb224;--red:#e5484d;--ink:#eef1f5;--dim:#a6adbb;--void:#07090c}
.tag{font:500 20px Mono;letter-spacing:.14em;text-transform:uppercase;color:var(--sig)}`
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const bg = `${OUT}stills/hud.png`
const mark = `<svg width="72" height="72" viewBox="0 0 64 64"><circle cx="32" cy="32" r="17" fill="none" stroke="#e5484d" stroke-width="2.5"/><circle cx="32" cy="32" r="9" fill="none" stroke="#e5484d" stroke-width="1.5" opacity=".45"/><circle cx="32" cy="32" r="3.2" fill="#ffb224"/><path d="M32 32 L46 18" stroke="#ffb224" stroke-width="2" stroke-linecap="round"/></svg>`
const backdrop = `<div style="position:absolute;inset:-40px;background:url(file://${bg}) center/cover;filter:blur(14px) brightness(.38) saturate(1.1)"></div>
  <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(7,9,12,.92) 0%,rgba(7,9,12,.55) 60%,rgba(7,9,12,.3))"></div>`
const html = {
  title: () => `${backdrop}<div style="position:absolute;left:150px;top:270px">
    <div class="tag">Team ${esc(C.team)} · Cairo, Egypt · NASA Space Apps 2026</div>
    <div style="display:flex;align-items:center;gap:26px;margin-top:26px">${mark}<div style="font:700 120px Chakra;letter-spacing:.14em;color:var(--ink)">REDSIGHT</div></div>
    <div style="margin-top:26px;font:500 46px Plex;color:var(--ink)">A Marswalk planner for Gale crater, Mount Sharp</div>
    <div style="margin-top:40px;font:500 26px Mono;color:var(--sig)">Challenge · ${esc(C.challenge)}</div></div>`,
  end: () => `${backdrop}<div style="position:absolute;left:150px;top:250px">
    <div style="display:flex;align-items:center;gap:22px">${mark}<div style="font:700 76px Chakra;letter-spacing:.14em;color:var(--ink)">REDSIGHT</div></div>
    <div style="margin-top:30px;font:600 56px Chakra;color:var(--ink);line-height:1.2">Explore with purpose.<br><span style="color:var(--sig)">Know when to turn back.</span></div>
    <div style="margin-top:44px;font:500 34px Mono;color:var(--ink)">▶ ${esc(C.url)}</div>
    <div style="margin-top:12px;font:500 26px Mono;color:var(--dim)">${esc(C.repo)}</div>
    <div style="margin-top:34px;font:400 21px Plex;color:var(--dim);max-width:1500px">Team ${esc(C.team)} · screen recording of the working web app · all times and O₂ are modeled estimates (Scenario), not guarantees · data and imagery: NASA/JPL-Caltech, MSSS, USGS, ASU · narration voice generated with AI (Kokoro TTS)</div></div>`,
  label: (l) => `<div style="position:absolute;right:150px;bottom:200px;padding:16px 22px 18px;background:rgba(7,9,12,.88);border-right:5px solid var(--sig);text-align:right;box-shadow:0 8px 30px rgba(0,0,0,.45)">
    <div class="tag">${esc(l[0])}</div><div style="margin-top:6px;font:600 30px Chakra;color:var(--ink)">${esc(l[1])}</div></div>`,
  sub: (t) => `<div style="position:absolute;left:0;right:0;bottom:46px;display:flex;justify-content:center">
    <div style="max-width:1500px;padding:14px 30px;background:rgba(0,0,0,.72);border-radius:8px;font:500 38px Plex;line-height:1.3;color:#fff;text-align:center">${esc(t)}</div></div>`,
}
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
const render = async (body, path, transparent) => {
  const f = path.replace(/\.png$/, '.html')
  await writeFile(f, `<!doctype html><meta charset="utf-8"><style>${base}</style><body>${body}</body>`)
  await page.goto('file://' + f, { waitUntil: 'load' }); await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path, omitBackground: transparent })
}
for (const [i, s] of C.scenes.entries()) {
  if (s.card) await render(html[s.card](), `${V}cards/card${i}.png`, false)
  await render((s.label ? html.label(s.label) : '') + html.sub(s.say), `${V}cards/ovl${i}.png`, true)
}
await browser.close()

// 3. Video segments (picture + label + subtitle), each exactly durs[i].
const enc = ['-r', '30', '-c:v', 'libx264', '-crf', '16', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-an']
const real = []
for (const [i, s] of C.scenes.entries()) {
  const d = durs[i], out = `${V}seg${i}.mp4`
  if (s.card) {
    run(['-framerate', '30', '-loop', '1', '-t', String(d), '-i', `${V}cards/card${i}.png`, '-framerate', '30', '-loop', '1', '-t', String(d), '-i', `${V}cards/ovl${i}.png`,
      '-filter_complex', `[0:v]zoompan=z='1+0.03*on/(${d}*30)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=30[b];[1:v]format=rgba,fade=in:st=0.3:d=0.3:alpha=1[o];[b][o]overlay=0:0[v]`,
      '-map', '[v]', '-t', String(d), ...enc, out])
  } else {
    const per = d / s.shots.length
    const ins = s.shots.flatMap((sh) => ['-i', `${OUT}clips/${sh.clip}.mp4`])
    let fc = s.shots.map((sh, k) => `[${k}:v]trim=${sh.from}:${sh.to},setpts=(PTS-STARTPTS)/${((sh.to - sh.from) / per).toFixed(4)},fps=30,scale=1920:1080,trim=0:${per.toFixed(3)},setpts=PTS-STARTPTS[p${k}];`).join('')
    fc += s.shots.map((_, k) => `[p${k}]`).join('') + `concat=n=${s.shots.length}:v=1:a=0[pic];`
    fc += `[${s.shots.length}:v]format=rgba,fade=in:st=0.3:d=0.3:alpha=1[o];[pic][o]overlay=0:0[v]`
    run([...ins, '-framerate', '30', '-loop', '1', '-t', String(d), '-i', `${V}cards/ovl${i}.png`, '-filter_complex', fc, '-map', '[v]', '-t', String(d), ...enc, out])
  }
  real.push(frames(out))
}

// 4. Join with cross-fades.
let chain = C.scenes.map((_, i) => `[${i}:v]settb=1/30,setpts=PTS-STARTPTS[s${i}];`).join(''), last = '[s0]', t = 0
const starts = [0]
for (let i = 1; i < C.scenes.length; i++) {
  t += real[i - 1] - C.xfade; starts.push(t)
  const lbl = i === C.scenes.length - 1 ? '[vout]' : `[x${i}]`
  chain += `${last}[s${i}]xfade=transition=fade:duration=${C.xfade}:offset=${t.toFixed(3)}${lbl};`; last = lbl
}
const total = real.reduce((a, b) => a + b, 0) - C.xfade * (C.scenes.length - 1)
run([...C.scenes.flatMap((_, i) => ['-i', `${V}seg${i}.mp4`]), '-filter_complex', chain.slice(0, -1), '-map', '[vout]', ...enc, `${V}picture.mp4`])

// 5. Audio: voice lines at their scene starts + a soft generated ambient pad (original, no licence needed).
const pad = `aevalsrc='0.05*sin(2*PI*110*t)*(0.6+0.4*sin(2*PI*0.07*t))+0.04*sin(2*PI*164.81*t)*(0.6+0.4*sin(2*PI*0.05*t+1))+0.03*sin(2*PI*220*t)*(0.5+0.5*sin(2*PI*0.09*t+2))+0.02*sin(2*PI*329.63*t)':s=48000:d=${total.toFixed(2)}`
const vIns = C.scenes.flatMap((_, i) => ['-i', `${V}say${i}.wav`])
let af = C.scenes.map((_, i) => `[${i}:a]aresample=48000,pan=stereo|c0=c0|c1=c0,adelay=${Math.round((starts[i] + (i ? C.xfade : 0) + LEAD) * 1000)}:all=1[a${i}];`).join('')
af += `${C.scenes.map((_, i) => `[a${i}]`).join('')}amix=inputs=${C.scenes.length}:normalize=0,volume=1.6[voice];`
af += `[${C.scenes.length}:a]lowpass=f=900,aecho=0.8:0.7:120|240:0.3|0.2,volume=0.5,afade=in:d=2,afade=out:st=${(total - 2.5).toFixed(2)}:d=2.5[bed];`
af += `[voice][bed]amix=inputs=2:normalize=0,alimiter=limit=0.9,loudnorm=I=-16:TP=-1.5:LRA=11[aout]`
run([...vIns, '-f', 'lavfi', '-i', pad, '-filter_complex', af, '-map', '[aout]', '-t', total.toFixed(3), '-ar', '48000', `${V}audio.wav`])
await mkdir(`${OUT}video`, { recursive: true })
const final = `${OUT}video/redsight-walkthrough.mp4`
run(['-i', `${V}picture.mp4`, '-i', `${V}audio.wav`, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart',
  '-metadata', 'title=RedSight walkthrough (Team RobEn, NASA Space Apps 2026)', '-metadata', 'comment=Narration voice generated with AI (Kokoro-82M TTS). Screen recording of the working app.', final])

// 6. SRT.
const ts = (x) => { const ms = Math.max(0, Math.round(x * 1000)); const p = (n, w = 2) => String(n).padStart(w, '0')
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}` }
await writeFile(`${OUT}video/redsight-walkthrough.srt`, C.scenes.map((s, i) => {
  const a = starts[i] + (i ? C.xfade : 0) + LEAD
  return `${i + 1}\n${ts(a)} --> ${ts(a + audio[i])}\n${s.say}\n`
}).join('\n'))
console.log(`video ${final}  ${probe(final).toFixed(2)} s`)
