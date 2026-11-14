// Real test of the deployed copilot: type each slide-6 ask into the live app, save the reply text + a still.
// Output: out/copilot/reply-<key>.txt (used by build/deck.mjs) and out/copilot/reply-<key>.png
import { chromium } from 'playwright'
import { writeFile, mkdir } from 'node:fs/promises'
import { sel } from './selectors.mjs'
const ASKS = { normal: 'How much oxygen do I have left?', emergency: 'I fell. I think my leg is broken. I need help.' }
const OUT = new URL('../out/copilot/', import.meta.url).pathname
await mkdir(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const b = await chromium.launch()
for (const [key, q] of Object.entries(ASKS)) {
  const p = await (await b.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2 })).newPage()
  await p.goto('https://mars.roben.club/demo/', { waitUntil: 'load', timeout: 60000 }); await sleep(4000)
  await sel.next(p).click(); await sleep(300); await sel.next(p).click(); await sleep(300); await sel.next(p).click()
  await sel.goalBoxwork(p).click(); await sel.next(p).click(); await sel.showRoutes(p).click(); await sleep(6000)
  // start the replay so the walk has a live position and O2 level, then ask mid-walk
  await sel.play(p).click().catch(() => {}); await sleep(5000)
  await sel.copilotBtn(p).click(); await sleep(2500)
  const box = p.getByPlaceholder(/message the copilot/i)
  await box.fill(q); await box.press('Enter')
  let prev = '', same = 0
  for (let i = 0; i < 45 && same < 4; i++) { await sleep(1000); const t = await p.locator('body').innerText(); same = t === prev ? same + 1 : 0; prev = t }
  await p.screenshot({ path: `${OUT}reply-${key}.png` })
  const tail = prev.slice(prev.lastIndexOf(q) + q.length).trim()
  await writeFile(`${OUT}reply-${key}.raw.txt`, tail)
  console.log(`=== ${key}\n${tail.slice(0, 900)}\n`)
  await p.context().close()
}
await b.close()
