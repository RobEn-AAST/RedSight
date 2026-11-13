// Run: cd app && node --test src/map/earthDelay.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { EARTH_DELAY_SPEC } from './earthDelay.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const BANNED = ['safe route', 'safe time remaining', 'certified', 'flight-safe', 'real-time', 'validated']

test('EARTH_DELAY_SPEC matches NASA Langley NTRS 20220013418 bounds', () => {
  assert.equal(EARTH_DELAY_SPEC.maxOneWayMin, 22)
  assert.deepEqual(EARTH_DELAY_SPEC.longStayMinRange, [15, 21])
  assert.equal(EARTH_DELAY_SPEC.maxRoundTripMin, 44)
  assert.equal(EARTH_DELAY_SPEC.badge, 'derived')
  assert.equal(EARTH_DELAY_SPEC.sourceUrl, 'https://ntrs.nasa.gov/citations/20220013418')
  assert.ok(EARTH_DELAY_SPEC.citation.includes('20220013418'))
  assert.ok(EARTH_DELAY_SPEC.summaryLine.includes('22 min'))
  assert.ok(EARTH_DELAY_SPEC.summaryLine.includes('15–21 min'))
})

test('Earth-delay modules and TurnBackPanel avoid banned wording (AGENTS rule 3)', () => {
  const files = [
    join(HERE, 'earthDelay.ts'),
    join(HERE, 'EarthDelayNote.tsx'),
    join(HERE, '../turnback/TurnBackPanel.tsx'),
  ]
  for (const file of files) {
    const lower = readFileSync(file, 'utf8').toLowerCase()
    for (const phrase of BANNED) {
      assert.equal(lower.includes(phrase), false, `${file} contains banned wording "${phrase}"`)
    }
  }
})
