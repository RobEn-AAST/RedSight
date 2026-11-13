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
let unreachable = 0;

for (const entry of index.routes) {
  if (entry.status === 'unreachable') {
    assert.equal(entry.file, null, `${entry.id} should not point at a nonexistent route file`);
    assert.ok(entry.reason, `${entry.id} should state why the route is unavailable`);
    unreachable += 1;
    continue;
  }
  assert.equal(entry.status, 'routed', `${entry.id} must be routed or explicitly unreachable`);
  const route = JSON.parse(fs.readFileSync(path.join(dataDir, entry.file), 'utf8'));
  const n = route.coords.length;
  assert.equal(route.cum.t_s.length, n, `${entry.id} outbound times`);
  assert.equal(route.cum.o2_l.length, n, `${entry.id} outbound O₂`);
  assert.equal(route.back.t_s.length, n, `${entry.id} return times`);
  assert.equal(route.back.o2_l.length, n, `${entry.id} return O₂`);
  assert.ok(route.pnr_index >= -1 && route.pnr_index < n, `${entry.id} PNR index must be in range`);
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
  assert.equal(timeline.reachStop, route.pnr_index === n - 1, `${entry.id} stop reachability matches D27 PNR`);
  if (timeline.reachStop) {
    assert.ok(Math.abs(timeline.totalS - route.total_s) < 1e-6, `${entry.id} round-trip time`);
  } else if (route.pnr_index >= 0) {
    assert.ok(timeline.turnPoint, `${entry.id} should expose the modeled turn-back point`);
    assert.ok(timeline.totalS < route.total_s, `${entry.id} should turn back before the destination`);
  }
  checked += 1;
}

assert.equal(checked + unreachable, 10, 'five supported stops in two modes are accounted for');
assert.ok(checked > 0, 'at least one route should be available to exercise the consumer');
console.log(`Mission Replay checked ${checked} routes and ${unreachable} explicit no-route outcomes; it used directed same-path returns and matching D27 turn-back behavior.`);
