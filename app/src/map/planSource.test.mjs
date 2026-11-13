// Run: cd app && node --test src/map/planSource.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { selectPlanSource } from './planSource.ts'

test('real native routes take precedence over the main branch mock plan index', () => {
  assert.equal(selectPlanSource({
    planIndex: Array.from({ length: 40 }, (_, i) => ({ id: `mock-${i}` })),
    planIndexMock: true,
    routeIndex: [{ id: 'S1_fastest_2_15' }, { id: 'S1_safest_2_15' }],
    routeIndexMock: false,
  }), 'routes')
})

test('a real plan index keeps precedence when both contracts are real', () => {
  assert.equal(selectPlanSource({
    planIndex: [{ id: 'native-plan' }],
    planIndexMock: false,
    routeIndex: [{ id: 'legacy-route' }],
    routeIndexMock: false,
  }), 'plans')
})

test('plan mocks remain a development fallback only when no real route index is available', () => {
  assert.equal(selectPlanSource({
    planIndex: [{ id: 'mock-plan' }],
    planIndexMock: true,
    routeIndex: [],
    routeIndexMock: false,
  }), 'plans')
  assert.equal(selectPlanSource({
    planIndex: [],
    planIndexMock: false,
    routeIndex: [],
    routeIndexMock: false,
  }), 'none')
})
