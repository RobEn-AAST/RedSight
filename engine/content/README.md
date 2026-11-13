# `engine/content` — Science Stops & Context Cards

Owner: **Ayman** (`feat/ayman-stops`, per [`docs/team-plan.md`](../../docs/team-plan.md) §3–§4).

## Outputs (owned contract files)
- [`app/public/data/stops.json`](../../app/public/data/stops.json) — RFC 7946 GeoJSON `FeatureCollection` of 5 Curiosity-anchored stops (`S1`, `S2`, `S3`, `D1`, `D2`) inside the D11 ops box (`137.335–137.435°E`, `−4.85…−4.75°`), pinned to live NASA MMGIS waypoints (with dynamic `S3` from `MSL_waypoints_current.json`), 4 diverse raw photos per stop (1 per instrument across multiple sols), JPL Photojournal panorama metadata (`PIA26559`, `PIA26696`), sourced science text, and stop card attributes.
- [`app/public/data/curiosity_path.geojson`](../../app/public/data/curiosity_path.geojson) — RFC 7946 GeoJSON `FeatureCollection` of Curiosity's `Observed` rover traverse (`LineString` segments clipped to contiguous runs inside the D11 ops box, sols `3345–5073`, 464 MMGIS waypoints with per-waypoint `sol`, `RMC`, `elev_m`, and `dist_km` odometry).
- [`app/public/data/cards/rad.json`](../../app/public/data/cards/rad.json) — Curiosity RAD surface radiation context card (`Observed` GCR baseline 2012–2013 + Sept 2017 SEP event absorbed dose in silicon, `Scenario` 4-h walk dose, `Unavailable` spatial map boundary).
- [`app/public/data/cards/rems.json`](../../app/public/data/cards/rems.json) — Curiosity REMS weather context card (`Observed` daily sol summary ranges computed directly from NASA's MSL REMS weather JSON feed for surface pressure, 1.6 m air temperature, and ground brightness temperature, plus the Armstrong limit physiological context; `Unavailable` walk-scale spatial weather map).

## Submission coordination note (`S3` vs `routes/S3_*`)
By default `build_stops_and_cards.py` anchors `S3` dynamically from NASA's live `MSL_waypoints_current.json`. Because `routes/S3_*` endpoints stay within 30 m only while Curiosity stays near the routed station (sol `5073`, RMC `125_2490` stays under 30 m from existing `S3_*` endpoints), pass `--pin-s3-sol 5073` to freeze `S3` for submission — or ask Ali (`feat/ali-router`) to regenerate `routes/S3_*` if advancing `S3` past sol `5073`.

## Commands
```bash
python engine/content/build_stops_and_cards.py
python engine/content/build_stops_and_cards.py --pin-s3-sol 5073   # freeze S3 for submission
python -m pytest engine/content/test_stops_and_cards.py
python -m pytest engine/content/test_stops_and_cards.py -m "not network"  # offline CI
python engine/content/test_stops_and_cards.py
cd app && npm run check:data
```
