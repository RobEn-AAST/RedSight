#!/usr/bin/env node
// Plan builder (docs/app-redesign.md §4 plan contract, app/public/data/README.md).
//
// Writes only what follows from files already on disk, with NO invented number:
//   targets.geojson                                 one area per stop in stops.json
//   plan/{stop}_{mode}_c{crew}_l{load}_foot.json    for every routed entry in routes/index.json, crew 2 and crew 1
//   plan/index.json                                 rebuilt from the plan files on disk
//
// Crew 2 (the route's own preset): the route file IS the plan; coords, seg, cum and directed back costs
// pnr_index are copied unchanged.
// Crew 1: the same numbers again. The engine's O2 model is per crew member (Pandolf + κ per person,
// engine/export.py) with no crew-size term, and its turn-back uses max(member_factors) with every factor
// 1.0 (engine/route/pnr.py), so one walker on the same route has the same per-person time, O2 and
// turn-back point as each member of the pair. The plan says this in `derived_from.note`.
//
// Rover plans: plan/{stop}_{mode}_c{crew}_l{load}_rover.json, from the same route plus rover_model.json
// (sourced drive speed and riding metabolic rate, team-choice park distance). The crew drives the route
// from the habitat to the park point, walks the rest, walks back to the rover and drives home.
//
// Not written, because no primary-sourced model exists for them: split plans (the separation limit) and
// the no-return limit lines (they need the engine's full return field, which is not exported). The app
// hides those options when their files are absent.
//
// Run from anywhere:  node app/scripts/build-plans.mjs
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DATA = process.env.DATA_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "..", "public", "data");
const readText = (p) => readFileSync(join(DATA, p), "utf8");
const read = (p) => JSON.parse(readText(p));
const write = (p, obj) => writeFileSync(join(DATA, p), JSON.stringify(obj, null, 1) + "\n");
const CONTRACT = "docs/app-redesign.md §4";
const round = (x, d = 6) => Math.round(x * 10 ** d) / 10 ** d;

// ---- Reject any non-production/mock plans; test fixtures belong outside public/data. ----
for (const f of readdirSync(join(DATA, "plan"))) {
  if (!/\.(geo)?json$/.test(f) || f === "index.json") continue;
  if (read(`plan/${f}`)._mock === true) throw new Error(`Mock plan is not valid production data: ${f}`);
}

// ---- Routes on disk ----
const routeIndex = read("routes/index.json").routes;
const routes = [];
for (const e of routeIndex) {
  if (e.status && e.status !== "routed") continue;
  const text = readText(e.file);
  const r = JSON.parse(text);
  if (r._mock === true) throw new Error(`Refusing to build a production plan from mock route data: ${e.file}`)
  routes.push({ entry: e, text, r });
}

// ---- Target areas: Observed stop + the routes' own access bound ----
// The circle is NOT a mapped geologic extent. It is the Scenario access bound the route model uses
// around each Observed stop (routes/*.json goal_access.access_bound_m): a route counts as arriving when
// its endpoint is within this distance. Which goals a site serves follows the app's sourced goal list
// (app/src/lib/materials.ts) and each stop's own science text in stops.json.
const R_MARS = 3396190; // m, meta.json CRS +R=3396190
const stops = read("stops.json").features;
const BOXWORK = /boxwork/i;
function circle([lon, lat], radiusM, n = 32) {
  const mPerDegLat = (Math.PI * R_MARS) / 180;
  const mPerDegLon = mPerDegLat * Math.cos((lat * Math.PI) / 180);
  const ring = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    ring.push([round(lon + (radiusM * Math.cos(a)) / mPerDegLon), round(lat + (radiusM * Math.sin(a)) / mPerDegLat)]);
  }
  ring.push(ring[0]);
  return ring;
}
const targets = [];
for (const f of stops) {
  const p = f.properties;
  const access = routes.map(({ r }) => r).find((r) => r.stop === p.id && r.goal_access)?.goal_access;
  if (!access || !(access.access_bound_m > 0)) continue; // no route, no plan target
  const text = `${p.science ?? ""} ${p.card?.geologic_context ?? ""} ${p.card?.target_type ?? ""}`;
  const boxwork = BOXWORK.test(text);
  targets.push({
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [circle(f.geometry.coordinates, access.access_bound_m)] },
    properties: {
      id: p.id,
      name: p.name,
      site: f.geometry.coordinates,
      site_badge: "Observed",
      substances: [
        ...(boxwork ? ["Boxwork ridges and hollows (stops.json science, NASA source)"] : []),
        "Sulfate-bearing unit host rock (Fraeman et al. 2016)",
      ],
      goals: [...(boxwork ? ["boxwork"] : []), "sulfate-unit", "survey"],
      evidence: p.evidence ?? null,
      source_url: p.card?.source_url ?? null,
      badge: "Scenario",
      extent_m: access.access_bound_m,
      extent_note: `The site is Observed (${p.evidence ?? "stops.json"}). The ${access.access_bound_m} m circle is the route model's Scenario access bound (routes goal_access.access_bound_m), not a mapped extent of the rock.`,
    },
  });
}
write("targets.geojson", {
  type: "FeatureCollection",
  _contract: CONTRACT,
  _source: "stops.json (Observed sites) + routes/*.json goal_access.access_bound_m (Scenario); built by app/scripts/build-plans.mjs",
  features: targets,
});

// ---- Rover model (rover_model.json, every number sourced) ----
const constants = read("constants.json");
const C = (k) => {
  const v = constants[k]?.value;
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`constants.json ${k} missing`);
  return v;
};
const roverModel = read("rover_model.json");
const RV = (k) => {
  const v = roverModel[k]?.value;
  if (typeof v !== "number" || !(v > 0) || !roverModel[k].source) throw new Error(`rover_model.json ${k} needs a positive value and a source`);
  return v;
};
const DRIVE_MPS = RV("drive_speed_mps");
const RIDE_W = (RV("riding_metabolic_kj_per_h") * 1000) / 3600;
const RIDE_O2_L_PER_S = (RIDE_W * C("watts_to_o2_ml_per_min")) / 60_000; // suited measurement: no kappa
const PARK_WALK_M = RV("park_walk_m");
const ROVER_SLOPE_DEG = C("slope_limit_rover_deg");

// Same turn-back rule as the engine (engine/route/pnr.py), every member factor 1.0.
function pnrIndex(used, home) {
  const capacity = C("o2_usable_primary_l");
  const reserve = Math.max(C("reserve_fraction") * capacity, C("reserve_minutes") * C("walkback_o2_lpm"));
  const budget = capacity - reserve;
  const margin = C("return_cost_margin");
  let pnr = -1;
  for (let i = 0; i < used.length; i++) {
    if (used[i] + margin * home[i] <= budget) pnr = i;
    else break;
  }
  return pnr;
}

/** Rover member: drive 0 → park, walk park → stop; or null when the route is too short to drive. */
function roverMember(r, base) {
  const n = r.coords.length;
  const segD = r.seg.map((s) => s.cost_terms.distance_m);
  const along = [0];
  for (const d of segD) along.push(along.at(-1) + d);
  const total = along[n - 1];
  if (total <= PARK_WALK_M) return null;
  let park = 0;
  for (let i = 0; i < n; i++) if (total - along[i] >= PARK_WALK_M) park = i;
  if (park === 0) return null;
  for (let i = 0; i < park; i++) {
    if (Math.abs(r.seg[i].slope_deg) > ROVER_SLOPE_DEG) throw new Error(`${r.id}: drive segment ${i} exceeds slope_limit_rover_deg`);
  }
  const driveT = (i) => along[i] / DRIVE_MPS;
  const cumT = [], cumO = [], backT = [], backO = [];
  for (let i = 0; i < n; i++) {
    if (i <= park) {
      cumT.push(driveT(i));
      cumO.push(driveT(i) * RIDE_O2_L_PER_S);
      backT.push(driveT(i));
      backO.push(driveT(i) * RIDE_O2_L_PER_S);
    } else {
      cumT.push(cumT[park] + r.cum.t_s[i] - r.cum.t_s[park]);
      cumO.push(cumO[park] + r.cum.o2_l[i] - r.cum.o2_l[park]);
      backT.push(backT[park] + r.back.t_s[i] - r.back.t_s[park]);
      backO.push(backO[park] + r.back.o2_l[i] - r.back.o2_l[park]);
    }
  }
  const seg = base.seg.map((s, i) => {
    if (i >= park) return s;
    const t = segD[i] / DRIVE_MPS;
    return { ...s, t_s: t, o2_l: t * RIDE_O2_L_PER_S, cost_terms: { ...s.cost_terms, power_w: RIDE_W } };
  });
  const walkD = total - along[park];
  return {
    ...base,
    seg,
    legs: [
      { kind: "drive", from: 0, to: park, t_s: cumT[park], o2_l: cumO[park], distance_m: along[park] },
      { kind: "walk", from: park, to: n - 1, t_s: cumT[n - 1] - cumT[park], o2_l: cumO[n - 1] - cumO[park], distance_m: walkD },
    ],
    cum: { t_s: cumT, o2_l: cumO },
    back: { t_s: backT, o2_l: backO },
    pnr_index: pnrIndex(cumO, backO),
    park_index: park,
  };
}

// ---- Plans ----
const written = [];
for (const { entry: e, text, r } of routes) {
  const load = Math.round(r.load_kg);
  const n = r.coords.length;
  const distance = r.seg.reduce((s, x) => s + x.cost_terms.distance_m, 0);
  const crews = r.crew === 2 ? [2, 1] : [r.crew];
  for (const crew of crews) {
    const id = `${r.stop}_${r.mode}_c${crew}_l${load}_foot`;
    const member = {
      member: crew === 2 ? "pair" : "A",
      label: crew === 2 ? "Both astronauts" : "Astronaut",
      targets: [r.stop],
      coords: r.coords,
      ...(r.elev_m ? { elev_m: r.elev_m } : {}),
      legs: [{ kind: "walk", from: 0, to: n - 1, t_s: r.cum.t_s[n - 1], o2_l: r.cum.o2_l[n - 1], distance_m: distance }],
      seg: r.seg.map((s) => ({ t_s: s.t_s, o2_l: s.o2_l, slope_deg: s.slope_deg, distance_m: s.cost_terms.distance_m, cost_terms: s.cost_terms })),
      cum: r.cum,
      back: r.back,
      pnr_index: r.pnr_index,
      park_index: null,
    };
    const note = crew === r.crew
      ? "On-foot plan for the route's own crew and load: every number is copied unchanged from the engine route file. Split plans are not shipped because the separation limit has no primary source yet."
      : "One astronaut on the same route: every number is copied unchanged from the engine route file, because the engine's O2 model is per crew member with no crew-size term (engine/export.py) and its turn-back uses the largest member factor, 1.0 for everyone (engine/route/pnr.py). Walking alone is a Scenario; NASA plans EVAs in pairs (NASA-SP-2009-566).";
    write(`plan/${id}.json`, {
      _contract: CONTRACT,
      id,
      target: r.stop,
      mode: r.mode,
      crew,
      load_kg: load,
      rover: false,
      badge: r.badge,
      budget_l: r.budget_l,
      derived_from: {
        badge: "Derived",
        route_file: e.file,
        route_sha256: createHash("sha256").update(text).digest("hex"),
        constants_hash: r.constants_hash,
        note,
      },
      together: [member],
      split: null,
    });
    written.push(id);

    const rover = roverMember(r, member);
    if (!rover) continue;
    const rid = `${r.stop}_${r.mode}_c${crew}_l${load}_rover`;
    write(`plan/${rid}.json`, {
      _contract: CONTRACT,
      id: rid,
      target: r.stop,
      mode: r.mode,
      crew,
      load_kg: load,
      rover: true,
      badge: "Scenario",
      budget_l: r.budget_l,
      derived_from: {
        badge: "Derived",
        route_file: e.file,
        route_sha256: createHash("sha256").update(text).digest("hex"),
        constants_hash: r.constants_hash,
        rover_model: "rover_model.json",
        note: `Rover plan on the same engine route: drive ${Math.round(rover.legs[0].distance_m)} m at ${DRIVE_MPS} m/s (Apollo LRV speed made good, NTRS 20250011301) breathing suit O2 at the Apollo LRV-operations metabolic rate (NASA TN D-7883), park ${PARK_WALK_M} m of route before the stop (team choice), walk the rest with the engine's own walking costs. Lunar rover data applied to Mars: Scenario.`,
      },
      together: [rover],
      split: null,
    });
    written.push(rid);
  }
}

// Rebuild the index from every plan file on disk.
const plans = readdirSync(join(DATA, "plan"))
  .filter((f) => f.endsWith(".json") && f !== "index.json")
  .sort()
  .map((f) => {
    const p = read(`plan/${f}`);
    if (p._mock === true) throw new Error(`Refusing to index mock plan data: ${f}`)
    return { id: p.id, target: p.target, mode: p.mode, crew: p.crew, load_kg: p.load_kg, rover: p.rover, file: `plan/${f}` };
  });
write("plan/index.json", { _contract: CONTRACT, plans });
console.log(`wrote ${targets.length} targets, ${written.length} plans; index lists ${plans.length} data-backed plans`);
