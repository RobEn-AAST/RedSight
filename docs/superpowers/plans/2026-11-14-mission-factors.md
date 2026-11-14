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
