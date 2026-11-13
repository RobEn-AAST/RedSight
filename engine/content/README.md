# `engine/content` — Science Stops & Context Cards

Owner: **Ayman** (`feat/ayman-stops`, per [`docs/team-plan.md`](../../docs/team-plan.md) §3–§4).

## Outputs (owned contract files)
- [`app/public/data/stops.json`](../../app/public/data/stops.json) — GeoJSON `FeatureCollection` of 5 Curiosity-anchored stops (`S1`, `S2`, `S3`, `D1`, `D2`) inside the D11 ops box (`137.335–137.435°E`, `−4.85…−4.75°`), with verified sol raw images, JPL 360° panorama metadata (`PIA26559`, `PIA26696`), science text, and sample-page-style stop card attributes.
- [`app/public/data/cards/stops.json`](../../app/public/data/cards/stops.json) — Standalone array of the 5 sample-page-style stop cards.
- [`app/public/data/cards/rad.json`](../../app/public/data/cards/rad.json) — Curiosity RAD surface radiation context card (`Observed` GCR baseline + Sept 2017 SEP event, `Scenario` 4-h walk dose, `Unavailable` spatial map boundary).
- [`app/public/data/cards/rems.json`](../../app/public/data/cards/rems.json) — Curiosity REMS weather context card (`Observed` Gale pressure, diurnal air/ground temperatures, cadence; `Unavailable` walk-scale spatial weather map).

## Commands
```bash
python engine/content/build_stops_and_cards.py
python engine/content/test_stops_and_cards.py
```
