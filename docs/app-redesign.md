# App redesign — astronaut-first planner (2026-11-13)

**Owner:** Yassin (app shell, branch `feat/yassin-app`). **Status:** built and browser-checked on **mock
data**; the new plan files are a **proposed** contract that Ali (engine) and Marwan (integration) still
have to agree (§4). Companion docs: [`demo-focus-plan.md`](demo-focus-plan.md) §8–9c (crew, rover,
return budget), [`web-foundation.md`](web-foundation.md) (app status), data contract
[`../app/public/data/README.md`](../app/public/data/README.md).

## 1. Why

Team feedback on the first app shell: cluttered, hard to follow, and the map read as "a chunk square" on
a black page. The setup questions were the one part that worked. The request:

- keep the setup Q&A, then show routes clearly to the astronaut;
- two routes only: the fastest and the lowest-hazard one;
- show where the substance we are looking for is;
- a **no-return line**: past it, the crew can't make it home;
- with a rover, say which parts to drive and which to walk;
- with two astronauts, let the plan split them over two targets to collect more samples;
- less on screen; a map that looks like terrain, not a square.

## 2. The flow (two screens)

```
① Set up  ──Show routes──▶  ② Routes
   crew · load · rover · goal · check      map  +  panel:
                                            1 Where to sample   (sample areas for the goal)
                                            2 Pick a route      (Fastest | Lowest hazard)
                                            3 Who goes where    (Walk together | Split up) — pair only
                                            4 Your plan         (drive/walk/sample/home steps + no-return note)
```

- The header holds only the brand, the two steps and **Sources** (the provenance list opens as a dialog).
  The old left rail, clock, evidence legend strip, keyboard hints and the HUD/copilot entries are gone.
- The setup questions keep their order; their help text is cut to one line each. The last button reads
  **Show routes**.

## 3. What each part shows, and what settled it

| Part | What the crew sees | Data | Settled by |
|---|---|---|---|
| Sample areas | Cyan areas on the map + a list with what each holds ("Ca-sulfate veins (boxwork) · sulfate-bearing bedrock"), filtered by the setup goal | `targets.geojson` (proposed) | User request. Areas are drawn **around real rover-visited sites** (stops.json). See finding 1 |
| Two routes | Two cards: round-trip time, % of the O₂ budget, steepest step. Chosen route bold on the map, the other one faint dotted | plan files (proposed) or the existing route files | User request. The label is **"Lowest hazard"**, never "safest" (AGENTS rule 3: no "safe route") |
| No-return line | Red dashed line on the map + a note: inside it the crew can get home; past it, modeled O₂ is not enough. If a route crosses it, a **TURN BACK** marker sits on the route and the plan turns there | `plan/limits_*.geojson` (proposed); per-route `pnr_index` | User request; matches demo-focus-plan §9 "don't go beyond" boundary. Scenario estimate, worded as modeled |
| Rover legs | Dashed line = drive, solid = walk, **P** = where the rover parks. The plan lists "Drive 1.1 km by rover → Walk 440 m → Sample → Walk back to the rover, drive home" | `legs` + `park_index` in plan files | User request; demo-focus-plan §8 "mixed plan: drive to a park point, walk the last leg" |
| Crew split | "Walk together" or "Split up". Split: A and B each get a route to a different target, the pair drives together to one park point, and the panel states the largest gap between them against a limit | `split` in plan files | User decision 2026-11-13: **split, but stay in reach** (radio contact + rescue distance), keeping the intent of the NASA DRA 5.0 buddy rule (decision D19) |
| Map | Sharp HiRISE image of the box inside a wider, coarser HiRISE image around it, so there is no hard edge; outside the box is lightly dimmed | `app/public/preview/` (temporary) | User request ("chunk square"). Both images exported once from Mars Trek, cached, not loaded live |

**Findings checked while building (2026-11-13, live queries to trek.nasa.gov):**

1. **Mars Trek's ready-made mineral layers do not cover our box.** `MC18_PolySulfate_Mineral_IndicatorV2_SP`
   spans 95.5°W–39.5°W and `T1303_FeMgSmectite_Mineral_Indicator_SP` spans 20.5°W–14.5°W; Gale is at
   137.4°E. The CRISM MTRDR footprint layer has no scene over the box (nearest ends at −5.08°, about 25 km
   south). **So "spectral" for the box needs another source** (raw CRISM cubes or a published unit map).
   This affects Youssef's `crism` layer and the goal text, which claimed these layers; the goal text is fixed.
2. **No clay site lies inside the box.** The clay-bearing unit is lower on Mount Sharp. Choosing the clay
   goal shows a notice and offers every site instead of inventing one.

## 4. Proposed contract additions (for Ali and Marwan to agree)

New files, next to the §15 ones in `app/public/data/`. Mocks are generated by
`app/public/data/_mock/make-plan-mock.mjs` (run after `make-mock.mjs`); every mock carries
`"_mock": true` and `"_proposal"`. **The app still works with only the old route files**: it shows them
as walk-only, together-only plans.

### `targets.geojson`

GeoJSON polygons, one per sample area.

| Property | Meaning |
|---|---|
| `id`, `name` | Same id as the stop it is drawn around |
| `site` | `[lon, lat]` of the real rover-visited site |
| `substances` | Short list shown to the crew |
| `goals` | Setup goal ids it serves (`sulfate-unit`, `clay-unit`, `boxwork`, `survey`) |
| `evidence`, `badge` | Source id and evidence class |
| `extent_note` | How the outline was drawn (mock: a 120 m area around the site) |

### `plan/index.json`

`{ "plans": [ { id, target, mode, crew, load_kg, rover, file } ] }`. The app picks the entry that matches
the setup (crew, nearest load bucket, rover), or the closest one, and says so on screen when it isn't exact.

### `plan/{target}_{mode}_c{crew}_l{load}_{foot|rover}.json`

| Field | Meaning |
|---|---|
| `target`, `mode` (`fastest`/`safest`), `crew`, `load_kg`, `rover`, `badge`, `budget_l` | Labels; `budget_l` as in the route files (capacity − reserve) |
| `together` | `[member]`: the crew walking together (one entry for the pair) |
| `split` | `null`, or `{ rule, max_separation_limit_m, planned_max_separation_m, members: [A, B] }` (crew of 2 only) |

A **member** is one route:

| Field | Meaning |
|---|---|
| `member`, `label`, `targets` | Who and where to |
| `coords` | `[[lon, lat], …]` habitat → target |
| `seg[]` | Per segment `t_s`, `o2_l`, `slope_deg`, `distance_m` |
| `cum`, `back` | Cumulative out, and cost home from each point (same meaning as in the route files) |
| `pnr_index` | Last point where going out and coming home still fits the budget (route files' rule) |
| `legs[]` | `{ kind: drive|walk, from, to, t_s, o2_l, distance_m }`, point indices into `coords` |
| `park_index` | Where the rover parks; `null` on foot |

In a split with a rover, the pair drives together: B's drive leg is the same as A's, and the map draws it once.

### `plan/limits_c{crew}_l{load}_{foot|rover}.geojson`

One `LineString` feature, `kind: "no_return_line"`: the edge of the zone where the crew can still make it
home (the red-zone boundary in demo-focus-plan §9). Scenario-badged.

## 5. Not done / owners

| Item | Owner | Note |
|---|---|---|
| Agree the §4 shapes, then write real plan, targets and limits files | Ali (engine), Marwan (contract) | Until then the app runs on mocks |
| A real spectral source for the box (finding 1) | Youssef | Trek's indicator layers don't cover Gale |
| Real target outlines and substance text | Ayman | Mock areas are circles around the sites |
| Mission Replay on the routes screen | Marwan | `usePlan()` gives `map` and `activeMembers` |
| Turn-back slider | Jana | Can read `usePlan().activePlan`; the panel has room under "Your plan" |
| Deploy | Yassin | Not started |
| Verify the preview images' alignment against a landmark | pilot gate | Placed by bounding box only |

## 6. Files

- `app/src/App.tsx`: two-step shell, header, Sources dialog.
- `app/src/map/`: `MapWorkspace.tsx` (routes screen layout), `MapCanvas.tsx` (map), `PlanPanel.tsx`
  (panel), `planStore.tsx` + `planContext.ts` + `usePlan.ts` (plan state), `format.ts` (labels, colours, sums).
- `app/src/lib/engineData*.ts(x)`: loads `targets.geojson`, `plan/index.json` and the context image.
- `app/src/mission/`: shorter setup text; `app/src/lib/materials.ts`: corrected goal sources.
- `app/public/preview/`: `context.jpg` + `basemap.json` entry.
- `app/public/data/_mock/make-plan-mock.mjs` + generated `targets.geojson`, `plan/`.
- Removed: `StopPicker.tsx`, `RouteCards.tsx`, `LayerPanel.tsx` (replaced by the panel).
