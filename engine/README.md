# RedSight offline route engine

## Build the native-slope real-data payload

From the repository root, with Python 3 plus the already-installed NumPy, rasterio, SciPy and pytest:

```sh
python3 -m engine build \
  --input-manifest data/raw/engine-pilot/input-manifest.json \
  --constants app/public/data/constants.json \
  --stops app/public/data/stops.json \
  --out app/public/data
```

`--habitat-row-col ROW COL` overrides the deterministic habitat selection; any override is labeled
Scenario in `meta.json`. The build writes only Ali-owned outputs: `constants.json`, `meta.json`,
`hazards.geojson`, `engine-build-manifest.json`, `routes/index.json` and a route file for each routed
stop/mode. All ten supported stop/mode outcomes remain in the index. A nonzero exit or a `partial` summary means at least one outcome is explicitly
no-route record; inspect the index and build manifest before using it. Input crops are checksum-checked
against the handoff manifest. The command does not download data.

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
Expected result: exit **1**, `status: partial`, seven files, S3 routed in both supported modes and
eight explicit no-route stop/mode outcomes. Exit 2 means an actual input/build error. Do not treat
exit 1 as five-stop completion.

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

The engine implementation has tested routing/PNR/replay behavior, but the intended five-stop demo
remains incomplete. Neither the native maximum nor p90 mask gives one habitat-connected component
serving all five targets. The p90 best-component offsets are about 764/197/688/647/203 m for
S1/S2/S3/D1/D2. These are diagnostics, not approach routes or modeled last legs. G2 remains a broad
visual alignment check with no uniquely identified common landmark. Historical G4 is only the
5,221.715 s first-recorded STAC-response-to-output lower bound, not exact total acquisition wall time;
a later replay is not that pilot.
A team decision on the target/habitat/slope-policy configuration is still required for five-stop
routing. Stop content and web integration remain other owners' work; no push, merge or deployment
is included here.

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
marked unavailable even where the second product has coverage. The native-slope mask determines final
habitat connectivity and per-stop reachability. The committed native-mask build routes S3; the other
four exact stop cells exceed the hard limit and remain no-route entries in the index, with reasons.

The primary asset is native 1.0117 m/pixel, while the local mean-elevation crop is 600×600 at about
9.879 m. The 15° hard mask requires the hash-checked native DEM Horn 3×3 slope aggregate in the
`native_hazard` block of the input manifest at maximum
or 90th percentile, aligned to this exact planning grid. The CLI refuses a missing or mismatched
cache; cells with unavailable native slope support remain blocked. Its manifest must identify the
local path, bytes and SHA-256, degree units, Horn algorithm, aggregation, source and target resolution,
source URL/license and S1 landmark-alignment evidence. These inputs are recorded in the build manifest.
No THEMIS thermal-inertia raster was supplied, so the terrain multiplier is 1.0 and the lowest-hazard
objective uses modeled slope exposure only. Collected sample mass is not included in the 2-crew,
15 kg route bucket; a sample-carrying variant needs a separate load bucket and routes.

The five stops are S1, S2, S3, D1 and D2 from the current `stops.json`; their names and coordinates
are preserved. The native-mask build routes only S3: S1/S2/D1/D2 land in cells whose native maximum
slopes exceed 15°. They remain explicit no-route entries. The Scenario habitat is row 422, col 312,
in the S3-connected component; the earlier north/downslope candidates were separated by the native
mask. The output records each blocked stop's measured slope and a nearest-walkable-cell diagnostic,
but never substitutes that cell for the specified stop.

## Model and route contract

- Terrain analysis uses the input raster's Mars 2015 sphere, ocentric equirectangular projected CRS
  (IAU:49910, radius 3,396,190 m). Browser/export route coordinates are converted to east-positive
  planetocentric longitude/latitude on the same sphere.
- Nodata and over-limit slope are hard blocked; no DEM or slope values are filled. The checked native
  Horn max/p90 aggregate supplies the hard mask. Signed directed edge grades use the destination minus
  source mean heights; reversing an edge recomputes time and O₂.
- Fastest minimizes modeled edge time. Safest minimizes the exposed weighted slope-hazard score; it is
  a preference within available data, not a guarantee or a lexicographic tie-break. Both modes use the
  same admissible graph and report their actual time costs.
- `cum.*` and `back.*` contain raw expected O₂ per crew member and time in seconds. `back.*` is the
  same outbound geometry walked in reverse, indexed from habitat to goal, with `back[0] = 0`; no
  reserve, return margin, crew factor, or drill factor is baked into the arrays. `total_s` remains
  outbound plus same-geometry return time.
- The baseline PNR is `f * (used + m * home) <= B`, with `[1, 1]` member factors for the current
  default crew, `B = capacity - max(reserve_fraction*capacity, reserve_minutes*walkback_o2_lpm)`,
  and the actual capacity read from `constants.json`. PNR is the last passing sample in the same-path
  cumulative arrays.

## Verification and reproducibility

```sh
python3 -m pytest -p no:cacheprovider -q engine/tests
node --test app/src/replay/replay-core.test.js
```

The build manifest records manifest/crop/ortho/mosaic/constants/stops hashes, a SHA-256 for each
engine-owned route/meta/constants/hazard output, source URLs and
licenses, scene offset statistics, CRS/grid/resampling, model values, habitat, runtime versions,
per-stop outcomes and limitations. Re-run the same command with the same input manifest and source
files; output is stable for the recorded Python/NumPy/rasterio/SciPy versions and Dijkstra tie policy.
The local real-data input crops themselves remain outside Git, so users need the supplied manifest and
matching source assets before reproducing the real route payload.
