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
| `routes/index.json`, `routes/{stop}_{mode}_{crew}_{load}.json` | Ali | fastest + lowest-modeled-hazard outcome for each of S1, S2, S3, D1 and D2 (crew 2, 15 kg); each route has a separate Derived approach endpoint and the Observed stop coordinate remains in `stops.json` |
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
| `coords` | `[[lon, lat], …]` from the Scenario habitat's native source-pixel center to the Derived route access endpoint (N points), CRS `+proj=longlat +R=3396190` |
| `observed_stop_lonlat` | Original Observed coordinate from `stops.json`; it is not appended to `coords` |
| `goal_access` | `{badge: "Derived", status: "approach_only", observed_stop_lonlat, endpoint_lonlat, offset_m, access_bound_m, native_cell_rc, reason, last_leg_modeled: false}`. Keep the Observed stop marker separate from the route endpoint; do not draw a last-leg segment or claim exact arrival. |
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

**Terrain and route grids:** the primary mean-elevation context DEM is 600×600 at ~9.879 m/cell.
Routes use a bounded native 1.0117468 m primary-DTM graph. The separate Horn 3×3 maximum-slope grid
aggregated to planning cells remains a conservative context/hazard layer. Cache SHA-256:
`0540b673cdeb5e297a6d712d1e94792bcc6d186820d1ae19e06b2f52d5b35f0e`; 281,227 cells have valid slope,
and 191,612 valid cells exceed the 15° working mask. No slope values are filled. The companion DTM
has a +52.64 m median offset on overlap, so complementary-only cells remain unavailable and are not
blended into routes.

**Stop outcome:** all five stops have both route modes in the index. Native access offsets are S1
0.34 m, S2 1.66 m, S3 0.47 m, D1 0.65 m and D2 8.26 m. S2's exact source pixel has a 16.09° Horn
slope and is blocked; D2's exact source pixel is walkable but disconnected from the existing habitat
component. Routes end at the selected connected access pixels within the 10 m Scenario bound. No
route includes a last leg from that endpoint to the Observed coordinate. The existing Scenario
habitat remains row 422, col 312 (`137.3870833°E, −4.8204167°`); it maps to native source pixel
[4126, 3051].

Fastest and lowest-modeled-hazard routes are minima only inside the 250 m-expanded source-data
corridor; they are not global terrain optima. G3 remains `partial_approach_only`, since these outputs
do not claim exact arrival at every Observed stop. G2 passes as one bounded qualitative local tie at
moderate confidence: K1 has a 4.10 m apparent pick difference below a subjective, uncalibrated
±6.84 m visual-pick estimate. This is not global or calibrated registration.

**Pilot evidence:** G1 pass; G2 bounded local qualitative pass with moderate confidence; G3
partial/approach-only; G4 failed on the latest end-to-end interval because first recorded STAC
response through native-route output exceeded the 3 h threshold. The earlier 1 h 27 min interval is
historical and ended with the prior coarse-mask build. Current timestamps, K1 tie-point record,
independent review, file hashes and runtime are in `engine-build-manifest.json` and the ignored
`data/raw/engine-pilot/evidence/g2-closure/` cache.

No THEMIS thermal raster was supplied; route terrain factor is 1.0, so lowest-hazard cost currently
represents modeled slope exposure only. Sample pickup mass is not included in the base 15 kg route
bucket. The full upstream COG SHA-256 was not computed; local crop/cache hashes and source ETag are
distinguished in the manifest.

Regenerate mocks: `node app/public/data/_mock/make-mock.mjs` (overwrites ALL files — don't run it after real
data has landed).
