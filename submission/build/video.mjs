// Builds the ≤ 30 s demo video from out/clips + rendered caption cards. Usage: npm run video
// Output: out/video/redsight-demo.mp4 (1920x1080, 30 fps, H.264, silent AAC track) + .srt sidecar.
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { segments, xfade, team, url, challenge } from './video.config.mjs'

const OUT = new URL('../out/', import.meta.url).pathname
const V = `${OUT}video/`
const FONTS = new URL('../../app/node_modules/@fontsource/', import.meta.url).href
await mkdir(`${V}cards`, { recursive: true })

const base = `
@font-face{font-family:Chakra;font-weight:700;src:url(${FONTS}chakra-petch/files/chakra-petch-latin-700-normal.woff2)}
@font-face{font-family:Chakra;font-weight:600;src:url(${FONTS}chakra-petch/files/chakra-petch-latin-600-normal.woff2)}
@font-face{font-family:Plex;font-weight:400;src:url(${FONTS}ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2)}
@font-face{font-family:Plex;font-weight:500;src:url(${FONTS}ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2)}
@font-face{font-family:Mono;font-weight:500;src:url(${FONTS}ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2)}
*{margin:0;box-sizing:border-box}html,body{width:1920px;height:1080px;background:transparent}
:root{--sig:#ffb224;--red:#e5484d;--ink:#eef1f5;--dim:#a6adbb;--void:#07090c}
.tag{font:500 22px Mono;letter-spacing:.14em;text-transform:uppercase;color:var(--sig)}
`
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const mark = `<svg width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" fill="#0b0e13"/><circle cx="32" cy="32" r="17" fill="none" stroke="#e5484d" stroke-width="2.5"/><circle cx="32" cy="32" r="9" fill="none" stroke="#e5484d" stroke-width="1.5" opacity=".45"/><circle cx="32" cy="32" r="3.2" fill="#ffb224"/><path d="M32 32 L46 18" stroke="#ffb224" stroke-width="2" stroke-linecap="round"/></svg>`

const cardHtml = {
  title: () => `<div style="position:absolute;inset:0;background:radial-gradient(1200px 700px at 30% 40%,rgba(229,72,77,.18),transparent 70%),var(--void)"></div>
    <div style="position:absolute;left:150px;top:300px;right:150px">
      <div style="display:flex;align-items:center;gap:28px">${mark}<div style="font:700 112px Chakra;letter-spacing:.16em;color:var(--ink)">REDSIGHT</div></div>
      <div style="margin-top:34px;font:500 52px Plex;color:var(--ink);line-height:1.2">Plan a science walk on Mars.<br><span style="color:var(--sig)">Know when to turn back.</span></div>
      <div style="margin-top:56px" class="tag">NASA Space Apps 2026 · ${esc(challenge)}</div>
      <div style="margin-top:14px;font:400 28px Plex;color:var(--dim)">Team ${esc(team)} · Gale crater, Mars</div>
    </div>`,
  end: () => `<div style="position:absolute;inset:0;background:radial-gradient(1200px 700px at 70% 60%,rgba(255,178,36,.12),transparent 70%),var(--void)"></div>
    <div style="position:absolute;left:150px;top:290px;right:150px">
      <div style="font:600 64px Chakra;color:var(--ink);line-height:1.25">Explore with purpose.<br>Know when to turn back.<br><span style="color:var(--sig)">Know what the map can support.</span></div>
      <div style="margin-top:56px;font:500 36px Mono;color:var(--ink)">${esc(url)}</div>
      <div style="margin-top:22px;font:400 24px Plex;color:var(--dim)">REDSIGHT · Team ${esc(team)} · screen recording of the working web app · data: NASA/JPL-Caltech, USGS, ASU</div>
    </div>`,
}
const capHtml = (c) => {
  const pos = c.pos === 'tl' ? 'top:120px' : 'bottom:56px'
  return `<div style="position:absolute;left:44px;${pos};max-width:1240px;padding:26px 34px 28px;background:rgba(7,9,12,.9);border-left:6px solid var(--sig);box-shadow:0 10px 40px rgba(0,0,0,.5)">
    <div class="tag">${esc(c.tag)}</div>
    <div style="margin-top:10px;font:600 50px Chakra;color:var(--ink);line-height:1.12">${esc(c.head)}</div>
    <div style="margin-top:12px;font:400 27px Plex;color:#c9ced8;line-height:1.3">${esc(c.sub)}</div></div>`
}

// 1. Render cards and caption overlays.
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
const render = async (html, path, transparent) => {
  const f = path.replace(/\.png$/, '.html')
  await writeFile(f, `<!doctype html><meta charset="utf-8"><style>${base}</style><body>${html}</body>`)
  await page.goto('file://' + f, { waitUntil: 'load' })
  await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].map((x) => x.status) })
  await page.screenshot({ path, omitBackground: transparent })
}
for (const [i, s] of segments.entries()) {
  if (s.card) await render(cardHtml[s.card](), `${V}cards/${i}.png`, false)
  else await render(capHtml(s.cap), `${V}cards/${i}.png`, true)
}
await browser.close()

// 2. One normalized segment file per entry.
const durs = []
const probeDur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', f]).toString()) / 30
for (const [i, s] of segments.entries()) {
  const out = `${V}seg${i}.mp4`
  const common = ['-r', '30', '-c:v', 'libx264', '-crf', '15', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-an']
  if (s.card) {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-loop', '1', '-t', String(s.dur), '-i', `${V}cards/${i}.png`,
      '-vf', `scale=1920:1080,zoompan=z='1+0.02*on/(${s.dur}*30)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=30`,
      ...common, out])
    durs.push(probeDur(out))
  } else {
    const d = (s.to - s.from) / s.speed
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${OUT}clips/${s.clip}.mp4`, '-loop', '1', '-i', `${V}cards/${i}.png`,
      '-filter_complex',
      `[0:v]trim=${s.from}:${s.to},setpts=(PTS-STARTPTS)/${s.speed},fps=30,scale=1920:1080[v];` +
      `[1:v]format=rgba,trim=0:${d},setpts=PTS-STARTPTS,fade=in:st=0.25:d=0.3:alpha=1[c];[v][c]overlay=0:0:shortest=1[o]`,
      '-map', '[o]', '-t', String(d), ...common, out])
    durs.push(probeDur(out))
  }
}

// 3. Cross-fade the segments together, add a silent audio track.
const inputs = segments.flatMap((_, i) => ['-i', `${V}seg${i}.mp4`])
let chain = segments.map((_, i) => `[${i}:v]settb=1/30,setpts=PTS-STARTPTS[s${i}];`).join('')
let last = '[s0]', t = 0
for (let i = 1; i < segments.length; i++) {
  t += durs[i - 1] - xfade
  const lbl = i === segments.length - 1 ? '[vout]' : `[x${i}]`
  chain += `${last}[s${i}]xfade=transition=fade:duration=${xfade}:offset=${t.toFixed(3)}${lbl};`
  last = lbl
}
const total = durs.reduce((a, b) => a + b, 0) - xfade * (segments.length - 1)
const final = `${V}redsight-demo.mp4`
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
  '-filter_complex', chain.slice(0, -1), '-map', '[vout]', '-map', `${segments.length}:a`, '-t', total.toFixed(3),
  '-c:v', 'libx264', '-crf', '17', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '96k', final])

// 4. SRT sidecar with the same caption text (for YouTube captions / accessibility).
const ts = (x) => { const ms = Math.round(x * 1000); const h = String(Math.floor(ms / 3600000)).padStart(2, '0')
  const m = String(Math.floor(ms / 60000) % 60).padStart(2, '0'); const s = String(Math.floor(ms / 1000) % 60).padStart(2, '0')
  return `${h}:${m}:${s},${String(ms % 1000).padStart(3, '0')}` }
let srt = '', start = 0, n = 1
for (const [i, s] of segments.entries()) {
  const text = s.card === 'title' ? `RedSight: plan a science walk on Mars. Know when to turn back.\nNASA Space Apps 2026 · ${challenge} · Team ${team}`
    : s.card === 'end' ? `Explore with purpose. Know when to turn back. Know what the map can support.\n${url}`
    : `${s.cap.head}\n${s.cap.sub}`
  srt += `${n++}\n${ts(start + (i ? xfade : 0))} --> ${ts(start + durs[i] - (i < segments.length - 1 ? xfade : 0))}\n${text}\n\n`
  start += durs[i] - xfade
}
await writeFile(`${V}redsight-demo.srt`, srt)
const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', final]).toString().trim()
console.log(`video ${final}  ${Number(probe).toFixed(2)} s  ${Number(probe) <= 30 ? 'OK (≤ 30 s)' : 'TOO LONG'}`)
