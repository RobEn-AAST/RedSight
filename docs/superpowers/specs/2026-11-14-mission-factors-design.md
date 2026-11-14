# Mission factors — design (2026-11-14)

Status: approved in chat by the user (Ali) on 2026-11-14. Scope: user-directed extension (AGENTS.md hard rule "stay within scope").
Owner area: engine (`engine/routing_api.py`), app (`app/src/lib`, `app/src/routes`, `app/src/copilot`), copilot server (`server/`).

## Goal
Ten mission factors that the operator **or the copilot AI** can set from the user's use case. Each changes the modeled route
or its modeled verdict. Everything is a **Scenario** input; nothing invents spatial radiation/weather data.

## Competition fit (requirements/, docs/demo-focus-plan.md §7)
- Extra safety context (radiation, weather) is **Recommended**, not Must. User-set values are allowed if labeled.
- RAD/REMS are rover-local point measurements: they stay cards and are never drawn as maps; here they only convert **route
  duration** into a modeled dose / cold exposure.
- Banned shipped wording: "safe route", "safe time remaining", "certified", "flight-safe", "real-time", "validated".
  Use "modeled estimate" + assumptions.
- Radio-contact requirement (viewshed layer, plan §9b) is **phase 2**: the layer does not exist, so it is not shipped as a factor.

## The factors (definitions live in `app/public/data/factors.json`, the single source for UI, copilot and validation)
| # | id | kind | effect | badge |
|---|---|---|---|---|
| 1 | `slopeCapDeg` | spatial | existing hard cap 0–15° | Scenario |
| 2 | `sandWeight` | spatial | new: multiplies edge hazard by `1 + w·(η−1)`, η from THEMIS TI on the native grid (0–3, default 1). Affects safest/balanced only | Derived proxy + Scenario weight |
| 3 | `hazardWeight` | spatial | new: balanced-mode blend α∈[0,1] between normalized time and hazard (default 0.5) | Scenario |
| 4 | crew / mass / load / sample | spatial | existing, via O₂ cost | Scenario |
| 5 | `radiationBudgetMsv` | limit | dose = RAD rate × round-trip + stop time; compared to budget | Observed rate, Scenario budget |
| 6 | `sepEvent` | limit | optional SEP-event multiplier scenario on the dose | Scenario |
| 7 | `startLocalHour` + `daylightRequired` | limit | Mars24 sunrise/sunset: route must end before sunset | Derived |
| 8 | `coldLimitK` | limit | start-hour REMS typical temperature vs limit | Observed point, Scenario limit |
| 9 | `scienceGoalId` | goal | existing; ranks stops | Derived |
| 10 | `geologyPreference` | goal | secondary ranking of stops by SIM 3292 unit (interpretation) | Derived |

Radio contact = phase 2. Rover on/off = existing.

## Architecture
- `engine/routing_api.py`: `/route` accepts `sand_weight`, `hazard_weight`. TI→η map (team choice, Scenario): TI ≥ 450 TIU → 1.0,
  TI ≤ 200 TIU → 2.1, linear between (Pandolf terrain factor range 1.0–2.1, technical-approaches §3). Response `routing` records the weights.
- `app/src/lib/factors.ts` (pure): `evaluateFactors(route, factors, defs)` → verdicts + "why this route" lines. Unit-tested.
- `app/src/types/mission.ts`: new optional fields with defaults; persisted store merges defaults.
- Copilot: new `set_mission_factors` tool (server schema, prompt, dock executor) validating against `factors.json` ranges; `set_route_preference`
  forwards the factor weights; `missionState` sent to the server includes the factors.
- UI: "Mission factors" panel on the routes screen; route card shows dose / daylight / cold verdicts.

## Testing
Python tests for sand/hazard weight changing the route; node tests for `factors.ts`, validation and copilot action; `npm run build`, `lint`, `check:data`; live run against the routing API.
