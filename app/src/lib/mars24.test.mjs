// Run: cd app && node --experimental-strip-types --test src/lib/mars24.test.mjs   (Node ≥ 22.18: no flag needed)
// Expected values are the worked examples on NASA GISS Mars24's algorithm page (accessed 2026-11-13).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { marsSun, localTrueSolarTime, daylightAt, formatMarsClock, SOL_S } from './mars24.ts'

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`)

test('Mars24 example 1: 2000-01-06 00:00 UTC at 0°', () => {
  const s = marsSun(947116800000)
  near(s.dtJ2000, 4.50074, 1e-5, 'ΔtJ2000')
  near(s.ls, 277.18758, 1e-4, 'Ls')
  near(s.eotDeg, -5.18774, 1e-4, 'EOT')
  near(s.mst, 23.99425, 1e-4, 'MST')
  near(s.declDeg, -25.22825, 1e-4, 'declination')
  near(localTrueSolarTime(947116800000, 0), 23.6484, 1e-4, 'LTST')
})

test('Mars24 example 2: Spirit landing target, local true midnight', () => {
  const t = 1073137591000
  near(marsSun(t).ls, 327.32416, 1e-4, 'Ls')
  const ltst = localTrueSolarTime(t, -184.702)
  near(Math.min(ltst, 24 - ltst), 0, 1e-3, 'LTST at midnight')
})

test('equator day is 12 Mars hours; sunrise and sunset sit around noon', () => {
  const d = daylightAt(947116800000, 0, 0)
  near(d.dayLength, 12, 1e-9, 'day length')
  near((d.sunrise + d.sunset) / 2, 12, 1e-9, 'noon')
})

test('Gale (4.6°S) has longer days in southern summer than in southern winter', () => {
  const summer = daylightAt(947116800000, 137.4, -4.8) // Ls ≈ 277
  assert.ok(summer.dayLength > 12)
  // half a Mars year later (≈ 343.5 Earth days) Ls is near 90: southern winter
  const winter = daylightAt(947116800000 + 343.5 * 86400e3, 137.4, -4.8)
  assert.ok(winter.dayLength < 12, `winter ${winter.dayLength}`)
})

test('sol length and clock formatting', () => {
  near(SOL_S, 88775.244, 1e-3, 'sol')
  assert.equal(formatMarsClock(6.5), '06:30')
  assert.equal(formatMarsClock(23.999), '00:00')
})
