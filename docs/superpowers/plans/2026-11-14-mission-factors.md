# Mission factors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ten operator/copilot-settable mission factors that change the modeled route or its modeled verdicts, all labeled Scenario.

**Architecture:** Spatial factors (sand, hazard blend) go into the routing API as new `/route` parameters. Limit factors (dose, daylight, cold) are evaluated by a pure `factors.ts` over the returned route. The copilot gets one `set_mission_factors` tool whose ranges come from `app/public/data/factors.json`.

**Tech Stack:** Python (numpy/scipy/FastAPI, pytest), TypeScript/React 19, node `--test` `.mjs` tests, Vite.

**Spec:** `docs/superpowers/specs/2026-11-14-mission-factors-design.md`

## Global Constraints

- Every factor result is labeled **Scenario**; copy says "modeled estimate"; never use: safe route, safe time remaining, certified, flight-safe, real-time, validated.
- Hard slope ceiling stays 15°; no cap is ever relaxed.
- RAD/REMS stay cards; no spatial radiation/weather maps.
- Radio-contact factor is phase 2 (not shipped).
- No push, deploy or submission. Commit on `feat/ali-mission-factors` only.
- Run before finishing: `cd app && npm run build && npm run lint && npm run check:data`.

---

### Task 1: Engine sand weight and hazard blend
**Files:** Modify `engine/routing_api.py`; Create `engine/tests/test_routing_factors.py`.
**Interfaces:** Produces `route_request` accepting `sand_weight` (float 0–3, default 1.0) and `hazard_weight` (float 0–1, default 0.5); `routing` echoes `sand_weight`, `hazard_weight`, `sand_model`.
- [ ] Write failing test: sand_weight 3 vs 0 changes `safest` route coordinates or objective cost; invalid values return `status=error`.
- [ ] Implement: load `data/processed/themis_ti_10m.npy` (600×600 over the ops box W137.335 E137.435 S-4.85 N-4.75), map TI→η (≥450→1.0, ≤200→2.1, linear), sample at native cell centers, scale `hazard_csr.data *= 1 + w*(η[dest]-1)`; blend `balanced` as `(1-α)·t_norm + α·h_norm`.
- [ ] Run pytest, commit.

### Task 2: Factor definitions and pure evaluator
**Files:** Create `app/public/data/factors.json`, `app/src/lib/factors.ts`, `app/src/lib/factors.test.mjs`; Modify `app/src/types/mission.ts`.
**Interfaces:** `evaluateFactors(route:{total_s:number}, f:FactorSettings, daylight:Daylight|null): FactorVerdict[]`; `validateFactorPatch(args, defs): string|null`; `FactorSettings` fields `sandWeight, hazardWeight, radiationBudgetMsv, sepEvent, startLocalHour, daylightRequired, coldLimitK|null, geologyPreference`.
- [ ] Failing tests for dose (0.64 mSv/day RAD rate × duration, SEP adds 0.418 mSv), daylight (start/end vs sunrise/sunset), cold (sinusoid between REMS 173–284 K), validation ranges.
- [ ] Implement, run `node --test`, commit.

### Task 3: Copilot tool end to end
**Files:** Modify `server/providers.mjs` (tool schema), `server/index.mjs` (forward weights to `/route`; return verdicts), `server/prompt.mjs`, `app/src/copilot/actions.ts`, `app/src/copilot/CopilotDock.tsx`, `app/src/copilot/actions.test.mjs`.
**Interfaces:** tool `set_mission_factors(args: Partial<FactorSettings>)`; `/route` body gains `sand_weight`, `hazard_weight` from `missionState`.
- [ ] Failing action test; implement; run tests; commit.

### Task 4: Mission factors panel and route verdicts
**Files:** Create `app/src/routes/FactorsPanel.tsx`; Modify `app/src/routes/RoutesWorkspace.tsx`.
- [ ] Panel lists all ten factors from `factors.json` with value, unit, badge, source; route card shows dose/daylight/cold verdicts. Build and lint, commit.

### Task 5: Verify and document
- [ ] `npm run build && npm run lint && npm run check:data`, pytest, node tests, live `/route` calls differing by factor. Add entry to `docs/ai-context.md` §2. Commit.

#### Verification record — 2026-11-14

Checked locally on `feat/ali-mission-factors` at implementation commit `0478135`:

- [x] App build and lint pass. Build reports large on-demand chunks.
- [x] Data check: 0 errors, 1 warning (`hazards.geojson` is 6.1 MB).
- [x] `python3 -m pytest -p no:cacheprovider -q engine/tests engine/content/test_stops_and_cards.py`: 65 passed, no skips, in 99.24 seconds.
- [x] All `.test.mjs` files under `app/src` and `server`, run with `node --test`: 55 passed, no failures or skips. Includes factor evaluation, patch validation and provider tool-schema tests.
- [x] Local FastAPI HTTP check on temporary port 18791: health reports terrain configured. Two `POST /route` requests for S2, mode `safest`, identical crew/load inputs and a 15° ceiling both return `status: ok`. Changing `sand_weight` from 0 to 3 changes path length from 768 to 774 coordinates and modeled objective cost from 1102.2470541000366 to 1559.7198159694672. Both responses echo the requested weight, retain the 15° hard ceiling and label the result Scenario. These costs use different weights and are not a cross-route performance ranking. The temporary service was stopped after checking.
- [x] The mission-factors spec and plan already have an entry in `docs/ai-context.md` §2.

Boundary: these checks establish local build, automated tests and native routing HTTP behavior. Browser interaction, a live model executing the copilot tool, and production behavior were not tested in this pass. No push, deployment, submission or commit was performed. Task 5's combined checkbox remains open because it also includes a commit.
