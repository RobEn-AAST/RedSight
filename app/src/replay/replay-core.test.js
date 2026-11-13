// Run: node --test app/src/replay/replay-core.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { buildTimeline, sampleAt, trailAt, o2Plan } from "./replay-core.js";

// 3 vertices, 10 + 10 min out, 5 + 5 L; return assumed symmetric.
const route = {
  stop: "S1", crew: 2,
  coords: [[137.40, -4.815], [137.395, -4.81], [137.39, -4.805]],
  cum: { t_s: [0, 600, 1200], o2_l: [0, 5, 10] },
};
const base = { capacityL: 40, reserveL: 10, returnMargin: 1, memberFactors: [1, 1], statusStep: 0 };

test("reserve is max(fraction, 30 min at walkback rate)", () => {
  assert.equal(o2Plan({ capacityL: 385 }).reserveL, 385 * 0.25);
  assert.equal(o2Plan({ capacityL: 100 }).reserveL, 30 * 1.22);
});

test("full trip arrives home with the reserve still in the tank", () => {
  const tl = buildTimeline(route, base);
  assert.equal(tl.reachStop, true);
  assert.equal(tl.totalS, 2400);
  assert.equal(tl.arrivalL, 20);
  assert.ok(tl.arrivalL >= tl.reserveL);
});

test("turns back where used + home = budget, so arrival = reserve exactly (margin 1)", () => {
  const tl = buildTimeline(route, { ...base, capacityL: 25 }); // budget 15 → turn at 7.5 L
  assert.equal(tl.reachStop, false);
  assert.equal(tl.events.find((e) => e.type === "turnback").t, 900);
  assert.ok(Math.abs(tl.arrivalL - 10) < 1e-9);
});

test("return margin keeps extra O2: arrives above the reserve", () => {
  const tl = buildTimeline(route, { ...base, capacityL: 25, returnMargin: 1.5 });
  assert.ok(tl.arrivalL > tl.reserveL + 1);
});

test("never dips into the reserve without a drill, for any capacity", () => {
  for (let C = 10; C <= 60; C += 0.7) {
    const tl = buildTimeline(route, { ...base, capacityL: C, returnMargin: 1.2 });
    assert.ok(tl.arrivalL >= tl.reserveL - 1e-9, `C=${C}`);
    assert.ok(!tl.events.some((e) => e.type === "reserve" || e.type === "emergency"));
  }
});

test("pair is limited by the hungrier suit", () => {
  const solo = buildTimeline(route, { ...base, capacityL: 25, memberFactors: [1] });
  const pair = buildTimeline(route, { ...base, capacityL: 25, memberFactors: [1, 1.2] });
  const far = (tl) => Math.max(...tl.frames.map((f) => f.d));
  assert.ok(far(pair) < far(solo));
  assert.ok(pair.arrivalL >= pair.reserveL - 1e-9);
});

test("engine back arrays are used when present", () => {
  const r = { ...route, back: { t_s: [0, 400, 800], o2_l: [0, 3, 6] } };
  const tl = buildTimeline(r, base);
  assert.equal(tl.backAssumed, false);
  assert.equal(tl.arrivalL, 40 - 16);
});

test("drill mid-walk: suit leak forces an immediate return and may use the reserve (shown honestly)", () => {
  const tl = buildTimeline(route, { ...base, capacityL: 25, drill: { atS: 800, factor: 3, label: "Suit leak" } });
  assert.ok(tl.forced);
  assert.ok(tl.events.some((e) => e.type === "forced-return" && e.t === 800));
  assert.ok(tl.events.some((e) => e.type === "reserve"));
  assert.ok(tl.reserveUsedL > 0);
});

test("drill on the way home only raises O2 use after it", () => {
  const plain = buildTimeline(route, base);
  const tl = buildTimeline(route, { ...base, drill: { atS: 1800, factor: 2 } });
  assert.equal(tl.totalS, plain.totalS);
  assert.ok(Math.abs(tl.arrivalL - (plain.arrivalL - 5)) < 1e-9);
});

test("status callouts every 10 % of the tank, with home-needed and margin", () => {
  const tl = buildTimeline(route, { ...base, statusStep: 0.1 });
  const st = tl.events.filter((e) => e.type === "status");
  assert.deepEqual(st.map((e) => e.pct), [90, 80, 70, 60, 50]);
  assert.ok(st.every((e) => typeof e.homePct === "number" && e.label.includes("home needs")));
  for (let i = 1; i < st.length; i++) assert.ok(st[i].t > st[i - 1].t);
});

test("sampling: full-tank gauge, home needed, clamps", () => {
  const tl = buildTimeline(route, base);
  const s = sampleAt(tl, 600);
  assert.equal(s.o2Left, 35);
  assert.equal(s.homeL, 5);
  assert.equal(sampleAt(tl, -5).o2Left, 40);
  assert.equal(sampleAt(tl, 1e9).o2Left, 20);
  assert.ok(trailAt(tl, 900).length >= 2);
});

test("no-go and turn-back-ahead", () => {
  assert.equal(buildTimeline({ ...route, cum: { t_s: [0, 600, 1200], o2_l: [1, 5, 10] } }, { ...base, capacityL: 10.5 }).events[0].type, "no-go");
  const tl = buildTimeline(route, { ...base, capacityL: 25, aheadS: 300 });
  const ahead = tl.events.find((e) => e.type === "turnback-ahead");
  assert.equal(ahead.t, tl.events.find((e) => e.type === "turnback").t - 300);
});
