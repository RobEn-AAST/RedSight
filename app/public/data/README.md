# app/public/data — engine → app contract files

Shapes follow [`docs/demo-focus-plan.md`](../../../docs/demo-focus-plan.md) §15. Ali's real route,
constants, metadata and hazard outputs have replaced their mocks using the build command in
[`engine/README.md`](../../../engine/README.md). Youssef's layer list and Ayman's stops/cards remain
mock or incomplete where indicated below. Do not regenerate the whole mock set after real Ali data
has landed; `_mock/make-mock.mjs` overwrites every data file.

| File | Owner (real data) | What's real already |
|---|---|---|
| `meta.json` | Ali | real ops grid and CRS; habitat is a Scenario cell selected in the native-mask-reachable component |
| `constants.json` | Ali | real file; stable keys and descriptive `source` retained with additive `source_url` for every constant |
| `layers.json` | Youssef | layer list + sources; `available:false` until tiles exist |
| `stops.json` | Ayman | positions (§6, §8); photos + science text TODO |
| `routes/index.json`, `routes/{stop}_{mode}_{crew}_{load}.json` | Ali | fastest + lowest-modeled-hazard outcome for each of S1, S2, S3, D1 and D2 (crew 2, 15 kg); blocked targets have an explicit no-route status |
| `hazards.geojson` | Ali | primary-DTM nodata, unavailable native slope support and native Horn slope hard masks |
| `engine-build-manifest.json` | Ali | input/output hashes, source/licence, seam/alignment evidence, G1–G4 status, timing, model and route outcomes |
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

**Native terrain result:** the primary mean-elevation DEM is 600×600 at ~9.879 m/cell; its source is a
1.0117468 m DTM. The separate Horn 3×3 maximum-slope grid is computed at native spacing and aggregated
to each planning-cell center. Cache SHA-256:
`0540b673cdeb5e297a6d712d1e94792bcc6d186820d1ae19e06b2f52d5b35f0e`; 281,227 cells have valid slope,
and 191,612 valid cells exceed the 15° working mask. No slope values are filled. The companion DTM
has a +52.64 m median offset on overlap, so complementary-only cells remain unavailable and are not
blended into routes.

**Stop outcome under the native mask:** the exact cells for S1/S2/D1/D2 have maximum native slopes of
21.82°/31.89°/26.29°/29.22° and are unreachable under the configured 15° threshold. S3 is 9.59° and
has both routes. All five IDs and all ten stop/mode outcomes remain in the index; the eight blocked
outcomes state their reason. Nearest walkable cells are diagnostic only, never substituted as route
goals. The Scenario habitat is row 422, col 312 (`137.3870833°E, −4.8204167°`), selected in the S3
component after no original north/downslope candidate connected to any walkable stop.

**Pilot evidence:** G1 pass; G2 partial visual alignment only (major ridge/trough patterns co-locate,
but no metric tie point or sub-meter residual); G3 partial because four exact target cells are hard
blocked; G4 pass on a 1 h 27 min 1.7 s lower-bound wall interval from the first recorded STAC response
to final native-mask output, under the 3 h threshold. The route build itself took 23.09 s. The first
request began slightly before the first recorded response. Full timing, S1 evidence files and their
hashes are in `engine-build-manifest.json`.

No THEMIS thermal raster was supplied; route terrain factor is 1.0, so lowest-hazard cost currently
represents modeled slope exposure only. Sample pickup mass is not included in the base 15 kg route
bucket. The full upstream COG SHA-256 was not computed; local crop/cache hashes and source ETag are
distinguished in the manifest.

Regenerate mocks: `node app/public/data/_mock/make-mock.mjs` (overwrites ALL files — don't run it after real
data has landed).
