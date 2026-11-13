# RedSight web console (`app/`)

React + Vite + TypeScript mission console for RedSight — the NASA Space Apps 2026 Martian Map
entry. The interface is a **spacecraft/station planning console**: mission setup, map, routes,
provenance inspector, HUD (Tier 2 placeholder) and an honestly unconfigured copilot dock.

**Status:** Tier 1 foundation. The app builds, typechecks and lints clean, and every workspace
runs with honest "engine data not loaded" states. No map tiles, route numbers, O₂ figures or
AI replies exist yet — they arrive exclusively via the engine's §15 data contract
(`public/data/*.json`, produced offline). Companion docs: [`../docs/web-foundation.md`](../docs/web-foundation.md)
· plan: [`../docs/demo-focus-plan.md`](../docs/demo-focus-plan.md) §15.

## Commands

```bash
npm ci          # install from package-lock.json
npm run dev     # dev server → http://localhost:5173
npm run build   # tsc -b (typecheck) && vite build → dist/
npm run lint    # oxlint (react + typescript rule sets)
npm run preview # serve the production build locally
```

Node `^20.19.0 || >=22.12.0` required by Vite 8 (verified on v26.8.1). No env vars, no keys:
the client bundle contains zero secrets and makes zero network calls beyond fetching
`/data/*.json` probes.

## What works now

- Mission setup stepper with validation + localStorage persistence (plan §8 limits: crew 1–2
  default 2, body mass 43–110 kg default 82, load 0–40 kg per astronaut with explicit
  per-astronaut vs mission-total basis, samples 0–10 kg, rover input recorded — execution is
  Tier 2 E0), evidence-backed science-goal picker, mission summary + editable review.
- Map workspace: layer console (engine `layers.json` wins when present), stops S1–S3 at real
  Curiosity positions, D11 ops-box caption; the viewport is an honest tiles-not-loaded frame.
- Routes workspace: mode/budget selectors and the §15 lookup key; honest engine-absent states.
- Provenance inspector: per-dataset evidence cards (Observed/Derived/Scenario/Unavailable).
- HUD workspace: labeled Tier 2 plan, no simulated readings.
- Copilot dock: not-configured truth — local-only transcript marked undelivered, no network
  calls, no synthesized replies (plan: `../docs/ai/voice-copilot-plan.md`).
- Keyboard: `1–5` workspaces, `C` copilot, `Esc` close. Exactly one copilot dock mounts per
  viewport (dock ≥1280 px, drawer below). WCAG 2.2 AA contrast (verified token math), 44 px
  touch targets on toggles, `prefers-reduced-motion` respected.

## Folder map

See [`../docs/web-foundation.md`](../docs/web-foundation.md) §5. Engine outputs are read-only
to the app; the app never computes model numbers (only threshold/lookup on precomputed fields).
