// node --test src/hud/earthDelay.test.mjs  (uses Node's TypeScript type stripping)
import test from 'node:test'
import assert from 'node:assert/strict'
import { earthMarsKm, oneWayDelayS } from './earthDelay.ts'

// Known geometry: closest approach 2003-08-27 ≈ 55.76 million km (NASA). At solar conjunction the distance
// must be near its maximum: Earth (~1 AU) + Mars (1.38–1.67 AU) on opposite sides of the Sun.
test('2003 closest approach ≈ 55.8 million km (~3.1 light-min)', () => {
  const km = earthMarsKm(new Date('2003-08-27T10:00:00Z'))
  assert.ok(Math.abs(km - 55.76e6) < 1.0e6, String(km))
  assert.ok(Math.abs(oneWayDelayS(new Date('2003-08-27T10:00:00Z')) / 60 - 3.1) < 0.1)
})
test('2023-11-18 solar conjunction: 2.38–2.68 AU', () => {
  const km = earthMarsKm(new Date('2023-11-18T00:00:00Z'))
  const au = km / 149_597_870.7
  assert.ok(au > 2.38 && au < 2.68, String(au))
})
test('always within the 3–22 min range', () => {
  for (let y = 2020; y < 2030; y += 0.25) {
    const m = oneWayDelayS(new Date(Date.UTC(Math.floor(y), Math.round((y % 1) * 12), 1))) / 60
    assert.ok(m > 3 && m < 22.5, `${y}: ${m}`)
  }
})
