import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { memberO2Factors, pandolfPowerW } from './memberFactor.ts'

const data = (p) => JSON.parse(readFileSync(new URL(`../../public/data/${p}`, import.meta.url), 'utf8'))
const constants = data('constants.json')
const value = (k) => (typeof constants[k] === 'object' ? constants[k].value : constants[k])
const plan = data('plan/S1_fastest_c2_l15_foot.json')
const member = plan.together[0]

test('recomputed Pandolf power matches the engine segments at the reference mass', () => {
  const kappa = value('suit_factor_kappa')
  for (const s of member.seg.slice(0, 200)) {
    const speed = s.distance_m / s.t_s
    const ours = pandolfPowerW(value('body_mass_kg'), plan.load_kg, speed, s.slope_deg) * kappa
    assert.ok(Math.abs(ours - s.cost_terms.power_w) < 1e-6 * Math.max(1, s.cost_terms.power_w), `${ours} vs ${s.cost_terms.power_w}`)
  }
})

test('the reference mass gives factor 1; heavier costs more, lighter less', () => {
  const ref = value('body_mass_kg')
  const [same, heavy, light] = memberO2Factors(member, [ref, ref + 20, ref - 20], ref, plan.load_kg)
  assert.ok(Math.abs(same - 1) < 1e-12)
  assert.ok(heavy > 1.1 && heavy < 1.4, `heavy ${heavy}`)
  assert.ok(light < 0.9 && light > 0.6, `light ${light}`)
})

test('no route or bad input falls back to 1', () => {
  assert.deepEqual(memberO2Factors(null, [82, 90], 82, 15), [1, 1])
  assert.deepEqual(memberO2Factors({ seg: [] }, [82], 82, 15), [1])
  assert.deepEqual(memberO2Factors(member, [Number.NaN], 82, 15), [1])
})
