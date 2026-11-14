# RedSight offline route engine

## Build the bounded native-route real-data payload

From the repository root, with Python 3 plus the already-installed NumPy, rasterio, SciPy, scikit-image and pytest:

```sh
python3 -m engine build \
  --input-manifest data/raw/engine-pilot/input-manifest.json \
  --constants app/public/data/constants.json \
  --stops app/public/data/stops.json \
  --out app/public/data
```

The input manifest must identify both the hash-checked 10 m Horn hazard cache and the local primary
native DTM window under `native_routing`. `--habitat-row-col ROW COL` overrides the deterministic
Scenario habitat cell; any override is labeled Scenario in `meta.json`. The build writes only Ali-owned outputs: `constants.json`, `meta.json`,
`hazards.geojson`, `engine-build-manifest.json`, `routes/index.json` and a route file for each routed
stop/mode. All ten supported stop/mode outcomes remain in the index. A nonzero exit or a `partial` summary means at least one outcome is explicitly
no-route record; inspect the index and build manifest before using it. Input crops are checksum-checked
against the handoff manifest. The command does not download data.

## Re-export status and how to run it (2026-11-14)

**Re-exported 2026-11-14 from a local rebuild (path (b) below).** The primary COG was reachable again,
so the inputs were rebuilt with `engine/tools/rebuild_pilot_inputs.py` from the full
[DTEEC_019698_1750_019988_1750_U01](https://astrogeo-ard.s3-us-west-2.amazonaws.com/mars/mro/hirise/controlled/dtm/ESP_019698_1750_ESP_019988_1750/DTEEC_019698_1750_019988_1750_U01.tif)
COG (265,874,780 bytes, cut to the same 5,859 × 5,859 window locally) and all ten routes were rebuilt with the
current `stops.json`. `engine-build-manifest.json` now says `input_provenance.kind: local_rebuild` and
G2 `not_reproduced`; the habitat is still row 422, col 312. Native access cells moved only where
`stops.json` moved the stops (D1, S1 by 1–2 px; S3 by about 26 m). The rebuilt crop has 281,327 valid
cells (Ali's had 281,563, −0.08 %) and 2,196 hazard polygons (was 2,207). Plans were regenerated with
`node app/scripts/build-plans.mjs`.

Scenario values per crew member, raw expected, no reserve or margin (old = previous shipped export with the
30 W floor and old stops; new = this re-export). The turn-back index is the last route point on every route:
the highest modeled round trip (about 88 L) is far below the 288.75 L usable budget, so no turn-back point
triggers on any shipped route. **Return-contract correction (2026-11-14):** the `yes` entries below
describe the historical export only. Those optional return paths used simplified display polylines
whose geometry was not guaranteed to preserve every legal native edge, so `back_fast` has since been
removed from production exports/data and automatic alternate-return behavior is unavailable. The full
same-path directed `back` arrays remain the return basis.

| Route | Out min old → new | Back min old → new | Out O₂ L old → new | Back O₂ L old → new | back_fast | Turn-back triggers |
|---|---|---|---|---|---|---|
| D1 fastest | 46.7 → 46.4 | 51.7 → 51.4 | 13.74 → 25.69 | 56.83 → 57.81 | no | no |
| D1 lowest-hazard | 47.3 → 47.1 | 51.4 → 51.0 | 12.90 → 25.44 | 56.20 → 56.91 | yes | no |
| D2 fastest | 32.0 → 32.0 | 35.2 → 35.2 | 9.23 → 17.41 | 39.08 → 39.69 | no | no |
| D2 lowest-hazard | 32.3 → 32.3 | 35.2 → 35.2 | 8.45 → 17.24 | 38.96 → 39.38 | yes | no |
| S1 fastest | 50.1 → 50.1 | 55.3 → 55.3 | 14.09 → 27.03 | 60.56 → 61.43 | no | no |
| S1 lowest-hazard | 50.7 → 50.7 | 55.0 → 55.0 | 13.16 → 26.86 | 60.07 → 60.79 | yes | no |
| S2 fastest | 32.0 → 32.0 | 35.3 → 35.3 | 9.15 → 17.36 | 39.16 → 39.75 | no | no |
| S2 lowest-hazard | 32.3 → 32.3 | 35.2 → 35.2 | 8.37 → 17.20 | 39.06 → 39.46 | yes | no |
| S3 fastest | 14.0 → 14.6 | 12.4 → 13.0 | 17.75 → 18.57 | 1.58 → 6.48 | no | no |
| S3 lowest-hazard | 14.0 → 14.6 | 12.4 → 12.8 | 17.75 → 18.56 | 1.41 → 6.26 | yes | no |

The file-size comparison above predates removal of `back_fast`; current route/plan artifacts contain no
alternate-return path polylines.

**(a) Ali, from the original bundle (preferred; keeps the G2 evidence).** On the machine holding
`data/raw/engine-pilot/`, on a branch with these fixes, run the build command at the top of this file
with `--out app/public/data`, then `node engine/tests/check_replay_adapter.mjs` and
`cd app && npm run check:data`.

**(b) Anyone, once the primary COG is reachable.** `engine/tools/rebuild_pilot_inputs.py` range-reads
only the 5,859 × 5,859 native window of
[DTEEC_019698_1750_019988_1750_U01](https://astrogeo-ard.s3-us-west-2.amazonaws.com/mars/mro/hirise/controlled/dtm/ESP_019698_1750_ESP_019988_1750/DTEEC_019698_1750_019988_1750_U01.tif)
(source rows from 1224, cols from 1335; the offsets put D1, S1 and the habitat on Ali's recorded native
cells). It then rebuilds the 600 × 600 average crop, the Horn maximum-slope cache and a manifest marked
**local rebuild**. That manifest has new hashes. The complement, ortho, mosaic and G2 evidence are not
reproduced, and G2 is reported as `not_reproduced`, never as passing. `--native-window PATH` reuses an
existing local copy of that exact window instead of reading it again.

```sh
python3 engine/tools/rebuild_pilot_inputs.py --out data/raw/engine-pilot-rebuild
python3 -m engine build --input-manifest data/raw/engine-pilot-rebuild/input-manifest.json \
  --constants app/public/data/constants.json --stops app/public/data/stops.json --out app/public/data
```

Ali's original bundle stays the reference. Before committing a rebuild, check that the habitat is still
row 422, col 312 and that the native access cells match the committed `engine-build-manifest.json`.

## Durable local handoff (2026-11-13)

`data/raw/engine-pilot/` is an ignored local bundle, not part of a Git clone. It contains the
primary/complement/ortho crops, historical mosaic, native primary DEM window, maximum and p90 slope
caches, STAC response, alignment evidence, original and relocated input/access manifests, and
`SHA256.json`. Its `evidence/` folder preserves prior audit reports and acquisition/analysis scripts.
The complementary crop and mosaic are provenance evidence only; routing still uses primary-only
coverage. No source data were downloaded again for this handoff.

To copy a supplied bundle to another checkout, run from that checkout (replace `/path/to/bundle`):

```sh
python3 engine/tools/preserve_pilot.py \
  --manifest /path/to/bundle/input-manifest.json \
  --access-review /path/to/bundle/access-review.json \
  --out data/raw/engine-pilot
```

The source bundle must remain at its recorded absolute paths during this copy. The helper checks
recorded asset hashes and preflights existing destination assets and manifests, refusing conflicting
files before it writes the bundle. It then rewrites paths into the new bundle. Copy
`evidence/` separately when transferring the historical reports/scripts; the helper only relocates
manifest-referenced assets. Relocation changes manifest hashes and path-bearing output metadata;
it does not change raster bytes or modeled route geometry/costs. The committed route artifacts retain
the original historical producer/manifest provenance; a rebuild records the new source revision.

For a non-destructive rebuild, use the build command above with `--out /tmp/redsight-rebuild`.
Expected result: exit **0**, `status: complete`, 15 engine-owned files, and ten routed stop/mode outcomes.
Each route ends at a Derived approach pixel within at most 10 m of its Observed stop. `G3` is reported
as `partial_approach_only`; the generated paths do not claim exact arrival at the stop coordinates.
Exit 1 means at least one of the ten route outcomes is explicitly unavailable; exit 2 means an
actual input/build error.

Cache reconstruction is distinct from this checked local replay. The archived `build_native_hazard.py`
and `build_native_p90.py` are historical scripts with original `/tmp` paths and remote reads; do not
run them as relocation tools. Their method is: query the recorded USGS STAC collection/products;
use the manifest's Mars sphere/projected D11 bounds and exact 600×600 planning transform; average
resample elevation crops; read the primary D11 native window; compute Horn 3×3 gradients at native
pixel spacing with any nodata-touching neighborhood excluded; bin source pixel centers into planning
cells and aggregate maximum (or linear p90 for the comparison). Copy the source Mars CRS WKT into
outputs. Preserve primary nodata and never blend the complementary DTM across the measured seam.
Exact upstream reacquisition/byte-for-byte cache reconstruction has **not** been rerun in this handoff.
Full remote COG hashes remain unavailable; local hashes and recorded upstream ETags are retained.

At the 9.88 m planning-cell aggregation, neither the maximum nor p90 mask connects all five targets
from one habitat; these are coarse-grid diagnostics, and the p90 component offsets (about
764/197/688/647/203 m for S1/S2/S3/D1/D2) are not routes. The checked 1.01175 m primary-DTM graph
now connects all five selected approach goals to the existing habitat within the same 15° maximum
mask. S2's exact source pixel is 16.09° and remains blocked; D2's exact source pixel is walkable but
disconnected from the habitat component. Their Derived endpoints are 1.66 m and 8.26 m from the
Observed coordinates, respectively; no final leg is modeled. The three other endpoints are in the
source pixels containing their Observed coordinates (pixel-center offsets below 0.65 m).

All ten fastest/lowest-modeled-hazard payloads are available, but G3 remains partial/approach-only;
the route endpoints must not be described as exact arrivals. The new independent G2 review closes
the local visual landmark gate at **moderate confidence**: one isolated K1 knob/butte crest was
matched, with an apparent 4.10 m pick difference below a subjective, uncalibrated ±6.84 m pick
estimate. This is one local qualitative tie, not global registration or calibrated accuracy. The
review, tie-point and artifact hashes are in the ignored pilot manifest and
`data/raw/engine-pilot/evidence/g2-closure/`. The historical 5,221.715 s first-recorded
STAC-response-to-old-output interval remains a lower-bound record. The latest end-to-end build
finished more than three hours after the first recorded response, so its G4 is `failed`; that is the
measured current result, not an acquisition-only estimate. Stop content and web integration remain
other owners' work; no push, merge, deployment or submission is included here.

## Current input and limits

The 2026-11-13 Cairo handoff supplies a 600×600, approximately 9.879 m average-resampled crop from
the [USGS Astrogeology HiRISE DTM collection](https://stac.astrogeology.usgs.gov/), with the primary
DTM asset [DTEEC_019698_1750_019988_1750_U01](https://astrogeo-ard.s3-us-west-2.amazonaws.com/mars/mro/hirise/controlled/dtm/ESP_019698_1750_ESP_019988_1750/DTEEC_019698_1750_019988_1750_U01.tif)
and a complementary [DTEEC_009149_1750_009294_1750_U01](https://astrogeo-ard.s3-us-west-2.amazonaws.com/mars/mro/hirise/controlled/dtm/PSP_009149_1750_PSP_009294_1750/DTEEC_009149_1750_009294_1750_U01.tif).
The supplied assets are CC0-1.0; access date recorded by the input handoff: 2026-11-13.

The crops align on the same grid and overlap in 224,180 cells, but the complementary-minus-primary
elevation difference has median +52.64 m, absolute 90th percentile 131.61 m and maximum 213.83 m.
The route builder therefore uses the primary DTM only and preserves its 78.21% valid-area mask; it does
not silently blend or apply an unsubstantiated vertical correction. Complementary-only pixels are
marked unavailable even where the second product has coverage. The primary native window is a local
5,859×5,859 crop at 1.0117468 m/pixel; its hash and byte count are recorded in
`native_routing` in the input manifest. Routing uses this primary-only native window. The separate
`native_hazard` maximum cache remains a conservative 9.879 m context/hazard layer.

The native 1.0117 m/pixel source and 600×600, approximately 9.879 m context grid share the declared
Mars 2015 sphere / IAU:49910 projected CRS but have different pixel centers. The `native_routing`
manifest block identifies the native primary DTM path, byte count, SHA-256, resolution, source URL
and license. The separate `native_hazard` block identifies the Horn max/p90 cache used for the coarse
context layer. The CLI rejects missing or mismatched inputs; native nodata and any Horn neighborhood
touching nodata remain blocked. The build manifest records both source hashes and the bounded graph
extent.
No THEMIS thermal-inertia raster was supplied, so the terrain multiplier is 1.0 and the lowest-hazard
objective uses modeled slope exposure only. Collected sample mass is not included in the 2-crew,
15 kg route bucket; a sample-carrying variant needs a separate load bucket and routes.

The five Observed stops and their `stops.json` coordinates are unchanged. In the native graph, S1,
S3 and D1 exact source pixels are walkable and connected to the existing Scenario habitat. S2's exact
source pixel has 16.09° Horn slope; its selected Derived access pixel is 1.66 m from the Observed
coordinate. D2's exact pixel is walkable but in a different component; its selected access pixel is
8.26 m away. Every selected access goal is within the explicit 10 m bound, connected to the existing
habitat, and labeled `Derived` / `approach_only`; none has a modeled final leg. The Scenario habitat
remains coarse row 422, col 312 (`137.3870833°E, −4.8204167°`) and maps to native pixel [4126, 3051].
All ten mode payloads terminate at the respective access pixel centers, not at a blocked or
disconnected Observed coordinate.

## Model and route contract

- Terrain analysis uses the input raster's Mars 2015 sphere, ocentric equirectangular projected CRS
  (IAU:49910, radius 3,396,190 m). Browser/export route coordinates are converted to east-positive
  planetocentric longitude/latitude on the same sphere.
- Nodata, unavailable Horn support, and per-pixel native maximum slope above 15° are hard blocked; no
  DEM or slope values are filled. Diagonal edges require both orthogonal pixels to be walkable, and
  absolute endpoint-sampled native grade must also be at or below 15°. Signed directed edge grades
  use destination minus source elevations; reversing an edge recomputes time and O₂.
- Fastest minimizes modeled edge time. Safest minimizes the exposed weighted slope-hazard score; it is
  a preference within available data, not a guarantee or a lexicographic tie-break. Both modes use the
  same admissible graph and report their actual time costs.
- `cum.*` and `back.*` contain raw expected O₂ per crew member and time in seconds on the native
  route geometry. `back.*` is that same geometry walked in reverse, indexed from habitat to goal,
  with `back[0] = 0`; no
  reserve, return margin, crew factor, or drill factor is baked into the arrays. `total_s` remains
  outbound plus same-geometry return time.
- Edge power is the Pandolf et al. (1977) load-carriage equation ([J Appl Physiol 43(4):577–581,
  doi:10.1152/jappl.1977.43.4.577](https://doi.org/10.1152/jappl.1977.43.4.577)) times κ. Downhill, its
  linear grade term drives the total below zero, so the power is floored at the same equation's
  **standing-with-load terms**, `1.5·M + 2·(M+L)·(L/M)²` (129.5 W for 82 kg + 15 kg). Walking downhill
  therefore never costs less than standing still with the load. This replaces the former 30 W floor
  (2026-11-14), which sat far below standing metabolism; a flat 1.6 km/h walk is 158.2 W before κ. The
  floor is a Scenario lower bound, not a measured downhill cost; no published downhill correction
  (e.g. Santee et al.) is applied.
- No alternate fastest-return payload is exported. `back_fast` remains unavailable until the engine
  can ship complete legal geometry and matching directed costs at all supported return points. The
  app uses the full same-path directed `back` arrays for PNR and never substitutes outbound cost.
- The baseline PNR is `f * (used + m * home) <= B`, with `[1, 1]` member factors for the current
  default crew, `B = capacity - max(reserve_fraction*capacity, reserve_minutes*walkback_o2_lpm)`,
  and the actual capacity read from `constants.json`. PNR is the last passing sample in the same-path
  cumulative arrays.

### Route endpoint handoff to the app owner

Keep the `stops.json` marker at its Observed coordinates. In each route payload, `coords[-1]` is the
Derived endpoint in `goal_access.endpoint_lonlat`; `goal_access.observed_stop_lonlat` retains the
Observed stop separately. `goal_access` also records `badge: Derived`, `status: approach_only`,
`offset_m`, `access_bound_m`, native source row/column diagnostics, the reason for using an approach
pixel, and `last_leg_modeled: false`. Render the Observed stop marker separately and label the route
endpoint as an approach point; do not connect the two with an implied segment. Existing replay code
that treats `coords[-1]` as the Observed stop needs an integration update before this is shown as
arrival.

## Verification and reproducibility

```sh
python3 -m pytest -p no:cacheprovider -q engine/tests
node --test app/src/replay/replay-core.test.js
```

The build manifest records manifest/crop/ortho/mosaic/native-route DEM/constants/stops hashes, a
SHA-256 for each engine-owned route/meta/constants/hazard output, source URLs and licenses, CRS,
coarse and native grid extents, corridor margin, model values, habitat, resource timing, per-stop
access outcomes and limitations. The current real-data build used a 2,129×975 bounded core
(2,069,571 source pixels, 250 m requested margin), built the graph and both objective fields in
2.424 s, and completed the engine build in 127.815 s with approximately 1.05 GB peak RSS. Re-run the
same command with the same input manifest and source files; route arrays and hashed outputs are
deterministic for the recorded Python/NumPy/rasterio/SciPy versions and sparse Dijkstra tie policy.
The local real-data input crops themselves remain outside Git, so users need the supplied manifest and
matching source assets before reproducing the real route payload.
