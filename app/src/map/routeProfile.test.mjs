// Run: cd app && node --test src/map/routeProfile.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildElevationProfile,
  buildWhyRoute,
  sampleAtDistance,
  summarizeCostTerms,
} from './routeProfile.ts'

const DATA = join(dirname(fileURLToPath(import.meta.url)), '../../public/data')
const routeFiles = readdirSync(join(DATA, 'routes')).filter((f) => f !== 'index.json')
const routes = routeFiles.map((f) => JSON.parse(readFileSync(join(DATA, 'routes', f), 'utf8')))
const BANNED = ['safe route', 'safe time remaining', 'certified', 'flight-safe', 'real-time', 'validated']

test('buildElevationProfile integrates signed slope_deg and distance_m accurately', () => {
  // 100 m at +atan(0.1) (~5.7106 deg) => +10 m; 100 m at -atan(0.05) (~-2.8624 deg) => -5 m
  const upDeg = (Math.atan(0.1) * 180) / Math.PI
  const downDeg = (-Math.atan(0.05) * 180) / Math.PI
  const p = buildElevationProfile({
    coords: [[0, 0], [1, 0], [2, 0]],
    seg: [
      { t_s: 100, o2_l: 1, slope_deg: upDeg, cost_terms: { distance_m: 100 } },
      { t_s: 100, o2_l: 1, slope_deg: downDeg, cost_terms: { distance_m: 100 } },
    ],
  })
  assert.ok(p)
  assert.equal(p.elevSource, 'slope-integrated')
  assert.equal(p.signedSlopes, true)
  assert.equal(p.totalDistanceM, 200)
  assert.ok(Math.abs(p.gainM - 10) < 1e-6)
  assert.ok(Math.abs(p.lossM - 5) < 1e-6)
  assert.ok(Math.abs(p.netM - 5) < 1e-6)

  const mid = sampleAtDistance(p, 50)
  assert.ok(Math.abs(mid.elevM - 5) < 1e-6)
  assert.ok(Math.abs(mid.slopeDeg - upDeg) < 1e-6)
})

test('buildElevationProfile prefers explicit elev_m or 3D coords when provided', () => {
  const pElev = buildElevationProfile({
    coords: [[0, 0], [1, 0], [2, 0]],
    elev_m: [-3500, -3510, -3505],
    seg: [
      { t_s: 10, o2_l: 1, slope_deg: 0, distance_m: 50 },
      { t_s: 10, o2_l: 1, slope_deg: 0, distance_m: 50 },
    ],
  })
  assert.ok(pElev)
  assert.equal(pElev.elevSource, 'route-elev')
  assert.equal(pElev.gainM, 5)
  assert.equal(pElev.lossM, 10)
  assert.equal(pElev.netM, -5)

  const p3d = buildElevationProfile({
    coords: [[0, 0, -100], [1, 0, -90]],
    seg: [{ t_s: 10, o2_l: 1, slope_deg: 0, distance_m: 100 }],
  })
  assert.ok(p3d)
  assert.equal(p3d.elevSource, 'route-elev')
  assert.equal(p3d.netM, 10)
})

test('buildElevationProfile and summarizeCostTerms return null on malformed routes', () => {
  assert.equal(buildElevationProfile({ coords: [[0, 0]], seg: [] }), null)
  assert.equal(buildElevationProfile({ coords: [[0, 0], [1, 0]], seg: [] }), null)
  assert.equal(summarizeCostTerms([]), null)
})

test('summarizeCostTerms computes distance-weighted means and buildWhyRoute avoids banned wording', () => {
  const fastSeg = [
    { t_s: 50, o2_l: 1.5, slope_deg: 12, cost_terms: { distance_m: 100, hazard_score: 2.0, power_w: 140, terrain_factor: 1.0 } },
    { t_s: 50, o2_l: 1.5, slope_deg: 6, cost_terms: { distance_m: 300, hazard_score: 1.2, power_w: 100, terrain_factor: 1.0 } },
  ]
  const safeSeg = [
    { t_s: 80, o2_l: 1.3, slope_deg: 4, cost_terms: { distance_m: 300, hazard_score: 1.0, power_w: 90, terrain_factor: 1.0 } },
    { t_s: 80, o2_l: 1.3, slope_deg: 5, cost_terms: { distance_m: 300, hazard_score: 1.1, power_w: 95, terrain_factor: 1.2 } },
  ]
  const fastSum = summarizeCostTerms(fastSeg)
  const safeSum = summarizeCostTerms(safeSeg)
  assert.ok(fastSum && safeSum)
  assert.equal(fastSum.distanceM, 400)
  // Weighted mean hazard: (100*2.0 + 300*1.2) / 400 = 560 / 400 = 1.4
  assert.ok(Math.abs(fastSum.terms.hazard_score.mean - 1.4) < 1e-9)
  assert.equal(fastSum.steepDistM, 100)
  assert.equal(safeSum.terms.terrain_factor.max, 1.2)

  const whySafe = buildWhyRoute('safest', safeSum, fastSum)
  assert.match(whySafe.headline, /200 m longer/)
  assert.match(whySafe.headline, /5\.0°/)
  assert.ok(whySafe.reasons.length >= 3)

  const whyFast = buildWhyRoute('fastest', fastSum, safeSum)
  assert.match(whyFast.headline, /faster outbound/)
  for (const w of [...whySafe.reasons.map((r) => `${r.label} ${r.detail}`), whySafe.headline, whyFast.headline]) {
    const low = w.toLowerCase()
    for (const banned of BANNED) assert.equal(low.includes(banned), false, `banned word "${banned}" in: ${w}`)
    assert.equal(low.includes('safest'), false, `should say "lowest-hazard", not "safest", in: ${w}`)
  }
})

test('every committed route file produces a finite profile and cost_terms breakdown', () => {
  const byStop = new Map()
  for (const r of routes) {
    const profile = buildElevationProfile(r)
    assert.ok(profile, `${r.id}: missing profile`)
    assert.ok(Number.isFinite(profile.totalDistanceM) && profile.totalDistanceM > 0)
    assert.ok(Number.isFinite(profile.netM))
    assert.ok(profile.sampled.length <= 180)
    const sum = summarizeCostTerms(r.seg)
    assert.ok(sum && sum.hasCostTerms, `${r.id}: expected cost_terms`)
    const entry = byStop.get(r.stop) ?? {}
    entry[r.mode] = sum
    byStop.set(r.stop, entry)
  }
  for (const [stop, pair] of byStop) {
    assert.ok(pair.fastest && pair.safest, `${stop}: both modes expected`)
    const why = buildWhyRoute('safest', pair.safest, pair.fastest)
    assert.ok(why.headline.length > 0 && why.reasons.length >= 2, `${stop}: why reasons expected`)
  }
})
