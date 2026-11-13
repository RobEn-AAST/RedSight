# Web Foundation — app/ status, versions, and integration path

**Written:** 2026-11-13 (hackathon day 1) by the web-foundation worker; verified + finished the
same day by the resumed web-copilot worker (verification record §7). Live status of the React app
versus planned work. Companion: [`demo-focus-plan.md`](demo-focus-plan.md) (tier plan + §15 data
contract) · [`ai/voice-copilot-plan.md`](ai/voice-copilot-plan.md) (copilot) · surface brief:
[`impeccable-brief-app-console.md`](impeccable-brief-app-console.md) + `PRODUCT.md` (root).

## 1. Implemented now (all visible in the running app; build/lint/typecheck verified green)

- **Stack:** official `create-vite` react-ts template, restructured into feature folders; Tailwind
  v4 official Vite integration; Motion for React; lucide icons; self-hosted fonts. Verified against
  the npm registry + official template on 2026-11-13 (exact versions in §3).
- **Spacecraft-station console UI** (user-pinned direction): station rail with brand + mission
  status + UTC/M+ clock, chamfered panels with seam borders and status LEDs, one signal-amber
  accent, evidence-taxonomy badge system (Observed / Derived / Scenario / Unavailable) in every
  list, keyboard shortcuts (1–5 workspaces, C copilot, Esc close), skip-link, focus rings, reduced
  motion, honest empty states. Design tokens in `app/src/styles/tokens.css` (Tailwind `@theme`).
- **Mission setup flow** (plan §8, D19) with validation and localStorage persistence: crew 1–2
  (default 2, buddy-rule warning on solo), body mass 43–110 kg (default 82), carried load with
  explicit per-astronaut vs mission-total basis (0–40 kg per astronaut), samples per stop 0–10 kg,
  rover availability (input recorded; execution is Tier 2 E0), evidence-backed science-goal picker +
  custom goal. Resolved manifest shows total / per-astronaut / nearest engine bucket (§15).
  Confirming flips the console to "mission active" and carries the operator to the map.
- **Map workspace:** layer console (toggles + badges; engine `layers.json` wins when present,
  research-era catalog otherwise) + stops list S1–S3 at real Curiosity positions with sol/coords
  (MMGIS waypoints via plan §6), habitat Scenario note, D11 ops-box caption (137.335–137.435°E /
  −4.85…−4.75, ≈5.9×5.9 km, pilot-gated). Map viewport is an honest "tiles not loaded" frame.
- **Routes workspace:** mode (fastest / lowest-hazard / balanced), budget type, §15 lookup key
  display, radio-coverage explainer (B4c) — all honest "engine not connected" states.
- **Provenance inspector:** per-dataset cards with badge, resolution, source link, verified-source
  status (mirrors technical-approaches §1).
- **HUD workspace:** labeled Tier 2 (§10), planned readouts listed as Scenario, no fake data.
- **Copilot dock:** not-configured truth (provider banner, disabled mic, undelivered local-only
  transcript, delete/clear), pointer to the plan docs. No network calls, no fake answers.
- **§15 contract hooks:** `EngineDataProvider` probes `app/public/data/{meta,layers,stops}.json`
  once; absence keeps honest empty states. Browser-side math limited to the allowed
  threshold/lookup operations (plan §4).

## 2. Planned, not implemented (do not claim otherwise)

- **MapLibre GL JS map + raster tiles** (B1) — deliberate: not installed while zero tiles exist
  (bundling ~800 kB for nothing). Next step when `engine/` produces tiles: `npm i maplibre-gl`,
  mount in the map frame, drive layers from `layers.json` (BSD-3-Clause credit).
- **Engine-consuming features** (B2 stop cards with photos, B3 route comparison, B4/B4b turn-back
  slider + zones + walk-along, B4c coverage layer render, B6 RAD/REMS cards, B6c judge extras) —
  the UI scaffolds and copy exist; all numbers wait for `app/public/data/` (§15).
- **Copilot backend + provider adapters + tool execution** — UNCONNECTED by design; see
  [`ai/voice-copilot-plan.md`](ai/voice-copilot-plan.md). Keys server-side only.
- Tier 2/3 features (rover mode, 360 + HUD, Vision Pro) — after Tier 1 ships (§3 build order).

## 3. Installed versions (exact, from `npm ci` on the lockfile, 2026-11-13)

| Package | Installed | Note |
|---|---|---|
| vite | 8.3.8 | Node ^20.19.0 \|\| >=22.12.0 (machine: v26.8.1, npm 11.19.0) |
| react / react-dom | 19.3.1 | |
| typescript | 7.0.2 | TS7 native compiler — `baseUrl` removed; alias via `paths` relative to tsconfig |
| tailwindcss + @tailwindcss/vite | 4.3.5 | Official Vite plugin; tokens via `@theme` CSS, no tailwind.config |
| motion | 14.14.0 | `motion/react`; `MotionConfig reducedMotion="user"` |
| lucide-react | 1.72.0 | Single icon family, consistent stroke |
| @fontsource/chakra-petch, /ibm-plex-sans, /ibm-plex-mono | 5.3.0 | Self-hosted (offline demo-safe) |
| @vitejs/plugin-react | 6.3.0 | |
| @types/node | 24.19.2 | devDependency |
| oxlint | 1.93.0 | Template default linter (flat `.oxlintrc.json`) |
| maplibre-gl | **not installed** | Deliberate — see §2 |

## 4. Commands (from `app/`)

```bash
npm ci          # install from lockfile
npm run dev     # dev server (Vite, http://localhost:5173)
npm run build   # tsc -b (typecheck) && vite build → dist/
npm run lint    # oxlint (react + typescript rules)
npm run preview # serve the production build locally
```

## 5. Folder boundaries (app/)

```
app/src/
├── styles/       tokens.css — design tokens (@theme) + base layer + console utilities
├── types/        mission.ts (§8 model + limits) · copilot.ts (chat + UNCONNECTED tool types)
│                 · layers.ts (evidence taxonomy)
├── lib/          missionStore/missionContext/useMission (shared state, localStorage)
│                 · validation.ts (§8 limits) · materials.ts (goal options)
│                 · layersData.ts + stopsData.ts (research-era fallbacks, §6-verified)
│                 · engineData(tsx)/engineDataContext/useEngineData (§15 contract loader)
│                 · useMediaQuery.ts (xl breakpoint → one copilot dock per viewport)
├── ui/           Panel, Button, Field, Badge, Toggle, LedDot, EmptyState, KeyHint
├── mission/      MissionSetup + MissionSteps + MissionWorkspace (setup/review)
├── map/ routes/ provenance/ hud/ copilot/   one folder per workspace feature
└── App.tsx       shell: rail, workspace switcher, copilot dock/drawer, status bar
```

Boundary rules: engine outputs are read-only to the app (`app/public/data/`, §15); the app never
computes model numbers; feature folders keep their data fetching in `lib/`; `ui/` stays
feature-agnostic.

## 6. Remaining integration steps (engine → app)

1. Engine writes `app/public/data/{meta,constants,layers,stops}.json` (+ routes/, fields/,
   hazards.geojson, cards/) — the loader already picks them up on next load.
2. Install `maplibre-gl`; render the map frame from `layers.json` tile templates; stop pins from
   `stops.json`; route/zone/coverage layers from routes/fields (B1–B4c).
3. Constants UI reads `constants.json` (every displayed constant: value + source + badge — UI never
   hardcodes a number it displays).
4. Turn-back slider + zones + walk-along slider per plan §9 (threshold/lookup on `fields/*.png`).
5. Copilot: build the minimal proxy (plan §6) only when the user approves and supplies keys.

## 7. Verification record (2026-11-13, resumed web-copilot worker)

Checked and green on this pass (evidence: command outputs in the session log; screenshots were
temporary inspection artifacts, not committed):

- `npm ci` (lockfile) → `npm run build` (tsc -b + vite build) ✓ · `npm run lint` (oxlint)
  0 warnings / 0 errors ✓ · `npx tsc -b --force` ✓ · Node v26.8.1.
- Full user flow in headless Chromium (desktop 1440×900 + mobile 390×844): setup stepper →
  confirm → map → routes → provenance → HUD → copilot send → invalid-load validation.
  **Zero browser console errors.** DOM-level checks: validation alert fires, Next is gated,
  exactly one `#copilot-input` per viewport.
- Fixes landed during the pass (found by that inspection):
  1. duplicate `#copilot-input` (desktop dock + mobile drawer both mounted) → dock/drawer now
     gated on the 1280 px breakpoint via `useMediaQuery`; drawer autofocuses its composer;
  2. `ink-faint` contrast raised #66717f → #7d8895 (was ~3.7–4.0:1, now ≥4.5:1 on the lightest
     surface — WCAG 2.2 AA bar from PRODUCT.md);
  3. mobile map frame: ops-box caption moved from absolute to in-flow footer (was overlapping
     the empty-state copy; verified fixed by element-geometry check);
  4. Toggle hit-slop (~44 px target) via invisible `::after` pad;
  5. `SetMissionParamsArgs` gained `sampleKgPerStop` (was missing vs voice-copilot-plan §7).
- Not checked / out of scope here: real-engine integration (§6 waits for `engine/` outputs),
  MapLibre rendering, deploy, and anything owned by other team-plan rows.
