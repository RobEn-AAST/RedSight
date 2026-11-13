// Generates MOCK contract files (demo-focus-plan §15) so the app can be built before the engine exists.
// Run from the repo root: node app/public/data/_mock/make-mock.mjs
// Every generated file has "_mock": true. Engine/data owners REPLACE these files with real output
// (same names, same shape) and delete the flag. Real values that are already sourced in the docs
// (stop positions, constants, RAD) are copied as-is with their source.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = process.env.MOCK_OUT ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const R = 3396190;
// Never overwrite a real file: once an owner replaces a mock (no "_mock": true), it is skipped.
const write = (p, obj) => {
  const file = join(OUT, p);
  if (existsSync(file)) {
    let cur = null;
    try { cur = JSON.parse(readFileSync(file, "utf8")); } catch { /* unreadable: treat as real */ }
    if (cur?._mock !== true) { console.log("skip (real file):", p); return; }
  }
  mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(obj, null, 1) + "\n");
};
const dist = (a, b) => { const r = (d) => (d * Math.PI) / 180; const h = Math.sin(r(b[1] - a[1]) / 2) ** 2 + Math.cos(r(a[1])) * Math.cos(r(b[1])) * Math.sin(r(b[0] - a[0]) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };

const HABITAT = [137.4005, -4.8185]; // MOCK — real habitat is chosen at the pilot gate
const CRS = "+proj=longlat +R=3396190 +no_defs";

write("meta.json", {
  _mock: true, ops_box: { west: 137.335, east: 137.435, south: -4.85, north: -4.75 },
  crs: CRS, grid: { resolution_m: 10, width: 600, height: 600, origin_lonlat: [137.335, -4.75] },
  nodata: -32768, habitat: { lonlat: HABITAT, badge: "Scenario", note: "MOCK position" },
  build_date: "2026-11-13", constants_hash: "mock",
});

const c = (value, unit, source, badge, range) => ({ value, unit, range: range ?? null, source, badge });
write("constants.json", {
  _mock: true, _note: "Values are the team's cited defaults (technical-approaches §3); Ali's engine owns this file.",
  suit_factor_kappa: c(1.3, "×", "Norcross et al. NASA/TP-2010-216115", "Scenario", [1.2, 1.5]),
  reserve_fraction: c(0.25, "fraction", "Team assumption (no official Mars figure)", "Scenario"),
  slope_limit_foot_deg: c(15, "deg", "Team assumption", "Scenario"),
  slope_limit_rover_deg: c(20, "deg", "Within Apollo LRV 20–23° favorable / 25° max (NTRS 20250011301)", "Scenario"),
  watts_to_o2_ml_per_min: c(2.9, "mL/min per W", "Scott 2005; Weir 1949", "Derived"),
  o2_usable_primary_l: c(385, "L", "EMU Data Book: 0.55 kg usable primary O₂ ÷ 1.429 g/L", "Derived"),
  gravity_mars: c(3.71, "m/s²", "NSSDC Mars Fact Sheet", "Observed"),
  walk_speed_kmh: c(1.6, "km/h", "ALSJ Lunar Gaits: 1.1–2.2 km/h working", "Scenario", [1.1, 2.2]),
  crew_size_default: c(2, "people", "NASA DRA 5.0 buddy rule", "Scenario", [1, 2]),
  body_mass_kg: c(82, "kg", "NASA ICES-2026-127 example (180 lbm)", "Scenario", [43, 110]),
  carried_load_kg: c(15, "kg", "Team default", "Scenario", [0, 40]),
  sample_mass_per_stop_kg: c(2, "kg", "Team default", "Scenario", [0, 10]),
  reserve_minutes: c(30, "min", "Apollo traverse planning: walkback capacities after a 30-minute consumables reserve", "Scenario"),
  walkback_o2_lpm: c(1.22, "L/min", "Apollo walkback planning rate 1440 BTU/h ≈ 422 W × 2.9 mL/min/W", "Derived"),
  return_cost_margin: c(1.2, "×", "Team choice: plan the way home 20 % more expensive than expected", "Scenario", [1, 1.5]),
  emergency_supply_min: c(30, "min", "EMU secondary oxygen pack (backup, never planned)", "Observed"),
  o2_status_step: c(0.1, "fraction of tank", "Team choice: status callout every 10 % (5 % option)", "Scenario", [0.05, 0.1]),
  radio_mast_height_m: c(10, "m", "Team assumption", "Scenario"),
  blackout_warn_min: c(10, "min", "Team assumption", "Scenario"),
});
const budget = +(385 * 0.75).toFixed(1);

const tiles = (id) => `tiles/${id}/{z}/{x}/{y}.png`;
const layer = (id, name, badge, source, res) => ({ id, name, tiles: tiles(id), minzoom: 10, maxzoom: 16, badge,
  provenance: { source, resolution: res, date: "TBD", license: "TBD" }, legend: null, available: false });
write("layers.json", { _mock: true, _note: "available:false until Youssef's tiles exist; app should skip unavailable layers.", layers: [
  layer("hirise", "HiRISE optical", "Observed", "USGS STAC / Trek curiosity_hirise_mosaic", "0.25 m"),
  layer("hillshade", "Hillshade", "Derived", "From HiRISE DTM DTEEC_009149_1750_009294_1750_U01", "1 m → 10 m"),
  layer("slope", "Slope", "Derived", "From HiRISE DTM", "10 m"),
  layer("themis", "THEMIS thermal inertia (sand proxy)", "Derived", "Mars Odyssey THEMIS", "100 m"),
  layer("crism", "CRISM mineral indicators", "Derived", "MRO CRISM via Trek", "18–36 m"),
  layer("geology", "Geologic units (SIM 3292)", "Derived", "USGS SIM 3292", "map scale"),
] });

const stop = (id, name, lonlat, sols, evidence, kind, extra = {}) => ({ type: "Feature",
  geometry: { type: "Point", coordinates: lonlat },
  properties: { id, name, kind, sols, evidence, approx: false, photos: [], panorama: null, science: "TODO (Ayman)", badge: "Observed", ...extra } });
write("stops.json", { type: "FeatureCollection", _mock: true, _note: "Positions are real (demo-focus-plan §6, §8); photos/science text are TODO.", features: [
  stop("S1", "First boxwork 360", [137.38592, -4.79782], [4539, 4541], "PIA26559", "panorama", { panorama: "PIA26559" }),
  stop("S2", "Nevado Sajama 360", [137.381, -4.808], [4711, 4741], "PIA26696", "panorama", { panorama: "PIA26696" }),
  stop("S3", "Curiosity current position", [137.38915, -4.82568], [5070], "MMGIS waypoint", "rover"),
  stop("D1", "Altadena drill site", [137.3835, -4.79981], [4558, 4560], "JPL news 2025-06-23", "drill", { approx: true }),
  stop("D2", "Valle de la Luna drill site", [137.38104, -4.80784], [4687], "NASA Curiosity blog sols 4689–4694", "drill", { approx: true }),
] });

// MOCK routes: wiggly line habitat → stop. Fastest = short and steeper; safest (lowest-hazard) = longer
// detour on gentler slopes, so it takes more time and, coming home, more O2 than the fastest way.
const index = [];
function route(sid, target, mode) {
  const n = 40, coords = [];
  const detour = mode === "safest" ? 0.011 : 0.0006;
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1), w = Math.sin(f * Math.PI) * (detour + 0.0008 * Math.sin(f * Math.PI * 4));
    coords.push([+(HABITAT[0] + (target[0] - HABITAT[0]) * f + w).toFixed(6), +(HABITAT[1] + (target[1] - HABITAT[1]) * f + w * 0.5).toFixed(6)]);
  }
  const t = [0], o2 = [0], bt = [0], bo = [0], seg = [];
  for (let i = 1; i < n; i++) {
    const d = dist(coords[i - 1], coords[i]);
    const slope = (mode === "safest" ? 1.5 : 4) + 4 * Math.sin((i / n) * Math.PI * 2) ** 2;
    const v = 0.45 - slope * 0.01, vb = v + 0.05;
    const lpm = 0.9 + slope * 0.03, lpmB = 0.8 + slope * 0.01;
    t.push(t[i - 1] + d / v); o2.push(o2[i - 1] + (d / v / 60) * lpm);
    bt.push(bt[i - 1] + d / vb); bo.push(bo[i - 1] + (d / vb / 60) * lpmB);
    seg.push({ t_s: +(d / v).toFixed(1), o2_l: +((d / v / 60) * lpm).toFixed(2), slope_deg: +slope.toFixed(1), cost_terms: { distance_m: +d.toFixed(1), slope: +(slope / 15).toFixed(2), terrain: 1 } });
  }
  const r2 = (a) => a.map((x) => +x.toFixed(2));
  const id = `${sid}_${mode}_2_15`;
  let pnr = -1; for (let i = 0; i < n; i++) if (o2[i] + bo[i] <= budget) pnr = i;
  const file = { _mock: true, id, stop: sid, mode, crew: 2, load_kg: 15, badge: "Scenario", budget_l: budget,
    constants_hash: "mock", coords, seg, cum: { t_s: r2(t), o2_l: r2(o2) }, back: { t_s: r2(bt), o2_l: r2(bo) }, pnr_index: pnr };
  index.push({ id, stop: sid, mode, crew: 2, load_kg: 15, file: `routes/${id}.json`, total_s: Math.round(t[n - 1] + bt[n - 1]) });
  return file;
}

// Optional back_fast (demo-focus-plan §9 Back_fast sampled at each vertex): the fastest way home from
// each point. MOCK geometry: straight to the nearest vertex of the fastest route, then along it home;
// the connector is costed at the fastest route's average return rate per metre.
function addBackFast(r, fast) {
  const F = fast.coords, n = F.length;
  let len = 0; for (let i = 1; i < n; i++) len += dist(F[i - 1], F[i]);
  const tPerM = fast.back.t_s[n - 1] / len, oPerM = fast.back.o2_l[n - 1] / len;
  const t = [], o = [], path = [];
  for (const p of r.coords) {
    let j = 0; for (let k = 1; k < n; k++) if (dist(p, F[k]) < dist(p, F[j])) j = k;
    const d = dist(p, F[j]);
    t.push(+(fast.back.t_s[j] + d * tPerM).toFixed(2));
    o.push(+(fast.back.o2_l[j] + d * oPerM).toFixed(2));
    path.push([p, ...F.slice(0, j + 1).reverse()].filter((q, k, a) => k === 0 || q !== a[k - 1]));
  }
  r.back_fast = { via: fast.id, t_s: t, o2_l: o, path };
}

for (const [sid, ll] of [["S1", [137.38592, -4.79782]], ["S2", [137.381, -4.808]], ["S3", [137.38915, -4.82568]], ["D1", [137.3835, -4.79981]], ["D2", [137.38104, -4.80784]]]) {
  const fast = route(sid, ll, "fastest"), safe = route(sid, ll, "safest");
  addBackFast(safe, fast);
  for (const r of [fast, safe]) write(`routes/${r.id}.json`, r);
}
write("routes/index.json", { _mock: true, routes: index });

write("hazards.geojson", { type: "FeatureCollection", _mock: true, features: [
  { type: "Feature", properties: { reason: "slope", label: "Slope over 15° (MOCK area)" },
    geometry: { type: "Polygon", coordinates: [[[137.392, -4.803], [137.396, -4.803], [137.396, -4.806], [137.392, -4.806], [137.392, -4.803]]] } },
] });

write("cards/rad.json", { _mock: true, title: "Radiation at Gale (RAD)", badge: "Observed",
  values: [{ label: "Surface dose rate (GCR, average)", value: 0.64, unit: "mSv/day", pm: 0.12 }],
  limits: [{ label: "NASA career effective dose limit", value: 600, unit: "mSv", source: "NASA-STD-3001 Vol 1" }],
  note: "Single rover-local measurement, not a map. Suit shielding not modeled.",
  source: "Hassler et al. 2014, Science 343:1244797, doi:10.1126/science.1244797; PDS PPI MSL RAD", date_range: "2012-08 → 2013-06" });
write("cards/rems.json", { _mock: true, title: "Weather at Gale (REMS)", badge: "Observed",
  values: [{ label: "Surface pressure (annual range)", value: "700–920", unit: "Pa" },
           { label: "Air temperature (sol of plan)", value: "TODO", unit: "°C" }],
  note: "Rover-local station; no walk-scale weather map exists.",
  source: "Gómez-Elvira et al. 2014 doi:10.1002/2013JE004576; PDS msl_rems_bundle", date_range: "TODO (Ayman)" });
console.log("mock contract files written to", OUT);
