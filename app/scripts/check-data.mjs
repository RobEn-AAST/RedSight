#!/usr/bin/env node
// Data-file checker for the engine → app contract (demo-focus-plan §15, app/public/data/README.md).
// Owner: Marwan (integration). Run before opening a PR that changes app/public/data/:
//   cd app && npm run check:data            # rejects mock or incomplete production data
//   cd app && npm run check:data -- --final # same checks plus submission-specific constraints
// Exit code 1 if any ERROR. Plain Node, no dependencies.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const DATA = process.env.DATA_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "..", "public", "data");
const FINAL = process.argv.includes("--final");
const MARS_R = 3396190;
const BADGES = new Set(["Observed", "Derived", "Scenario", "Unavailable"]);
const BANNED = ["safe route", "safe time remaining", "certified", "flight-safe", "real-time", "validated"];
// constants.json keys the app reads by name (turnback.ts, MissionReplay.tsx); renaming one breaks the UI.
const REQUIRED_CONSTANTS = ["o2_usable_primary_l", "reserve_fraction", "reserve_minutes", "walkback_o2_lpm",
  "return_cost_margin", "emergency_supply_min", "o2_status_step"];

const errors = [], warnings = [];
const err = (file, msg) => errors.push(`${file}: ${msg}`);
const warn = (file, msg) => warnings.push(`${file}: ${msg}`);
const isNum = (x) => typeof x === "number" && Number.isFinite(x);
const distM = (a, b) => {
  const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(b[1] - a[1]) / 2) ** 2 + Math.cos(r(a[1])) * Math.cos(r(b[1])) * Math.sin(r(b[0] - a[0]) / 2) ** 2;
  return 2 * MARS_R * Math.asin(Math.min(1, Math.sqrt(h)));
};

const sha256 = (rel) => createHash("sha256").update(readFileSync(join(DATA, rel))).digest("hex");

const loaded = new Set();
function load(rel, { optional = false } = {}) {
  loaded.add(rel);
  const file = join(DATA, rel);
  if (!existsSync(file)) { (optional ? warn : err)(rel, "missing"); return null; }
  const text = readFileSync(file, "utf8");
  let json;
  try { json = JSON.parse(text); } catch (e) { err(rel, `not valid JSON (${e.message})`); return null; }
  if (json?._mock === true) err(rel, 'mock data is not accepted in production contracts');
  const lower = text.toLowerCase();
  for (const w of BANNED) if (lower.includes(w)) err(rel, `banned wording "${w}" (AGENTS rule 3)`);
  return json;
}
const checkBadge = (rel, where, badge) => {
  if (!BADGES.has(badge)) err(rel, `${where}: badge must be one of ${[...BADGES].join("/")}, got ${JSON.stringify(badge)}`);
};
const nonDecreasing = (a) => a.every((x, i) => i === 0 || x >= a[i - 1] - 1e-9);

// meta.json
const meta = load("meta.json");
let box = null, habitat = null;
if (meta) {
  const b = meta.ops_box;
  if (!b || ![b.west, b.east, b.south, b.north].every(isNum) || b.west >= b.east || b.south >= b.north) err("meta.json", "ops_box needs numeric west < east, south < north");
  else box = b;
  if (typeof meta.crs !== "string" || !meta.crs.includes(`+R=${MARS_R}`)) err("meta.json", `crs must state the Mars sphere +R=${MARS_R}`);
  const h = meta.habitat?.lonlat;
  if (!Array.isArray(h) || h.length !== 2 || !h.every(isNum)) err("meta.json", "habitat.lonlat [lon, lat] missing");
  else habitat = h;
  if (meta.habitat) checkBadge("meta.json", "habitat", meta.habitat.badge);
}
const inBox = (p) => !box || (p[0] >= box.west && p[0] <= box.east && p[1] >= box.south && p[1] <= box.north);
if (habitat && !inBox(habitat)) err("meta.json", "habitat is outside ops_box");

// constants.json
const constants = load("constants.json");
let budgetL = null;
if (constants) {
  for (const k of REQUIRED_CONSTANTS) if (!isNum(constants[k]?.value)) err("constants.json", `required key "${k}" missing or value not a number`);
  for (const [k, c] of Object.entries(constants)) {
    if (k.startsWith("_")) continue;
    if (!isNum(c?.value)) { err("constants.json", `${k}: value must be a number`); continue; }
    if (typeof c.unit !== "string") warn("constants.json", `${k}: unit missing`);
    if (!c.source && !c.source_url) err("constants.json", `${k}: source missing (AGENTS rule 1)`);
    checkBadge("constants.json", k, c.badge);
    if (Array.isArray(c.range) && (c.value < c.range[0] || c.value > c.range[1])) err("constants.json", `${k}: value ${c.value} outside its range ${c.range}`);
  }
  const v = (k) => constants[k]?.value;
  if (REQUIRED_CONSTANTS.every((k) => isNum(v(k)))) {
    const C = v("o2_usable_primary_l");
    budgetL = C - Math.max(v("reserve_fraction") * C, v("reserve_minutes") * v("walkback_o2_lpm"));
  }
}

// layers.json
const layers = load("layers.json");
if (layers) {
  if (!Array.isArray(layers.layers)) err("layers.json", "layers[] missing");
  for (const l of layers.layers ?? []) {
    const w = `layer ${l?.id ?? "?"}`;
    if (typeof l?.id !== "string" || typeof l?.name !== "string" || typeof l?.tiles !== "string") { err("layers.json", `${w}: id, name, tiles must be strings`); continue; }
    checkBadge("layers.json", w, l.badge);
    if (!l.provenance?.source) err("layers.json", `${w}: provenance.source missing`);
    if (!(l.tiles.includes("{z}") && l.tiles.includes("{x}") && l.tiles.includes("{y}"))) err("layers.json", `${w}: tiles must be an {z}/{x}/{y} template`);
    if (l.available) {
      const dir = join(DATA, l.tiles.split("{z}")[0]);
      if (/^https?:/.test(l.tiles)) warn("layers.json", `${w}: remote tiles (${l.tiles}); check they load without login`);
      // CI has no tiles (git-ignored, hosted on the VPS); the VPS deploy runs the full check.
      else if (process.env.CHECK_DATA_SKIP_TILES === "1") continue;
      else if (!existsSync(dir) || readdirSync(dir).length === 0) err("layers.json", `${w}: available:true but no tiles in ${relative(DATA, dir)}`);
    }
  }
  if ((layers.layers ?? []).filter((l) => l?.available).length === 0) warn("layers.json", "no layer is available yet (map shows the preview image only)");
}

// stops.json
const stops = load("stops.json");
const stopIds = new Set();
if (stops) {
  if (!Array.isArray(stops.features)) err("stops.json", "features[] missing");
  for (const f of stops.features ?? []) {
    const p = f?.properties ?? {}, c = f?.geometry?.coordinates;
    const w = `stop ${p.id ?? "?"}`;
    if (typeof p.id !== "string" || typeof p.name !== "string") { err("stops.json", `${w}: id and name required`); continue; }
    if (stopIds.has(p.id)) err("stops.json", `${w}: duplicate id`);
    stopIds.add(p.id);
    if (f.geometry?.type !== "Point" || !Array.isArray(c) || !c.every(isNum)) err("stops.json", `${w}: Point geometry required`);
    else if (!inBox(c)) err("stops.json", `${w}: outside ops_box`);
    checkBadge("stops.json", w, p.badge);
  }
}

// routes
const index = load("routes/index.json");
if (index) {
  if (!Array.isArray(index.routes) || index.routes.length === 0) err("routes/index.json", "routes[] empty");
  const modesByStop = new Map();
  for (const e of index.routes ?? []) {
    const w = `entry ${e?.id ?? e?.file ?? "?"}`;
    if (typeof e?.file !== "string" || typeof e?.stop !== "string") { err("routes/index.json", `${w}: file and stop required`); continue; }
    if (stops && !stopIds.has(e.stop)) err("routes/index.json", `${w}: stop ${e.stop} not in stops.json`);
    if (!["fastest", "safest"].includes(e.mode)) err("routes/index.json", `${w}: mode must be fastest or safest`);
    modesByStop.set(e.stop, new Set([...(modesByStop.get(e.stop) ?? []), e.mode]));
    const r = load(e.file);
    if (r) checkRoute(e.file, r, e);
  }
  for (const [s, m] of modesByStop) if (m.size < 2) warn("routes/index.json", `stop ${s}: only ${[...m]} (route cards A/B need both)`);
}

function checkRoute(rel, r, e) {
  const n = r.coords?.length ?? 0;
  if (!Array.isArray(r.coords) || n < 2 || !r.coords.every((p) => Array.isArray(p) && p.length >= 2 && p.every(isNum))) { err(rel, "coords needs ≥ 2 [lon, lat] points"); return; }
  for (const k of ["stop", "mode", "crew", "load_kg"]) if (e[k] != null && r[k] !== e[k]) err(rel, `${k} ${JSON.stringify(r[k])} differs from routes/index.json (${JSON.stringify(e[k])})`);
  checkBadge(rel, "route", r.badge);
  if (r.coords.some((p) => !inBox(p))) err(rel, "a point lies outside ops_box");
  if (habitat && distM(r.coords[0], habitat) > 30) err(rel, `first point is ${distM(r.coords[0], habitat).toFixed(0)} m from the habitat (routes start at meta.habitat)`);
  const stop = stops?.features?.find((f) => f.properties?.id === r.stop);
  if (stop && distM(r.coords[n - 1], stop.geometry.coordinates) > 30) warn(rel, `last point is ${distM(r.coords[n - 1], stop.geometry.coordinates).toFixed(0)} m from stop ${r.stop}`);
  const table = (name, t, { required }) => {
    if (!t) { if (required) err(rel, `${name} missing`); return false; }
    for (const k of ["t_s", "o2_l"]) {
      const a = t[k];
      if (!Array.isArray(a) || a.length !== n || !a.every(isNum)) { err(rel, `${name}.${k} must have ${n} numbers (one per point)`); return false; }
      if (a.some((x) => x < 0)) err(rel, `${name}.${k} has negative values`);
    }
    return true;
  };
  if (table("cum", r.cum, { required: true })) {
    if (!nonDecreasing(r.cum.t_s) || !nonDecreasing(r.cum.o2_l)) err(rel, "cum must not decrease along the route");
    if (r.cum.t_s[0] !== 0 || r.cum.o2_l[0] !== 0) err(rel, "cum must start at 0 at the habitat");
  }
  if (table("back", r.back, { required: true })) {
    if (!nonDecreasing(r.back.t_s) || !nonDecreasing(r.back.o2_l)) err(rel, "back must not decrease along the outbound-indexed route");
    if (r.back.t_s[0] !== 0 || r.back.o2_l[0] !== 0) err(rel, "back must start at 0 at the habitat");
  }
  if (!Array.isArray(r.seg) || r.seg.length !== n - 1) err(rel, `seg[] must have ${n - 1} segments`);
  if (budgetL != null && isNum(r.budget_l) && Math.abs(r.budget_l - budgetL) > 1) err(rel, `budget_l ${r.budget_l} ≠ constants C − R = ${budgetL.toFixed(1)} (O₂ note in app/public/data/README.md)`);
  if (r.back_fast !== undefined) err(rel, "back_fast is not supported until full legal alternate-return geometry and matching costs are exported");
}

// hazards + cards
const hazards = load("hazards.geojson", { optional: true });
if (hazards) for (const [i, f] of (hazards.features ?? []).entries()) if (!f?.properties?.reason) err("hazards.geojson", `feature ${i}: properties.reason missing`);
for (const c of ["cards/rad.json", "cards/rems.json"]) {
  const card = load(c, { optional: true });
  if (!card) continue;
  if (typeof card.title !== "string" || !Array.isArray(card.values)) err(c, "title and values[] required");
  if (!card.source) err(c, "source missing (AGENTS rule 1)");
  checkBadge(c, "card", card.badge);
  if (JSON.stringify(card).includes("TODO")) warn(c, "contains TODO");
}

// Plan files (docs/app-redesign.md §4): targets, plan index, every plan's members in the route shape.
const targets = load("targets.geojson", { optional: true });
const targetIds = new Set();
if (targets) for (const f of targets.features ?? []) {
  const p = f?.properties ?? {};
  if (typeof p.id !== "string" || f.geometry?.type !== "Polygon") { err("targets.geojson", `target ${p.id ?? "?"}: id and Polygon geometry required`); continue; }
  targetIds.add(p.id);
  checkBadge("targets.geojson", `target ${p.id}`, p.badge);
}
// Rover model behind plan/*_rover.json: every number needs a value and a source (AGENTS rule 1).
const roverModel = load("rover_model.json", { optional: true });
if (roverModel) for (const k of ["drive_speed_mps", "riding_metabolic_kj_per_h", "park_walk_m"]) {
  const v = roverModel[k];
  if (!isNum(v?.value) || !(v.value > 0)) err("rover_model.json", `${k}.value must be a positive number`);
  if (!v?.source || !v?.source_url) err("rover_model.json", `${k} needs source and source_url (AGENTS rule 1)`);
  checkBadge("rover_model.json", k, v?.badge);
}
const planIndex = load("plan/index.json", { optional: true });
if (planIndex) {
  if (!Array.isArray(planIndex.plans) || planIndex.plans.length === 0) err("plan/index.json", "plans[] empty");
  for (const e of planIndex.plans ?? []) {
    const w = `entry ${e?.id ?? e?.file ?? "?"}`;
    if (typeof e?.file !== "string" || typeof e?.target !== "string" || typeof e?.rover !== "boolean") { err("plan/index.json", `${w}: file, target, rover required`); continue; }
    if (targets && !targetIds.has(e.target)) err("plan/index.json", `${w}: target ${e.target} not in targets.geojson`);
    const plan = load(e.file);
    if (!plan) continue;
    for (const k of ["target", "mode", "crew", "load_kg", "rover"]) if (plan[k] !== e[k]) err(e.file, `${k} ${JSON.stringify(plan[k])} differs from plan/index.json (${JSON.stringify(e[k])})`);
    checkBadge(e.file, "plan", plan.badge);
    // A plan must name the exact engine route bytes it was built from (build-plans.mjs), or it is stale.
    const src = plan.derived_from;
    if (typeof src?.route_file !== "string" || typeof src?.route_sha256 !== "string") err(e.file, "derived_from.route_file/route_sha256 required");
    else if (!existsSync(join(DATA, src.route_file))) err(e.file, `derived_from.route_file ${src.route_file} missing`);
    else if (sha256(src.route_file) !== src.route_sha256) err(e.file, `stale: ${src.route_file} changed since this plan was built (run node scripts/build-plans.mjs)`);
    if (!Array.isArray(plan.together) || plan.together.length === 0) { err(e.file, "together[] empty"); continue; }
    const members = [...plan.together.map((m) => ["together", m]), ...(plan.split?.members ?? []).map((m) => ["split", m])];
    for (const [group, m] of members) {
      const where = `${e.file} (${group} ${m?.member ?? "?"})`;
      // Plan members store distance_m on the segment; checkRoute reads it from cost_terms.
      const seg = Array.isArray(m?.seg) ? m.seg.map((s) => ({ ...s, cost_terms: { distance_m: s.distance_m, ...s.cost_terms } })) : m?.seg;
      checkRoute(where, { ...m, seg, stop: m?.targets?.at(-1), mode: plan.mode, crew: plan.crew, load_kg: plan.load_kg, badge: plan.badge, budget_l: plan.budget_l }, {});
      if (!Array.isArray(m?.legs) || m.legs.length === 0) err(where, "legs[] empty");
      if (plan.rover === false && m?.park_index != null) err(where, "park_index must be null on foot");
      if (plan.rover === true) {
        const n = m?.coords?.length ?? 0;
        if (!Number.isInteger(m?.park_index) || m.park_index <= 0 || m.park_index >= n - 1) err(where, "rover plan needs park_index inside the route");
        const kinds = (m?.legs ?? []).map((l) => l.kind).join(",");
        if (kinds !== "drive,walk") err(where, `rover legs must be drive then walk (got ${kinds})`);
        if (!roverModel) err(where, "rover plan without rover_model.json");
      }
    }
  }
}

// Engine outputs must be byte-identical to what the engine wrote (engine-build-manifest.json output_sha256);
// a hand-edited or substituted route/hazard/constants file fails here.
const manifest = load("engine-build-manifest.json", { optional: true });
for (const [rel, want] of Object.entries(manifest?.output_sha256 ?? {})) {
  if (!existsSync(join(DATA, rel))) err("engine-build-manifest.json", `output ${rel} missing`);
  else if (sha256(rel) !== want) err(rel, "differs from the engine build manifest (not the engine's output)");
}

// Every production JSON/GeoJSON under data/ (except tiles/): parse it and reject mock flags.
// Also flag huge files that slow the deploy.
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name), s = statSync(p), rel = relative(DATA, p);
    if (s.isDirectory()) { if (name !== "tiles") walk(p); continue; }
    if (s.size > 5e6) warn(rel, `${(s.size / 1e6).toFixed(1)} MB (large for a static deploy)`);
    if (/\.(geo)?json$/.test(name) && !loaded.has(rel)) load(rel);
  }
})(DATA);

for (const w of warnings) console.log(`WARN  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)${FINAL ? " (--final)" : ""} in ${relative(process.cwd(), DATA) || DATA}`);
process.exit(errors.length ? 1 : 0);
