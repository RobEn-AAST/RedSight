import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildTimeline } from '../../app/src/replay/replay-core.js';

const dataDir = path.resolve(process.argv[2] ?? 'app/public/data');
const constants = JSON.parse(fs.readFileSync(path.join(dataDir, 'constants.json'), 'utf8'));
const value = (key) => constants[key].value;
const index = JSON.parse(fs.readFileSync(path.join(dataDir, 'routes/index.json'), 'utf8'));
const capacityL = value('o2_usable_primary_l');
let checked = 0;

for (const entry of index.routes) {
  assert.equal(entry.status, 'routed', `${entry.id} must have a generated route`);
  const route = JSON.parse(fs.readFileSync(path.join(dataDir, entry.file), 'utf8'));
  const n = route.coords.length;
  assert.equal(route.cum.t_s.length, n, `${entry.id} outbound times`);
  assert.equal(route.cum.o2_l.length, n, `${entry.id} outbound O₂`);
  assert.equal(route.back.t_s.length, n, `${entry.id} return times`);
  assert.equal(route.back.o2_l.length, n, `${entry.id} return O₂`);
  assert.equal(route.pnr_index, n - 1, `${entry.id} should reach its stop under the baseline budget`);
  const timeline = buildTimeline(route, {
    capacityL,
    reserveFraction: value('reserve_fraction'),
    reserveMin: value('reserve_minutes'),
    walkbackLpm: value('walkback_o2_lpm'),
    returnMargin: value('return_cost_margin'),
    memberFactors: [1, 1],
    budgetL: route.budget_l,
  });
  assert.equal(timeline.backAssumed, false, `${entry.id} must use engine return arrays`);
  assert.equal(timeline.reachStop, true, `${entry.id} should reach its stop`);
  assert.ok(Math.abs(timeline.totalS - route.total_s) < 1e-6, `${entry.id} round-trip time`);
  checked += 1;
}

assert.equal(checked, 10, 'five supported stops in two modes');
console.log(`Mission Replay accepted ${checked} routes; it used directed same-path return arrays and reproduced round-trip times.`);
