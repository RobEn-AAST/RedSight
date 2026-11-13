// Mission Replay — pure timeline logic (no DOM, no map). Owner: Marwan.
// Every number comes from the engine route file; this module only interpolates precomputed values and
// compares them against the budget (threshold logic allowed by demo-focus-plan §4 design rule).

export const MARS_RADIUS_M = 3396190; // matches the contract CRS (+R=3396190)

export function distanceM(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
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

/**
 * Cost to walk home from each vertex. Uses the engine's back_* arrays when present; otherwise assumes the
 * return costs the same as the way out along the same path (flagged as backAssumed).
 */
function backArrays(route) {
  const n = route.coords.length;
  const hasBack =
    Array.isArray(route.back?.t_s) && route.back.t_s.length === n &&
    Array.isArray(route.back?.o2_l) && route.back.o2_l.length === n;
  return hasBack
    ? { t: route.back.t_s, o2: route.back.o2_l, assumed: false }
    : { t: route.cum.t_s, o2: route.cum.o2_l, assumed: true };
}

/**
 * Build the whole replay: walk out, (optional) work at the stop, walk home.
 * If the budget can't cover the full trip, the crew turns at the modeled turn-back point: the exact spot on
 * the route where O2 used so far + O2 to get home = budget.
 *
 * @param route   engine route file (see README.md in this folder)
 * @param opts    { budgetL, dwellS = 0, dwellO2L = 0, lowFraction = 0.25 }
 */
export function buildTimeline(route, opts = {}) {
  const n = validate(route);
  const B = opts.budgetL ?? route.budget_l;
  if (!(B >= 0)) throw new Error("budgetL is required (litres O2 per crew member)");
  const dwellS = opts.dwellS ?? 0;
  const dwellO2 = opts.dwellO2L ?? 0;
  const lowFraction = opts.lowFraction ?? 0.25;
  const U = route.cum.o2_l;
  const T = route.cum.t_s;
  const back = backArrays(route);
  const need = (i) => U[i] + back.o2[i];

  const frames = []; // {t, o2, pt, d, phase}
  const events = [];
  let dist = 0;
  const push = (t, o2, pt, phase) => {
    const prev = frames[frames.length - 1];
    if (prev) dist += distanceM(prev.pt, pt);
    frames.push({ t, o2, pt, d: dist, phase });
  };

  if (need(0) > B) {
    push(0, 0, route.coords[0], "home");
    events.push({ t: 0, type: "no-go", label: "Budget too small to leave the habitat (modeled)" });
    return finish();
  }

  events.push({ t: 0, type: "depart", label: "Leaving the habitat" });

  // Outbound: walk while the trip home still fits the budget.
  const reachStop = need(n - 1) + dwellO2 <= B;
  let turnIdx = n - 1; // last full vertex walked
  let turnPt = route.coords[n - 1];
  let turnFrac = 0;
  if (!reachStop) {
    let k = 0;
    while (k + 1 < n && need(k + 1) <= B) k++;
    // inside segment k..k+1: U + Back grows linearly; solve for the crossing point.
    const dNeed = need(k + 1) - need(k);
    turnFrac = dNeed > 0 ? Math.min(1, Math.max(0, (B - need(k)) / dNeed)) : 0;
    turnIdx = k;
    turnPt = lerpPt(route.coords[k], route.coords[k + 1], turnFrac);
  }

  for (let i = 0; i <= turnIdx; i++) push(T[i], U[i], route.coords[i], "out");
  let tTurn = T[turnIdx];
  let o2Turn = U[turnIdx];
  let backT = back.t[turnIdx];
  let backO2 = back.o2[turnIdx];
  if (!reachStop && turnFrac > 0) {
    tTurn = lerp(T[turnIdx], T[turnIdx + 1], turnFrac);
    o2Turn = lerp(U[turnIdx], U[turnIdx + 1], turnFrac);
    backT = lerp(back.t[turnIdx], back.t[turnIdx + 1], turnFrac);
    backO2 = lerp(back.o2[turnIdx], back.o2[turnIdx + 1], turnFrac);
    push(tTurn, o2Turn, turnPt, "out");
  }

  let t = tTurn;
  let o2 = o2Turn;
  if (reachStop) {
    events.push({ t, type: "arrive", label: `Arrived at ${route.stop_name ?? route.stop ?? "the stop"}` });
    if (dwellS > 0) {
      t += dwellS;
      o2 += dwellO2;
      push(t, o2, turnPt, "stop");
    }
    events.push({ t, type: "return", label: "Heading home" });
  } else {
    events.push({ t, type: "turnback", label: "Modeled turn-back point reached: heading home" });
  }

  // Return along the same path (reversed). Costs from the back arrays, relative to the turn spot.
  const t0 = t, o0 = o2;
  // Turned mid-segment → the next vertex home is turnIdx; otherwise we stand on turnIdx already.
  const firstHome = !reachStop && turnFrac > 0 ? turnIdx : turnIdx - 1;
  for (let i = firstHome; i >= 0; i--) {
    push(t0 + (backT - back.t[i]), o0 + (backO2 - back.o2[i]), route.coords[i], "back");
  }
  events.push({ t: frames[frames.length - 1].t, type: "home", label: "Back at the habitat" });

  return finish();

  function finish() {
    // First moment the remaining budget drops below lowFraction.
    if (B > 0) {
      for (let i = 1; i < frames.length; i++) {
        const a = frames[i - 1], b = frames[i];
        const lim = B * (1 - lowFraction);
        if (a.o2 < lim && b.o2 >= lim) {
          const f = b.o2 === a.o2 ? 0 : (lim - a.o2) / (b.o2 - a.o2);
          events.push({ t: lerp(a.t, b.t, f), type: "low", label: `O₂ budget below ${Math.round(lowFraction * 100)}%` });
          break;
        }
      }
    }
    events.sort((a, b) => a.t - b.t);
    const last = frames[frames.length - 1];
    return {
      frames,
      events,
      budgetL: B,
      totalS: last.t,
      reachStop: frames.length > 1 && reachStop,
      turnPoint: frames.length > 1 ? turnPt : null,
      backAssumed: back.assumed,
    };
  }
}

/** Position and gauges at mission time t (seconds). */
export function sampleAt(tl, t) {
  const f = tl.frames;
  if (t <= f[0].t) return snap(f[0]);
  if (t >= f[f.length - 1].t) return snap(f[f.length - 1]);
  let lo = 0, hi = f.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (f[mid].t <= t) lo = mid; else hi = mid;
  }
  const a = f[lo], b = f[hi];
  const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  return {
    t,
    pt: lerpPt(a.pt, b.pt, k),
    o2Used: lerp(a.o2, b.o2, k),
    o2Left: tl.budgetL - lerp(a.o2, b.o2, k),
    distM: lerp(a.d, b.d, k),
    phase: b.phase,
    index: lo,
  };
  function snap(x) {
    return { t, pt: x.pt, o2Used: x.o2, o2Left: tl.budgetL - x.o2, distM: x.d, phase: x.phase, index: f.indexOf(x) };
  }
}

/** Walked trail up to time t (for the line behind the crew). */
export function trailAt(tl, t) {
  const s = sampleAt(tl, t);
  const pts = tl.frames.slice(0, s.index + 1).filter((fr) => fr.t <= t).map((fr) => fr.pt);
  pts.push(s.pt);
  return pts;
}

export function formatClock(s) {
  const m = Math.floor(s / 60);
  return `${String(Math.floor(m / 60)).padStart(1, "0")}:${String(m % 60).padStart(2, "0")}`;
}
