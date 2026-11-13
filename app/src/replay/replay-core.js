// Mission Replay — pure timeline logic (no DOM, no map). Owner: Marwan.
// Every number comes from the engine route file or constants; this module interpolates precomputed values and
// compares them against the budget (threshold logic allowed by demo-focus-plan §4 design rule).
//
// O2 model (docs: demo-focus-plan §9c, modeled on Apollo / EMU practice):
//   capacity C  = usable primary O2 in the suit
//   reserve  R  = never planned: max(reserve fraction × C, reserve minutes × walkback O2 rate)
//                 (Apollo planned walkback after a 30-minute consumables reserve)
//   budget   B  = C − R = what the plan may spend
//   emergency   = separate backup supply (EMU secondary O2 pack ≈ 30 min), never in the plan
// Turn rule: keep walking while  f × (used + m × home) ≤ B,
//   f = the most O2-hungry crew member's factor (pair = limited by the worse suit),
//   m = return margin (plan the way home pessimistically; the expected return is cheaper).
// So a normal plan arrives home with R plus the margin still in the tank, never at zero.

export const MARS_RADIUS_M = 3396190; // matches the contract CRS (+R=3396190)

export const DEFAULTS = {
  capacityL: 385, // EMU-class usable primary O2 (constants.o2_usable_primary_l)
  reserveFraction: 0.25, // team assumption
  reserveMin: 30, // Apollo: walkback capacities after a 30-minute consumables reserve
  walkbackLpm: 1.22, // ≈ 1440 BTU/h (422 W) × 2.9 mL/min/W — Apollo walkback planning rate
  returnMargin: 1.2, // Team choice: plan the return 20 % more expensive than expected
  emergencyMin: 30, // EMU secondary oxygen pack
};

export function o2Plan(o = {}) {
  const capacityL = o.capacityL ?? DEFAULTS.capacityL;
  const reserveFraction = o.reserveFraction ?? DEFAULTS.reserveFraction;
  const reserveMin = o.reserveMin ?? DEFAULTS.reserveMin;
  const walkbackLpm = o.walkbackLpm ?? DEFAULTS.walkbackLpm;
  const reserveL = o.reserveL ?? Math.max(reserveFraction * capacityL, reserveMin * walkbackLpm);
  return {
    capacityL,
    reserveL,
    budgetL: capacityL - reserveL,
    walkbackLpm,
    returnMargin: o.returnMargin ?? DEFAULTS.returnMargin,
    emergencyMin: o.emergencyMin ?? DEFAULTS.emergencyMin,
  };
}

export function distanceM(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * MARS_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

const lerp = (a, b, f) => a + (b - a) * f;
const lerpPt = (a, b, f) => [lerp(a[0], b[0], f), lerp(a[1], b[1], f)];

function validate(route) {
  const n = route?.coords?.length ?? 0;
  if (n < 2) throw new Error("route.coords needs at least 2 points");
  for (const k of ["t_s", "o2_l"]) {
    const arr = route.cum?.[k];
    if (!Array.isArray(arr) || arr.length !== n) throw new Error(`route.cum.${k} must have ${n} values`);
    for (let i = 1; i < n; i++) if (arr[i] < arr[i - 1]) throw new Error(`route.cum.${k} must not decrease`);
  }
  return n;
}

/** Copy the route arrays; use engine back arrays if present, else assume home costs the same as out. */
function arrays(route) {
  const n = route.coords.length;
  const hasBack =
    Array.isArray(route.back?.t_s) && route.back.t_s.length === n &&
    Array.isArray(route.back?.o2_l) && route.back.o2_l.length === n;
  return {
    P: route.coords.map((p) => [...p]),
    T: [...route.cum.t_s],
    U: [...route.cum.o2_l],
    BT: hasBack ? [...route.back.t_s] : [...route.cum.t_s],
    BO: hasBack ? [...route.back.o2_l] : [...route.cum.o2_l],
    assumed: !hasBack,
  };
}

/** Insert an interpolated vertex at mission time t (outbound). Returns its index, or -1 if not on the way out. */
function insertAtTime(a, t) {
  const { T } = a;
  if (!(t > T[0]) || t >= T[T.length - 1]) return t <= T[0] ? 0 : -1;
  let i = 0;
  while (T[i + 1] < t) i++;
  if (T[i + 1] === t) return i + 1;
  const f = (t - T[i]) / (T[i + 1] - T[i]);
  for (const k of ["T", "U", "BT", "BO"]) a[k].splice(i + 1, 0, lerp(a[k][i], a[k][i + 1], f));
  a.P.splice(i + 1, 0, lerpPt(a.P[i], a.P[i + 1], f));
  return i + 1;
}

/**
 * Build the whole replay: walk out, (optional) work at the stop, walk home.
 * @param route  engine route file (see app/public/data/README.md)
 * @param opts   o2Plan options + { budgetL (overrides C − R), memberFactors = [1, 1], dwellS, dwellO2L,
 *               lowFraction = 0.25, aheadS = 600, drill: { atS, factor, label } }
 */
export function buildTimeline(route, opts = {}) {
  validate(route);
  const plan = o2Plan({ ...opts, capacityL: opts.capacityL ?? route.capacity_l });
  if (opts.budgetL != null) { plan.budgetL = opts.budgetL; plan.capacityL = opts.budgetL + plan.reserveL; }
  const B = plan.budgetL;
  const m = plan.returnMargin;
  const members = opts.memberFactors ?? [1, 1].slice(0, route.crew ?? 2);
  const f = Math.max(...members);
  const dwellS = opts.dwellS ?? 0;
  const dwellO2 = opts.dwellO2L ?? 0;
  const drill = opts.drill && opts.drill.factor > 0 ? opts.drill : null;

  const a = arrays(route);
  const drillIdx = drill ? insertAtTime(a, drill.atS) : -1; // -1 = drill not during the way out
  const n = a.P.length;
  const k = drill?.factor ?? 1;
  const tD = drill?.atS ?? Infinity;
  const usedAt = (i) => (a.T[i] <= tD ? a.U[i] : a.U[drillIdx] + k * (a.U[i] - a.U[drillIdx]));
  const homeMult = (i) => (a.T[i] >= tD ? k : 1);
  const need = (i) => f * (usedAt(i) + m * homeMult(i) * a.BO[i]);

  const frames = [];
  const events = [];
  let dist = 0;
  const push = (t, o2, pt, phase, home = null) => {
    const prev = frames[frames.length - 1];
    if (prev) dist += distanceM(prev.pt, pt);
    frames.push({ t, o2, pt, d: dist, phase, home });
  };
  const result = (extra) => finish(extra);

  if (need(0) > B) {
    push(0, 0, a.P[0], "home");
    events.push({ t: 0, type: "no-go", label: "Budget too small to leave the habitat (modeled)" });
    return result({ reachStop: false, turnPoint: null, forced: false });
  }
  events.push({ t: 0, type: "depart", label: "Leaving the habitat" });

  const reachStop = need(n - 1) + f * dwellO2 <= B;
  let turnIdx = n - 1, turnFrac = 0, forced = false;
  if (!reachStop) {
    let j = 0;
    while (j + 1 < n && need(j + 1) <= B) j++;
    if (drillIdx > 0 && j === drillIdx - 1) {
      forced = true; // the drill made the trip home too expensive right now: turn on the spot
      turnIdx = drillIdx;
    } else {
      const d = need(j + 1) - need(j);
      turnFrac = j + 1 < n && d > 0 ? Math.min(1, Math.max(0, (B - need(j)) / d)) : 0;
      turnIdx = j;
    }
  }
  const turnPt = turnFrac > 0 ? lerpPt(a.P[turnIdx], a.P[turnIdx + 1], turnFrac) : a.P[turnIdx];

  for (let i = 0; i <= turnIdx; i++) push(a.T[i], a.U[i], a.P[i], "out", a.BO[i] * homeMult(i));
  const at = (arr) => (turnFrac > 0 ? lerp(arr[turnIdx], arr[turnIdx + 1], turnFrac) : arr[turnIdx]);
  let t = at(a.T), o2 = at(a.U);
  const backT = at(a.BT), backO2 = at(a.BO);
  if (turnFrac > 0) push(t, o2, turnPt, "out", backO2 * (t >= tD ? k : 1));

  if (reachStop) {
    events.push({ t, type: "arrive", label: `Arrived at ${route.stop_name ?? route.stop ?? "the stop"}` });
    if (dwellS > 0) { t += dwellS; o2 += dwellO2; push(t, o2, turnPt, "stop"); }
    events.push({ t, type: "return", label: "Heading home" });
  } else {
    const label = forced
      ? `${drill.label ?? "Contingency"}: return now by the fastest way home`
      : "Modeled turn-back point reached: heading home";
    events.push({ t, type: forced ? "forced-return" : "turnback", label });
    const ahead = opts.aheadS ?? 600;
    if (!forced && t - ahead > 0) events.push({ t: t - ahead, type: "turnback-ahead", label: "Turn-back point ahead" });
  }

  const t0 = t, o0 = o2;
  const firstHome = turnFrac > 0 ? turnIdx : turnIdx - 1;
  for (let i = firstHome; i >= 0; i--) push(t0 + (backT - a.BT[i]), o0 + (backO2 - a.BO[i]), a.P[i], "back");
  events.push({ t: frames[frames.length - 1].t, type: "home", label: "Back at the habitat" });
  return result({ reachStop, turnPoint: reachStop ? null : turnPt, forced });

  function finish(extra) {
    // Drill: O2 use after tD runs at k × the modeled rate (time unchanged).
    if (drill) {
      const base = o2AtTime(frames, tD);
      for (const fr of frames) if (fr.t > tD) fr.o2 = base + k * (fr.o2 - base);
      if (tD < frames[frames.length - 1].t) events.push({ t: tD, type: "drill", label: drill.label ?? "Contingency drill" });
    }
    const lastO2 = frames[frames.length - 1].o2;
    for (const fr of frames) if (fr.home == null || fr.phase !== "out") fr.home = lastO2 - fr.o2;
    const C = plan.capacityL, R = plan.reserveL;
    const left = (o) => C - f * o; // worst member
    crossing(B * (1 - (opts.lowFraction ?? 0.25)) / f, "low", `Usable O₂ below ${Math.round((opts.lowFraction ?? 0.25) * 100)}%`);
    crossing((C - R) / f, "reserve", "Into the reserve: no longer on plan");
    crossing(C / f, "emergency", "Primary O₂ empty: emergency supply needed");
    const step = opts.statusStep ?? 0.1;
    if (step > 0) {
      for (let p = 1 - step; p > 1e-9; p -= step) {
        const pct = Math.round(p * 100);
        const lim = (C * (1 - p)) / f;
        for (let i = 1; i < frames.length; i++) {
          const a0 = frames[i - 1], b0 = frames[i];
          if (a0.o2 < lim && b0.o2 >= lim) {
            const w = b0.o2 === a0.o2 ? 1 : (lim - a0.o2) / (b0.o2 - a0.o2);
            const homeFrac = (f * lerp(a0.home, b0.home, w)) / C;
            const homePct = Math.round(homeFrac * 100);
            const reservePct = Math.round((R / C) * 100);
            const sparePct = Math.max(0, Math.round((p - homeFrac - R / C) * 100));
            events.push({ t: lerp(a0.t, b0.t, w), type: "status", pct, homePct, sparePct,
              label: `O₂ ${pct}% · home needs ${homePct}% · reserve ${reservePct}% · spare ${sparePct}%` });
            break;
          }
        }
      }
    }
    events.sort((x, y) => x.t - y.t);
    const last = frames[frames.length - 1];
    const arrivalL = left(last.o2);
    return {
      frames, events, ...plan, budgetL: B, members, worstFactor: f,
      totalS: last.t, arrivalL, arrivalMin: arrivalL / plan.walkbackLpm,
      reserveUsedL: Math.max(0, R - arrivalL), backAssumed: a.assumed, drill, ...extra,
      reachStop: frames.length > 1 && extra.reachStop,
    };
    function crossing(lim, type, label) {
      for (let i = 1; i < frames.length; i++) {
        const p = frames[i - 1], q = frames[i];
        if (p.o2 < lim && q.o2 >= lim) {
          events.push({ t: q.o2 === p.o2 ? q.t : lerp(p.t, q.t, (lim - p.o2) / (q.o2 - p.o2)), type, label });
          return;
        }
      }
    }
  }
}

function o2AtTime(frames, t) {
  if (t <= frames[0].t) return frames[0].o2;
  for (let i = 1; i < frames.length; i++) {
    const p = frames[i - 1], q = frames[i];
    if (q.t >= t) return q.t === p.t ? q.o2 : lerp(p.o2, q.o2, (t - p.t) / (q.t - p.t));
  }
  return frames[frames.length - 1].o2;
}

/** Position and gauges at mission time t (seconds). o2Left/each member use the full tank (capacity). */
export function sampleAt(tl, t) {
  const f = tl.frames;
  let lo = 0, hi = f.length - 1, k = 0;
  if (t <= f[0].t) hi = 0;
  else if (t >= f[hi].t) lo = hi;
  else {
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (f[mid].t <= t) lo = mid; else hi = mid; }
    k = f[hi].t === f[lo].t ? 0 : (t - f[lo].t) / (f[hi].t - f[lo].t);
  }
  const a = f[lo], b = f[hi];
  const used = lerp(a.o2, b.o2, k);
  const members = tl.members.map((mf) => tl.capacityL - mf * used);
  const o2Left = Math.min(...members);
  return {
    t, pt: lerpPt(a.pt, b.pt, k), o2Used: used, o2Left, members,
    usableLeft: o2Left - tl.reserveL, // what's left of the plan's budget (can go negative = in reserve)
    homeL: tl.worstFactor * lerp(a.home, b.home, k), // expected O2 to get home from here (worst member)
    minutesLeft: o2Left / tl.walkbackLpm,
    distM: lerp(a.d, b.d, k), phase: b.phase, index: lo,
  };
}

/** Walked trail up to time t, split into the way out and the way home (so progress home is visible). */
export function trailAt(tl, t) {
  const s = sampleAt(tl, t);
  const done = tl.frames.slice(0, s.index + 1).filter((fr) => fr.t <= t);
  const out = done.filter((fr) => fr.phase !== "back").map((fr) => fr.pt);
  const back = done.filter((fr) => fr.phase === "back").map((fr) => fr.pt);
  if (s.phase === "back") {
    if (!back.length && out.length) back.push(out[out.length - 1]);
    back.push(s.pt);
  } else out.push(s.pt);
  if (back.length && out.length && back[0] !== out[out.length - 1]) back.unshift(out[out.length - 1]);
  return { out, back };
}

export function formatDuration(s) {
  const mm = Math.max(0, Math.round(s / 60));
  return mm >= 60 ? `${Math.floor(mm / 60)} h ${String(mm % 60).padStart(2, "0")} min` : `${mm} min`;
}

export function formatClock(s) {
  const mm = Math.floor(s / 60);
  return `${Math.floor(mm / 60)}:${String(mm % 60).padStart(2, "0")}`;
}
