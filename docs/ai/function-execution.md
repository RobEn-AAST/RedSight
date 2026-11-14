# Copilot function execution and constrained routing

**Status:** Implemented on `AI-functions`, 2026-11-14. The Node service keeps provider keys, chat,
voice, and SSE. Structured provider functions reach the authoritative React stores; constrained route
requests pass from Node to the separate FastAPI service and the existing Python native-terrain engine.

## Supported direct commands

- `set_mission_screen`: open setup or confirm a configured mission and open the routes screen.
- `set_oxygen_budget`: set the active route usable budget in litres; reject values above the engine budget.
- `set_mission`: update crew (1–2), body mass (43–110 kg), per-astronaut load (0–40 kg), load basis,
  samples per stop (0–10 kg), rover availability, or a listed science-goal ID. The app rejects unknown
  fields/IDs and out-of-range values. This only changes mission inputs; unavailable route presets are
  not invented.
- `select_destination`: select one of the currently goal-eligible engine targets by exact ID.
- `set_route_preference`: calculate a new route at the selected destination using fastest,
  lowest-modeled-hazard, or balanced objective and a 0–15° hard cap. Default cap is 15°; the model
  ceiling is fixed at 15° and cannot be raised. Route geometry, segment costs, directed same-path
  return fields and PNR come from the Python engine operating on the hash-checked primary native DEM. It ends at
  a Derived approach endpoint within 10 m of an Observed stop when the engine finds one; no final leg
  is modeled. Full directed same-path return time/O₂ arrays include the configured sample mass and
  drive the PNR. Dynamic routes intentionally omit `back_fast`: there is no complete alternate-return
  geometry in the live API, so replay and turn-back do not claim or switch to a separate fastest-home
  path. A missing/unreachable route returns `no_route`; the previous route is retained and no looser
  preset is substituted.
- `set_layer`: show/hide an available data layer by exact ID.
- `reset_route_constraints`: clear the persisted explicit mobility cap, restore the 15° model ceiling
  and fastest preference, and recompute the current destination route.
- `search_mission_knowledge`: existing source-grounded corpus search.

Balanced routing is a **Scenario** objective: each directed edge gets the mean of its min-max normalized
modeled travel-time cost and mapped slope-hazard cost, then Dijkstra finds the least summed cost within
the existing bounded native corridor. Equal edge-cost ranges normalize to zero. It is not a global
terrain optimum. The route response names the objective, terrain resolution and constraints.

## Mobility and slope constraints

Leg pain or a mobility concern is recorded only as operator-reported context. The copilot must not
diagnose, compute physiology, infer a medical limit, or promise medical suitability. If the operator
does not specify a slope cap and the mission has no saved explicit cap, ask for one; do not invent it.
A chosen numeric cap is persisted in the mission configuration as an explicit Scenario preference and applied to native Horn pixel slopes and directed
edge grades for both outbound and engine-generated return paths. A 0° request is honored and may
return `no_matching_route`; it is never relaxed. A shorter return is described only from engine output.

## Service operation

Install the engine API dependencies once with `python3 -m pip install -r engine/requirements-api.txt`.
Provide the ignored, hash-verified terrain handoff at `data/raw/engine-pilot/input-manifest.json` (or
set `REDSIGHT_ENGINE_MANIFEST`), then run:

```sh
uvicorn engine.api:app --host 127.0.0.1 --port 8790
node server/index.mjs
```

The API admits one CPU-bound request at a time to one persistent worker process, caches verified
terrain inputs in that worker, and returns 429/504/503 instead of queueing unbounded work. The browser
never calls the routing API directly. Node uses `ROUTING_API_URL` (default `http://127.0.0.1:8790`).
Without the native manifest/DEM it reports routing unavailable; the static committed plans remain
usable as existing data, but are not represented as a recomputed result.

The Node SSE action bridge uses per-call UUIDs, one mutation per assistant turn, an app-result wait
with timeout, and abort cleanup. The app validates the tool again against current stores and returns
applied state plus route metrics before the provider generates its final reply. No credentials or
medical conversation text are included in logs.

## Independent completion review

The route panel also exposes a numeric 0–15° slope input and Fastest/Lowest hazard/Balanced controls.
Both controls and AI use the same native terrain service via Node. Incomplete alternate-return data
is ignored by replay and turn-back, with no guessed geometry. Static alternate-return payloads were
removed and manifest output hashes refreshed; directed same-path arrays remain.

Verified locally: real FastAPI requests for D1 under all three objectives, independent per-edge
recalculation of outbound and sample-loaded reverse time/O₂, matching PNR and 0°/10° no-route results.
The browser command bridge was exercised with an explicitly test-only provider protocol fixture and
the real terrain service. No live LLM provider key was available, so actual live-provider language
behavior and speech recognition/synthesis are not verified by that test.

Final independent checks: 48 Python tests and 43 Node tests passed; production app build and lint
passed; check:data reported 0 errors (one existing large-hazard-file warning). HTTP checks recomputed
all outbound/return edge costs and PNR for real D1 fastest, lowest-hazard and balanced routes with
three kilograms of return samples. Requests at 0° and 10° returned no matching route, and 16° was
rejected. Browser checks confirmed the chat tool call applied the real D1 route; a 10° manual request
reported no route without silently relaxing its constraint. Production static GeoJSON and module-worker
MIME types were corrected during that check.
