// Run: cd app && node --test src/turnback/turnback.test.mjs   (Node ≥ 22.18 loads the .ts module natively)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { o2PlanFromConstants, turnBackPoint, budgetToReachStop } from './turnback.ts'
import { buildTimeline } from '../replay/replay-core.js'

const DATA = join(dirname(fileURLToPath(import.meta.url)), '../../public/data')
const constants = JSON.parse(readFileSync(join(DATA, 'constants.json'), 'utf8'))
const routeFiles = readdirSync(join(DATA, 'routes')).filter((f) => f !== 'index.json')
const routes = routeFiles.map((f) => JSON.parse(readFileSync(join(DATA, 'routes', f), 'utf8')))

// Tiny hand-checkable route: 3 points, 5 L out per leg, home costs what the way out cost.
const tiny = {
  coords: [[0, 0], [1, 0], [2, 0]],
  seg: [{ cost_terms: { distance_m: 100 } }, { cost_terms: { distance_m: 100 } }],
  cum: { t_s: [0, 600, 1200], o2_l: [0, 5, 10] },
  back: { t_s: [0, 600, 1200], o2_l: [0, 5, 10] },
}

test('O2 plan from constants.json matches the documented ≈289 L budget (team-plan §4b)', () => {
  const { plan, missing } = o2PlanFromConstants(constants)
  assert.deepEqual(missing, [])
  assert.ok(plan)
  // 385 − max(0.25 × 385, 30 × 1.22) = 385 − 96.25 = 288.75
  assert.equal(plan.reserveL, 96.25)
  assert.equal(plan.maxBudgetL, 288.75)
  assert.equal(plan.reserveRule, 'fraction')
  // Route files carry budget_l = C − R rounded to 0.1 L.
  for (const r of routes) assert.ok(Math.abs(r.budget_l - plan.maxBudgetL) < 0.1, r.id)
})

test('missing constants are reported, never defaulted', () => {
  const { plan, missing } = o2PlanFromConstants({ o2_usable_primary_l: { value: 385 } })
  assert.equal(plan, null)
  assert.deepEqual(missing, ['reserve_fraction', 'reserve_minutes', 'walkback_o2_lpm', 'return_cost_margin'])
})

test('hand-checked turn point: margin 1, budget 15 → turn halfway along leg 2', () => {
  // need(i) = used + home = 0, 10, 20 → crosses 15 halfway between points 1 and 2.
  const r = turnBackPoint(tiny, 15, 1)
  assert.equal(r.status, 'turns-back')
  assert.equal(r.index, 1)
  assert.equal(r.frac, 0.5)
  assert.deepEqual(r.lonlat, [1.5, 0])
  assert.equal(r.outTimeS, 900)
  assert.equal(r.outO2L, 7.5)
  assert.equal(r.distanceM, 150)
  assert.equal(r.routeFraction, 0.75)
  assert.equal(r.spareAtHomeL, 0) // margin 1 ⇒ arrive exactly at the reserve
})

test('return margin leaves spare O2 above the reserve on arrival', () => {
  const r = turnBackPoint(tiny, 15, 1.5)
  // need = 0, 12.5, 25 → crosses 15 at frac 0.2 of leg 2: out 6 L, home 6 L ⇒ spare 3 L
  assert.equal(r.index, 1)
  assert.ok(Math.abs(r.frac - 0.2) < 1e-12)
  assert.ok(Math.abs(r.spareAtHomeL - 3) < 1e-9)
})

test('status: reaches the stop / no-go; incomplete return arrays disable turn-back', () => {
  assert.equal(turnBackPoint(tiny, 20, 1).status, 'reaches-stop')
  assert.equal(turnBackPoint(tiny, -1, 1).status, 'no-go')
  const noBack = { ...tiny, back: undefined }
  assert.equal(turnBackPoint(noBack, 15, 1), null)
  assert.equal(budgetToReachStop(noBack,1),null)
  assert.equal('backAssumed' in turnBackPoint(tiny, 15, 1), false)
  assert.equal(turnBackPoint({ ...tiny, cum: { t_s: [0], o2_l: [0] } }, 15, 1), null)
})

test('acceptance (B4): the marker moves toward the habitat as the budget drops — every real route', () => {
  const { plan } = o2PlanFromConstants(constants)
  for (const route of routes) {
    let prev = Infinity
    for (let b = plan.maxBudgetL; b >= 0; b -= 0.5) {
      const r = turnBackPoint(route, b, plan.returnMargin)
      const pos = r.index + r.frac
      assert.ok(pos <= prev + 1e-9, `${route.id}: marker moved away from the habitat at budget ${b}`)
      prev = pos
      // The planned turn always fits the budget with the margin applied.
      if (r.status !== 'no-go') assert.ok(r.outO2L + plan.returnMargin * r.homeO2L <= b + 1e-9)
    }
  }
})

test('budgetToReachStop is the exact threshold between reaching and turning back', () => {
  const m = 1.2
  for (const route of routes) {
    const need = budgetToReachStop(route, m)
    assert.equal(turnBackPoint(route, need, m).status, 'reaches-stop')
    assert.equal(turnBackPoint(route, need - 0.01, m).status, 'turns-back')
  }
})

test('slider agrees with Mission Replay (replay-core.js) on every real route and budget', () => {
  const { plan } = o2PlanFromConstants(constants)
  for (const route of routes) {
    for (const b of [10, 25, 40, 60, 90, 130, 200, plan.maxBudgetL]) {
      const mine = turnBackPoint(route, b, plan.returnMargin)
      const tl = buildTimeline(route, {
        capacityL: plan.capacityL, reserveL: plan.reserveL, budgetL: b,
        returnMargin: plan.returnMargin, memberFactors: [1, 1], statusStep: 0,
      })
      assert.equal(mine.status === 'reaches-stop', tl.reachStop, `${route.id} @ ${b} L: reach`)
      if (mine.status === 'turns-back') {
        assert.ok(Math.abs(mine.lonlat[0] - tl.turnPoint[0]) < 1e-9, `${route.id} @ ${b} L: lon`)
        assert.ok(Math.abs(mine.lonlat[1] - tl.turnPoint[1]) < 1e-9, `${route.id} @ ${b} L: lat`)
      }
    }
  }
})
