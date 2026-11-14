// 7-slide deck. HTML → (1) PDF with live text + key-moment stills, (2) PPTX with animated GIFs for Google Slides.
// Usage: npm run slides  → out/slides/redsight-slides.pdf, out/slides/redsight-slides.pptx, out/slides/png/slide-N.png
// Wording: AGENTS rule 3 + docs/submission/demo-production-plan.md §5.
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
const pptxgen = createRequire(import.meta.url)('pptxgenjs')

const OUT = new URL('../out/', import.meta.url).pathname
const S = `${OUT}slides/`
const FONTS = new URL('../../app/node_modules/@fontsource/', import.meta.url).href
await mkdir(`${S}png`, { recursive: true }); await mkdir(`${S}gif`, { recursive: true }); await mkdir(`${S}still`, { recursive: true })
const ff = (a) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a])

// GIF sources: clip, range, speed, and the still frame (clip seconds) used in the PDF.
const GIFS = {
  overview: { clip: 'overview', from: 0.4, to: 5.9, speed: 1.1, still: 5.6 },
  map: { clip: 'map', from: 0.6, to: 20.5, speed: 1.5, still: 9.5 },
  setup: { clip: 'setup', from: 0.6, to: 13.0, speed: 1.8, still: 7.5 },
  routes: { clip: 'routes', from: 0.4, to: 10.0, speed: 1.2, still: 9.6 },
  rover: { clip: 'rover', from: 0.3, to: 15.0, speed: 1.8, still: 8.5 },
  decision: { clip: 'decision', from: 0.6, to: 6.9, speed: 1, still: 6.6 },
  replay: { clip: 'replay', from: 1.5, to: 34.5, speed: 2.6, still: 17 },
  sources: { clip: 'sources', from: 0.4, to: 4.7, speed: 0.8, img: 'sources-inspector' },
  hud: { clip: 'hud', from: 0.2, to: 33.0, speed: 2.2, img: 'hud-details' },
}
for (const [n, g] of Object.entries(GIFS)) g.img ? ff(['-i', `${OUT}stills/${g.img}.png`, '-vf', 'scale=1920:1080', `${S}still/${n}.png`]) : ff(['-ss', String(g.still), '-i', `${OUT}clips/${g.clip}.mp4`, '-frames:v', '1', `${S}still/${n}.png`])

const badge = (k) => `<span class="b ${k.toLowerCase()}">${k}</span>`
const gif = (n, cap) => `<figure class="shot"><div class="gif" data-gif="${n}"><img src="file://${S}still/${n}.png"></div>${cap ? `<figcaption>${cap}</figcaption>` : ''}</figure>`
const foot = (n) => `<div class="foot"><span>REDSIGHT · Team RobEn · NASA Space Apps 2026</span><span>Imagery: NASA/JPL-Caltech/UArizona/MSSS/ASU/USGS · screen recordings of the working app</span><span>${n} / 7</span></div>`

const slides = [
// 1 · Title
`<div class="s title">
  <img class="hero" src="file://${OUT}stills/hud.png">
  <div class="heroShade"></div>
  <div class="tl">
    <div class="tag">NASA Space Apps 2026 · Cairo, Egypt</div>
    <div class="logo"><svg width="88" height="88" viewBox="0 0 64 64"><circle cx="32" cy="32" r="17" fill="none" stroke="#e5484d" stroke-width="2.5"/><circle cx="32" cy="32" r="9" fill="none" stroke="#e5484d" stroke-width="1.5" opacity=".45"/><circle cx="32" cy="32" r="3.2" fill="#ffb224"/><path d="M32 32 L46 18" stroke="#ffb224" stroke-width="2" stroke-linecap="round"/></svg><h1>REDSIGHT</h1></div>
    <p class="lede">Plan a science walk on Mars.<br><em>Know when to turn back.</em></p>
    <div class="chal"><span class="k">Challenge</span>Interplanetary Survival Guide: Martian Map</div>
    <div class="team"><span class="k">Team RobEn</span>Software &amp; AI team · AASTMT</div>
    <ul class="members"><li>Ali Omar</li><li>Marwan Mesbah</li><li>Yassin Abdallah</li><li>Youssef Nader</li><li>Mohamed Ayman</li><li>Jana Adham</li></ul>
    <div class="links"><span>▶ mars.roben.club/demo</span><span>github.com/RobEn-AAST/RedSight</span></div>
  </div>
  <div class="herocap">Helmet HUD prototype over a NASA Curiosity photo (PIA26363, stand-in)</div>
</div>`,
// 2 · Problem + purpose
`<div class="s">
  <div class="tag">01 · The problem</div>
  <h2>One walk, one oxygen tank, no help from Earth</h2>
  <div class="cols c2">
    <div>
      <p class="body">Mars maps (Mars Trek, USGS) are made for regions and the whole planet. A crew on foot needs a plan for <b>one walk of a few kilometres</b>: where to go, how long, and when to turn back.</p>
      <div class="stats">
        <div class="stat"><div class="n">≈ 22 min</div><div class="l">one-way signal to Earth, so the crew decides on site</div><div class="src">NASA NTRS 20220013418</div></div>
        <div class="stat"><div class="n">385 L</div><div class="l">usable O₂ per suit; a 25 % reserve is never planned</div><div class="src">EMU Data Book · ${badge('Derived')}</div></div>
        <div class="stat"><div class="n">15°</div><div class="l">steepest slope a suited walker may take in our model</div><div class="src">Team limit · ${badge('Scenario')}</div></div>
      </div>
      <div class="why"><span class="k">Why here</span>Lower Mount Sharp, Gale crater: <b>boxwork ridges left by ancient groundwater</b>, where Curiosity is driving now (JPL, 2025). Our crew walks to the same targets.</div>
    </div>
    ${gif('overview', 'From the crater region to one walk: habitat → S1, the first boxwork 360 site')}
  </div>${foot(2)}
</div>`,
// 3 · Data → map
`<div class="s">
  <div class="tag">02 · NASA data</div>
  <h2>Real NASA data, stacked into one walk-scale map</h2>
  <div class="cols c3-2">
    ${gif('map', 'Each layer switched on in the live app (6 × 6 km operations area)')}
    <ul class="layers">
      <li>${badge('Observed')}<div><b>HiRISE optical, 0.25 m</b><span>MRO · what the ground looks like</span></div></li>
      <li>${badge('Derived')}<div><b>HiRISE DTM ~1 m → slope</b><span>drives every route · 15° hard limit</span></div></li>
      <li>${badge('Derived')}<div><b>THEMIS thermal inertia</b><span>Mars Odyssey · sand proxy (context)</span></div></li>
      <li>${badge('Derived')}<div><b>CRISM mineral indicators</b><span>MRO, PDS ODE · sulfate host rock (context)</span></div></li>
      <li>${badge('Derived')}<div><b>USGS geologic map SIM 3292</b><span>regional units (context)</span></div></li>
      <li>${badge('Observed')}<div><b>Curiosity’s real path</b><span>sols 3345–5073 · real stops S1, S2, D1, D2</span></div></li>
    </ul>
  </div>
  <p class="note">Only terrain and slope enter the route costs. The other layers explain the site; they don't steer the walk.</p>${foot(3)}
</div>`,
// 4 · Plan the walk
`<div class="s">
  <div class="tag">03 · Plan the walk</div>
  <h2>Set the mission, get two modeled routes</h2>
  <div class="cols c4">
    <div class="stack">
      ${gif('setup', '① Crew, load, rover, science goal')}
      ${gif('rover', '③ Rover option: drive, park ~100 m short, walk the rest')}
    </div>
    <div class="stack">
      ${gif('routes', '② Fastest vs lowest hazard on the ~1 m HiRISE DTM, with the climb profile. S1, crew of 2: all values are Scenario model estimates')}
      <div class="kpis">
        <div><div class="n">1.4 km</div><div class="l">walk to S1</div></div>
        <div><div class="n">50 min</div><div class="l">out</div></div>
        <div><div class="n">55 min</div><div class="l">home</div></div>
        <div><div class="n">27 · 61 L</div><div class="l">O₂ out · home</div></div>
      </div>

    </div>
  </div>${foot(4)}
</div>`,
// 5 · The decision
`<div class="s">
  <div class="tag">04 · The decision</div>
  <h2>Less oxygen? The turn-back point moves</h2>
  <div class="cols c2e">
    ${gif('decision', 'Drag the usable-O₂ budget: the TURN marker appears on the route')}
    ${gif('replay', 'Mission replay: the crew turns at the marker and walks home')}
  </div>
  <div class="ba">
    <div class="ok"><div class="k">Full budget · 288.8 L</div><div class="v">Reaches the S1 approach point and back, 200 L spare</div></div>
    <div class="arrow">→</div>
    <div class="no"><div class="k">Budget cut to 70 L</div><div class="v">Turn back <b>950 m</b> out, at <b>33 min</b>. The science stop waits for another day.</div></div>
  </div>
  <p class="note">The 96.3 L reserve is never planned · return costed ×1.2 · drills (suit leak ×2, hard work ×1.5) re-test the plan mid-walk · all ${badge('Scenario')}</p>${foot(5)}
</div>`,
// 6 · Evidence + limits
`<div class="s">
  <div class="tag">05 · Evidence &amp; limits</div>
  <h2>Every number shows its evidence, and its limits</h2>
  <div class="cols c2">
    ${gif('sources', 'Open any number: its class, value range and source')}
    <div>
      <div class="classes">
        <div>${badge('Observed')}<span>measured by an instrument</span></div>
        <div>${badge('Derived')}<span>computed from observed data</span></div>
        <div>${badge('Scenario')}<span>model or team assumption</span></div>
        <div>${badge('Unavailable')}<span>no public data at this scale</span></div>
      </div>
      <h3>Limits we show, not hide</h3>
      <ul class="lim">
        <li>Routes end at an <b>approach point</b> near the stop; the last metres are not modeled.</li>
        <li>Radiation (RAD) and weather (REMS) are measured <b>at the rover</b>, not along the route.</li>
        <li>THEMIS and CRISM are context; they are not route costs.</li>
        <li>One return path for now: no alternate fastest return, no crew split.</li>
      </ul>
    </div>
  </div>
  <div class="chain"><span class="k">One number, end to end</span>
    <div>${badge('Observed')} HiRISE stereo images</div><i>→</i><div>${badge('Derived')} ~1 m DTM → slope</div><i>→</i><div>${badge('Scenario')} route time + O₂ (load-carriage model, suit factor)</div><i>→</i><div><b>Turn-back point</b></div>
  </div>${foot(6)}
</div>`,
// 7 · Status + access
`<div class="s">
  <div class="tag">06 · What works today</div>
  <h2>Working today, and what comes next</h2>
  <div class="cols c7">
    ${gif('hud', 'Prototype: helmet HUD at S1 with the way home, O₂ and Earth delay (photo stand-in)')}
    <div>
      <h3>Working in the live app</h3>
      <ul class="chips ok"><li>Mission setup</li><li>6 NASA layers + Curiosity path</li><li>Fastest / lowest-hazard routes</li><li>Climb profile</li><li>O₂ turn-back point</li><li>Replay + drills</li><li>Rover option</li><li>Daylight + radiation dose</li><li>Source inspector</li><li>Helmet HUD (prototype)</li></ul>
      <h3>Next</h3>
      <ul class="chips nx"><li>Voice + chat copilot (built; server not online yet)</li><li>Panoramas at the real stops</li><li>Alternate fastest return</li><li>Crew split</li><li>Headset view</li></ul>
      <div class="access"><div><span class="k">Try it · no sign-in</span>mars.roben.club/demo</div><div><span class="k">Code</span>github.com/RobEn-AAST/RedSight</div><div class="wide"><span class="k">Every data file: URL, date, licence</span>github.com/RobEn-AAST/RedSight/blob/main/data/PROVENANCE.md</div></div>
    </div>
  </div>${foot(7)}
</div>`,
]

const css = `
@font-face{font-family:Chakra;font-weight:700;src:url(${FONTS}chakra-petch/files/chakra-petch-latin-700-normal.woff2)}
@font-face{font-family:Chakra;font-weight:600;src:url(${FONTS}chakra-petch/files/chakra-petch-latin-600-normal.woff2)}
@font-face{font-family:Plex;font-weight:400;src:url(${FONTS}ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2)}
@font-face{font-family:Plex;font-weight:500;src:url(${FONTS}ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2)}
@font-face{font-family:Plex;font-weight:600;src:url(${FONTS}ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2)}
@font-face{font-family:Mono;font-weight:500;src:url(${FONTS}ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2)}
@page{size:1920px 1080px;margin:0}
*{margin:0;padding:0;box-sizing:border-box}
body{background:#07090c}
:root{--void:#07090c;--panel:#10141b;--panel2:#161b24;--seam:#252c38;--ink:#eef1f5;--dim:#a9b0bd;--faint:#7b8394;--sig:#ffb224;--red:#e5484d;--obs:#3fc5d6;--der:#a78bfa;--scn:#f59e5b;--ok:#3ecf8e}
.s{position:relative;width:1920px;height:1080px;overflow:hidden;background:radial-gradient(1400px 800px at 85% 0%,rgba(229,72,77,.10),transparent 60%),var(--void);color:var(--ink);font:400 30px Plex;padding:64px 80px 0;page-break-after:always}
.tag{font:500 22px Mono;letter-spacing:.16em;text-transform:uppercase;color:var(--sig)}
h2{font:700 66px Chakra;line-height:1.05;margin:12px 0 34px;letter-spacing:.01em}
h3{font:600 30px Chakra;color:var(--sig);margin:26px 0 12px;letter-spacing:.03em}
b{font-weight:600;color:#fff}
.cols{display:grid;gap:48px;align-items:start}
.c2{grid-template-columns:1fr 1.15fr}.c3-2{grid-template-columns:1.45fr 1fr}.c4{grid-template-columns:600px 1fr;gap:56px}.c4 .stack{gap:14px}.c4 .kpis .n{font-size:36px}.c7{grid-template-columns:1.05fr 1fr}.c2e{grid-template-columns:1fr 1fr}
.shot{margin:0}.gif{position:relative;border-radius:14px;overflow:hidden;border:1px solid var(--seam);box-shadow:0 18px 50px rgba(0,0,0,.55);aspect-ratio:16/9}
.gif img{width:100%;height:100%;object-fit:cover;display:block}
figcaption{font:400 22px Plex;color:var(--dim);margin-top:12px}
.stack{display:flex;flex-direction:column;gap:22px}
.b{display:inline-block;font:500 17px Mono;letter-spacing:.1em;text-transform:uppercase;padding:3px 10px;border:1.5px solid;border-radius:4px;vertical-align:middle;white-space:nowrap}
.b.observed{color:var(--obs);border-color:var(--obs);background:rgba(63,197,214,.1)}.b.derived{color:var(--der);border-color:var(--der);background:rgba(167,139,250,.1)}
.b.scenario{color:var(--scn);border-color:var(--scn);background:rgba(245,158,91,.1)}.b.unavailable{color:var(--faint);border-color:var(--faint)}
.body{font-size:31px;line-height:1.45;color:#d9dde5}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin:34px 0 30px}
.stat{background:var(--panel);border:1px solid var(--seam);border-radius:12px;padding:22px 22px 20px}
.stat .n{font:700 52px Chakra;color:var(--sig)}.stat .l{font-size:23px;line-height:1.3;color:#d9dde5;margin-top:6px}.stat .src{font-size:18px;color:var(--faint);margin-top:12px}
.why{background:var(--panel2);border-radius:12px;padding:22px 26px;font-size:26px;line-height:1.45;color:#d9dde5}
.k{display:block;font:500 19px Mono;letter-spacing:.14em;text-transform:uppercase;color:var(--sig);margin-bottom:6px}
.layers{list-style:none;display:flex;flex-direction:column;gap:16px}
.layers li{display:grid;grid-template-columns:150px 1fr;align-items:center;gap:16px;background:var(--panel);border:1px solid var(--seam);border-radius:10px;padding:14px 18px}
.layers li .b{justify-self:start}.layers b{display:block;font-size:26px}.layers span{font-size:21px;color:var(--dim)}
.note{margin-top:26px;font-size:24px;color:var(--dim)}
.small{font-size:22px;line-height:1.45;color:var(--dim)}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.kpis>div{background:var(--panel);border:1px solid var(--seam);border-radius:10px;padding:14px 18px}
.kpis .n{font:700 40px Chakra;color:var(--ink)}.kpis .l{font-size:20px;color:var(--dim)}
.ba{display:grid;grid-template-columns:1fr 70px 1fr;align-items:center;margin-top:30px;gap:10px}
.ba>.ok,.ba>.no{border-radius:12px;padding:18px 24px;font-size:26px;line-height:1.35}
.ba .ok{background:rgba(62,207,142,.1);border:1.5px solid rgba(62,207,142,.6)}.ba .ok .k{color:var(--ok)}
.ba .no{background:rgba(229,72,77,.12);border:1.5px solid rgba(229,72,77,.7)}.ba .no .k{color:#ff7b7f}
.ba .arrow{font:700 54px Chakra;color:var(--sig);text-align:center}
.classes{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.classes>div{background:var(--panel);border:1px solid var(--seam);border-radius:10px;padding:16px 18px;display:flex;flex-direction:column;gap:10px;font-size:23px;color:#d9dde5}
.classes .b{align-self:flex-start}
.lim{list-style:none;display:flex;flex-direction:column;gap:12px}
.lim li{font-size:25px;line-height:1.38;color:#d9dde5;padding-left:34px;position:relative}
.lim li:before{content:'!';position:absolute;left:0;top:2px;width:24px;height:24px;border-radius:50%;background:var(--sig);color:#14100a;font:700 17px Plex;text-align:center;line-height:24px}
.chips{list-style:none;display:flex;flex-wrap:wrap;gap:10px}
.chips li{font-size:22px;padding:8px 14px;border-radius:8px;background:var(--panel);border:1px solid var(--seam)}
.chips.ok li:before{content:'✓  ';color:var(--ok);font-weight:600}.chips.nx li{color:var(--dim);border-style:dashed}
.chain{margin-top:34px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;background:var(--panel2);border-radius:12px;padding:18px 24px;font-size:24px}.chain .k{margin:0 10px 0 0}.chain i{font-style:normal;color:var(--sig);font:700 30px Chakra}
.access{display:grid;grid-template-columns:1fr 1.25fr;gap:14px;margin-top:28px}.access .wide{grid-column:1/-1;font-size:21px}
.access>div{background:var(--panel2);border-radius:10px;padding:16px 20px;font:500 23px Mono;color:#fff;white-space:nowrap}
.foot{position:absolute;left:80px;right:80px;bottom:26px;display:flex;justify-content:space-between;font:400 17px Plex;color:var(--faint)}
/* title */
.title{padding:0}.hero{position:absolute;right:0;top:0;width:1150px;height:1080px;object-fit:cover;object-position:60% 50%}
.heroShade{position:absolute;inset:0;background:linear-gradient(90deg,var(--void) 0%,var(--void) 42%,rgba(7,9,12,.55) 62%,rgba(7,9,12,.15) 100%)}
.tl{position:absolute;left:100px;top:110px;width:980px}
.logo{display:flex;align-items:center;gap:24px;margin:22px 0 10px}.logo h1{font:700 128px Chakra;letter-spacing:.12em}
.lede{font:500 50px Plex;line-height:1.22}.lede em{font-style:normal;color:var(--sig)}
.chal,.team{margin-top:34px;font-size:30px}.team{margin-top:22px}
.members{list-style:none;display:grid;grid-template-columns:repeat(3,auto);justify-content:start;gap:8px 34px;margin-top:12px;font-size:25px;color:#d9dde5}
.links{display:flex;gap:28px;margin-top:40px;font:500 24px Mono;color:#fff}.links span{background:var(--panel2);padding:10px 16px;border-radius:8px}
.herocap{position:absolute;right:30px;bottom:24px;font:400 17px Plex;color:rgba(255,255,255,.75);background:rgba(0,0,0,.5);padding:6px 12px;border-radius:6px}
`
const html = `<!doctype html><meta charset="utf-8"><style>${css}</style><body>${slides.join('\n')}</body>`
await writeFile(`${S}slides.html`, html)

// Render: PDF (live text, stills), PNG per slide, GIF boxes.
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
await page.goto(`file://${S}slides.html`, { waitUntil: 'load' }); await page.evaluate(() => document.fonts.ready)
await page.pdf({ path: `${S}redsight-slides.pdf`, width: '1920px', height: '1080px', printBackground: true })
const els = await page.$$('.s'); const boxes = []
for (const [i, el] of els.entries()) {
  await el.screenshot({ path: `${S}png/slide-${i + 1}.png` })
  boxes.push(await el.evaluate((s) => { const r0 = s.getBoundingClientRect()
    return [...s.querySelectorAll('.gif')].map((g) => { const r = g.getBoundingClientRect(); return { name: g.dataset.gif, x: r.left - r0.left, y: r.top - r0.top, w: r.width, h: r.height } }) }))
}
await browser.close()

// GIFs sized to their boxes (1.25× for crispness), ≤ ~9 MB each.
for (const b of boxes.flat()) {
  const g = GIFS[b.name], w = Math.min(1280, Math.round(b.w * 1.25 / 2) * 2), out = `${S}gif/${b.name}.gif`
  const make = (fps, colors, ww = w) => ff(['-ss', String(g.from), '-to', String(g.to), '-i', `${OUT}clips/${g.clip}.mp4`, '-vf',
    `setpts=PTS/${g.speed},fps=${fps},scale=${ww}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle`, out])
  const size = () => Number(execFileSync('stat', ['-f', '%z', out]))
  make(12, 192)
  if (size() > 9e6) make(10, 128)
  if (size() > 9e6) make(8, 96, Math.round(w * 0.75 / 2) * 2)
}

// PPTX: rendered slide as background, GIFs on top at the same boxes. Speaker notes = slide text summary.
const pres = new pptxgen(); pres.layout = 'LAYOUT_WIDE'; pres.title = 'RedSight · Team RobEn · NASA Space Apps 2026'
const k = 13.333 / 1920
const alt = ['RedSight title: Team RobEn, challenge, members, links', 'Problem: one walk, one oxygen tank, no help from Earth', 'NASA data layers stacked into one walk-scale map',
  'Plan the walk: setup, fastest vs lowest-hazard routes, rover option', 'The decision: less oxygen moves the turn-back point', 'Evidence classes and the limits we show', 'What works today and what comes next']
for (const [i, bx] of boxes.entries()) {
  const sl = pres.addSlide()
  sl.background = { path: `${S}png/slide-${i + 1}.png` }
  for (const b of bx) sl.addImage({ path: `${S}gif/${b.name}.gif`, x: b.x * k, y: b.y * k, w: b.w * k, h: b.h * k, altText: `Animated screen recording: ${b.name}`, rounding: false })
  sl.addNotes(alt[i])
}
await pres.writeFile({ fileName: `${S}redsight-slides.pptx` })
console.log(`slides → ${S}redsight-slides.pdf, ${S}redsight-slides.pptx`)
