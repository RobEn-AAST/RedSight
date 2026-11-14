# Copilot Mission Control Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans; the user requested inline implementation.

**Goal:** Connect mission readback, UI actions, emergency return and simulated rover rescue to chat/voice.
**Architecture:** A typed shared runtime bridges replay, app stores and copilot. Native return routing stays in Python; illustrative rover motion is separately labeled.
**Tech Stack:** Existing React/TypeScript, MapLibre, Node SSE and Python/scipy/FastAPI; no new dependencies.
**Spec:** ../specs/2026-11-14-copilot-mission-control-design.md

## Global Constraints

- Preserve the 15 degree ceiling and explicit caps; no invented terrain connectors.
- Scenario labels for telemetry, incidents and rover motion; preserve Observed/Derived provenance.
- Push only the feature branch; no deployment or main merge.

## Review Focus

- Combined incidents must not duplicate pickup or reset oxygen.
- Old async results after reset/config changes must never apply.
- Missing terrain/provider must leave manual simulation controls usable.
- Split crew actions must identify the supported member and reject unavailable members.
- Cancellation must stop motion and preserve position/consumption.

### Task 1: Native current-position return

Files: engine/routing_api.py, engine/api.py, engine/tests/test_return_routing.py, server/index.mjs.
Interface: return_request(request) -> {status, return_route}; POST /return via Node /api/routing/return.
- [x] Add failing synthetic graph tests for directed shortest return, exact vertex start, blocked/outside starts and cap preservation.
- [x] Implement native current-position to habitat search with full matching geometry/cost arrays and carried samples.
- [x] Run Python suite and an available native-data check.

### Task 2: Mission simulation runtime and UI

Files: app/src/simulation/*, replay.js/.d.ts, MissionReplay.tsx, App.tsx.
Interface: shared missionControl.getSnapshot/subscribe/execute, registered replay and app adapters.
- [x] Add failing deterministic tests for incidents, oxygen, pickup, cancellation/reset, duplicates and stale results.
- [x] Implement snapshot, composite incident action, native return request, illustrative rover states and map overlay.
- [x] Add manual controls and share replay progress without resetting consumption.
- [x] Run Node tests, build and lint.

### Task 3: AI read/actions and completion

Files: server/providers.mjs, server/prompt.mjs, server/index.mjs, CopilotDock.tsx, docs/ai/*.
Interface: mission_control(op, ...) and read_app_data(section, id) use app acknowledgements.
- [x] Add tool exposure/behavior tests before changing provider declarations.
- [x] Expose full bounded mission data queries and all supported mission UI controls; keep permission-based audio controls separate.
- [x] Wire current simulation snapshot, cancellation and confirmed results into chat/voice.
- [x] Browser-check full flows; review diff; run required suites/build/lint/data check; commit and push feature branch.

## Execution ledger

- Approved design; implementation starts from 924bbfc in isolated feature worktree.
- Ruling: current-position native starts may be exact vertices or exact points on a supplied legal adjacent native edge. The engine checks the edge and computes directional partial-edge costs; the astronaut is never snapped.
