# app/public/data — engine → app contract files

Shapes follow [`docs/demo-focus-plan.md`](../../../docs/demo-focus-plan.md) §15. This feature branch
contains Ali's real native-route outputs, metadata, constants and hazard polygons. The app's separate
`plan/` files remain Marwan's mock plan set until that plan producer consumes the native engine
contract. The normal data checker allows those mocks with warnings; `--final` rejects any remaining
`"_mock": true` files.

| File | Owner (real data) | What's real already |
|---|---|---|
| `meta.json` | Ali | Real ops box, CRS, coarse grid and unchanged Scenario habitat; native route extent is additive metadata |
| `constants.json` | Ali | Stable cited model defaults; source URLs retained |
| `layers.json` | Youssef | Layer list and sources; unavailable until tiles exist |
| `stops.json` | Ayman | Observed stop coordinates, science/source cards and photos |
| `routes/index.json`, `routes/{stop}_{mode}_{crew}_{load}.json` | Ali | Ten native-grid fastest/lowest-modeled-hazard routes; Derived approach-only endpoints are separate from Observed stops |
| `hazards.geojson` | Ali | Primary-DTM nodata, unavailable native slope support and conservative coarse Horn maximum-slope cells |
| `engine-build-manifest.json` | Ali | Source/output hashes, bounded native extent, G1–G4 status, timing, access outcomes and limitations |
| `plan/*.json`, `plan/index.json`, `plan/limits_*.geojson` | Marwan / Ali | Main-branch mock crew/rover plans; they do not yet consume Ali's native approach routes |
| `cards/rad.json`, `cards/rems.json`, `cards/stops.json` | Ayman | Context cards and stop content from the main branch |
| `fields/*.png`, `fields/coverage.png` | Ali / Youssef | Not supplied yet |

## Check your files before a PR

`cd app && npm run check:data` checks the data contract (shapes, lengths, route coordinates, cumulative
arrays, budget, badges, sources, available tiles, and banned wording). It permits mock files with
warnings. Before submission use `npm run check:data -- --final`, which fails if any `"_mock": true`
file remains.

## Note for Ali (engine) — O₂ numbers, read before writing routes (D27, demo-focus-plan §9c)

- `cum.o2_l` and `back.o2_l` are **plain expected O₂ per crew member** at the planned walking rate
  (Pandolf + κ). Do not add the reserve, return margin, or pair/drill factors; the turn-back logic
  applies them from `constants.json`.
- `back.o2_l[i]` is the O₂ to walk home from point `i` on the same route geometry walked in reverse.
- `budget_l = capacity − max(reserve_fraction × capacity, reserve_minutes × walkback_o2_lpm)`, with
  capacity read from `constants.json`.
- Keep `constants.json` keys stable; the app reads them by name.

## Route file fields

| Field | Meaning |
|---|---|
| `coords` | `[[lon, lat], …]` from the Scenario habitat's native source-pixel center to the Derived route access endpoint (N points), CRS `+proj=longlat +R=3396190` |
| `observed_stop_lonlat` | Original Observed coordinate from `stops.json`; it is not appended to `coords` |
| `goal_access` | `{badge: "Derived", status: "approach_only", observed_stop_lonlat, endpoint_lonlat, offset_m, access_bound_m, native_cell_rc, reason, last_leg_modeled: false}`. Keep the Observed marker separate; never draw a last-leg segment or claim exact arrival. |
| `seg[]` | N−1 segments: `t_s`, `o2_l` (per crew member), `slope_deg`, `cost_terms` |
| `cum.t_s`, `cum.o2_l` | Cumulative from habitat to each point (N values, non-decreasing) |
| `back.t_s`, `back.o2_l` | Return time/O₂ from each point along this same geometry in reverse |
| `budget_l` | Usable O₂ per member after reserve (385 L × 0.75 by default) |
| `pnr_index` | Last outbound index satisfying `f × (cum.o2_l + m × back.o2_l) ≤ budget_l`; baseline `f = 1` per crew member and `m = constants.return_cost_margin` |
| `back_fast` *(optional; safest routes)* | Fastest way home from each point: `t_s[]`, `o2_l[]`, `path[]`, and the fastest route id in `via` |
| `id`, `stop`, `mode` (`fastest`/`safest`), `crew`, `load_kg`, `badge`, `constants_hash` | Labels |

The native primary-DTM route graph is bounded to the union of the existing habitat and five Observed
stop coordinates expanded by 250 m, clipped to the cached source window. Fastest and lowest-modeled-
hazard paths are corridor-limited optima. The 9.88 m Horn maximum-slope aggregate remains a coarse
context layer; a legal native path can cross a planning cell whose neighboring source pixels exceed
15°. The route cache uses the same 15° maximum, hard nodata blocking, no-corner-cut rule and native
endpoint-sampled edge grades.

**Current engine result:** ten route files are present. S2's exact source pixel exceeds the 15° limit;
D2's exact pixel is walkable but disconnected. All endpoints are Derived approach pixels within 10 m;
no final leg is modeled. G3 remains `partial_approach_only`. G2 passes as one bounded qualitative K1
landmark tie at moderate confidence only (4.10 m apparent difference, below a subjective uncalibrated
±6.84 m pick estimate; no global registration claim). Current G4 is failed because the latest
first-recorded-STAC-response-to-output interval exceeds three hours. Full timing and evidence hashes
are in `engine-build-manifest.json`; wider G2 evidence is preserved in the ignored local pilot cache.

Regenerate only remaining mock files with `node app/public/data/_mock/make-mock.mjs`; it skips files
without `"_mock": true`. `node app/public/data/_mock/make-plan-mock.mjs` regenerates the separate mock
plan set and does not consume the native route endpoints.
