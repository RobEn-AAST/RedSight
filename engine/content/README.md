# `engine/content` — Science Stops & Context Cards

Owner: **Ayman** (`feat/ayman-stops`, per [`docs/team-plan.md`](../../docs/team-plan.md) §3–§4).

## Outputs (owned contract files)
- [`app/public/data/stops.json`](../../app/public/data/stops.json) — RFC 7946 GeoJSON `FeatureCollection` of 5 Curiosity-anchored stops (`S1`, `S2`, `S3`, `D1`, `D2`) inside the D11 ops box (`137.335–137.435°E`, `−4.85…−4.75°`), pinned to live NASA MMGIS waypoints (with dynamic `S3` from `MSL_waypoints_current.json`), 4 diverse raw photos per stop (1 per instrument across multiple sols), JPL Photojournal panorama metadata (`PIA26559`, `PIA26696`), sourced science text, and stop card attributes.
- [`app/public/data/cards/rad.json`](../../app/public/data/cards/rad.json) — Curiosity RAD surface radiation context card (`Observed` GCR baseline 2012–2013 + Sept 2017 SEP event absorbed dose in silicon, `Scenario` 4-h walk dose, `Unavailable` spatial map boundary).
- [`app/public/data/cards/rems.json`](../../app/public/data/cards/rems.json) — Curiosity REMS weather context card (`Observed` Gale pressure, sols 1–100 air temperature, multi-year ground brightness temperature, Armstrong limit physiological context; `Unavailable` walk-scale spatial weather map).

## Commands
```bash
python engine/content/build_stops_and_cards.py
python -m pytest engine/content/test_stops_and_cards.py
python engine/content/test_stops_and_cards.py
cd app && npm run check:data
```
