# RedSight engine implementation plan (Ali)

**Status:** Gate A complete and real-data route build implemented, 2026-11-13. This plan follows the
existing team choices and does not change the app data contract. The engine is a Python/NumPy/SciPy
offline producer; outputs are Scenario estimates unless a field is directly observed.

## Scope and sequence

1. **Gate A — synthetic model and core.** Build a Mars-metric planning grid, conservative terrain
   mask, directed 8-neighbor CSR, segment cost model, indexed SciPy Dijkstra fields/predecessors, route
   extraction, raw per-member O₂ arrays and the D27 prefix PNR rule. Hand-check all behavior on small
   synthetic arrays. This gate does not claim real-terrain performance.
2. **Gate B — independent Tester audit.** Resolve findings before any real-raster route work.
3. **Gate C — one real-data pilot (G1–G4).** Use the separate input handoff (DEM + ortho) to confirm
   file/license/provenance, Mars CRS and grid alignment, actual stop footprint, habitat location,
   slope/mask sanity, reverse-path costs and D27 PNR. Record runtime. No synthetic fallback counts as
   real evidence. Failure is reported against G1–G4 before scaling.
4. **Gate D — all confirmed supported stops.** Only after Gate C passes, export fastest and
   lowest-modeled-hazard routes for every stop supported by the actual DEM. Preserve failures and
   unreachable stops as explicit outcomes; do not silently drop them. Record hashes and make builds
   deterministic. Existing mocks remain untouched until real replacement is ready.
5. **Gate E — independent whole-engine/consumer audit.** Check contract, real terrain, route arrays,
   reproducibility, and that the current Mission Replay reads the exported raw route costs and
   same-route reverse geometry as intended. Fix findings and commit the resulting gate only after
   review.

No app, replay, tile, stop-card, science-content, or data-acquisition ownership is taken here. No
submission, publishing, push, or deploy action is part of this plan.

## Gate A model and implementation choices

- Use Python 3, NumPy, rasterio for later raster I/O, and SciPy sparse graph/Dijkstra. Reuse installed
  packages; use an isolated engine venv only if the available environment cannot run the engine.
- Analysis coordinates are projected Mars metric coordinates derived from the existing spherical Mars
  CRS (`+proj=longlat +R=3396190 +no_defs`), never Earth Web Mercator. Grid metadata and terrain fields
  are engine-owned; the app contract's existing `meta.json` values and stable keys remain unchanged.
- Do not fill DEM or slope nodata. Nodata/outside-coverage cells and edges are hard blocked. Resample
  the real source DEM to each planning cell by mean elevation; use a separate, hash-checked native
  Horn max/90th-percentile slope aggregate for the hard mask. Synthetic fixtures supply mean heights
  and hard slopes directly. Signed directional grade comes from source/destination mean heights.
  Foot edges above the
  existing 15° team threshold are blocked. Diagonals require both orthogonal side cells to be
  traversable (no corner cutting).
- Each legal adjacency is directed. Edge grade is `atan2(z_destination-z_source, edge_distance)` in
  degrees; reversing an edge recomputes grade and all directional costs. CSR stores finite,
  nonnegative time and exposed lowest-hazard objective weights. Lowest-hazard means the selected
  weighted objective and is not described as lexicographic or guaranteed globally safest.
- Use the adopted degree-based piecewise `V(theta)`: uphill speed is `Vmax * max(0.3, cos(2*theta))`
  with theta converted to radians; downhill is `1.1*Vmax` through −12°, then linearly falls to the
  0.3 floor at the −15° hard limit. This is a Scenario transfer, not a measured Mars walking law.
  Segment time follows the documented terrain factor and speed model. Pandolf power uses body mass,
  carried load, terrain factor, speed, and signed grade percent. Apply the existing kappa and
  watts-to-O₂ conversion to energy; return paths recompute return-direction segment costs.
- Dijkstra runs from the habitat over the directed graph for time and hazard objectives, retaining
  predecessor trees and indexed fields. Fastest time must be no greater than any admissible candidate
  evaluated with the same time-edge costs. Optimized time/O₂ return fields stay distinct from the
  required same-geometry replay return arrays.
- Contract names and semantics stay as documented in `app/public/data/README.md` and
  `docs/demo-focus-plan.md` §15. Route coordinates are habitat→stop; `cum.*` are N-length cumulative
  costs; `back.*` are N-length costs home along that same geometry reversed, with index 0 = zero and
  final index = full return. `total_s` remains round-trip. O₂ values are raw expected per-member
  values. Do not bake in reserve, margin, crew factor, pair factor, or drill factor.
- Baseline PNR uses the exact replay formula and the consumer's actual default member factors `[1, 1]`:
  `f * (used + m * home) <= B`, where `B = C - max(reserve_fraction*C,
  reserve_minutes*walkback_o2_lpm)`. Capacity C is read from constants, not inferred from B. The PNR
  index is the last passing point in the contiguous outbound prefix; after the first failure later
  feasible samples do not reopen the path. The replay README example `[1, 1.08]` is an explicit
  example override, not the current core default.
- Keep constants and route keys stable. Add §15's `source_url` alongside each existing descriptive
  `source` value; preserve all current values and keys. Team-choice assumptions point to the canonical
  project plan, while measured/model anchors point to their source record. Never replace Youssef's
  display layers/tiles, Ayman's stops/cards, or Marwan's replay files.

## Reproducibility and operator record

Real-data builds will record source URLs and access dates, dataset license, input checksums, stop and
constants hashes, grid/CRS/resampling/nodata rules, engine version and command, and output hashes in a
local manifest plus the agreed provenance location. The CLI will accept explicit DEM, constants,
stops, output, and habitat inputs; it must state a per-stop no-route result rather than fabricate a
route. Static artifacts stay local until their owner integrates them. Run commands and exact exit
codes are kept with each gate report. Gate A tests use only synthetic arrays and hand calculations.

## Evidence required at each gate

- A: failing-before-implementation and passing hand-calculation tests for flat cost, wall/gap,
  thermal-factor sand, nodata, diagonal corner block, unreachable target, asymmetric signed grades,
  positive edge costs, segment/cumulative array sums, budget equality and contiguous-prefix PNR.
- B: independent audit with ordered findings; fixes recorded and retested.
- C: G1 file opens/license, G2 landmark alignment, G3 hard constraints and monotone PNR, G4 runtime
  within the documented pilot window; retain actual logs and hashes.
- D: deterministic repeated outputs; every supported stop accounted for in both modes, each output
  schema-checked and each failure explicit.
- E: independent review of contract semantics, actual replay compatibility, real-terrain evidence,
  and reproducibility. Completion claims must state the exact boundary of verified evidence.

## Operator commands

From the repository root, run the synthetic gate with:

```sh
python3 -m pytest engine/tests/test_synthetic_core.py -q
```

The Gate A module entry points are `engine.model.grid.build_graph`,
`engine.route.solve.dijkstra_field` / `shortest_path`, `engine.route.arrays.route_arrays`, and
`engine.route.pnr.point_of_no_return`. Gate A does not claim a CLI; Gate C/D add the real-input command
after the input manifest and operator handoff are settled.

## Model references

- Pandolf, Givoni & Goldman (1977), load-carriage equation, *Journal of Applied Physiology* 43(4),
  577–581: [PubMed record](https://pubmed.ncbi.nlm.nih.gov/908672/). Accessed 2026-11-13; its terrestrial
  equation is transferred to Mars as a Scenario estimate.
- Suit mobility factor anchor: Norcross et al., NASA/TP-2010-216115 (2010), cited in the team's
  [technical model notes](technical-approaches.md#3-model-constants-deterministic-calculator-every-value-cited-in-app).
  Kappa remains a Scenario choice, not a Mars measurement.
- Mars gravity: NASA NSSDC [Mars Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html),
  accessed 2026-11-13; 3.71 m/s² is the current constants-file working value.
- Mars sphere and map coordinates: [mapping-options research](research/mapping-options.md), CRS
  resolution and sources reviewed 2026-11-13; the stable app contract remains
  `+proj=longlat +R=3396190 +no_defs`.
- SciPy sparse path solver: [official `csgraph.dijkstra` API](https://docs.scipy.org/doc/scipy/reference/generated/scipy.sparse.csgraph.dijkstra.html),
  accessed 2026-11-13; selected by the existing architecture review for indexed directed cost fields.
- Mars walking speed shape and the 15° working foot threshold: [routing-options F5 and model section](research/routing-options.md),
  updated 2026-11-13. The piecewise speed curve is an explicit team Scenario assumption.

## Real-data pilot evidence (2026-11-13)

The input handoff is `/tmp/redsight-engine-pilot-inputs.json`; its primary crop hash is
`0ac559b00024056c70532096dee86c4a9a5bf6202e5bb2d37ed07543d317c963`, mosaic hash is
`07fbcfbff4741ba43d8450bd56f436e00e2d28e326fa84f1155dfb389c50c79c`, and ortho-context crop hash is
`a3f2e3d7f6f12299306cf61c753db808dc461ab4577b1eb10db769186615f794`. The primary and companion DTM
products are the [USGS HiRISE DTEEC_019698_1750_019988_1750_U01](https://astrogeo-ard.s3-us-west-2.amazonaws.com/mars/mro/hirise/controlled/dtm/ESP_019698_1750_ESP_019988_1750/DTEEC_019698_1750_019988_1750_U01.tif)
and [DTEEC_009149_1750_009294_1750_U01](https://astrogeo-ard.s3-us-west-2.amazonaws.com/mars/mro/hirise/controlled/dtm/PSP_009149_1750_PSP_009294_1750/DTEEC_009149_1750_009294_1750_U01.tif)
respectively (CC0-1.0; source handoff access date 2026-11-13).

Observed input facts: the primary average-resampled crop is 600×600 at about 9.879 m/cell, has 78.21%
valid primary coverage, and all five stop cells are valid. Its overlap with the companion product has
224,180 cells; companion-minus-primary height difference is +52.64 m median, 131.61 m absolute p90,
and 213.83 m maximum absolute. The build therefore excludes complementary-only cells instead of
blending the offset into routes, slope, or elevation; the full proposed ops box remains in `meta.json`
and excluded cells are represented in `hazards.geojson`.

Observed native-slope pilot input (2026-11-13): the added cache is Horn 3×3 slope calculated at the
native 1.0117468 m pixel spacing and aggregated as the **maximum** valid native slope per ~9.879 m
planning-cell center, on the primary DTM only. Its local cache SHA-256 is
`0540b673cdeb5e297a6d712d1e94792bcc6d186820d1ae19e06b2f52d5b35f0e`; 281,227 cells have valid slope
support, and 191,612 valid cells exceed the 15° threshold. No complementary DTM values or blending are
used. The native slope grid, not the mean-elevation gradient, supplies the hard mask; average-resampled
mean elevations continue to supply signed directional edge grades and movement costs.

Observed stop result under that hard mask: S1 = 21.82°, S2 = 31.89°, D1 = 26.29° and D2 = 29.22°;
each exact stop cell is blocked at the configured 15° threshold, so both modes are explicitly
unreachable for those four stops. S3 = 9.59° and remains routable in both modes. The closest walkable
cell diagnostics are 9.88 m from S1, 91.08 m from S2, 19.76 m from D1 and 91.08 m from D2; they are
recorded for troubleshooting only and are **not substituted as stop goals**. The full ops box and all
five stop IDs remain in the app contracts and route index; no threshold was loosened.

Because the previous north/downslope habitat candidates fell in components separated from S3 by the
native hard mask, the final Scenario habitat is row 422, col 312 (`137.3870833°E, −4.8204167°`), the
nearest walkable candidate to S1 in the component that contains S3. This is a 1,345.3 m offset from
S1 and is clearly labeled in `meta.json`; it is not the earlier provisional habitat at row 274, col 269.
The final route index has ten outcomes: S3 fastest and lowest-modeled-hazard routes are routed; the
other eight entries are explicit no-route outcomes with slope reasons. Mission Replay consumed both
S3 routes, including directed same-path return arrays and D27 values.

S1 alignment evidence is a bounded visual sanity check from the native-DTM hillshade and fully valid
512 m ortho crop: major ridge/trough boundaries and broad central rough terrain co-locate, with no
obvious displacement. The review establishes no unique quantitative tie point or sub-meter residual;
G2 is therefore recorded as partial visual evidence, not a metric registration pass.

End-to-end timing uses the actual recorded first STAC response `2026-11-13T19:14:31+02:00` through
native-slope build completion `2026-11-13T20:41:32+02:00`, **5,221.7 s (1 h 27 min 1.7 s)**. The
first request began shortly before that response, so this is a lower-bound wall interval; the native
cache and alignment evidence were ready at 20:19:35 and the final build itself took 23.09 s. G4 is
under the 3 h threshold on this recorded interval. The build manifest retains all timestamps and scope.

The projected Mars grid and all included hard/soft calculations are limited to their stated input
resolution. No THEMIS raster was included; terrain factor stays 1.0, so the lowest-hazard score is
slope-only. The base 2-crew, 15 kg route bucket still does not add sample pickup mass. The native cache
retains its upstream COG ETag and states that the full remote COG SHA-256 was not computed; local crop,
native-cache, manifest, ortho and evidence-image hashes are recorded separately.

## 2026-11-13 closure update

The coarse-cell reachability result above is historical and has been superseded for route generation by
the bounded native-pixel graph documented in [`../engine/README.md`](../engine/README.md): all ten
fastest/lowest-modeled-hazard outcomes now have Derived approach-only endpoints within 10 m, with the
existing habitat and unchanged 15° maximum. S2's exact source pixel is 16.09°; D2's exact pixel is
walkable but disconnected. No last leg to either Observed stop is modeled, and G3 remains
`partial_approach_only`.

G2 is now **PASS for one bounded qualitative local landmark tie at moderate confidence**. The independent
review matched K1 in the wider ortho and native-DTM hillshade, with an apparent 4.10 m pick difference
below the subjective ±6.84 m estimate. That estimate is not calibrated and the result does not establish
global, subpixel, or metric registration. The ignored source evidence index is
`data/raw/engine-pilot/evidence/g2-closure/g2_wider_landmark_artifacts.json`; the independent review is
`data/raw/engine-pilot/evidence/g2-closure/independent-visual-review.md`.

The latest end-to-end pilot interval from the first recorded STAC response through native-route output
is over three hours, so current G4 is **failed** despite the historical earlier build interval being
under the threshold. Full recorded timestamps and scope are in the final `engine-build-manifest.json`.
