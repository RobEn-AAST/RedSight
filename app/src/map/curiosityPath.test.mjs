// Run: cd app && node --test src/map/curiosityPath.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  compareRouteWithCuriosity,
  curiosityLineCollection,
  curiosityWaypointCollection,
  marsDistanceM,
  parseCuriosityPath,
} from './curiosityPath.ts'

const DATA = join(dirname(fileURLToPath(import.meta.url)), '../../public/data')
const OPS_BOX = { west: 137.335, east: 137.435, south: -4.85, north: -4.75 }
const BANNED = ['safe route', 'safe time remaining', 'certified', 'flight-safe', 'real-time', 'validated']

test('parses committed curiosity_path.geojson inside OPS_BOX cleanly', () => {
  const rawText = readFileSync(join(DATA, 'curiosity_path.geojson'), 'utf8')
  const lower = rawText.toLowerCase()
  for (const phrase of BANNED) {
    assert.equal(lower.includes(phrase), false, `unexpected banned wording ${phrase}`)
  }
  const raw = JSON.parse(rawText)
  assert.equal(raw._mock, undefined, 'curiosity_path.geojson must not be marked _mock')

  const parsed = parseCuriosityPath(raw)
  assert.ok(parsed, 'parseCuriosityPath must succeed on committed file')
  assert.equal(parsed.badge, 'Observed')
  assert.ok(parsed.segments.length >= 1)
  assert.ok(parsed.waypointCount > 400, `expected >400 waypoints in box, got ${parsed.waypointCount}`)
  assert.ok(parsed.solStart <= 3350 && parsed.solEnd >= 5073)
  assert.ok(parsed.inBoxLengthKm > 5 && parsed.inBoxLengthKm < 30)
  assert.ok(parsed.inBoxOdomKm !== null && parsed.inBoxOdomKm > 5)
  assert.ok(parsed.totalOdomKm !== null && parsed.totalOdomKm > 38)

  for (const wp of parsed.waypoints) {
    assert.ok(wp.lon >= OPS_BOX.west && wp.lon <= OPS_BOX.east, `lon ${wp.lon} out of box`)
    assert.ok(wp.lat >= OPS_BOX.south && wp.lat <= OPS_BOX.north, `lat ${wp.lat} out of box`)
  }
})

test('parseCuriosityPath returns null for malformed or empty payloads', () => {
  assert.equal(parseCuriosityPath(null), null)
  assert.equal(parseCuriosityPath({ type: 'FeatureCollection', features: [] }), null)
  assert.equal(
    parseCuriosityPath({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [137.38, -4.8] },
          properties: {},
        },
      ],
    }),
    null,
  )
})

test('curiosityLineCollection and curiosityWaypointCollection preserve segment and sol metadata', () => {
  const raw = JSON.parse(readFileSync(join(DATA, 'curiosity_path.geojson'), 'utf8'))
  const parsed = parseCuriosityPath(raw)
  assert.ok(parsed)

  const lines = curiosityLineCollection(parsed)
  assert.equal(lines.features.length, parsed.segments.length)
  assert.equal(lines.features[0].geometry.type, 'LineString')

  const pts = curiosityWaypointCollection(parsed)
  assert.equal(pts.features.length, parsed.waypointCount)
  assert.equal(pts.features[pts.features.length - 1].properties?.is_latest, true)
  assert.equal(pts.features[0].properties?.is_latest, false)
})

test('compareRouteWithCuriosity locates S1 MMGIS waypoint within 1 m', () => {
  const pathRaw = JSON.parse(readFileSync(join(DATA, 'curiosity_path.geojson'), 'utf8'))
  const stopsRaw = JSON.parse(readFileSync(join(DATA, 'stops.json'), 'utf8'))
  const parsed = parseCuriosityPath(pathRaw)
  assert.ok(parsed)

  const s1 = stopsRaw.features.find((f) => f.properties?.id === 'S1')
  assert.ok(s1)
  const s1Coords = s1.geometry.coordinates
  const cmp = compareRouteWithCuriosity(parsed, s1Coords, [[137.4005, -4.8185], s1Coords])
  assert.ok(cmp)
  assert.ok(cmp.nearestToTarget.distanceM < 1.0, `expected <1 m match, got ${cmp.nearestToTarget.distanceM}`)
  assert.equal(cmp.nearestToTarget.waypoint.sol, 4541)
  assert.ok(cmp.closestApproach && cmp.closestApproach.distanceM < 1.0)
  assert.ok(marsDistanceM([137.3859, -4.7978], [137.3859, -4.7978]) === 0)
})
