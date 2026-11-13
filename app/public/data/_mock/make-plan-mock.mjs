// Mock generator for the PROPOSED plan files (docs/app-redesign.md §4).
//
// Writes, next to the existing §15 mocks:
//   targets.geojson                       target areas around real rover-visited sites
//   plan/index.json                       one entry per plan file
//   plan/{target}_{mode}_c{crew}_l{load}_{foot|rover}.json
//   plan/limits_c{crew}_l{load}_{foot|rover}.geojson   the modeled no-return line
//
// Every number here is MOCK. Coordinates of the targets are the real stop
// positions from stops.json; their areas, the routes and the O2 numbers are
// placeholders until the engine writes the real files in the same shape.
//
// Run from the repo root:  node app/public/data/_mock/make-plan-mock.mjs
// It reads routes/*.json and stops.json, so run it after make-mock.mjs.
// It skips files without `_mock` (real plans). Afterwards run app/scripts/build-plans.mjs, which
// rebuilds plan/index.json from the files on disk.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => JSON.parse(readFileSync(join(DATA, p), 'utf8'))
const write = (p, obj) => {
  // Never overwrite a real file (no `_mock` flag), e.g. plans from app/scripts/build-plans.mjs.
  if (existsSync(join(DATA, p)) && JSON.parse(readFileSync(join(DATA, p), 'utf8'))._mock !== true) return
  mkdirSync(dirname(join(DATA, p)), { recursive: true })
  writeFileSync(join(DATA, p), JSON.stringify(obj, null, 1) + '\n')
}
const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d

const meta = read('meta.json')
const stops = read('stops.json').features
const constants = read('constants.json')
const HAB = meta.habitat.lonlat
const M_PER_DEG = (Math.PI * 3396190) / 180
const COS = Math.cos((HAB[1] * Math.PI) / 180)
const toXY = ([lon, lat]) => [(lon - HAB[0]) * M_PER_DEG * COS, (lat - HAB[1]) * M_PER_DEG]
const toLonLat = ([x, y]) => [round(HAB[0] + x / (M_PER_DEG * COS), 6), round(HAB[1] + y / M_PER_DEG, 6)]
const dist = (a, b) => Math.hypot(toXY(a)[0] - toXY(b)[0], toXY(a)[1] - toXY(b)[1])

const PROPOSAL = 'docs/app-redesign.md §4 (proposed contract, not agreed yet)'
const budgetL = constants._budget_l?.value ?? 288.8

// ---- Target areas ----------------------------------------------------------
// What each real site is evidence for. Boxwork sits in the sulfate-bearing
// unit (JPL 2025-06-23); the drill sites are boxwork-unit drill campaigns.
const SITE_SCIENCE = {
  S1: { substances: ['Ca-sulfate veins (boxwork)', 'sulfate-bearing bedrock'], goals: ['boxwork', 'sulfate-unit', 'survey'] },
  S2: { substances: ['Ca-sulfate veins (boxwork)', 'sulfate-bearing bedrock'], goals: ['boxwork', 'sulfate-unit', 'survey'] },
  S3: { substances: ['sulfate-bearing bedrock'], goals: ['sulfate-unit', 'survey'] },
  D1: { substances: ['boxwork-unit edge (drilled)', 'sulfate-bearing bedrock'], goals: ['boxwork', 'sulfate-unit', 'survey'] },
  D2: { substances: ['boxwork-unit block (drilled)', 'sulfate-bearing bedrock'], goals: ['boxwork', 'sulfate-unit', 'survey'] },
}
const AREA_RADIUS_M = 120

function ring(center, radiusFn, n = 36) {
  const [cx, cy] = toXY(center)
  const pts = []
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n
    const r = radiusFn(a)
    pts.push(toLonLat([cx + r * Math.cos(a), cy + r * Math.sin(a)]))
  }
  pts.push(pts[0])
  return pts
}

const targets = stops.map((f, i) => {
  const p = f.properties
  const sci = SITE_SCIENCE[p.id] ?? { substances: [], goals: ['survey'] }
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [ring(f.geometry.coordinates, (a) => AREA_RADIUS_M * (1 + 0.06 * Math.sin(3 * a + i)))],
    },
    properties: {
      id: p.id,
      name: p.name,
      site: f.geometry.coordinates,
      substances: sci.substances,
      goals: sci.goals,
      evidence: p.evidence ?? null,
      badge: 'Observed',
      extent_note: `MOCK extent: a ~${AREA_RADIUS_M} m area drawn around the rover-visited site. The site is real; the outline is a placeholder.`,
    },
  }
})
write('targets.geojson', { type: 'FeatureCollection', _mock: true, _proposal: PROPOSAL, features: targets })

// ---- Routes per member -----------------------------------------------------
const ROVER_SPEED = 5 / 3.6 // m/s (demo-focus-plan §8: we use 5 km/h)
const ROVER_O2_LPM = 0.6 // seated: MOCK value
const PARK_FRACTION = 0.72 // rover parks this far along the path, crew walks the rest

function baseRoute(target, mode) {
  try {
    return read(`routes/${target}_${mode}_2_15.json`)
  } catch {
    return null
  }
}

function member(id, label, targetId, mode, crew, rover) {
  const r = baseRoute(targetId, mode)
  if (!r) return null
  const crewFactor = crew === 1 ? 0.96 : 1
  const n = r.coords.length
  const park = rover ? Math.max(1, Math.round((n - 1) * PARK_FRACTION)) : 0
  const seg = r.seg.map((s, i) => {
    const d = s.cost_terms.distance_m
    if (rover && i < park) {
      const t = d / ROVER_SPEED
      return { kind: 'drive', t_s: round(t, 1), o2_l: round((t / 60) * ROVER_O2_LPM), slope_deg: s.slope_deg, distance_m: d }
    }
    return { kind: 'walk', t_s: round(s.t_s * crewFactor, 1), o2_l: round(s.o2_l * crewFactor), slope_deg: s.slope_deg, distance_m: d }
  })
  const cum = { t_s: [0], o2_l: [0] }
  seg.forEach((s, i) => {
    cum.t_s.push(round(cum.t_s[i] + s.t_s, 1))
    cum.o2_l.push(round(cum.o2_l[i] + s.o2_l))
  })
  // Way home from each point. On foot, reuse the route file's own return table and its optional
  // back_fast (fastest way home, drives the automatic switch), scaled like the way out. With a rover
  // (MOCK): the same path reversed, so it costs what the way out cost. The engine samples its return
  // field here instead (§9).
  const scale = (a, k) => a.map((x) => round(x * k))
  const foot = !rover && r.back?.o2_l?.length === n
  const toHome = foot
    ? { t_s: r.back.t_s.map((x) => round(x * crewFactor, 1)), o2_l: scale(r.back.o2_l, crewFactor) }
    : { t_s: cum.t_s.slice(), o2_l: cum.o2_l.slice() }
  const backFast = foot && r.back_fast?.o2_l?.length === n
    ? { via: r.back_fast.via, t_s: r.back_fast.t_s.map((x) => round(x * crewFactor, 1)), o2_l: scale(r.back_fast.o2_l, crewFactor), path: r.back_fast.path }
    : null
  let pnr = 0
  for (let i = 0; i < n; i++) if (cum.o2_l[i] + toHome.o2_l[i] <= budgetL) pnr = i
  const legs = []
  seg.forEach((s, i) => {
    const last = legs[legs.length - 1]
    if (last && last.kind === s.kind) {
      last.to = i + 1
      last.t_s = round(last.t_s + s.t_s, 1)
      last.o2_l = round(last.o2_l + s.o2_l)
      last.distance_m = round(last.distance_m + s.distance_m, 1)
    } else {
      legs.push({ kind: s.kind, from: i, to: i + 1, t_s: s.t_s, o2_l: s.o2_l, distance_m: s.distance_m })
    }
  })
  return {
    member: id,
    label,
    targets: [targetId],
    coords: r.coords,
    legs,
    seg: seg.map(({ kind: _kind, ...rest }) => rest),
    cum,
    back: toHome,
    ...(backFast ? { back_fast: backFast } : {}),
    pnr_index: pnr,
    park_index: rover ? park : null,
  }
}

const GOAL_TARGETS = (id) => targets.find((t) => t.properties.id === id)?.properties.goals ?? []

function partnerTarget(targetId) {
  // Nearest other target that shares a goal: the second astronaut's stop.
  const site = targets.find((t) => t.properties.id === targetId).properties.site
  const goals = GOAL_TARGETS(targetId)
  return targets
    .filter((t) => t.properties.id !== targetId && t.properties.goals.some((g) => g !== 'survey' && goals.includes(g)))
    .sort((a, b) => dist(a.properties.site, site) - dist(b.properties.site, site))[0]?.properties.id
}

/**
 * With one rover, the pair drives together to A's park point and splits there:
 * B's route is A's drive leg, then a walk to B's own target (MOCK: a straight
 * walk, costed at A's average walking rate).
 */
function sharedDrive(a, b, budget) {
  if (a.park_index === null) return b
  const park = a.park_index
  const start = a.coords[park]
  const end = targets.find((t) => t.properties.id === b.targets[0]).properties.site
  const walkSegs = a.seg.slice(park)
  const walkM = walkSegs.reduce((s, x) => s + x.distance_m, 0)
  const tPerM = walkSegs.reduce((s, x) => s + x.t_s, 0) / walkM
  const o2PerM = walkSegs.reduce((s, x) => s + x.o2_l, 0) / walkM
  const steps = Math.max(2, Math.round(dist(start, end) / 40))
  const walk = []
  for (let k = 1; k <= steps; k++) {
    const f = k / steps
    walk.push([round(start[0] + (end[0] - start[0]) * f, 6), round(start[1] + (end[1] - start[1]) * f, 6)])
  }
  const coords = [...a.coords.slice(0, park + 1), ...walk]
  const seg = [
    ...a.seg.slice(0, park),
    ...walk.map((p, k) => {
      const d = dist(k === 0 ? start : walk[k - 1], p)
      return { t_s: round(d * tPerM, 1), o2_l: round(d * o2PerM), slope_deg: 4, distance_m: round(d, 1) }
    }),
  ]
  const cum = { t_s: [0], o2_l: [0] }
  seg.forEach((s, i) => {
    cum.t_s.push(round(cum.t_s[i] + s.t_s, 1))
    cum.o2_l.push(round(cum.o2_l[i] + s.o2_l))
  })
  let pnr = 0
  for (let i = 0; i < coords.length; i++) if (2 * cum.o2_l[i] <= budget) pnr = i
  const driveLeg = a.legs.find((l) => l.kind === 'drive')
  const walkT = cum.t_s.at(-1) - cum.t_s[park]
  const walkO2 = cum.o2_l.at(-1) - cum.o2_l[park]
  return {
    ...b,
    coords,
    seg,
    cum,
    back: { t_s: cum.t_s.slice(), o2_l: cum.o2_l.slice() },
    pnr_index: pnr,
    park_index: park,
    legs: [
      driveLeg,
      { kind: 'walk', from: park, to: coords.length - 1, t_s: round(walkT, 1), o2_l: round(walkO2), distance_m: round(seg.slice(park).reduce((s, x) => s + x.distance_m, 0), 1) },
    ],
  }
}

function maxSeparation(a, b) {
  let max = 0
  for (let k = 0; k <= 20; k++) {
    const pa = a.coords[Math.round(((a.coords.length - 1) * k) / 20)]
    const pb = b.coords[Math.round(((b.coords.length - 1) * k) / 20)]
    max = Math.max(max, dist(pa, pb))
  }
  return Math.round(max)
}

const index = []
for (const crew of [1, 2]) {
  for (const rover of [false, true]) {
    const moveKey = rover ? 'rover' : 'foot'
    for (const t of targets) {
      for (const mode of ['fastest', 'safest']) {
        const together = member(crew === 2 ? 'pair' : 'A', crew === 2 ? 'Both astronauts' : 'Astronaut', t.properties.id, mode, crew, rover)
        if (!together) continue
        let split = null
        if (crew === 2) {
          const other = partnerTarget(t.properties.id)
          const a = member('A', 'Astronaut A', t.properties.id, mode, crew, rover)
          const bOwn = other ? member('B', 'Astronaut B', other, mode, crew, rover) : null
          const b = a && bOwn ? sharedDrive(a, bOwn, budgetL) : null
          if (a && b) {
            split = {
              rule: 'Stay within radio contact and rescue distance of each other',
              max_separation_limit_m: 600,
              planned_max_separation_m: maxSeparation(a, b),
              members: [a, b],
            }
          }
        }
        const id = `${t.properties.id}_${mode}_c${crew}_l15_${moveKey}`
        write(`plan/${id}.json`, {
          _mock: true,
          _proposal: PROPOSAL,
          id,
          target: t.properties.id,
          mode,
          crew,
          load_kg: 15,
          rover,
          badge: 'Scenario',
          budget_l: budgetL,
          together: [together],
          split,
        })
        index.push({ id, target: t.properties.id, mode, crew, load_kg: 15, rover, file: `plan/${id}.json` })
      }
    }

    // No-return line: where walking out further leaves too little O2 to get back.
    // MOCK: an irregular ring around the habitat; the engine derives it from its fields (§9).
    const reach = rover ? 4200 : 2900
    write(`plan/limits_c${crew}_l15_${moveKey}.geojson`, {
      type: 'FeatureCollection',
      _mock: true,
      _proposal: PROPOSAL,
      features: [
        {
          type: 'Feature',
          properties: {
            kind: 'no_return_line',
            crew,
            load_kg: 15,
            rover,
            badge: 'Scenario',
            note: 'Beyond this line the modeled O2 left is not enough to get home to the habitat.',
          },
          geometry: {
            type: 'LineString',
            coordinates: ring(HAB, (a) => reach * (1 + 0.12 * Math.sin(2 * a + 0.6) + 0.07 * Math.cos(5 * a)), 72),
          },
        },
      ],
    })
  }
}
write('plan/index.json', { _mock: true, _proposal: PROPOSAL, plans: index })
console.log(`wrote ${targets.length} targets, ${index.length} plans, 4 limit lines`)
