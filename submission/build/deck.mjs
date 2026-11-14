// Simple, editable 7-slide deck (native text + animated GIFs) for PowerPoint / Google Slides / Canva.
// One layout spec → (1) out/deck/redsight-deck.pptx, (2) out/deck/preview/slide-N.png (same boxes, for visual QA).
// Usage: npm run deck. Wording rules: AGENTS rule 3 + docs/submission/demo-production-plan.md §5.
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
const pptxgen = createRequire(import.meta.url)('pptxgenjs')

const OUT = new URL('../out/', import.meta.url).pathname
const D = `${OUT}deck/`
await mkdir(`${D}gif`, { recursive: true }); await mkdir(`${D}still`, { recursive: true }); await mkdir(`${D}preview`, { recursive: true })
const ff = (a) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a])

// ---- palette + type (Arial: ships with PowerPoint, Google Slides and Canva) ----
const BG = '0E1117', INK = 'FFFFFF', BODY = 'D3D8E0', MUTED = '8A93A3', ACC = 'FFB224', CARD = '1A1F29'
const FONT = 'Arial'

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
const title = (t) => ({ t: 'text', x: 0.5, y: 0.35, w: 9, h: 0.6, text: t, size: 26, bold: true, color: INK })
const footer = (n) => [
  { t: 'text', x: 0.5, y: 5.2, w: 7.5, h: 0.25, text: 'RedSight · Team RobEn · NASA Space Apps 2026 · imagery NASA/JPL-Caltech/UArizona/MSSS/USGS', size: 10, color: MUTED },
  { t: 'text', x: 8.5, y: 5.2, w: 1, h: 0.25, text: `${n} / 7`, size: 10, color: MUTED, align: 'right' },
]
const gif = (name, x = 0.5, y = 1.1, w = 5.2) => ({ t: 'gif', name, x, y, w, h: w * 9 / 16 })
const caption = (text, x = 0.5, y = 4.07, w = 5.2) => ({ t: 'text', x, y, w, h: 0.28, text, size: 11, color: MUTED })
const head = (text, y, x = 5.95, w = 3.55) => ({ t: 'text', x, y, w, h: 0.25, text, size: 10, bold: true, color: ACC })
// rows: [[bold lead, rest]] as one text box, one paragraph per row
const rows = (items, y = 1.1, h = 3.9, x = 5.95, w = 3.55, size = 12) => ({ t: 'rows', x, y, w, h, items, size })
// stat cards in a row: [[number, label]]
const stats = (items, x = 0.5, y = 4.45, w = 5.2, h = 0.62) => {
  const gap = 0.1, cw = (w - gap * (items.length - 1)) / items.length
  return items.flatMap(([n, l], i) => [{ t: 'card', x: x + i * (cw + gap), y, w: cw, h },
    { t: 'text', x: x + i * (cw + gap) + 0.1, y: y + 0.06, w: cw - 0.2, h: 0.3, text: n, size: 15, bold: true, color: INK },
    { t: 'text', x: x + i * (cw + gap) + 0.1, y: y + 0.36, w: cw - 0.2, h: 0.22, text: l, size: 9, color: MUTED }])
}
const note = (text) => ({ t: 'notes', text })

const slides = [
  // 1 · Title (full-bleed NASA photo, darkened on the left; built from app/public/pano/PIA26696.jpg)
  [
    { t: 'image', path: new URL('../assets/title-boxwork.jpg', import.meta.url).pathname, x: 0, y: 0, w: W, h: H },
    { t: 'text', x: 0.6, y: 0.9, w: 5, h: 0.3, text: 'NASA SPACE APPS 2026 · CAIRO', size: 13, bold: true, color: ACC },
    { t: 'text', x: 0.6, y: 1.3, w: 5, h: 1.0, text: 'RedSight', size: 60, bold: true, color: INK },
    { t: 'text', x: 0.6, y: 2.4, w: 5, h: 0.9, text: 'Plan a science walk on Mars.\nKnow when to turn back.', size: 22, color: INK },
    { t: 'text', x: 0.6, y: 3.6, w: 5, h: 0.3, text: 'Team RobEn · Interplanetary Survival Guide: Martian Map', size: 13, color: BODY },
    { t: 'text', x: 0.6, y: 4.0, w: 5, h: 0.3, text: 'mars.roben.club/demo', size: 16, bold: true, color: ACC },
    { t: 'text', x: 0.6, y: 5.15, w: 6, h: 0.25, text: 'Boxwork ridge on Mount Sharp · NASA/JPL-Caltech/MSSS, PIA26696', size: 10, color: MUTED },
    note('RedSight plans a science walk on foot near Curiosity, on the boxwork ridges of Mount Sharp, and shows when the crew must turn back. Try it at mars.roben.club/demo; no sign-in.'),
  ],
  // 2 · Problem
  [title('The problem: one walk, one oxygen tank'), gif('overview'), caption('From the crater region down to one walk'),
    rows([['Maps show regions. ', 'Mars maps cover kilometres; a walk on foot needs metres.'],
      ['One tank. ', '385 L of usable O₂ per suit. A 25 % reserve is kept and never planned.'],
      ['No help from Earth. ', 'A signal takes up to ~22 min one way, so the crew decides on site.'],
      ['Why this site. ', 'Boxwork ridges on Mount Sharp: veins left by ancient groundwater, where Curiosity drives today.']]),
    ...stats([['~22 min', 'signal to Earth'], ['385 L', 'usable O₂ per suit'], ['15°', 'slope limit on foot'], ['2', 'crew, buddy rule']]),
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
    { t: 'text', x: 0.65, y: 4.08, w: 4.1, h: 0.25, text: 'FULL BUDGET · 288.8 L', size: 10, bold: true, color: '4CC38A' },
    { t: 'text', x: 0.65, y: 4.36, w: 4.1, h: 0.6, text: 'Reaches the S1 approach point and back, with 200 L spare.', size: 13, color: INK },
    { t: 'text', x: 5.25, y: 4.08, w: 4.1, h: 0.25, text: 'CUT TO 70 L', size: 10, bold: true, color: 'FF6B6B' },
    { t: 'text', x: 5.25, y: 4.36, w: 4.1, h: 0.6, text: 'Turn back 950 m out, at 33 min. The science stop waits for another day.', size: 13, color: INK },
    note('Budget = 385 L minus the 25 % reserve (96.3 L). Drills: suit leak ×2 and hard work ×1.5 change O₂ use mid-walk. The turn-back point is a Scenario estimate, not a guarantee.'), ...footer(5)],
  // 6 · Evidence
  [title('Every number shows its source'), gif('sources'), caption('Click any number: its label, range and source link'),
    head('FOUR LABELS', 1.1),
    rows([['Observed ', 'measured by an instrument'], ['Derived ', 'computed from observed data'],
      ['Scenario ', 'a model or team assumption'], ['Unavailable ', 'no public data at this scale']], 1.38, 1.35),
    head('LIMITS WE SHOW', 2.85),
    rows([['', 'Routes end at an approach point near each stop.'],
      ['', 'Radiation (RAD) and weather (REMS) are measured at the rover, not along the route.'],
      ['', 'One way home for now: no alternate return, no crew split.']], 3.13, 1.9),
    { t: 'text', x: 0.5, y: 4.45, w: 5.2, h: 0.6, text: 'HiRISE stereo (Observed) → 1 m elevation, slope (Derived) → time + O₂ (Scenario) → turn-back point', size: 11, color: BODY },
    note('Each layer and constant has a source card and a line in data/PROVENANCE.md (URL, date, licence).'), ...footer(6)],
  // 7 · Status
  [title('Working today, and next'), gif('hud'), caption('Helmet view prototype on a NASA photo stand-in'),
    head('WORKING NOW', 1.1),
    { t: 'text', x: 5.95, y: 1.36, w: 3.55, h: 1.3, text: 'Setup · 6 map layers · 2 routes · climb profile · turn-back point · replay + drills · rover · daylight + radiation dose · sources · helmet view', size: 12, color: BODY },
    head('NEXT', 2.75),
    { t: 'text', x: 5.95, y: 3.01, w: 3.55, h: 0.6, text: 'Voice copilot online · panoramas at each stop · other ways home', size: 12, color: BODY },
    { t: 'text', x: 5.95, y: 3.75, w: 3.55, h: 0.5, text: 'mars.roben.club/demo\ngithub.com/RobEn-AAST/RedSight', size: 12, bold: true, color: INK },
    { t: 'text', x: 0.5, y: 4.45, w: 9, h: 0.5, text: 'Team RobEn, AASTMT: Ali Omar · Marwan Mesbah · Yassin Abdallah · Youssef Nader · Mohamed Ayman · Jana Adham', size: 11, color: MUTED },
    note('The voice copilot is built, but its server is not online yet. The helmet view is a prototype drawn on NASA photo PIA26363 (Gediz Vallis), not on the stop itself.'), ...footer(7)],
]

// ---- keep "22 min", "1 m", "turn-back" from breaking across lines ----
const nb = (t) => t.replace(/(\d) (min|m|km|L|%)(?![a-z])/g, '$1\u00A0$2').replace(/~(\d)/g, '~$1').replace(/(\w)-(\w)/g, '$1\u2011$2')
for (const els of slides) for (const e of els) { if (e.text) e.text = nb(e.text); if (e.items) e.items = e.items.map((it) => Array.isArray(it) ? it.map(nb) : nb(it)) }

// ---- PPTX ----
const pres = new pptxgen(); pres.layout = 'LAYOUT_16x9'; pres.title = 'RedSight · Team RobEn · NASA Space Apps 2026'
for (const els of slides) {
  const s = pres.addSlide(); s.background = { color: BG }
  for (const e of els) {
    const box = { x: e.x, y: e.y, w: e.w, h: e.h }
    if (e.t === 'text') s.addText(e.text, { ...box, fontFace: FONT, fontSize: e.size, bold: !!e.bold, color: e.color, align: e.align || 'left', valign: 'top', margin: 0, isTextBox: true, lineSpacingMultiple: 1.1 })
    else if (e.t === 'bullets') s.addText(e.items.map((it, i) => ({ text: it, options: { bullet: { indent: 14 }, breakLine: i < e.items.length - 1, paraSpaceAfter: 9 } })),
      { ...box, fontFace: FONT, fontSize: e.size, color: e.color, valign: 'top', margin: 0, isTextBox: true, lineSpacingMultiple: 1.1 })
    else if (e.t === 'rows') s.addText(e.items.flatMap(([a, b], i) => [{ text: a, options: { bold: true, color: INK } },
      { text: b, options: { color: BODY, breakLine: i < e.items.length - 1, paraSpaceAfter: 6 } }]),
      { ...box, fontFace: FONT, fontSize: e.size, valign: 'top', margin: 0, isTextBox: true, lineSpacingMultiple: 1.1 })
    else if (e.t === 'notes') s.addNotes(e.text)
    else if (e.t === 'gif') s.addImage({ path: `${D}gif/${e.name}.gif`, ...box, altText: `Screen recording: ${e.name}` })
    else if (e.t === 'image') s.addImage({ path: e.path, ...box, sizing: e.cover ? { type: 'cover', w: e.w, h: e.h } : undefined, altText: 'Helmet view prototype' })
    else if (e.t === 'card') s.addShape(pres.ShapeType.roundRect, { ...box, fill: { color: CARD }, rectRadius: 0.08, line: { color: CARD } })
  }
}
await pres.writeFile({ fileName: `${D}redsight-deck.pptx` })

// ---- HTML preview with the same boxes (1 in = 192 px; 1 pt = 2.667 px) ----
const px = (v) => `${(v * 192).toFixed(1)}px`, pt = (v) => `${(v * 192 / 72).toFixed(1)}px`
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')
const pos = (e) => `position:absolute;left:${px(e.x)};top:${px(e.y)};width:${px(e.w)};height:${px(e.h)};`
const page = slides.map((els) => `<div class="s">${els.map((e) => {
  if (e.t === 'text') return `<div class="box" style="${pos(e)}font-size:${pt(e.size)};font-weight:${e.bold ? 700 : 400};color:#${e.color};text-align:${e.align || 'left'}">${esc(e.text)}</div>`
  if (e.t === 'bullets') return `<ul class="box" style="${pos(e)}font-size:${pt(e.size)};color:#${e.color}">${e.items.map((it) => `<li>${esc(it)}</li>`).join('')}</ul>`
  if (e.t === 'rows') return `<div class="box" style="${pos(e)}font-size:${pt(e.size)};color:#${BODY}">${e.items.map(([a, b]) => `<p style="margin-bottom:${pt(6)}"><b style="color:#${INK}">${esc(a)}</b>${esc(b)}</p>`).join('')}</div>`
  if (e.t === 'gif') return `<img style="${pos(e)}object-fit:fill" src="file://${D}still/${e.name}.png">`
  if (e.t === 'image') return `<img style="${pos(e)}object-fit:cover" src="file://${e.path}">`
  if (e.t === 'card') return `<div style="${pos(e)}background:#${CARD};border-radius:${px(0.08)}"></div>`
  return ''
}).join('')}</div>`).join('')
await writeFile(`${D}preview.html`, `<!doctype html><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box}
.s{position:relative;width:1920px;height:1080px;background:#${BG};overflow:hidden;font-family:Arial}
.box{line-height:1.2;outline:1px dashed rgba(255,0,255,.0)} ul.box{list-style:none} ul.box li{position:relative;padding-left:${pt(14 * 1.4)};margin-bottom:${pt(9)}}
ul.box li:before{content:'•';position:absolute;left:0}</style>${page}`)
const browser = await chromium.launch()
const p = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
await p.goto(`file://${D}preview.html`)
const overflow = await p.evaluate(() => [...document.querySelectorAll('.s')].flatMap((s, i) => [...s.querySelectorAll('.box')]
  .filter((b) => b.scrollHeight > b.clientHeight + 2 || b.scrollWidth > b.clientWidth + 2).map((b) => `slide ${i + 1}: "${b.textContent.slice(0, 40)}"`)))
const els = await p.$$('.s')
for (const [i, el] of els.entries()) await el.screenshot({ path: `${D}preview/slide-${i + 1}.png` })
await browser.close()
console.log(overflow.length ? `OVERFLOW:\n${overflow.join('\n')}` : 'no text overflow')
console.log(`deck → ${D}redsight-deck.pptx (${(Number(execFileSync('stat', ['-f', '%z', `${D}redsight-deck.pptx`])) / 1e6).toFixed(1)} MB)`)
