import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ringForBudget } from './noReturn.ts'

const ring = (budget, clipped = false) => ({
  type: 'Feature',
  geometry: { type: 'MultiLineString', coordinates: [[[0, 0], [1, 1]]] },
  properties: { kind: 'no_return_line', budget_l: budget, clipped_by_model_edge: clipped },
})
const rings = { type: 'FeatureCollection', features: [ring(25), ring(50), ring(75), ring(288.75, true)] }

test('picks the largest ring at or below the budget (never further out)', () => {
  assert.equal(ringForBudget(rings, 60).budgetL, 50)
  assert.equal(ringForBudget(rings, 75).budgetL, 75)
  assert.equal(ringForBudget(rings, 74.9).budgetL, 50)
})

test('full tank (no slider value) shows the largest ring and its edge flag', () => {
  const r = ringForBudget(rings, null)
  assert.equal(r.budgetL, 288.75)
  assert.equal(r.clipped, true)
  assert.equal(r.line.features.length, 1)
})

test('below the smallest ring there is no line', () => {
  assert.equal(ringForBudget(rings, 10), null)
})

test('a file with one fixed line is drawn as it is; empty or missing gives nothing', () => {
  const fixed = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: null, properties: { kind: 'no_return_line' } }] }
  assert.equal(ringForBudget(fixed, 100).line, fixed)
  assert.equal(ringForBudget({ type: 'FeatureCollection', features: [] }, 100), null)
  assert.equal(ringForBudget(null, 100), null)
})
