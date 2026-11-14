// Real Gemini Live test: feed each slide-6 ask (out/copilot/mic-<key>.wav) into a fake microphone, start a voice
// call in the deployed app mid-walk, and save the live transcript of the copilot's spoken reply.
// Output: out/copilot/reply-<key>.txt (used by build/deck.mjs) + reply-<key>.png
import { chromium } from 'playwright'
import { writeFile } from 'node:fs/promises'
import { sel } from './selectors.mjs'
const OUT = new URL('../out/copilot/', import.meta.url).pathname
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
for (const key of process.argv.slice(2).length ? process.argv.slice(2) : ['normal', 'emergency']) {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${OUT}mic-${key}.wav`, '--autoplay-policy=no-user-gesture-required'] })
  const ctx = await b.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2, permissions: ['microphone'] })
  const p = await ctx.newPage()
  await p.goto('https://mars.roben.club/demo/', { waitUntil: 'load', timeout: 60000 }); await sleep(4000)
  await sel.next(p).click(); await sleep(300); await sel.next(p).click(); await sleep(300); await sel.next(p).click()
  await sel.goalBoxwork(p).click(); await sel.next(p).click(); await sel.showRoutes(p).click(); await sleep(6000)
  await sel.play(p).click().catch(() => {}); await sleep(6000)
  await sel.copilotBtn(p).click(); await sleep(2500)
  await p.getByRole('button', { name: /start voice call/i }).click()
  let prev = '', same = 0
  for (let i = 0; i < 40 && same < 6; i++) { await sleep(1000); const t = await p.locator('body').innerText(); same = t === prev && i > 10 ? same + 1 : 0; prev = t }
  await p.screenshot({ path: `${OUT}reply-${key}.png` })
  await writeFile(`${OUT}reply-${key}.raw.txt`, prev)
  const i = prev.search(/COPILOT|Copilot/); console.log(`=== ${key}\n${prev.slice(-1600)}\n`)
  await p.getByRole('button', { name: /end voice call/i }).first().click().catch(() => {})
  await b.close()
}
