// Records every demo shot from the running app. Usage:
//   node capture/shots.mjs [baseUrl] [shotName ...]
// Default baseUrl http://localhost:5199/. Output: out/clips/<shot>.mp4 (1920x1080, 30 fps) and
// out/stills/<shot>.png (2880x1620). Only capture/selectors.mjs should need edits when the UI changes.
import { chromium } from 'playwright'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { sel } from './selectors.mjs'

const args = process.argv.slice(2)
const BASE = args[0]?.startsWith('http') ? args.shift() : 'https://mars.roben.club/demo/'
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
  await sleep(6500)
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

const tab = (p, name) => p.getByRole('tab', { name })
async function openTab(p, name, rec = false) { if (rec) await click(p, tab(p, name), { pause: 700 }); else { await tab(p, name).click(); await sleep(700) } }
async function openFold(p, name, rec = false) {
  const f = sel.fold(p, name)
  if (rec) await click(p, f, { pause: 500 }); else { await f.click(); await sleep(400) }
  await f.evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'smooth' })); await sleep(900)
}

async function copilotShot(p, name, question, tailMs) {
  await toRoutes(p)
  await sel.play(p).click().catch(() => {}); await sleep(7000)
  await sel.copilotBtn(p).click(); await sleep(2500)
  const box = p.getByPlaceholder(/message the copilot/i)
  const stop = await startRec(p, name)
  await sleep(800)
  await click(p, box, { pause: 300 })
  await box.pressSequentially(question, { delay: 45 }); await sleep(500)
  await box.press('Enter')
  let prev = '', same = 0
  for (let i = 0; i < 50 && same < 4; i++) { await sleep(1000); const t = await p.locator('body').innerText(); same = t === prev && i > 4 ? same + 1 : 0; prev = t }
  await sleep(tailMs)
  await stop(); await still(p, name)
  await writeFile(`${OUT}stills/${name}.txt`, prev.slice(prev.lastIndexOf(question)))
  if (/rate limited|ERROR/i.test(prev.slice(prev.lastIndexOf(question)))) console.log(`  !! ${name}: copilot error (see stills/${name}.txt)`)
}

const SHOTS = {
  // Copilot (text chat, live backend): ask mid-walk, the copilot reads the app data and answers.
  async 'copilot-ask'(p) { await copilotShot(p, 'copilot-ask', 'How much oxygen do I have left?', 8000) },
  // Emergency: the copilot runs mission control (hold position, fastest return, rover dispatch) and answers.
  async 'copilot-emergency'(p) { await copilotShot(p, 'copilot-emergency', 'I fell. I think my leg is broken. I need help.', 14000) },
  // Mission setup: crew, load, rover, goal (boxwork), review, show routes.
  async setup(p) {
    const stop = await startRec(p, 'setup')
    await sleep(900)
    for (let i = 0; i < 3; i++) await click(p, sel.next(p), { pause: 900 })
    await click(p, sel.goalBoxwork(p), { pause: 1000 })
    await click(p, sel.next(p), { pause: 1400 })
    await click(p, sel.showRoutes(p), { pause: 6000 })
    await stop(); await still(p, 'setup-end')
  },
  // Problem: zoom out to the wider crater, then back in to the walk.
  async overview(p) {
    await toRoutes(p)
    const zin = p.getByRole('button', { name: 'Zoom in' }), zout = p.getByRole('button', { name: 'Zoom out' })
    for (let i = 0; i < 4; i++) { await zout.click(); await sleep(250) }
    await sleep(2500)
    const stop = await startRec(p, 'overview')
    await sleep(800)
    for (let i = 0; i < 4; i++) await click(p, zin, { pause: 900 })
    await sleep(1500)
    await stop()
  },
  // NASA layers toggled one by one.
  async map(p) {
    await toRoutes(p)
    const stop = await startRec(p, 'map')
    await sleep(600)
    await click(p, sel.layersBtn(p), { pause: 900 })
    for (const l of ['Hillshade', 'Slope', 'THEMIS thermal inertia (sand proxy)', 'CRISM mineral indicators', 'Geologic units (SIM 3292)']) {
      await click(p, sel.layerToggle(p, l), { pause: 1500 })
      await still(p, 'layer-' + l.split(' ')[0].toLowerCase())
      await click(p, sel.layerToggle(p, l), { pause: 400 })
    }
    await click(p, sel.layersBtn(p), { pause: 800 })
    await stop()
  },
  // Route choice + why this route (profile).
  async routes(p) {
    await toRoutes(p)
    const stop = await startRec(p, 'routes')
    await sleep(500)
    await openTab(p, 'Route', true)
    await click(p, sel.routePref(p, /^Lowest hazard/), { pause: 2000 })
    await still(p, 'routes-lowest-hazard')
    await click(p, sel.routePref(p, /^Fastest/), { pause: 1500 })
    await openFold(p, 'Why this route', true)
    const svg = p.locator('details[open] svg').filter({ visible: true }).last()
    const b = await svg.boundingBox().catch(() => null)
    if (b) { await moveTo(p, b.x + 10, b.y + b.height / 2, 300); await moveTo(p, b.x + b.width - 10, b.y + b.height / 2, 2600) }
    await sleep(600)
    await stop(); await still(p, 'profile')
  },
  // Mission factors (Scenario inputs).
  async factors(p) {
    await toRoutes(p)
    await openTab(p, 'Route')
    await openFold(p, 'Mission factors')
    await still(p, 'factors')
  },
  // The decision: usable O2 288.8 L -> 70 L moves the turn-back point.
  async decision(p) {
    await toRoutes(p)
    await openTab(p, 'Plan')
    await still(p, 'decision-before')
    const stop = await startRec(p, 'decision')
    await sleep(900)
    await setBudget(p, 70, 2400)
    await sleep(2600)
    await stop(); await still(p, 'decision-after')
  },
  // Replay of the reduced-budget walk: out, turn at the marker, home.
  async replay(p) {
    await toRoutes(p)
    await openTab(p, 'Plan'); await setBudget(p, 70, 200)
    await openTab(p, 'Replay')
    await sel.replayLength(p).selectOption('30 s')
    const stop = await startRec(p, 'replay')
    await sleep(600)
    await click(p, sel.play(p).last(), { pause: 0 })
    for (let t = 0; t < 32; t++) { await sleep(1000); if (t === 14) await still(p, 'replay-turn') }
    await stop(); await still(p, 'replay-end')
  },
  // Suit-leak drill during the full-budget replay.
  async drill(p) {
    await toRoutes(p)
    await openTab(p, 'Replay')
    await sel.replayLength(p).selectOption('30 s')
    const stop = await startRec(p, 'drill')
    await click(p, sel.play(p).last(), { pause: 3500 })
    await click(p, sel.drill(p, 'Suit leak ×2'), { pause: 0 })
    for (let t = 0; t < 14; t++) { await sleep(1000); if (t === 5) await still(p, 'drill') }
    await stop()
  },
  // Rover Scenario: drive, park ~100 m short, walk the last leg.
  async rover(p) {
    await toRoutes(p, { rover: true })
    await still(p, 'rover-plan')
    await openTab(p, 'Replay')
    await sel.replayLength(p).selectOption('30 s')
    const stop = await startRec(p, 'rover')
    await click(p, sel.play(p).last(), { pause: 0 })
    for (let t = 0; t < 16; t++) { await sleep(1000); if (t === 8) await still(p, 'rover-drive') }
    await stop()
  },
  // Daylight + radiation folds.
  async environment(p) {
    await toRoutes(p)
    await openTab(p, 'Plan')
    await openFold(p, 'Daylight'); await still(p, 'daylight')
    await openFold(p, 'Radiation dose'); await still(p, 'radiation')
  },
  // 360 photo stand-in + helmet HUD: tour, details, emergency.
  async hud(p) {
    await toRoutes(p)
    await click(p, p.getByRole('button', { name: /^360° view \+ helmet HUD/ }), { pause: 0 })
    await sleep(6000)
    const stop = await startRec(p, 'hud')
    await still(p, 'hud')
    await click(p, sel.hudTour(p), { pause: 0 })
    await sleep(9000)
    await click(p, sel.hudTour(p).or(p.getByRole('button', { name: /STOP|Stop/ })).first(), { pause: 600 }).catch(() => {})
    await click(p, sel.hudDetails(p), { pause: 2200 })
    await still(p, 'hud-details')
    await click(p, sel.hudEmergency(p), { pause: 3000 })
    await still(p, 'hud-emergency')
    await stop()
  },
  // Evidence: a source chip, then the provenance inspector.
  async sources(p) {
    await toRoutes(p)
    await openTab(p, 'Plan')
    const stop = await startRec(p, 'sources')
    await sleep(500)
    await click(p, sel.sourceChip(p), { pause: 1800 })
    await still(p, 'sources-chip')
    await click(p, sel.sourcesBtn(p), { pause: 1600 })
    await still(p, 'sources-inspector')
    await p.mouse.wheel(0, 500); await sleep(1500)
    await stop()
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
