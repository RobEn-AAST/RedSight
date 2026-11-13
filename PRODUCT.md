# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React + Vite + TypeScript (user-selected). Builder choices verified 2026-11-13 from the official
`create-vite` react-ts template and the npm registry: Vite 8.3.x · React 19.3.x · TypeScript ~7.0.x ·
Tailwind CSS 4.3.x via `@tailwindcss/vite` (official Vite integration) · Motion (`motion/react`) 14.x ·
lucide-react 1.x · oxlint (template default linter). MapLibre GL JS is the planned map runtime
(docs/technical-approaches.md §4) but is intentionally **not installed yet** — no tiles/rasters exist
to render, so the map workspace ships an honest "data not loaded" state instead.

## Users

*(inferred from the dispatch brief; no interview possible in this session)* Primary demo audience:
NASA Space Apps 2026 judges and the public project-page visitor (logged-out, laptop or phone). In-app
persona: an astronaut *operator* planning a single excursion ("Marswalk") from a habitat on lower
Mount Sharp, Gale crater. Secondary: the RedSight team itself during the 24–48 h build.

## Product Purpose

RedSight is a hyperlocal Marswalk **decision-support prototype**: a layered map of a small Gale
crater operations area, a science-goal picker, modeled routes with time/O2 estimates and a modeled
turn-back marker, and a provenance inspector that labels every layer Observed / Derived / Scenario /
Unavailable. Success = a judge can verify at a public URL that real NASA data drives the tool and that
every number is traceable and honestly labeled.

## Positioning

The provenance inspector + honesty taxonomy is the differentiator: neighboring Mars map tools (Mars
Trek, USGS viewers) show regional/global data without walk-scale planning or per-claim evidence
labeling. RedSight is the missing hyperlocal layer with labeled uncertainty.

## Operating Context

Hackathon build (Cairo, Nov 13–14 2026): English UI, demoed over a public static web link; static
hosting, no backend required for the core app. Map data (HiRISE DTM/ortho tiles, derived rasters) is
produced by a separate offline Python engine and drops into `app/public/data/` per the §15 data
contract (docs/demo-focus-plan.md) — the frontend must work before that data exists (honest empty
states). Ops box: proposed 137.335–137.435°E / −4.85…−4.75° (D11); habitat is a Scenario point chosen
at the pilot gate.

## Capabilities and Constraints

Scope is **tiered and strictly ordered** (docs/demo-focus-plan.md §3): Tier 1 base (map, ≥4 layers,
stops S1–S3, fastest + lowest-hazard routes, turn-back slider, return-budget zones, radio coverage,
provenance/RAD/REMS cards, deploy, submit) → Tier 2 (rover mode E0, 360° at stops + HUD) → Tier 3
(Vision Pro). This session (user-approved): mission setup per plan §8 (crew 1–2, body mass 43–110 kg,
carried load 0–40 kg per astronaut with explicit per-person/total semantics, samples 0–10 kg per stop,
rover availability recorded — execution is Tier 2), map/stops/layers/routes/provenance interfaces over
the §15 JSON contract with honest engine-data-absent states, HUD workspace labeled Tier 2, and a
voice/chat copilot panel honest about being unconfigured (no fake answers, no network calls; plan in
docs/ai/). **AI exception:** D12 excluded an AI assistant from the hackathon, but the user explicitly
authorized the spacecraft UI + AI/chat *planning* (docs + unconfigured panel) on 2026-11-13; route
tool execution stays pending user-supplied functions. The browser never computes model numbers — only
threshold/lookup operations on precomputed engine fields (plan §4). Banned wording in shipped copy:
"safe route", "safe time remaining", "certified", "flight-safe", "real-time", "validated". No NASA
logos/insignia in generated content (SI rule). API keys stay server-side, never in the client bundle.

## Brand Commitments

Name: **RedSight**. User-pinned visual direction: the interface feels like being **inside a
spacecraft/station** — a thoughtful mission console with structural panels, crisp typography,
restrained lighting, meaningful motion, strong hierarchy, legible mission controls, keyboard and
mobile accessibility. Distinctive, not a stock Vite screen.

## Evidence on Hand

docs/technical-approaches.md (verified data inventory, model constants, claim verdicts),
docs/research/*.md + errata, docs/24-48-hour-plan.md, requirements/*. No Mars raster/vector data is
downloaded yet; no measurements exist to display. Future work must not fabricate any of it.

## Product Principles

1. Honesty is the product: every visible claim carries its evidence class and source.
2. The engine computes; the interface explains. The AI layer never originates numbers.
3. Empty is honest: unimplemented data shows explicit not-loaded states, never placeholders dressed
   as data.
4. Operate like a console: dense, structured, keyboard-friendly; calm under time pressure.
5. Static-first: no runtime dependency on live remote services for the demo.

## Accessibility & Inclusion

Keyboard operability and mobile responsiveness are user requirements for this build; WCAG 2.2 AA
contrast and focus visibility are the working bar. prefers-reduced-motion respected (Motion + CSS).
