import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSystemPrompt } from './prompt.mjs'

test('system prompt treats mobility pain as reported and requires explicit, engine-grounded constraints', () => {
  const prompt = buildSystemPrompt({missionState:{routeSlopeCapDeg:15},availableData:[],webSearchActive:false})
  assert.match(prompt,/operator-reported/)
  assert.match(prompt,/Ask for an explicit numeric Scenario slope cap/)
  assert.match(prompt,/never substitute a\s+looser preset/)
  assert.match(prompt,/infer a medical slope limit/)
  assert.match(prompt,/applied/)
})
