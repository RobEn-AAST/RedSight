// Simple, editable 7-slide deck (native text + animated GIFs) for PowerPoint / Google Slides / Canva.
// One layout spec → (1) out/deck/redsight-deck.pptx, (2) out/deck/preview/slide-N.png (same boxes, for visual QA).
// Usage: npm run deck. Wording rules: AGENTS rule 3 + docs/submission/demo-production-plan.md §5.
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
const pptxgen = createRequire(import.meta.url)('pptxgenjs')

const OUT = new URL('../out/', import.meta.url).pathname
const D = `${OUT}deck/`
await mkdir(`${D}gif`, { recursive: true }); await mkdir(`${D}still`, { recursive: true }); await mkdir(`${D}preview`, { recursive: true })
const ff = (a) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a])

// ---- palette + type (Arial: ships with PowerPoint, Google Slides and Canva) ----
// Theme = the landing page (mars.roben.club): void background, rust accent, Syne display, IBM Plex text.
// All three are Google Fonts, so Google Slides renders them as designed.
const BG = '070A12', INK = 'E9E4DA', BODY = 'C9C5BD', MUTED = '9BA3B4', ACC = 'E0653A', ACC2 = 'F0854F', CARD = '141A28', OK = '6FBF8F'
const FONTS = { display: 'Syne', body: 'IBM Plex Sans', mono: 'IBM Plex Mono' }
const FONT = FONTS.body

// ---- GIFs: clip range, speed; still frame (clip seconds) for the preview ----
const GIFS = {
  overview: { clip: 'overview', from: 0.4, to: 5.9, speed: 1.1, still: 5.6 },
  map: { clip: 'map', from: 0.6, to: 20.5, speed: 1.5, still: 9.5 },
  routes: { clip: 'routes', from: 0.4, to: 10.0, speed: 1.2, still: 9.6 },
  decision: { clip: 'decision', from: 0.6, to: 6.9, speed: 1, still: 6.6 },
  replay: { clip: 'replay', from: 1.5, to: 34.5, speed: 2.6, still: 17 },
  sources: { clip: 'sources', from: 0.4, to: 4.7, speed: 0.8, img: 'sources-inspector' },
  hud: { clip: 'hud', from: 0.2, to: 22.0, speed: 2.2, img: 'hud-details' },
}
for (const [n, g] of Object.entries(GIFS)) {
  const still = `${D}still/${n}.png`
  g.img ? ff(['-i', `${OUT}stills/${g.img}.png`, '-vf', 'scale=1920:1080', still]) : ff(['-ss', String(g.still), '-i', `${OUT}clips/${g.clip}.mp4`, '-frames:v', '1', still])
  const out = `${D}gif/${n}.gif`
  const make = (w, fps, colors) => ff(['-ss', String(g.from), '-to', String(g.to), '-i', `${OUT}clips/${g.clip}.mp4`, '-vf',
    `setpts=PTS/${g.speed},fps=${fps},scale=${w}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle`, out])
  const size = () => Number(execFileSync('stat', ['-f', '%z', out]))
  make(1024, 10, 160)
  if (size() > 6e6) make(900, 9, 128)
  if (size() > 6e6) make(800, 8, 96)
}

// ---- layout spec (inches, 10 × 5.625) ----
const W = 10, H = 5.625
const title = (t) => ({ t: 'text', x: 0.5, y: 0.35, w: 9, h: 0.6, text: t, size: 24, bold: true, color: INK, font: 'display' })
const footer = (n) => [
  { t: 'text', x: 0.5, y: 5.2, w: 7.5, h: 0.25, text: 'REDSIGHT · TEAM ROBEN · NASA SPACE APPS 2026 · IMAGERY NASA/JPL-CALTECH/UARIZONA/MSSS/USGS', size: 8, color: MUTED, font: 'mono', spacing: 1 },
  { t: 'text', x: 8.5, y: 5.2, w: 1, h: 0.25, text: `0${n} / 07`, size: 8, color: MUTED, align: 'right', font: 'mono', spacing: 1 },
]
const gif = (name, x = 0.5, y = 1.1, w = 5.2) => ({ t: 'gif', name, x, y, w, h: w * 9 / 16 })
const caption = (text, x = 0.5, y = 4.07, w = 5.2) => ({ t: 'text', x, y, w, h: 0.28, text, size: 11, color: MUTED })
const head = (text, y, x = 5.95, w = 3.55) => ({ t: 'text', x, y, w, h: 0.25, text, size: 9, bold: true, color: ACC, font: 'mono', spacing: 2 })
// rows: [[bold lead, rest]] as one text box, one paragraph per row
const rows = (items, y = 1.1, h = 3.9, x = 5.95, w = 3.55, size = 12) => ({ t: 'rows', x, y, w, h, items, size })
// stat cards in a row: [[number, label]]
const stats = (items, x = 0.5, y = 4.45, w = 5.2, h = 0.62) => {
  const gap = 0.1, cw = (w - gap * (items.length - 1)) / items.length
  return items.flatMap(([n, l], i) => [{ t: 'card', x: x + i * (cw + gap), y, w: cw, h },
    { t: 'text', x: x + i * (cw + gap) + 0.1, y: y + 0.06, w: cw - 0.2, h: 0.3, text: n, size: 15, bold: true, color: INK, font: 'display' },
    { t: 'text', x: x + i * (cw + gap) + 0.1, y: y + 0.36, w: cw - 0.2, h: 0.22, text: l, size: 9, color: MUTED }])
}
const note = (text) => ({ t: 'notes', text })
const COPD = `${OUT}copilot/`
const COP = (n) => `${COPD}${n}.mp3`
const replyOf = (k, fallback) => { try { return 'Copilot: ' + readFileSync(`${COPD}reply-${k}.txt`, 'utf8').trim() } catch { return fallback } }
const REPLY = {
  normal: replyOf('normal', 'Copilot answers from the plan: O₂ left, minutes to the turn-back point, and minutes home.'),
  emergency: replyOf('emergency', 'Copilot holds you at your position, raises the alarm, sends the rover to you and shows the fastest way home. (Rover motion is illustrative.)'),
}

const slides = [
  // 1 · Title (full-bleed NASA photo, darkened on the left; built from app/public/pano/PIA26696.jpg)
  [
    { t: 'image', path: new URL('../assets/title-boxwork.jpg', import.meta.url).pathname, x: 0, y: 0, w: W, h: H },
    { t: 'text', x: 0.6, y: 0.75, w: 8, h: 0.25, text: 'NASA SPACE APPS 2026 · INTERPLANETARY SURVIVAL GUIDE: MARTIAN MAP', size: 9, color: MUTED, font: 'mono', spacing: 2 },
    { t: 'text', x: 0.55, y: 1.05, w: 8.5, h: 1.25, runs: [['RED', INK], ['SIGHT', ACC]], size: 72, bold: true, font: 'display' },
    { t: 'text', x: 0.6, y: 2.45, w: 7, h: 0.45, runs: [['See the Red Planet ', INK], ['before', ACC], [' you step on it.', INK]], size: 22, bold: true, font: 'display' },
    { t: 'text', x: 0.6, y: 3.05, w: 5.2, h: 0.6, text: 'Plan a science walk on Mars, on real NASA terrain, and know when to turn back.', size: 13, color: BODY },
    { t: 'text', x: 0.6, y: 3.85, w: 5.2, h: 0.25, text: 'TEAM ROBEN · CAIRO', size: 9, bold: true, color: ACC, font: 'mono', spacing: 2 },
    { t: 'text', x: 0.6, y: 4.12, w: 5.2, h: 0.3, text: 'mars.roben.club', size: 14, bold: true, color: INK, font: 'mono' },
    { t: 'text', x: 0.6, y: 5.15, w: 6, h: 0.25, text: 'BOXWORK RIDGE, MOUNT SHARP · NASA/JPL-CALTECH/MSSS PIA26696', size: 8, color: MUTED, font: 'mono', spacing: 1 },
    note('RedSight plans a science walk on foot near Curiosity, on the boxwork ridges of Mount Sharp, and shows when the crew must turn back. Try it at mars.roben.club/demo; no sign-in.'),
  ],
  // 2 · Problem
  [title('The problem: one walk, one oxygen tank'), gif('overview'), caption('From the crater region down to one walk'),
    rows([['Maps show regions. ', 'Mars maps cover kilometres; a walk on foot needs metres.'],
      ['One tank. ', '385 L of usable O₂ per suit. A 25 % reserve is kept and never planned.'],
      ['No help from Earth. ', 'A signal takes up to ~22 min one way, so the crew decides on site.'],
      ['Why this site. ', 'Boxwork ridges on Mount Sharp: veins left by ancient groundwater, where Curiosity drives today.']]),
    ...stats([['22 min', 'max signal delay'], ['385 L', 'usable O₂ per suit'], ['15°', 'slope limit on foot'], ['2', 'crew, buddy rule']]),
    note('Sources: EMU Data Book (0.55 kg usable O₂ = 385 L), NASA DRA 5.0 buddy rule. The 15° limit and the 25 % reserve are team assumptions (Scenario).'), ...footer(2)],
  // 3 · Data
  [title('NASA data on one walk-scale map'), gif('map'), caption('Each layer switched on in the live app'),
    head('6 LAYERS + CURIOSITY’S PATH', 1.1),
    rows([['HiRISE optical ', '(Observed): 0.25 m/px base image'],
      ['Hillshade + slope ', '(Derived): from the ~1 m HiRISE elevation model; slope drives routing'],
      ['THEMIS ', '(Derived): thermal inertia, a loose-sand hint'],
      ['CRISM ', '(Derived): mineral hints from scene FRT000058A3'],
      ['Geology ', '(Derived): USGS geologic map SIM 3292'],
      ['Curiosity path ', '(Observed): the rover’s real drive and stops']], 1.4, 3.65),
    { t: 'text', x: 0.5, y: 4.45, w: 5.2, h: 0.6, text: 'THEMIS, CRISM and geology are context for the science goal; they are not used as route costs.', size: 11, color: BODY },
    note('Every layer opens a source card with its URL and date. Elevation: NASA/JPL Mars Trek Gale DEM from the PDS HiRISE DTM.'), ...footer(3)],
  // 4 · Plan
  [title('Plan the walk: two modeled routes'), gif('routes'), caption('Fastest vs lowest hazard, with the climb profile'),
    head('HOW A ROUTE IS MADE', 1.1),
    rows([['Setup. ', 'Crew, load (15 kg), rover or not, and a science goal.'],
      ['Terrain. ', '~1 m HiRISE elevation; slopes over 15° are blocked.'],
      ['Two routes. ', 'Fastest and lowest hazard. At S1 the fastest is 36 s quicker out; steepest 13.8°.'],
      ['Oxygen. ', 'Walking power → O₂ at Mars gravity, with a ×1.3 suit factor.'],
      ['Way home. ', 'Costed 20 % higher (×1.2) to keep a margin.'],
      ['Rover option. ', 'Drive, park ~100 m short, walk the rest.']], 1.4, 3.65),
    ...stats([['1.4 km', 'walk to S1'], ['50 min', 'out'], ['55 min', 'home'], ['27 · 61 L', 'O₂ out · home']]),
    note('All route numbers are Scenario model estimates for S1 (First boxwork 360), crew of 2, 15 kg load. Routes end at an approach point; the last metres are not modeled.'), ...footer(4)],
  // 5 · Decision
  [title('Know when to turn back'), gif('decision', 0.5, 1.05, 4.4), gif('replay', 5.1, 1.05, 4.4),
    caption('Drag the O₂ budget down: a TURN point appears', 0.5, 3.6, 4.4), caption('Replay: the crew turns there; drills re-test the plan', 5.1, 3.6, 4.4),
    { t: 'card', x: 0.5, y: 4.0, w: 4.4, h: 1.0 }, { t: 'card', x: 5.1, y: 4.0, w: 4.4, h: 1.0 },
    { t: 'text', x: 0.65, y: 4.08, w: 4.1, h: 0.25, text: 'FULL BUDGET · 288.8 L', size: 9, bold: true, color: OK, font: 'mono', spacing: 2 },
    { t: 'text', x: 0.65, y: 4.36, w: 4.1, h: 0.6, text: 'Reaches the S1 approach point and back, with 200 L spare.', size: 13, color: INK },
    { t: 'text', x: 5.25, y: 4.08, w: 4.1, h: 0.25, text: 'CUT TO 70 L', size: 9, bold: true, color: ACC2, font: 'mono', spacing: 2 },
    { t: 'text', x: 5.25, y: 4.36, w: 4.1, h: 0.6, text: 'Turn back 950 m out, at 33 min. The science stop waits for another day.', size: 13, color: INK },
    note('Budget = 385 L minus the 25 % reserve (96.3 L). Drills: suit leak ×2 and hard work ×1.5 change O₂ use mid-walk. The turn-back point is a Scenario estimate, not a guarantee.'), ...footer(5)],
  // 6 · Voice copilot (new live version in progress; replies come from a real test by the copilot owner)
  [title('Talk to the copilot, hands-free'),
    { t: 'image', path: new URL('../assets/copilot-astronaut.png', import.meta.url).pathname, x: 0.5, y: 1.1, w: 4.2, h: 4.2 * 346 / 790 },
    { t: 'text', x: 0.5, y: 2.95, w: 4.2, h: 1.2, text: 'Ask out loud, mid-walk. The copilot knows your mission plan and answers out loud, so your hands stay free.', size: 13, color: BODY },
    { t: 'card', x: 5.0, y: 1.1, w: 4.5, h: 1.85 }, { t: 'card', x: 5.0, y: 3.1, w: 4.5, h: 1.95 },
    { t: 'audio', path: COP('ask-normal'), x: 5.15, y: 1.25, w: 0.42, h: 0.42 },
    { t: 'text', x: 5.7, y: 1.22, w: 3.7, h: 0.25, text: 'NORMAL ASK', size: 9, bold: true, color: OK, font: 'mono', spacing: 2 },
    { t: 'text', x: 5.7, y: 1.46, w: 3.7, h: 0.3, text: '“How much oxygen do I have left?”', size: 13, bold: true, color: INK },
    { t: 'text', x: 5.15, y: 1.92, w: 4.25, h: 0.95, text: REPLY.normal, size: 12, color: BODY },
    { t: 'audio', path: COP('ask-emergency'), x: 5.15, y: 3.25, w: 0.42, h: 0.42 },
    { t: 'text', x: 5.7, y: 3.22, w: 3.7, h: 0.25, text: 'EMERGENCY', size: 9, bold: true, color: ACC2, font: 'mono', spacing: 2 },
    { t: 'text', x: 5.7, y: 3.46, w: 3.7, h: 0.3, text: '“I fell. I think my leg is broken.”', size: 13, bold: true, color: INK },
    { t: 'text', x: 5.15, y: 3.92, w: 4.25, h: 1.05, text: REPLY.emergency, size: 12, color: BODY },
    note('Click the speaker icons to hear the two asks (AI voice, Kokoro TTS). The copilot replies are added from a real test of the live version. In an emergency the app holds the astronaut at the modeled position, draws the fastest return and dispatches an illustrative rover (mission-control simulation).'), ...footer(6)],
  // 7 · Get home: 360 view + helmet HUD
  [title('Get home: 360° view + helmet HUD'), gif('hud'), caption('Helmet HUD prototype on a NASA photo stand-in (PIA26363)'),
    rows([['360° view. ', 'At a stop, drag to look around a real Curiosity panorama.'],
      ['Way home. ', 'Arrow, distance and turns along the modeled route back to the habitat.'],
      ['Oxygen + time. ', 'O₂ left, minutes to walk home, O₂ spare at the door.'],
      ['Earth delay. ', 'Today’s signal time to Earth, so the crew knows help is not instant.'],
      ['Radar + emergency. ', 'Where home is from where you face; one press to raise an alarm.']], 1.1, 3.25),
    { t: 'text', x: 5.95, y: 4.45, w: 3.55, h: 0.6, text: 'mars.roben.club/demo', size: 12, bold: true, color: INK },
    { t: 'text', x: 0.5, y: 4.45, w: 5.2, h: 0.6, text: 'Team RobEn, AASTMT: Ali Omar · Marwan Mesbah · Yassin Abdallah · Youssef Nader · Mohamed Ayman · Jana Adham', size: 11, color: MUTED },
    note('The HUD is a prototype drawn over NASA photo PIA26363 (Gediz Vallis), not over the stop itself; the numbers are the walk’s modeled values. Messages to Earth are simulated.'), ...footer(7)],
]

// ---- keep "22 min", "1 m", "turn-back" from breaking across lines ----
const nb = (t) => t.replace(/(\d) (min|m|km|L|%)(?![a-z])/g, '$1\u00A0$2').replace(/~(\d)/g, '~$1').replace(/(\w)-(\w)/g, '$1\u2011$2')
for (const els of slides) for (const e of els) { if (e.text) e.text = nb(e.text); if (e.items) e.items = e.items.map((it) => Array.isArray(it) ? it.map(nb) : nb(it)) }

// speaker icon (cover image for embedded audio)
const SPEAKER = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#E0653A"/><path d="M6 10h3l4-3v10l-4-3H6z" fill="#070A12"/><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5M17.5 7.5a6.5 6.5 0 0 1 0 9" stroke="#070A12" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>').toString('base64')

// PowerPoint needs a PNG cover for audio
const SPEAKER_PNG = await (async () => { const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 96, height: 96 } })
  await pg.setContent(`<style>body{margin:0;background:transparent}</style><img src="${SPEAKER}" width="96" height="96">`)
  const buf = await pg.screenshot({ omitBackground: true }); await b.close(); return 'image/png;base64,' + buf.toString('base64') })()

// ---- PPTX ----
const pres = new pptxgen(); pres.layout = 'LAYOUT_16x9'; pres.title = 'RedSight · Team RobEn · NASA Space Apps 2026'
for (const els of slides) {
  const s = pres.addSlide(); s.background = { color: BG }
  for (const e of els) {
    const box = { x: e.x, y: e.y, w: e.w, h: e.h }
    if (e.t === 'text') s.addText(e.runs ? e.runs.map(([t, c]) => ({ text: t, options: { color: c } })) : e.text, { ...box, fontFace: FONTS[e.font ?? 'body'], fontSize: e.size, bold: !!e.bold, color: e.color, charSpacing: e.spacing ?? 0, align: e.align || 'left', valign: 'top', margin: 0, isTextBox: true, lineSpacingMultiple: 1.1 })
    else if (e.t === 'bullets') s.addText(e.items.map((it, i) => ({ text: it, options: { bullet: { indent: 14 }, breakLine: i < e.items.length - 1, paraSpaceAfter: 9 } })),
      { ...box, fontFace: FONT, fontSize: e.size, color: e.color, valign: 'top', margin: 0, isTextBox: true, lineSpacingMultiple: 1.1 })
    else if (e.t === 'rows') s.addText(e.items.flatMap(([a, b], i) => [{ text: a, options: { bold: true, color: INK } },
      { text: b, options: { color: BODY, breakLine: i < e.items.length - 1, paraSpaceAfter: 6 } }]),
      { ...box, fontFace: FONT, fontSize: e.size, valign: 'top', margin: 0, isTextBox: true, lineSpacingMultiple: 1.1 })
    else if (e.t === 'audio') { if (existsSync(e.path)) s.addMedia({ type: 'audio', path: e.path, ...box, cover: SPEAKER_PNG }) }
    else if (e.t === 'notes') s.addNotes(e.text)
    else if (e.t === 'gif') s.addImage({ path: `${D}gif/${e.name}.gif`, ...box, altText: `Screen recording: ${e.name}` })
    else if (e.t === 'image') s.addImage({ path: e.path, ...box, sizing: e.cover ? { type: 'cover', w: e.w, h: e.h } : undefined, altText: 'Helmet view prototype' })
    else if (e.t === 'card') s.addShape(pres.ShapeType.roundRect, { ...box, fill: { color: CARD }, rectRadius: 0.06, line: { color: '1D2637', width: 0.75 } })
  }
}
await pres.writeFile({ fileName: `${D}redsight-deck.pptx` })

const FSRC = new URL('../../app/node_modules/@fontsource/', import.meta.url).href
const FACES = `@font-face{font-family:Syne;font-weight:400 800;src:url(${new URL('../../landing/public/fonts/syne-var.woff2', import.meta.url).href})}` +
  [400, 600, 700].map((w) => `@font-face{font-family:'IBM Plex Sans';font-weight:${w};src:url(${FSRC}ibm-plex-sans/files/ibm-plex-sans-latin-${w}-normal.woff2)}`).join('') +
  `@font-face{font-family:'IBM Plex Mono';font-weight:400;src:url(${FSRC}ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2)}` +
  `@font-face{font-family:'IBM Plex Mono';font-weight:700;src:url(${FSRC}ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2)}`
// ---- HTML preview with the same boxes (1 in = 192 px; 1 pt = 2.667 px) ----
const px = (v) => `${(v * 192).toFixed(1)}px`, pt = (v) => `${(v * 192 / 72).toFixed(1)}px`
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')
const pos = (e) => `position:absolute;left:${px(e.x)};top:${px(e.y)};width:${px(e.w)};height:${px(e.h)};`
const page = slides.map((els) => `<div class="s">${els.map((e) => {
  if (e.t === 'text') return `<div class="box" style="${pos(e)}font-family:'${FONTS[e.font ?? 'body']}';letter-spacing:${((e.spacing ?? 0) * 192 / 72).toFixed(1)}px;font-size:${pt(e.size)};font-weight:${e.bold ? 700 : 400};color:#${e.color};text-align:${e.align || 'left'}">${e.runs ? e.runs.map(([t, c]) => `<span style="color:#${c}">${esc(t)}</span>`).join('') : esc(e.text)}</div>`
  if (e.t === 'bullets') return `<ul class="box" style="${pos(e)}font-size:${pt(e.size)};color:#${e.color}">${e.items.map((it) => `<li>${esc(it)}</li>`).join('')}</ul>`
  if (e.t === 'audio') return `<img style="${pos(e)}" src="${SPEAKER}">`
  if (e.t === 'rows') return `<div class="box" style="${pos(e)}font-size:${pt(e.size)};color:#${BODY}">${e.items.map(([a, b]) => `<p style="margin-bottom:${pt(6)}"><b style="color:#${INK}">${esc(a)}</b>${esc(b)}</p>`).join('')}</div>`
  if (e.t === 'gif') return `<img style="${pos(e)}object-fit:fill" src="file://${D}still/${e.name}.png">`
  if (e.t === 'image') return `<img style="${pos(e)}object-fit:cover" src="file://${e.path}">`
  if (e.t === 'card') return `<div style="${pos(e)}background:#${CARD};border:2px solid #1D2637;border-radius:${px(0.06)}"></div>`
  return ''
}).join('')}</div>`).join('')
await writeFile(`${D}preview.html`, `<!doctype html><meta charset="utf-8"><style>${FACES}@page{size:1920px 1080px;margin:0}*{margin:0;padding:0;box-sizing:border-box}
.s{position:relative;width:1920px;height:1080px;break-after:page;background:#${BG};overflow:hidden;font-family:'IBM Plex Sans'}
.box{line-height:1.2;outline:1px dashed rgba(255,0,255,.0)} ul.box{list-style:none} ul.box li{position:relative;padding-left:${pt(14 * 1.4)};margin-bottom:${pt(9)}}
ul.box li:before{content:'•';position:absolute;left:0}</style>${page}`)
const browser = await chromium.launch()
const p = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
await p.goto(`file://${D}preview.html`); await p.evaluate(() => document.fonts.ready); await p.evaluate(() => document.fonts.ready)
const overflow = await p.evaluate(() => [...document.querySelectorAll('.s')].flatMap((s, i) => [...s.querySelectorAll('.box')]
  .filter((b) => b.scrollHeight > b.clientHeight + 2 || b.scrollWidth > b.clientWidth + 2).map((b) => `slide ${i + 1}: "${b.textContent.slice(0, 40)}"`)))
await p.pdf({ path: `${D}redsight-deck.pdf`, width: '1920px', height: '1080px', printBackground: true, pageRanges: '' })
const els = await p.$$('.s')
for (const [i, el] of els.entries()) await el.screenshot({ path: `${D}preview/slide-${i + 1}.png` })
await browser.close()
console.log(overflow.length ? `OVERFLOW:\n${overflow.join('\n')}` : 'no text overflow')
console.log(`deck → ${D}redsight-deck.pptx (${(Number(execFileSync('stat', ['-f', '%z', `${D}redsight-deck.pptx`])) / 1e6).toFixed(1)} MB)`)
