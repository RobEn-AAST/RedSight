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

/** Describe whether the exported route ends at an Observed stop or a Derived approach point. */
export function routeGoalInfo(route) {
  const goalAccess = route?.goal_access;
  const approachOnly = goalAccess?.status === "approach_only";
  const observedStop = approachOnly
    ? goalAccess.observed_stop_lonlat ?? route.observed_stop_lonlat ?? null
    : null;
  return {
    approachOnly,
    endpointLonlat: route?.coords?.[route.coords.length - 1] ?? null,
    observedStopLonlat: Array.isArray(observedStop) ? observedStop : null,
    offsetM: approachOnly && Number.isFinite(goalAccess.offset_m) ? goalAccess.offset_m : null,
  };
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

/**
 * Fastest way home from route point i as a polyline (starts at coords[i], ends at the habitat), or null.
 * With back_fast.path_from (engine export since 2026-11-14) paths are stored only at key points: walk the
 * route back to the nearest key point at or before i, then follow its path. Without path_from, path has
 * one polyline per route point (older contract).
 */
export function fastPathFrom(route, i) {
  const bf = route?.back_fast;
  const coords = route?.coords;
  if (!bf || !Array.isArray(bf.path) || !Array.isArray(coords) || !(i >= 0 && i < coords.length)) return null;
  const from = bf.path_from;
  if (!Array.isArray(from)) return bf.path.length === coords.length && bf.path[i]?.length > 1 ? bf.path[i] : null;
  let k = -1;
  for (let j = 0; j < from.length && from[j] <= i; j++) k = j;
  if (k < 0 || !Array.isArray(bf.path[k]) || bf.path[k].length < 1) return null;
  const line = [...coords.slice(from[k], i + 1).reverse(), ...bf.path[k].slice(1)];
  return line.length > 1 ? line : null;
}

/** Copy the route arrays; use engine back arrays if present, else assume home costs the same as out. */
function arrays(route) {
  const n = route.coords.length;
  const hasBack =
    Array.isArray(route.back?.t_s) && route.back.t_s.length === n &&
    Array.isArray(route.back?.o2_l) && route.back.o2_l.length === n;
  // Optional back_fast: the fastest way home from each vertex (O2, time, path). Ignored on a fastest route.
  const bf = route.back_fast;
  const hasFast = route.mode !== "fastest" &&
    Array.isArray(bf?.t_s) && bf.t_s.length === n && Array.isArray(bf?.o2_l) && bf.o2_l.length === n;
  return {
    P: route.coords.map((p) => [...p]),
    T: [...route.cum.t_s],
    U: [...route.cum.o2_l],
    BT: hasBack ? [...route.back.t_s] : [...route.cum.t_s],
    BO: hasBack ? [...route.back.o2_l] : [...route.cum.o2_l],
    BFT: hasFast ? [...bf.t_s] : null,
    BFO: hasFast ? [...bf.o2_l] : null,
    // Without a path, the fastest way home is drawn back along this route (its cost still from back_fast).
    BFP: hasFast ? route.coords.map((p, i) => fastPathFrom(route, i) ?? route.coords.slice(0, i + 1).reverse()) : null,
    fast: hasFast,
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
  for (const k of ["T", "U", "BT", "BO", "BFT", "BFO"]) if (a[k]) a[k].splice(i + 1, 0, lerp(a[k][i], a[k][i + 1], f));
  const pt = lerpPt(a.P[i], a.P[i + 1], f);
  a.P.splice(i + 1, 0, pt);
  if (a.BFP) a.BFP.splice(i + 1, 0, [pt, ...a.BFP[i].slice(1)]);
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
  // tankL = full tank (the gauge scale); capacityL = O2 at the start. A lower budget (turn-back slider)
  // means starting with less O2 in the same tank, so percentages stay of the full tank.
  plan.tankL = plan.capacityL;
  if (opts.budgetL != null) { plan.budgetL = opts.budgetL; plan.capacityL = opts.budgetL + plan.reserveL; plan.tankL = Math.max(plan.tankL, plan.capacityL); }
  const B = plan.budgetL;
  const m = plan.returnMargin;
  const members = opts.memberFactors ?? [1, 1].slice(0, route.crew ?? 2);
  const f = Math.max(...members);
  const dwellS = opts.dwellS ?? 0;
  const dwellO2 = opts.dwellO2L ?? 0;
  const drill = opts.drill && opts.drill.factor > 0 ? opts.drill : null;

  const a = arrays(route);
  const goalInfo = routeGoalInfo(route);
  const drillIdx = drill ? insertAtTime(a, drill.atS) : -1; // -1 = drill not during the way out
  const n = a.P.length;
  const k = drill?.factor ?? 1;
  const tD = drill?.atS ?? Infinity;
  const usedAt = (i) => (a.T[i] <= tD ? a.U[i] : a.U[drillIdx] + k * (a.U[i] - a.U[drillIdx]));
  const homeMult = (i) => (a.T[i] >= tD ? k : 1);
  const need = (i) => f * (usedAt(i) + m * homeMult(i) * a.BO[i]);
  // demo-focus-plan §9: with back_fast known, the "don't go beyond" rule uses the fastest way home, and
  // the recommended return switches from this route's own way back to the fastest one where the former
  // stops fitting the budget.
  const needF = (i) => f * (usedAt(i) + m * homeMult(i) * a.BFO[i]);
  const needT = a.fast ? (i) => Math.min(need(i), needF(i)) : need; // any modeled way home that fits

  const frames = [];
  const events = [];
  let dist = 0;
  const push = (t, o2, pt, phase, home = null) => {
    const prev = frames[frames.length - 1];
    if (prev) dist += distanceM(prev.pt, pt);
    frames.push({ t, o2, pt, d: dist, phase, home });
  };
  const result = (extra) => finish(extra);

  if (needT(0) > B) {
    push(0, 0, a.P[0], "home");
    events.push({ t: 0, type: "no-go", label: "Budget too small to leave the habitat (modeled)" });
    return result({ reachStop: false, turnPoint: null, forced: false, switchPoint: null, switchT: null, fastHome: false });
  }
  events.push({ t: 0, type: "depart", label: "Leaving the habitat" });

  const reachStop = needT(n - 1) + f * dwellO2 <= B;
  let turnIdx = n - 1, turnFrac = 0, forced = false;
  if (!reachStop) {
    let j = 0;
    while (j + 1 < n && needT(j + 1) <= B) j++;
    if (drillIdx > 0 && j === drillIdx - 1) {
      forced = true; // the drill made the trip home too expensive right now: turn on the spot
      turnIdx = drillIdx;
    } else {
      const d = needT(j + 1) - needT(j);
      turnFrac = j + 1 < n && d > 0 ? Math.min(1, Math.max(0, (B - needT(j)) / d)) : 0;
      turnIdx = j;
    }
  }
  const turnPt = turnFrac > 0 ? lerpPt(a.P[turnIdx], a.P[turnIdx + 1], turnFrac) : a.P[turnIdx];

  const at = (arr) => (turnFrac > 0 ? lerp(arr[turnIdx], arr[turnIdx + 1], turnFrac) : arr[turnIdx]);
  const tTurn = at(a.T);

  // Switch point: where this route's own way back stops fitting (only matters before the turn/stop).
  let switchT = null, switchPt = null;
  const stayT = reachStop ? Infinity : tTurn; // after arriving, the dwell O2 also counts
  if (a.fast) {
    const ownFits = (i) => need(i) + (i === n - 1 && reachStop ? f * dwellO2 : 0) <= B;
    let j = -1;
    while (j + 1 < n && a.T[j + 1] <= Math.min(stayT, a.T[n - 1]) && ownFits(j + 1)) j++;
    if (j < 0) { switchT = 0; switchPt = a.P[0]; }
    else if (j < n - 1) {
      const d = need(j + 1) - need(j);
      const fr = d > 0 ? Math.min(1, Math.max(0, (B - need(j)) / d)) : 0;
      switchT = lerp(a.T[j], a.T[j + 1], fr); switchPt = lerpPt(a.P[j], a.P[j + 1], fr);
      if (switchT > tTurn) { switchT = null; switchPt = null; }
    }
  }
  const fastHome = a.fast && (switchT != null || forced);
  const homeAt = (i) => (switchT != null && a.T[i] >= switchT ? a.BFO[i] : a.BO[i]) * homeMult(i);

  for (let i = 0; i <= turnIdx; i++) push(a.T[i], a.U[i], a.P[i], "out", homeAt(i));
  let t = tTurn, o2 = at(a.U);
  const backT = fastHome ? at(a.BFT) : at(a.BT), backO2 = fastHome ? at(a.BFO) : at(a.BO);
  if (turnFrac > 0) push(t, o2, turnPt, "out", backO2 * (t >= tD ? k : 1));
  if (switchT != null) events.push({ t: switchT, type: "switch-fast", label: "O₂ getting low: switching to the fastest way back" });

  if (reachStop) {
    if (goalInfo.approachOnly) {
      const offset = goalInfo.offsetM === null ? "" : ` (${goalInfo.offsetM.toFixed(1)} m from the Observed stop)`;
      events.push({
        t,
        type: "approach",
        label: `Reached the Derived approach point${offset}; no final leg is modeled.`,
      });
      // Preserve a zero-duration approach phase at the route endpoint when no dwell is configured.
      if (dwellS <= 0) push(t, o2, turnPt, "approach");
    } else {
      events.push({ t, type: "arrive", label: `Arrived at ${route.stop_name ?? route.stop ?? "the stop"}` });
    }
    if (dwellS > 0) {
      t += dwellS;
      o2 += dwellO2;
      push(t, o2, turnPt, goalInfo.approachOnly ? "approach" : "stop");
    }
    events.push({ t, type: "return", label: "Heading home" });
  } else {
    const label = forced
      ? `${drill.label ?? "Contingency"}: return now by the fastest way home`
      : fastHome ? "Modeled turn-back point reached: heading home by the fastest way" : "Modeled turn-back point reached: heading home";
    events.push({ t, type: forced ? "forced-return" : "turnback", label });
    const ahead = opts.aheadS ?? 600;
    if (!forced && t - ahead > 0) events.push({ t: t - ahead, type: "turnback-ahead", label: "Turn-back point ahead" });
  }

  const t0 = t, o0 = o2;
  if (fastHome) {
    // Walk the fastest way home; time and O2 spread along it by distance.
    // BFP[i] starts at vertex i; a turn point past vertex i walks back to it first.
    const path = turnFrac > 0 ? [turnPt, ...a.BFP[turnIdx]] : [turnPt, ...a.BFP[turnIdx].slice(1)];
    const cd = [0]; for (let i = 1; i < path.length; i++) cd.push(cd[i - 1] + distanceM(path[i - 1], path[i]));
    const L = cd[cd.length - 1] || 1;
    for (let i = 1; i < path.length; i++) push(t0 + backT * (cd[i] / L), o0 + backO2 * (cd[i] / L), path[i], "back");
    if (path.length < 2) push(t0, o0, turnPt, "back");
  } else {
    const firstHome = turnFrac > 0 ? turnIdx : turnIdx - 1;
    for (let i = firstHome; i >= 0; i--) push(t0 + (backT - a.BT[i]), o0 + (backO2 - a.BO[i]), a.P[i], "back");
  }
  events.push({ t: frames[frames.length - 1].t, type: "home", label: "Back at the habitat" });
  return result({ reachStop, turnPoint: reachStop ? null : turnPt, forced, switchPoint: switchPt, switchT, fastHome });

  function finish(extra) {
    // Drill: O2 use after tD runs at k × the modeled rate (time unchanged).
    if (drill) {
      const base = o2AtTime(frames, tD);
      for (const fr of frames) if (fr.t > tD) fr.o2 = base + k * (fr.o2 - base);
      if (tD < frames[frames.length - 1].t) events.push({ t: tD, type: "drill", label: drill.label ?? "Contingency drill" });
    }
    const lastO2 = frames[frames.length - 1].o2;
    for (const fr of frames) if (fr.home == null || fr.phase !== "out") fr.home = lastO2 - fr.o2;
    const C = plan.capacityL, R = plan.reserveL, T = plan.tankL;
    const left = (o) => C - f * o; // worst member
    crossing(B * (1 - (opts.lowFraction ?? 0.25)) / f, "low", `Usable O₂ below ${Math.round((opts.lowFraction ?? 0.25) * 100)}%`);
    crossing((C - R) / f, "reserve", "Into the reserve: no longer on plan");
    crossing(C / f, "emergency", "Primary O₂ empty: emergency supply needed");
    const step = opts.statusStep ?? 0.1;
    if (step > 0) {
      for (let p = 1 - step; p > 1e-9; p -= step) {
        if (p * T >= C - 1e-9) continue; // started below this level
        const pct = Math.round(p * 100);
        const lim = (C - T * p) / f;
        for (let i = 1; i < frames.length; i++) {
          const a0 = frames[i - 1], b0 = frames[i];
          if (a0.o2 < lim && b0.o2 >= lim) {
            const w = b0.o2 === a0.o2 ? 1 : (lim - a0.o2) / (b0.o2 - a0.o2);
            const homeFrac = (f * lerp(a0.home, b0.home, w)) / T;
            const homePct = Math.round(homeFrac * 100);
            const reservePct = Math.round((R / T) * 100);
            const sparePct = Math.max(0, Math.round((p - homeFrac - R / T) * 100));
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
      // Keep reachStop as the legacy route-endpoint flag; the additive flags identify what endpoint it represents.
      reachStop: frames.length > 1 && extra.reachStop,
      reachedApproachPoint: frames.length > 1 && extra.reachStop && goalInfo.approachOnly,
      reachedObservedStop: frames.length > 1 && extra.reachStop && !goalInfo.approachOnly,
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
    distM: lerp(a.d, b.d, k),
    phase: k === 0 && a.phase === "approach" ? "approach" : b.phase,
    index: lo,
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
