// Run: cd app && node --test src/lib/factors.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { evaluateFactors, validateFactorPatch, describeRouting } from './factors.ts'

const defs = JSON.parse(readFileSync(new URL('../../public/data/factors.json', import.meta.url), 'utf8'))
const settings = (over = {}) => ({
  radiationBudgetMsv: 0.5, sepEvent: false, startLocalHour: 8, daylightRequired: true,
  coldLimitK: null, stopMinutes: 30, ...over,
})
// 2 h round trip (Earth seconds) at Gale-like daylight 06:00–18:00.
const route = { total_s: 2 * 3600 }
const daylight = { sunrise: 6, sunset: 18, dayLength: 12, ls: 0, declDeg: 0 }
const byId = (list, id) => list.find((v) => v.id === id)

test('radiation: dose = RAD rate x (route + stop time) in sols', () => {
  const v = byId(evaluateFactors(route, settings(), defs, daylight), 'radiation')
  const sols = (2 * 3600 + 30 * 60) / (24.6597 * 3600)
  assert.ok(Math.abs(v.value - 0.64 * sols) < 1e-6)
  assert.equal(v.status, 'within')
  assert.equal(v.badge, 'Scenario')
})

test('radiation: tiny budget is exceeded; SEP scenario adds the event dose', () => {
  assert.equal(byId(evaluateFactors(route, settings({ radiationBudgetMsv: 0.01 }), defs, daylight), 'radiation').status, 'over')
  const base = byId(evaluateFactors(route, settings(), defs, daylight), 'radiation').value
  const sep = byId(evaluateFactors(route, settings({ sepEvent: true }), defs, daylight), 'radiation').value
  assert.ok(Math.abs(sep - base - 0.418) < 1e-9)
})

test('daylight: ends before sunset is within; late start is over; disabled is off', () => {
  assert.equal(byId(evaluateFactors(route, settings(), defs, daylight), 'daylight').status, 'within')
  assert.equal(byId(evaluateFactors(route, settings({ startLocalHour: 16 }), defs, daylight), 'daylight').status, 'over')
  assert.equal(byId(evaluateFactors(route, settings({ startLocalHour: 4 }), defs, daylight), 'daylight').status, 'over')
  assert.equal(byId(evaluateFactors(route, settings({ daylightRequired: false }), defs, daylight), 'daylight').status, 'off')
})

test('cold: no limit is off; a limit above the modeled minimum is over', () => {
  assert.equal(byId(evaluateFactors(route, settings(), defs, daylight), 'cold').status, 'off')
  // Starting at 02:00 LTST is near the modeled minimum (~173 K); a 200 K limit is violated.
  assert.equal(byId(evaluateFactors(route, settings({ coldLimitK: 200, startLocalHour: 2 }), defs, daylight), 'cold').status, 'over')
  // Afternoon start stays warm: 200 K limit is met.
  assert.equal(byId(evaluateFactors(route, settings({ coldLimitK: 200, startLocalHour: 12 }), defs, daylight), 'cold').status, 'within')
})

test('validateFactorPatch enforces ranges from factors.json and rejects unknown fields', () => {
  assert.equal(validateFactorPatch({ sandWeight: 2, hazardWeight: 0.3, radiationBudgetMsv: 1, sepEvent: true, startLocalHour: 9, daylightRequired: false, coldLimitK: 190, stopMinutes: 45 }, defs), null)
  assert.equal(validateFactorPatch({ coldLimitK: null }, defs), null)
  assert.match(validateFactorPatch({ sandWeight: 4 }, defs), /sandWeight/)
  assert.match(validateFactorPatch({ hazardWeight: -0.1 }, defs), /hazardWeight/)
  assert.match(validateFactorPatch({ sepEvent: 'yes' }, defs), /sepEvent/)
  assert.match(validateFactorPatch({ coldLimitK: 100 }, defs), /coldLimitK/)
  assert.match(validateFactorPatch({ rm: 1 }, defs), /Unsupported factor/)
  assert.match(validateFactorPatch({ sandWeight: NaN }, defs), /sandWeight/)
})

test('describeRouting explains what shaped the route without banned wording', () => {
  const lines = describeRouting({ objective: 'balanced', slope_cap_deg: 12, sand_weight: 2, hazard_weight: 0.7 })
  const text = lines.join(' ')
  assert.match(text, /12/)
  assert.match(text, /sand/i)
  assert.doesNotMatch(text, /safe route|certified|flight-safe|real-time|validated/i)
})

test('RAD rate in factors.json matches the shipped RAD card (single source of truth guard)', () => {
  const rad = JSON.parse(readFileSync(new URL('../../public/data/cards/rad.json', import.meta.url), 'utf8'))
  const rate = rad.values.find((v) => v.unit === 'mSv/day')
  assert.equal(defs.constants.rad_msv_per_day.value, rate.value)
  const sep = rad.values.find((v) => /sep/i.test(v.label))
  assert.equal(defs.constants.sep_event_msv.value, sep.value / 1000)
})
