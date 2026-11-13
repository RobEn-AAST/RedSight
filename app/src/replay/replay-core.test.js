// Run: node --test app/src/replay/
import test from "node:test";
import assert from "node:assert/strict";
import { buildTimeline, sampleAt, trailAt } from "./replay-core.js";

// 3 vertices, 10 min + 10 min out, 5 L + 5 L O2; return assumed symmetric.
const route = {
  stop: "S1",
  coords: [[137.40, -4.815], [137.395, -4.81], [137.39, -4.805]],
  cum: { t_s: [0, 600, 1200], o2_l: [0, 5, 10] },
};

test("full trip when the budget covers it", () => {
  const tl = buildTimeline(route, { budgetL: 25 });
  assert.equal(tl.reachStop, true);
  assert.equal(tl.totalS, 2400);
  assert.equal(tl.frames.at(-1).o2, 20);
  assert.deepEqual(tl.frames.at(-1).pt, route.coords[0]);
  assert.ok(tl.events.some((e) => e.type === "arrive"));
  assert.equal(tl.backAssumed, true);
});

test("turns back exactly where used + home = budget", () => {
  const tl = buildTimeline(route, { budgetL: 15 }); // need(i)=2*U(i) → turn at U=7.5
  assert.equal(tl.reachStop, false);
  const turn = tl.events.find((e) => e.type === "turnback");
  assert.equal(turn.t, 900);
  assert.ok(Math.abs(tl.frames.at(-1).o2 - 15) < 1e-9, "uses the whole budget, never more");
  assert.equal(tl.totalS, 1800);
});

test("never uses more than the budget, for any budget", () => {
  for (let B = 0; B <= 30; B += 0.7) {
    const tl = buildTimeline(route, { budgetL: B });
    assert.ok(tl.frames.at(-1).o2 <= B + 1e-9, `B=${B}`);
  }
});

test("lower budget never walks farther", () => {
  let prev = Infinity;
  for (let B = 30; B >= 0; B -= 1) {
    const far = Math.max(...buildTimeline(route, { budgetL: B }).frames.map((f) => f.d));
    assert.ok(far <= prev + 1e-6);
    prev = far;
  }
});

test("engine back arrays are used when present", () => {
  const r = { ...route, back: { t_s: [0, 400, 800], o2_l: [0, 3, 6] } }; // downhill home is cheaper
  const tl = buildTimeline(r, { budgetL: 16 });
  assert.equal(tl.backAssumed, false);
  assert.equal(tl.reachStop, true);
  assert.equal(tl.frames.at(-1).o2, 16);
});

test("sampling interpolates and clamps", () => {
  const tl = buildTimeline(route, { budgetL: 25 });
  const s = sampleAt(tl, 300);
  assert.equal(s.o2Used, 2.5);
  assert.equal(s.phase, "out");
  assert.equal(sampleAt(tl, -5).o2Used, 0);
  assert.equal(sampleAt(tl, 1e9).o2Used, 20);
  assert.ok(trailAt(tl, 900).length >= 2);
});

test("low-O2 event and no-go case", () => {
  const tl = buildTimeline(route, { budgetL: 20 });
  assert.ok(tl.events.some((e) => e.type === "low"));
  const none = buildTimeline({ ...route, cum: { t_s: [0, 600, 1200], o2_l: [1, 5, 10] } }, { budgetL: 1 });
  assert.equal(none.events[0].type, "no-go");
});
