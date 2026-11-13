# app/public/data — engine → app contract files

Shapes follow [`docs/demo-focus-plan.md`](../../../docs/demo-focus-plan.md) §15. Ali's real route,
constants, metadata and hazard outputs have replaced their mocks using the build command in
[`engine/README.md`](../../../engine/README.md). Youssef's layer list and Ayman's stops/cards remain
mock or incomplete where indicated below. Do not regenerate the whole mock set after real Ali data
has landed; `_mock/make-mock.mjs` overwrites every data file.

| File | Owner (real data) | What's real already |
|---|---|---|
| `meta.json` | Ali | real ops grid and CRS; habitat is a Scenario cell selected from the primary DEM |
| `constants.json` | Ali | real file; stable keys and cited team defaults retained |
| `layers.json` | Youssef | layer list + sources; `available:false` until tiles exist |
| `stops.json` | Ayman | positions (§6, §8); photos + science text TODO |
| `routes/index.json`, `routes/{stop}_{mode}_{crew}_{load}.json` | Ali | fastest + lowest-modeled-hazard outcome for each of S1, S2, S3, D1 and D2 (crew 2, 15 kg); blocked targets have an explicit no-route status |
| `hazards.geojson` | Ali | primary-DTM nodata and represented-grid slope hard masks |
| `engine-build-manifest.json` | Ali | input hashes, source/licence data, seam statistics, model, runtime and route outcome record |
| `cards/rad.json`, `cards/rems.json` | Ayman | RAD dose + source, REMS pressure range |
| `fields/*.png`, `fields/coverage.png` | Ali / Youssef | not mocked yet (If-time features) |

## Note for Ali (engine) — O₂ numbers, read before writing routes (D27, demo-focus-plan §9c)

- `cum.o2_l` and `back.o2_l` = **plain expected O₂ per crew member** at the planned walking rate (Pandolf + κ).
  **Don't add** the reserve, the 20 % return margin, or pair/drill factors: the turn-back logic applies them
  from `constants.json` (`reserve_minutes`, `reserve_fraction`, `walkback_o2_lpm`, `return_cost_margin`), so
  they'd otherwise be counted twice.
- `back.o2_l[i]` = O₂ to walk **home from point i** (your return field sampled along the route). Without it
  the app assumes home costs the same as the way out and says so on screen.
- `budget_l` = capacity − reserve = 385 − max(0.25 × 385, 30 × 1.22) ≈ **289 L**. If you change capacity or
  reserve, change `constants.json`, not only the route files.
- Keep `constants.json` keys stable; the app reads them by name.

## Route file fields

| Field | Meaning |
|---|---|
| `coords` | `[[lon, lat], …]` habitat → stop (N points), CRS `+proj=longlat +R=3396190` |
| `seg[]` | N−1 segments: `t_s`, `o2_l` (per crew member), `slope_deg`, `cost_terms` |
| `cum.t_s`, `cum.o2_l` | cumulative from the habitat to each point (N values, non-decreasing) |
| `back.t_s`, `back.o2_l` | time / O₂ to walk **home from** each point (return field sampled on the route) |
| `budget_l` | usable O₂ per member after reserve (385 L × 0.75 by default) |
| `pnr_index` | last reachable point in the outbound prefix where `f × (cum.o2_l + m × back.o2_l) ≤ budget_l`; baseline `f = 1` per crew member and `m = constants.return_cost_margin` |
| `id`, `stop`, `mode` (`fastest`/`safest`), `crew`, `load_kg`, `badge`, `constants_hash` | labels |

`budget_l = capacity − max(reserve_fraction × capacity, reserve_minutes × walkback_o2_lpm)`, with
capacity read from `constants.json`. Route `cum.o2_l` and `back.o2_l` remain raw expected per-member
liters: reserve, return margin and crew factor are applied by the PNR calculation, not baked into the
arrays. Current replay invocation must pass capacity, reserve, margin and default member factors
`[1, 1]` from constants/settings. `total_s` remains outbound + return time. Return arrays describe the
same route geometry walked in reverse, with index 0 at the habitat and the final index at the stop.

**Terrain boundary:** the 600×600 DTM crop is average-resampled to ~9.88 m cells. The route hard mask
must use the separate native Horn max/90th-percentile slope cache aligned to this grid; no gradient of
the downsampled elevations may stand in for that hard mask. The cache manifest must include S1
landmark-alignment evidence. The companion DTM has large scene-to-scene height differences on overlap,
so complementary-only cells are marked unavailable and excluded from routes rather than vertically
adjusted or blended. No THEMIS thermal raster was supplied; route terrain factor is 1.0 and the
lowest-hazard cost currently represents modeled slope exposure only. Sample pickup mass is not
included in the base 15 kg route bucket. **The committed route files predate the native-slope cache
and are provisional; rerun the CLI with the updated `/tmp/redsight-engine-pilot-inputs.json` before treating them
as the final pilot outputs.** See `engine-build-manifest.json`
for the observed seam statistics, hashes and per-route outcomes.

Regenerate mocks: `node app/public/data/_mock/make-mock.mjs` (overwrites ALL files — don't run it after real
data has landed).
