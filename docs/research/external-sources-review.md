# External Sources Review — Kaggle notebook, NASA Life Sciences Portal, and the 5 official resources

**Written:** 2026-11-13 (Cairo day 1), planning session. All checks were done live from this workstation on
2026-11-13. Scope: decide whether each source helps RedSight and in which tier
([`../demo-focus-plan.md`](../demo-focus-plan.md) §3). This is an evidence record (AGENTS rule 4):
correct it by errata, don't rewrite it.

## 1. Verdicts at a glance

| Source | What it really is | Verdict | Tier / use |
|---|---|---|---|
| Kaggle notebook `meeratif/comprehensive-data-analysis-on-mars-data` | Generic data analysis + KNN/decision-tree classifiers on **map data from the video game *Surviving Mars*** | ❌ **Do not use**: not NASA data, not real Mars | None |
| NASA Life Sciences Portal (NLSP), "mars" experiments | NASA Ames archive of human/biology research records (formerly LSDA): analog tests, suit physiology, radiation biology | ✅ **Use as citations** for the Scenario O₂ / turn-back model, not as map data | Tier 1 provenance cards + slides |
| JPL Mars Trek | NASA Mars map portal | ✅ Core | Tier 1 data source (DEM, HiRISE mosaic, CRISM layers) |
| USGS–NASA Planetary Geologic Mapping | Standardized geologic maps | ✅ Context | Tier 1 geology layer (SIM 3292) |
| Curiosity's proposed path up Mount Sharp | 2019 animation/annotated map of a *proposed* route | ✅ Reference only | Tier 1 slide: "NASA's example vs our computed route" |
| NASA Worldview | **Earth** satellite imagery viewer | ⚠️ Inspiration only | Layer-toggle UI idea; never Mars data |
| Perseverance raw images | Jezero crater photos | ⚠️ Wrong site | Not used; Curiosity raw images instead |

## 2. Kaggle notebook — why we reject it

- **Notebook:** https://www.kaggle.com/code/meeratif/comprehensive-data-analysis-on-mars-data (author "meer
  atif magsi", version 12, last run 2026-11-10; pulled through Kaggle's public kernels API). 51 cells:
  pandas/seaborn charts, then `KNeighborsClassifier` and `DecisionTreeClassifier` with sklearn.
- **Its only data source:** Kaggle dataset `peijenlin/surviving-mars-maps` (files `MapData-Evans-GP.csv`,
  `MapData-Evans-GP-Flatten.csv`). The dataset's own description: *"Surviving Mars is a sci-fi city builder
  all about colonizing Mars…"*, colony locations with "breakthroughs available on each map", converted
  from a community game-modding file. License CDLA-Sharing-1.0; last updated 2020-01-27.
- **Verdict:** game content, not a NASA mission product. Using it would break the "NASA data is integral"
  Relevance criterion and the Validity story, and its license is ShareAlike. **Not used, not cited.** If a
  teammate brings it up: the game's "map" values are invented gameplay attributes, not measurements.

## 3. NASA Life Sciences Portal (NLSP)

- **Portal:** https://nlsp.nasa.gov (NASA Ames). The page the team shared,
  `…/explore?search=mars&dataType=EXPERIMENTS…`, is a JavaScript app. Its own bundle calls an undocumented
  JSON route, `https://nlsp.nasa.gov/api/v1/data/experiments?search=<q>&page=1&limit=<n>`, which returned
  **259 experiment records for "mars"** on 2026-11-13. Most are long-duration habitat/analog studies
  (Lunar-Mars Life Support Test Project, Mars-520 simulation), radiation biology, food and plant
  growth. None of these are map layers.
- **Records that help RedSight** (record pages: `https://nlsp.nasa.gov/explore/data/details/<id>`):

| Record (experiment ID) | What it says (paraphrased from the record's objectives) | Our use |
|---|---|---|
| **EVA Walkback Test** (EWT) | A Constellation EVA Systems + EPSP study of whether a suited crew can walk back **10 km** to the habitat after a rover failure. 10 km was assumed as the maximum EVA excursion distance; it frames walkback for the Moon (1/6 g) and Mars (3/8 g) | Anchor for the **turn-back marker** card: the NASA walkback concept (already cited via NASA TP-2009-214796). Context, not our validation |
| **Haughton Mars Walkback** (HMP_Walkback) | Unsuited 10 km returns over **Mars/lunar-analog terrain at Haughton Crater** with GPS navigation and VO₂ measured, compared against a treadmill replay of the same grade and speed | Supports "terrain and navigation change O₂ cost", which is why our route cost uses slope + surface. Context card / slide citation |
| **CxP EVA Systems Test 1/2/3** (IST_1, IST_2, IST_3) | Metabolic cost and biomechanics of planetary-suit walking, exploration tasks, and suit center-of-gravity effects | Backs the suit-overhead constant κ (Norcross TP-2010-216115 belongs to this series) |
| **Metabolism and Heat Dissipation During Apollo EVA Periods** (AP013) | Apollo surface EVA metabolic measurements | Context for the suited-EVA sanity bands |
| **SPE Observations with MARIE** (NAG91427) | Solar particle events measured by Mars Odyssey's MARIE instrument (**in orbit**, not on the surface) | Radiation card context only. RAD remains the only **surface** dosimeter |

- **Limits:** the records are summaries; full data generally needs a data request through the portal, so we
  don't depend on it. The JSON route is undocumented: cite the record pages, not the API. All derived
  numbers stay **Scenario** (AGENTS rule 2).

## 4. The five official Resources-tab links (all HTTP 200 on 2026-11-13)

| # | Link | What it is | How RedSight uses it | Tier |
|---|---|---|---|---|
| 1 | [JPL Mars Trek](https://trek.nasa.gov/mars/) | NASA Mars portal. The URL the team shared opens the global viewer; the data sits behind its ArcGIS REST services | `Gale_DEM_SMG_1m` (1 m DEM, fallback to USGS STAC DTMs), `curiosity_hirise_mosaic` (0.25 m), CRISM mineral-indicator layers, exported once and cached (never a runtime dependency) | **Tier 1** |
| 2 | [USGS–NASA Planetary Geologic Mapping](https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars) | Standardized geologic maps of Mars | SIM 3292 geology units as a context layer + stop-card unit names. Interpretation, **not** spectral/chemical data | **Tier 1** |
| 3 | [Curiosity's proposed path up Mount Sharp](https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/) | Animation + annotated map of a **2019 proposed** rover route | Style reference, and a slide contrast: "NASA's example drawing → our computed, slope-checked route". Never route data; the real traverse comes from NASA's MMGIS waypoints | **Tier 1 (slides)** |
| 4 | [NASA Worldview](https://worldview.earthdata.nasa.gov/) | **Earth** satellite imagery explorer | UI inspiration: layer list, opacity, time slider. Our layer panel can borrow its pattern. Not a Mars source | **Tier 1 (UI idea only)** |
| 5 | [Perseverance raw images](https://mars.nasa.gov/mars2020/multimedia/raw-images/) | 1M+ images from Perseverance at **Jezero** | Not used (wrong site). We use the sibling Curiosity raw-image API (`condition=msl`) + NASA 360 panoramas at Gale | — |

Using all five is not required (challenge page: suggested starting points). The project page's NASA Data
field should list what we actually use: Trek, USGS geology, USGS STAC HiRISE DTMs, THEMIS, CRISM, Curiosity
raw images/waypoints/panoramas, RAD, REMS, plus NLSP records as references.

## 5. Sources (accessed 2026-11-13)

- Kaggle kernel metadata/source: `https://www.kaggle.com/api/v1/kernels/pull?userName=meeratif&kernelSlug=comprehensive-data-analysis-on-mars-data`;
  dataset: `https://www.kaggle.com/api/v1/datasets/view/peijenlin/surviving-mars-maps`
- NLSP: https://nlsp.nasa.gov · JSON route observed in the site bundle: `/api/v1/data/experiments`
  (searches "mars", "walkback", "EVA metabolic", "suit locomotion", "MARIE")
- EVA Walkback Test record: https://nlsp.nasa.gov/explore/data/details/f43b4702-f289-51f5-a82b-e6d7bcc3ec1e
- Haughton Mars Walkback record: https://nlsp.nasa.gov/explore/data/details/c8fc0c84-d202-57f2-a455-22d3c6f03abd
- CxP EVA Systems Test 1 record: https://nlsp.nasa.gov/explore/data/details/1c32aa16-6107-53dd-b2ca-4fa55805b9bf
- MARIE SPE record: https://nlsp.nasa.gov/explore/data/details/1a427823-11d1-585d-8887-3849258edf8a
- Five official resources: as linked in §4 (HTTP status checked with curl)
