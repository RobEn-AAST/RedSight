// Run: node --test app/src/replay/replay-core.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { buildTimeline, routeGoalInfo, sampleAt, trailAt, o2Plan } from "./replay-core.js";
import { calloutFor } from "./voice.js";

// Three vertices with complete directed same-path return arrays.
const route = {
  stop: "S1", crew: 2,
  coords: [[137.40, -4.815], [137.395, -4.81], [137.39, -4.805]],
  cum: { t_s: [0, 600, 1200], o2_l: [0, 5, 10] },
  back: { t_s: [0,600,1200], o2_l: [0,5,10] },
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
  assert.equal(tl.arrivalL, 40 - 16);
});

test("replay refuses incomplete directed return data instead of guessing symmetric costs", () => {
  assert.throws(() => buildTimeline({ ...route, back:undefined },base),/route.back.t_s/);
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
  assert.ok(st.every((e) => typeof e.homePct === "number" && e.label.includes("home needs") && typeof e.sparePct === "number"));
  for (let i = 1; i < st.length; i++) assert.ok(st[i].t > st[i - 1].t);
});

test("sampling: full-tank gauge, home needed, clamps", () => {
  const tl = buildTimeline(route, base);
  const s = sampleAt(tl, 600);
  assert.equal(s.o2Left, 35);
  assert.equal(s.homeL, 5);
  assert.equal(sampleAt(tl, -5).o2Left, 40);
  assert.equal(sampleAt(tl, 1e9).o2Left, 20);
  assert.ok(trailAt(tl, 900).out.length >= 2)
  assert.ok(trailAt(tl, 1800).back.length >= 2);
});

test("no-go and turn-back-ahead", () => {
  assert.equal(buildTimeline({ ...route, cum: { t_s: [0, 600, 1200], o2_l: [1, 5, 10] } }, { ...base, capacityL: 10.5 }).events[0].type, "no-go");
  const tl = buildTimeline(route, { ...base, capacityL: 25, aheadS: 300 });
  const ahead = tl.events.find((e) => e.type === "turnback-ahead");
  assert.equal(ahead.t, tl.events.find((e) => e.type === "turnback").t - 300);
});

test("lower budget (turn-back slider) = less O2 at the start of the same tank", () => {
  // tank 40, reserve 10, budget 10 → start with 20 L = 50 % of the tank.
  const tl = buildTimeline(route, { ...base, budgetL: 10, statusStep: 0.1 });
  assert.equal(tl.tankL, 40);
  assert.equal(tl.capacityL, 20);
  const pcts = tl.events.filter((e) => e.type === "status").map((e) => e.pct);
  assert.ok(pcts.length > 0 && pcts.every((p) => p < 50), `status calls below the start level: ${pcts}`);
  assert.equal(pcts[0], 40);
});

// Own way back 6 L from the stop; fastest way home 3 L with its own path.
const withFast = {
  ...route, mode: "safest",
  back: { t_s: [0, 600, 1200], o2_l: [0, 3, 6] },
  back_fast: { t_s: [0, 300, 600], o2_l: [0, 1.5, 3], path: [
    [[137.40, -4.815]], [[137.395, -4.81], [137.40, -4.815]], [[137.39, -4.805], [137.40, -4.815]]] },
};

test("auto-switch: own way back stops fitting → switch to the fastest way home, later turn-back", () => {
  // B = 14: own rule 10 + 6 = 16 > 14 at the stop; fastest 10 + 3 = 13 ≤ 14 → reach the stop, switch on the way.
  const tl = buildTimeline(withFast, { ...base, capacityL: 24, reserveL: 10 });
  assert.equal(tl.reachStop, true);
  assert.ok(tl.switchT > 600 && tl.switchT < 1200, `switch between vertex 1 and 2: ${tl.switchT}`);
  assert.ok(tl.events.some((e) => e.type === "switch-fast"));
  assert.equal(tl.fastHome, true);
  assert.equal(tl.arrivalL, 24 - 13); // home by the fastest way: 10 out + 3 back
});

test("auto-switch: no switch when the own way back fits", () => {
  const tl = buildTimeline(withFast, { ...base, capacityL: 40, reserveL: 10 });
  assert.equal(tl.switchT, null);
  assert.equal(tl.fastHome, false);
  assert.ok(!tl.events.some((e) => e.type === "switch-fast"));
});

test("without complete alternate-return data, replay stays on same-path return and does not claim an auto-switch", () => {
  const samePathOnly = {
    ...route,
    mode: "balanced",
    back: { t_s: [0, 600, 1200], o2_l: [0, 3, 6] },
    // Dynamic constrained routes intentionally omit back_fast until complete legal alternate geometry is exported.
  };
  const tl = buildTimeline(samePathOnly, { ...base, capacityL: 26, reserveL: 10 });
  assert.equal(tl.fastHome, false);
  assert.equal(tl.switchT, null);
  assert.ok(!tl.events.some((e) => e.type === "switch-fast"));
  assert.equal(tl.arrivalL, 26 - 16);
});

test("auto-switch: switch point always comes before the turn-back point", () => {
  for (const B of [4, 6, 8, 10, 12]) {
    const tl = buildTimeline(withFast, { ...base, capacityL: B + 10, reserveL: 10 });
    const turn = tl.events.find((e) => e.type === "turnback" || e.type === "arrive");
    if (tl.switchT != null && turn) assert.ok(tl.switchT <= turn.t + 1e-9, `B=${B}`);
    assert.ok(tl.arrivalL >= 10 - 1e-9, `reserve intact at B=${B}: ${tl.arrivalL}`);
  }
});

test("approach-only engine routes do not claim arrival at the Observed stop", () => {
  const approachRoute = {
    ...route,
    stop_name: "S2",
    goal_access: {
      badge: "Derived",
      status: "approach_only",
      observed_stop_lonlat: [137.381, -4.808],
      endpoint_lonlat: route.coords.at(-1),
      offset_m: 8.2589,
      access_bound_m: 10,
      last_leg_modeled: false,
    },
  };

  const tl = buildTimeline(approachRoute, base);
  const approach = tl.events.find((event) => event.type === "approach");
  const withDwell = buildTimeline(approachRoute, { ...base, dwellS: 30 });

  assert.equal(tl.reachStop, true, "legacy reachStop still means the route endpoint was reached");
  assert.equal(tl.reachedApproachPoint, true);
  assert.equal(tl.reachedObservedStop, false);
  assert.ok(approach);
  assert.equal(tl.events.some((event) => event.type === "arrive"), false);
  assert.match(approach.label, /approach point/i);
  assert.match(approach.label, /8\.3 m/);
  assert.match(approach.label, /Observed stop/);
  assert.match(approach.label, /no final leg is modeled/i);
  assert.equal(calloutFor(approach), approach.label, "the spoken callout uses the honest approach label");
  assert.ok(withDwell.frames.some((frame) => frame.phase === "approach"));

  const goal = routeGoalInfo(approachRoute);
  assert.equal(goal.approachOnly, true);
  assert.deepEqual(goal.endpointLonlat, approachRoute.coords.at(-1));
  assert.deepEqual(goal.observedStopLonlat, approachRoute.goal_access.observed_stop_lonlat);
  assert.equal(goal.offsetM, 8.2589);
  assert.equal(sampleAt(tl, 1200).phase, "approach");
  const outboundAtEndpoint = trailAt(tl, 1200).out;
  assert.deepEqual(outboundAtEndpoint.at(-1), approachRoute.coords.at(-1));
  assert.ok(!outboundAtEndpoint.some(([lon, lat]) => lon === 137.381 && lat === -4.808));
});

test("legacy route payloads retain stop-arrival behavior", () => {
  const tl = buildTimeline(route, base);
  const arrival = tl.events.find((event) => event.type === "arrive");

  assert.equal(tl.reachStop, true);
  assert.equal(tl.reachedApproachPoint, false);
  assert.equal(tl.reachedObservedStop, true);
  assert.equal(arrival.label, "Arrived at S1");
  assert.equal(routeGoalInfo(route).approachOnly, false);
  assert.equal(routeGoalInfo(route).observedStopLonlat, null);
});

test('cost-only alternate return is omitted instead of drawing guessed geometry', () => {
  const r = {...withFast, back_fast:{t_s:[0,300,600],o2_l:[0,1.5,3]}};
  const tl=buildTimeline(r,{...base,capacityL:24,reserveL:10});
  assert.equal(tl.fastHome,false);
  assert.equal(tl.switchT,null);
})
