// Records every demo shot from the running app. Usage:
//   node capture/shots.mjs [baseUrl] [shotName ...]
// Default baseUrl http://localhost:5199/. Output: out/clips/<shot>.mp4 (1920x1080, 30 fps) and
// out/stills/<shot>.png (2880x1620). Only capture/selectors.mjs should need edits when the UI changes.
import { chromium } from 'playwright'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { sel } from './selectors.mjs'

const args = process.argv.slice(2)
const BASE = args[0]?.startsWith('http') ? args.shift() : 'http://localhost:5199/'
const ONLY = new Set(args)
const OUT = new URL('../out/', import.meta.url).pathname
const VIEW = { width: 1440, height: 810 } // CSS px; UI reads well at this size
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Visible cursor + click ripple, injected into every page (the recording has no OS cursor).
const CURSOR = `(() => {
  const css = '#rs-cur{position:fixed;z-index:2147483647;pointer-events:none;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;border:2px solid #fff;background:rgba(255,178,36,.55);box-shadow:0 0 0 2px rgba(0,0,0,.45);transition:transform .12s}'+
    '#rs-cur.down{transform:scale(.7)}.rs-rip{position:fixed;z-index:2147483646;pointer-events:none;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;border:3px solid #ffb224;animation:rsr .55s ease-out forwards}'+
    '@keyframes rsr{to{transform:scale(3.2);opacity:0}}'
  const add = () => { if (document.getElementById('rs-cur')) return
    const s=document.createElement('style');s.textContent=css;document.head.appendChild(s)
    const c=document.createElement('div');c.id='rs-cur';c.style.left='-50px';document.body.appendChild(c)
    addEventListener('mousemove',e=>{c.style.left=e.clientX+'px';c.style.top=e.clientY+'px'},true)
    addEventListener('mousedown',e=>{c.classList.add('down');const r=document.createElement('div');r.className='rs-rip';r.style.left=e.clientX+'px';r.style.top=e.clientY+'px';document.body.appendChild(r);setTimeout(()=>r.remove(),700)},true)
    addEventListener('mouseup',()=>c.classList.remove('down'),true) }
  document.readyState==='loading'?addEventListener('DOMContentLoaded',add):add()
})()`

let mouse = { x: VIEW.width / 2, y: VIEW.height / 2 }
async function moveTo(p, x, y, ms = 450) {
  const steps = Math.max(8, Math.round(ms / 16))
  await p.mouse.move(x, y, { steps })
  mouse = { x, y }
}
async function click(p, loc, { pause = 250 } = {}) {
  await loc.scrollIntoViewIfNeeded()
  const b = await loc.boundingBox()
  await moveTo(p, b.x + b.width / 2, b.y + b.height / 2)
  await sleep(120)
  await p.mouse.down(); await sleep(70); await p.mouse.up()
  await sleep(pause)
}

// CDP screencast recorder: frames + timestamps -> constant 30 fps MP4.
async function startRec(p, name) {
  const cdp = await p.context().newCDPSession(p)
  const dir = `${OUT}frames/${name}/`
  await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true })
  const frames = []
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const f = `${dir}${String(frames.length).padStart(5, '0')}.jpg`
    frames.push({ f, t: metadata.timestamp })
    await writeFile(f, Buffer.from(data, 'base64'))
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 })
  return async function stop() {
    const end = Date.now() / 1000
    await cdp.send('Page.stopScreencast'); await sleep(300)
    let list = ''
    frames.forEach((fr, i) => {
      const dur = ((frames[i + 1]?.t ?? end) - fr.t).toFixed(4)
      list += `file '${fr.f}'\nduration ${dur}\n`
    })
    if (frames.length) list += `file '${frames.at(-1).f}'\n`
    await writeFile(`${dir}list.txt`, list)
    await mkdir(`${OUT}clips`, { recursive: true })
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${dir}list.txt`,
      '-vf', 'scale=1920:1080:flags=lanczos,fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '16', '-preset', 'slow',
      `${OUT}clips/${name}.mp4`])
    console.log(`  clip  out/clips/${name}.mp4  (${frames.length} frames)`)
  }
}

async function still(p, name) {
  await mkdir(`${OUT}stills`, { recursive: true })
  await p.screenshot({ path: `${OUT}stills/${name}.png` })
  console.log(`  still out/stills/${name}.png`)
}

async function freshPage(browser) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2, reducedMotion: 'no-preference' })
  await ctx.addInitScript(CURSOR)
  const p = await ctx.newPage()
  await p.goto(BASE, { waitUntil: 'networkidle' })
  await sleep(800)
  return p
}

// Fast, unrecorded path to the routes screen (boxwork goal, defaults otherwise).
async function toRoutes(p, { rover = false } = {}) {
  await sel.next(p).click(); await sleep(300); await sel.next(p).click(); await sleep(300)
  if (rover) await sel.roverOption(p).click()
  await sel.next(p).click()
  await sel.goalBoxwork(p).click()
  await sel.next(p).click()
  await sel.showRoutes(p).click()
  await sleep(4000)
}
async function scrollPanelTo(p, loc) {
  await loc.evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }))
  await sleep(500)
}
async function setBudget(p, litres, ms = 1600) {
  const s = sel.budgetSlider(p)
  const max = Number(await s.getAttribute('max'))
  const cur = Number(await s.inputValue())
  const b = await s.boundingBox()
  const pad = 8 // thumb radius
  const xAt = (v) => b.x + pad + (b.width - 2 * pad) * (v / max)
  await moveTo(p, xAt(cur), b.y + b.height / 2)
  await p.mouse.down()
  await moveTo(p, xAt(litres), b.y + b.height / 2, ms)
  await p.mouse.up()
}

const SHOTS = {
  // 1. Mission setup: crew, goal (boxwork), show routes.
  async setup(p) {
    const stop = await startRec(p, 'setup')
    await sleep(900)
    for (let i = 0; i < 3; i++) await click(p, sel.next(p), { pause: 700 })
    await click(p, sel.goalBoxwork(p), { pause: 900 })
    await click(p, sel.next(p), { pause: 1200 })
    await click(p, sel.showRoutes(p), { pause: 4500 })
    await stop(); await still(p, 'setup-end')
  },
  // 2. The map: NASA layers on, Curiosity path, stops.
  async map(p) {
    await toRoutes(p)
    const stop = await startRec(p, 'map')
    await sleep(800)
    await click(p, sel.layersBtn(p), { pause: 900 })
    await still(p, 'map-layers')
    await click(p, sel.layerToggle(p, 'Hillshade'), { pause: 1400 })
    await click(p, sel.layerToggle(p, 'Hillshade'), { pause: 600 })
    await click(p, sel.layersBtn(p), { pause: 900 })
    await click(p, sel.stopCard(p, 'S2'), { pause: 2200 })
    await click(p, sel.stopCard(p, 'S1'), { pause: 2200 })
    await stop(); await still(p, 'map-route')
  },
  // 3. Route choice: fastest vs lowest hazard.
  async routes(p) {
    await toRoutes(p)
    const stop = await startRec(p, 'routes')
    await sleep(700)
    await click(p, sel.routePref(p, 'Lowest hazard'), { pause: 2200 })
    await still(p, 'routes-lowest-hazard')
    await click(p, sel.routePref(p, 'Fastest'), { pause: 2200 })
    await stop(); await still(p, 'routes-fastest')
  },
  // 4. The decision: less usable O2 -> modeled turn-back point appears before the stop.
  async decision(p) {
    await toRoutes(p)
    await scrollPanelTo(p, sel.o2Heading(p))
    await still(p, 'decision-before')
    const stop = await startRec(p, 'decision')
    await sleep(900)
    await setBudget(p, 70, 2200)
    await sleep(2600)
    await stop(); await still(p, 'decision-after')
  },
  // 5. Replay of the same reduced-budget mission: walk out, turn at the marker, head home.
  async replay(p) {
    await toRoutes(p)
    await scrollPanelTo(p, sel.o2Heading(p))
    await setBudget(p, 70, 200)
    await sel.replayFold(p).click(); await sleep(500)
    await sel.replayLength(p).selectOption('30 s')
    await scrollPanelTo(p, sel.o2Heading(p))
    const stop = await startRec(p, 'replay')
    await sleep(600)
    await click(p, sel.play(p).first(), { pause: 0 })
    for (let t = 0; t < 32; t++) { await sleep(1000); if (t === 14) await still(p, 'replay-turn') }
    await stop(); await still(p, 'replay-end')
  },
  // 6. Contingency drill (Scenario multiplier) during the replay.
  async drill(p) {
    await toRoutes(p)
    await sel.replayFold(p).click(); await sleep(500)
    await sel.replayLength(p).selectOption('30 s')
    await scrollPanelTo(p, sel.replayFold(p))
    const stop = await startRec(p, 'drill')
    await click(p, sel.play(p).first(), { pause: 3500 })
    await click(p, sel.drill(p, 'Suit leak ×2'), { pause: 0 })
    for (let t = 0; t < 12; t++) { await sleep(1000); if (t === 4) await still(p, 'drill') }
    await stop()
  },
  // 7. Evidence: a source chip, then the provenance inspector.
  async sources(p) {
    await toRoutes(p)
    await scrollPanelTo(p, sel.o2Heading(p))
    const stop = await startRec(p, 'sources')
    await sleep(600)
    await click(p, sel.sourceChip(p), { pause: 2000 })
    await still(p, 'sources-chip')
    await click(p, sel.sourcesBtn(p), { pause: 1500 })
    await still(p, 'sources-inspector')
    await p.mouse.wheel(0, 600); await sleep(1600)
    await stop()
  },
  // 8. Tier 2 prototype: 360 photo stand-in + AR helmet HUD.
  async hud(p) {
    await toRoutes(p)
    await sel.replayFold(p).click(); await sleep(500)
    await click(p, sel.hudBtn(p), { pause: 0 })
    await sleep(5000)
    const stop = await startRec(p, 'hud')
    await still(p, 'hud')
    await click(p, sel.hudTour(p), { pause: 0 })
    await sleep(9000)
    await stop(); await still(p, 'hud-tour')
  },
  // 10. Rover Scenario: drive the walking path, park ~100 m short, walk the last leg.
  async rover(p) {
    await toRoutes(p, { rover: true })
    await still(p, 'rover-plan')
    await sel.replayFold(p).click(); await sleep(500)
    await sel.replayLength(p).selectOption('30 s')
    const stop = await startRec(p, 'rover')
    await click(p, sel.play(p).first(), { pause: 0 })
    for (let t = 0; t < 16; t++) { await sleep(1000); if (t === 8) await still(p, 'rover-drive') }
    await stop()
  },
  // 11. Why this route: cost explanation + elevation profile.
  async profile(p) {
    await toRoutes(p)
    const stop = await startRec(p, 'profile')
    const why = sel.fold(p, 'Why this route')
    await click(p, why, { pause: 600 })
    await why.evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'smooth' })); await sleep(1200)
    await still(p, 'profile')
    const svg = p.locator('details[open] svg').filter({ visible: true }).last()
    const b = await svg.boundingBox().catch(() => null)
    if (b) { await moveTo(p, b.x + 10, b.y + b.height / 2, 300); await moveTo(p, b.x + b.width - 10, b.y + b.height / 2, 2500) }
    await sleep(800)
    await stop(); await still(p, 'profile-hover')
  },
  // 12. Environment folds: daylight + EVA radiation dose.
  async environment(p) {
    await toRoutes(p)
    for (const [f, n] of [['Daylight', 'daylight'], ['Radiation dose', 'radiation']]) {
      const s = sel.fold(p, f); await s.click(); await sleep(500)
      await s.evaluate((el) => el.scrollIntoView({ block: 'start' })); await sleep(600)
      await still(p, n)
    }
  },
  // 13. HUD details + emergency (simulated comms, local UI only).
  async huddetails(p) {
    await toRoutes(p)
    await sel.replayFold(p).click(); await sleep(500)
    await sel.hudBtn(p).click(); await sleep(5000)
    const stop = await startRec(p, 'huddetails')
    await click(p, sel.hudDetails(p), { pause: 2000 })
    await still(p, 'hud-details')
    await click(p, sel.hudEmergency(p), { pause: 3000 })
    await still(p, 'hud-emergency')
    await stop()
  },
  // 9. Copilot drawer (only shown if it works in the final build).
  async copilot(p) {
    await toRoutes(p)
    const stop = await startRec(p, 'copilot')
    await click(p, sel.copilotBtn(p), { pause: 3000 })
    await stop(); await still(p, 'copilot')
  },
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] })
let failed = 0
for (const [name, fn] of Object.entries(SHOTS)) {
  if (ONLY.size && !ONLY.has(name)) continue
  console.log(`shot: ${name}`)
  const p = await freshPage(browser)
  try { await fn(p) } catch (e) { failed++; console.error(`  FAILED ${name}: ${e.message.split('\n')[0]}`) }
  await p.context().close()
}
await browser.close()
process.exit(failed ? 1 : 0)
