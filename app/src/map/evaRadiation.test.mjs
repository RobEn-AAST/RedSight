// Run: cd app && node --test src/map/evaRadiation.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  computeEvaRadiationDose,
  formatCareerPct,
  formatRadiationDoseMSv,
  parseRadCardParams,
} from './evaRadiation.ts'

const DATA = join(dirname(fileURLToPath(import.meta.url)), '../../public/data')
const BANNED = ['safe route', 'safe time remaining', 'certified', 'flight-safe', 'real-time', 'validated']

test('parses committed cards/rad.json without banned wording or mock flag', () => {
  const rawText = readFileSync(join(DATA, 'cards/rad.json'), 'utf8')
  const lower = rawText.toLowerCase()
  for (const phrase of BANNED) {
    assert.equal(lower.includes(phrase), false, `unexpected banned wording ${phrase}`)
  }
  const raw = JSON.parse(rawText)
  assert.equal(raw._mock, undefined, 'cards/rad.json must not be marked _mock')

  const params = parseRadCardParams(raw)
  assert.ok(params, 'parseRadCardParams must succeed on committed cards/rad.json')
  assert.equal(params.rateMSvPerDay, 0.64)
  assert.equal(params.ratePmMSvPerDay, 0.12)
  assert.equal(params.careerLimitMSv, 600)
  assert.equal(params.sepValueText, '418 µGy (Si)')
  assert.equal(params.mock, false)
})

test('4-hour EVA dose matches rad.json baseline (~0.11 mSv) and NASA-STD-3001 comparison', () => {
  const raw = JSON.parse(readFileSync(join(DATA, 'cards/rad.json'), 'utf8'))
  const params = parseRadCardParams(raw)
  assert.ok(params)

  const est = computeEvaRadiationDose(4 * 3600, params)
  assert.ok(est)
  assert.equal(est.evaHours, 4)
  assert.ok(Math.abs(est.doseMSv - 0.64 / 6) < 1e-12)
  assert.equal(formatRadiationDoseMSv(est.doseMSv), '0.11')
  assert.equal(formatRadiationDoseMSv(est.doseMinMSv), '0.09')
  assert.equal(formatRadiationDoseMSv(est.doseMaxMSv), '0.13')
  assert.equal(est.careerLimitMSv, 600)
  assert.equal(formatCareerPct(est.careerLimitPct), '0.018')
  assert.equal(est.shieldingModeled, false)
  assert.equal(est.sepIncluded, false)
})

test('every committed plan file yields a valid finite EVA dose estimate', () => {
  const params = parseRadCardParams(JSON.parse(readFileSync(join(DATA, 'cards/rad.json'), 'utf8')))
  assert.ok(params)

  const planFiles = readdirSync(join(DATA, 'plan')).filter((f) => f.endsWith('.json') && f !== 'index.json')
  assert.ok(planFiles.length > 0)
  for (const f of planFiles) {
    const plan = JSON.parse(readFileSync(join(DATA, 'plan', f), 'utf8'))
    const m = plan.together[0]
    const last = m.coords.length - 1
    const durationS = m.cum.t_s[last] + m.back.t_s[last]
    const est = computeEvaRadiationDose(durationS, params)
    assert.ok(est, `expected dose estimate for ${f}`)
    assert.ok(est.doseMSv > 0 && est.doseMSv < est.careerLimitMSv)
    assert.equal(est.shieldingModeled, false)
  }
})

test('handles zero duration, negative/NaN inputs, and missing rad.json cleanly', () => {
  const params = parseRadCardParams(JSON.parse(readFileSync(join(DATA, 'cards/rad.json'), 'utf8')))
  assert.ok(params)

  const zero = computeEvaRadiationDose(0, params)
  assert.ok(zero)
  assert.equal(zero.doseMSv, 0)
  assert.equal(formatRadiationDoseMSv(zero.doseMSv), '0.00')
  assert.equal(formatCareerPct(zero.careerLimitPct), '0.00')

  assert.equal(computeEvaRadiationDose(-10, params), null)
  assert.equal(computeEvaRadiationDose(Number.NaN, params), null)
  assert.equal(computeEvaRadiationDose(3600, null), null)
  assert.equal(parseRadCardParams(null), null)
  assert.equal(parseRadCardParams({ title: 'Empty', values: [] }), null)
  assert.equal(
    parseRadCardParams({
      title: 'Missing limit',
      values: [{ label: 'Rate', value: 0.64, unit: 'mSv/day' }],
    }),
    null,
  )
})
