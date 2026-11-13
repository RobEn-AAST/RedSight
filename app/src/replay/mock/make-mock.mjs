// MOCK route generator for developing the replay before the engine exists. NOT real model output.
// Run: node app/src/replay/mock/make-mock.mjs > app/src/replay/mock/route.json
import { distanceM } from "../replay-core.js";

const habitat = [137.4005, -4.8185]; // MOCK habitat (the real one is chosen at the pilot gate)
const stop = [137.38592, -4.79782]; // S1 boxwork 360 site (demo-focus-plan §6)
const n = 40;
const coords = [];
for (let i = 0; i < n; i++) {
  const f = i / (n - 1);
  const wiggle = Math.sin(f * Math.PI * 3) * 0.0012 * Math.sin(f * Math.PI);
  coords.push([+(habitat[0] + (stop[0] - habitat[0]) * f + wiggle).toFixed(6), +(habitat[1] + (stop[1] - habitat[1]) * f).toFixed(6)]);
}
const t = [0], o2 = [0], bt = [0], bo = [0];
for (let i = 1; i < n; i++) {
  const d = distanceM(coords[i - 1], coords[i]);
  const slope = 4 + 6 * Math.sin((i / n) * Math.PI); // mock uphill outbound
  const v = 0.9 - slope * 0.02; // m/s
  t.push(t[i - 1] + d / v);
  o2.push(o2[i - 1] + (d / v / 60) * (1.0 + slope * 0.06)); // L/min mock
  bt.push(bt[i - 1] + d / (v + 0.1));
  bo.push(bo[i - 1] + (d / (v + 0.1) / 60) * (0.9 + slope * 0.02)); // cheaper downhill
}
const r2 = (a) => a.map((x) => +x.toFixed(2));
console.log(JSON.stringify({
  _mock: true, id: "S1_fastest_2_15", stop: "S1", stop_name: "S1 boxwork site (MOCK route)",
  mode: "fastest", crew: 2, load_kg: 15, badge: "Scenario", budget_l: 90,
  coords, cum: { t_s: r2(t), o2_l: r2(o2) }, back: { t_s: r2(bt), o2_l: r2(bo) },
}));
