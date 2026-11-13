#!/usr/bin/env node
// Real plan builder (docs/app-redesign.md §4 plan contract, app/public/data/README.md).
//
// Writes the plan files that follow from the engine's real route files with NO extra assumption:
//   plan/{stop}_{mode}_c{crew}_l{load}_foot.json   for every entry in routes/index.json
// An on-foot plan for the route's own crew/load preset IS that route: coords, seg, cum, back,
// back_fast and pnr_index are copied unchanged, so the numbers keep the route's own label
// (the route badge; Derived geometry, Scenario habitat and O2 model, see the route's model_note).
//
// What it does NOT write (these stay as `_mock: true` from _mock/make-plan-mock.mjs until a
// sourced model exists): crew-1 plans (the 0.96 factor has no source), rover plans (drive speed,
// seated O2 rate and park point have no source), split plans (the 600 m separation limit has no
// source, so real plans ship `split: null`), the no-return limit lines, and targets.geojson extents.
//
// plan/index.json is rebuilt from the files on disk; each entry carries `_mock` from its file and
// the index itself keeps `_mock: true` while any listed plan is still mock (that drives the header badge).
//
// Run from anywhere:  node app/scripts/build-plans.mjs
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DATA = process.env.DATA_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "..", "public", "data");
const readText = (p) => readFileSync(join(DATA, p), "utf8");
const read = (p) => JSON.parse(readText(p));
const write = (p, obj) => writeFileSync(join(DATA, p), JSON.stringify(obj, null, 1) + "\n");
const CONTRACT = "docs/app-redesign.md §4";

const routeIndex = read("routes/index.json").routes;
const written = [];

for (const e of routeIndex) {
  if (e.status && e.status !== "routed") continue;
  const text = readText(e.file);
  const r = JSON.parse(text);
  if (r._mock === true) continue; // only real engine routes become real plans
  const load = Math.round(r.load_kg);
  const id = `${r.stop}_${r.mode}_c${r.crew}_l${load}_foot`;
  const n = r.coords.length;
  const distance = r.seg.reduce((s, x) => s + x.cost_terms.distance_m, 0);
  const member = {
    member: r.crew === 2 ? "pair" : "A",
    label: r.crew === 2 ? "Both astronauts" : "Astronaut",
    targets: [r.stop],
    coords: r.coords,
    ...(r.elev_m ? { elev_m: r.elev_m } : {}),
    legs: [{ kind: "walk", from: 0, to: n - 1, t_s: r.cum.t_s[n - 1], o2_l: r.cum.o2_l[n - 1], distance_m: distance }],
    seg: r.seg.map((s) => ({ t_s: s.t_s, o2_l: s.o2_l, slope_deg: s.slope_deg, distance_m: s.cost_terms.distance_m, cost_terms: s.cost_terms })),
    cum: r.cum,
    back: r.back,
    ...(r.back_fast ? { back_fast: r.back_fast } : {}),
    pnr_index: r.pnr_index,
    park_index: null,
  };
  write(`plan/${id}.json`, {
    _contract: CONTRACT,
    id,
    target: r.stop,
    mode: r.mode,
    crew: r.crew,
    load_kg: load,
    rover: false,
    badge: r.badge,
    budget_l: r.budget_l,
    derived_from: {
      badge: "Derived",
      route_file: e.file,
      route_sha256: createHash("sha256").update(text).digest("hex"),
      constants_hash: r.constants_hash,
      note: "On-foot plan for the route's own crew and load: every number is copied unchanged from the engine route file. Split plans are not shipped because the separation limit has no primary source yet.",
    },
    together: [member],
    split: null,
  });
  written.push(id);
}

// Rebuild the index from every plan file on disk (real + still-mock).
const plans = readdirSync(join(DATA, "plan"))
  .filter((f) => f.endsWith(".json") && f !== "index.json")
  .sort()
  .map((f) => {
    const p = read(`plan/${f}`);
    return { id: p.id, target: p.target, mode: p.mode, crew: p.crew, load_kg: p.load_kg, rover: p.rover, file: `plan/${f}`, ...(p._mock === true ? { _mock: true } : {}) };
  });
const anyMock = plans.some((p) => p._mock) ||
  readdirSync(join(DATA, "plan")).some((f) => f.endsWith(".geojson") && read(`plan/${f}`)._mock === true);
write("plan/index.json", { ...(anyMock ? { _mock: true } : {}), _contract: CONTRACT, plans });
if (!existsSync(join(DATA, "targets.geojson"))) console.warn("targets.geojson missing");
console.log(`wrote ${written.length} real plans (${written.join(", ")}); index lists ${plans.length} plans, ${plans.filter((p) => p._mock).length} still mock`);
