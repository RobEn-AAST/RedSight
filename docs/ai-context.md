# AI Context — State of the RedSight Workspace

**Updated:** 2026-11-13 (Cairo day 1), by the documentation editor; same day by the documentation reviewer
(pre-publication audit — see [`documentation-review.md`](documentation-review.md)). Read this first when you (human or
AI agent) start working in this repo: it says what exists, what is decided, what is pending, and where
every fact lives. Working rules for agents: [`../AGENTS.md`](../AGENTS.md).

## 1. What this is

**RedSight** — NASA Space Apps Challenge 2026 (Cairo, Nov 13–14) entry for the **Interplanetary
Survival Guide: Martian Map** challenge (Intermediate). A hyperlocal Marswalk decision-support planner
for **Gale crater / lower Mount Sharp**: layered NASA-data map, science-goal picker, modeled routes
with time/O2 estimates and turn-back marker, provenance inspector. **App foundation exists and is
verified green** (2026-11-13, web-foundation worker + resumed web-copilot worker): `app/` holds the
React+Vite+TS mission console (mission setup per plan §8, map/stops/routes/provenance/HUD workspaces
with honest engine-data-absent states, copilot panel in not-configured state) — build/lint/typecheck
pass and the full flow was browser-tested with zero console errors (verification record:
[`web-foundation.md`](web-foundation.md) §7). Engine data, MapLibre tiles and route math are still
pending (see [`web-foundation.md`](web-foundation.md) §1–§2, §6).

## 2. Document map (read order for a new agent)

| Priority | Doc | Role |
|---|---|---|
| 1 | [`challenge-in-plain-language.md`](challenge-in-plain-language.md) | The challenge, the glossary, the corrections, why-judges-care — start here |
| 2 | [`../requirements/competition-requirements.md`](../requirements/competition-requirements.md) | Every participation/submission/judging rule, each linked to its official source, plus the onsite checklist |
| 3 | [`../requirements/challenge-details-and-resources.md`](../requirements/challenge-details-and-resources.md) | Faithful section-by-section account of the official challenge Details + Resources tabs |
| 4 | [`../README.md`](../README.md) | Project pitch, planned scope, data summary, repo layout |
| 5 | [`competition-overview.md`](competition-overview.md) | Official requirements vs our proposal, mapping table, site choice, open decisions |
| 6 | [`technical-approaches.md`](technical-approaches.md) | Verified data inventory, claim verdicts, model constants, architecture recommendation, honesty guardrails |
| 7 | [`demo-focus-plan.md`](demo-focus-plan.md) | **Current focused plan** (2026-11-13): what we submit, narrowed scope, architecture diagram, corrected ops box + stops, data-type order, 360 + HUD, Vision Pro, first steps |
| 7b | [`web-foundation.md`](web-foundation.md) | **App status** (2026-11-13, verified): implemented vs planned, exact installed versions + Node needs, commands, folder boundaries, engine→app integration steps, verification record §7 (build/lint/typecheck green, browser-tested, zero console errors) |
| 7c | [`ai/voice-copilot-plan.md`](ai/voice-copilot-plan.md), [`ai/assistant-system-prompt.md`](ai/assistant-system-prompt.md) | Voice/chat copilot **plan** (UNCONNECTED): pipeline, local-vs-Groq STT tradeoffs, Gemini/Groq model IDs verified 2026-11-13, server-side-key backend proposal, typed future tool contracts, system-prompt design. Records the user's 2026-11-13 exception to D12 (planning + honest panel only; no live AI at judging without a new team decision) |
| 7a | [`team-plan.md`](team-plan.md) | **Who builds what**: 6 owners, Must ship / If time per person, branches, checkpoints, Mission Replay hook. Teammates start a session with "I am <name>" |
| 7d | [`24-48-hour-plan.md`](24-48-hour-plan.md) | Must/Should/Stretch scope, phase plan, acceptance evidence, risks (scope/ops area superseded by demo-focus-plan) |
| 8 | [`research/mapping-options.md`](research/mapping-options.md), [`research/routing-options.md`](research/routing-options.md) | Deep evidence: datasets/live checks/CRS traps; graph/algorithms/PNR — keep as evidence, see their Errata headers |
| 8b | [`research/external-sources-review.md`](research/external-sources-review.md) | Verdicts on the Kaggle notebook (game data, rejected), the NASA Life Sciences Portal (EVA/walkback citations), and how each of the 5 official resources is used, by tier |
| 9 | [`research/independent-architecture-review.md`](research/independent-architecture-review.md) | Adversarial review of the two research docs: verdicts V1–V13, findings F1–F8, pilot + gate |
| 10 | [`documentation-review.md`](documentation-review.md) | Pre-publication audit (2026-11-13): links, consistency, F1–F8 integration, .gitignore — verdict PASS |
| — | [`../requirements/decision-log.md`](../requirements/decision-log.md), [`../requirements/open-questions.md`](../requirements/open-questions.md), [`../requirements/quick-requirements.md`](../requirements/quick-requirements.md) | Decision history, unresolved claims (Cairo-local rules), superseded initial checklist |

## 3. Current decisions (all marked, none are challenge rules)

- **Project name:** RedSight (user-selected). Earlier drafts say "Marswalk Planner (working title)" — superseded.
- **Site:** Gale crater / lower Mount Sharp (user decision; challenge permits any site). Ops box
  **proposed 137.335–137.435°E / −4.85…−4.75°** at the boxwork site, with stops at real Curiosity
  waypoints (D11, demo-focus-plan §6). The research-era box (137.30–137.45°E / −4.75…−4.55°) missed the
  boxwork and was ~9×12 km. Habitat position is set at the pilot gate (U1 closes there).
- **Scope is tiered, built strictly in order** (D12, [`demo-focus-plan.md`](demo-focus-plan.md) §3):
  **Tier 1 base** (map + layers + stops + routes + turn-back slider + provenance/RAD/REMS cards +
  deploy + submit) → **Tier 2 extras** (360 at stops + HUD) only after Tier 1 is submitted → **Tier 3
  bonus** (Vision Pro WebXR, 3D fly-along) only after Tier 2 works. Before starting work, check which tier
  is complete. Data-type order and badges: D16–D17. Return-budget zones, the "don't go beyond" line and
  the automatic switch to the fastest return when O₂ is low are Tier 1 (D22, demo-focus-plan §9). Crew setup (pair, body mass, load, samples) is
  Tier 1 (D19); rover-vs-foot mode is the first Tier 2 item (D20); drill-site stops (D21). Display
  formats are all optional; no fixed number is required (demo-focus-plan §1b). The challenge-text
  traceability table is demo-focus-plan §1c. Judge-criteria ideas and the 60-second demo script: §17 (D23). Radio coverage / radio-shadow layer is Tier 1 (D24, §9b); relays Tier 2.
- **Architecture:** web-first static 2D planner (MapLibre + precomputed tiles/JSON), Python engine
  offline; three.js 3D/HUD as 48 h extension (Approach 1, technical-approaches §4; reinforced by the
  independent review V2/F2: scipy Dijkstra field core, hand-written A* only as interactive/oracle).
- **Router:** backward-Dijkstra return-cost field from habitat (reachability + turn-back everywhere) +
  path extraction; per review F2, scipy full field ≈ 0.25 s beats hand-written A* (6.5 s worst case) —
  do not put a custom A* on the 24 h critical path.
- **License:** Apache-2.0 proposed (official Terms require OSI license + documentation; Apache 2.0 is
  NASA's default for unspecified content) — team sign-off pending (U3).
- **Demo format:** 7 slides vs ≤30 s video — undecided (U2/D03); slides currently the safer default.
- **Labeling:** every layer/number carries Observed / Derived / Scenario / Unavailable (taxonomy in
  technical-approaches §legend and plain-language §1). Banned wording (AGENTS rule 3): "safe route",
  "safe time remaining", "certified", "flight-safe", "real-time", "validated".

## 4. Key verified facts agents often need (full evidence in the linked docs)

- Challenge wording is permissive: "at least three kinds of data" and the route map are **recommended,
  not mandatory**; HUD/habitat/tablet formats explicitly optional (challenge-details §Objectives).
- Submission window: opens Sat Nov 14 9:00 a.m. Africa/Cairo; closes Sun Nov 15 11:59 p.m.; Cairo
  local judging is Saturday ⇒ submit before it (working rule; exact local cutoff unconfirmed).
- Global rule: edit-and-resubmit allowed until close; the Cairo compilation's "no changes after
  submission" is unverified/contradicted (open-questions #1–#3).
- RAD = only surface dosimeter on Mars, rover-local (0.64–0.67 mSv/day GCR); no spatial radiation
  product exists. REMS (Gale) and MEDA (Jezero) are rover-local weather stations; no spatial weather
  at walk scale; MCD is a coarse global model.
- THEMIS thermal inertia: 100 m/px coarse sand-proxy, not boot-scale truth.
- Curiosity = Gale (use its raw images via `mars.nasa.gov` JSON API; no per-image coordinates, but
  matching an image's sol to NASA's MMGIS waypoint file (`mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json`,
  current through sol 5070) gives the rover's position for that sol; otherwise pin approximately). Perseverance = Jezero.
  Mars Trek `curiosity_path` layer ends 2018/2019 — stale.
- Cairo event officially started Fri 2026-11-13 07:00 Africa/Cairo (official Cairo page); its page sets
  no submission deadline; judging start time still to ask (open-questions update).
- USGS ARD STAC serves CC0 HiRISE DTM/ortho COGs; one flagship example product was found dead with
  intermittent S3 404s — use the retry ladder (review F3). Mars Trek quantitative export needs exactly
  `format=tiff&compression=…&f=image` (F3); default export caps at 400×400 px.
- MOLA (463 m/px) cannot support walk-scale routing; plan on the 1 m Gale DEM.

## 5. Open items that gate work (owners: see 24-48-hour-plan §2 / overview §5)

- U1 ops-area box + habitat location (blocks build B1) · U2 demo format (blocks C4) · U3 license
  sign-off · U4 AI assistant ship/no-ship · U5 HRSC/MCD usage (default skip HRSC).
- Ask the Local Lead (tonight): pre-work boundary for data downloads; exact Cairo cutoff + any local
  edit lock; who may click Submit; People's Choice format (open-questions #1–#3).
- Before any app code: the **pilot + gate** defined in the independent review §6 (2–3 h end-to-end
  evidence run; binary gate G1–G4).

## 6. Conventions for changing this repo

- Docs are the product right now: keep claims sourced, dated, and labeled; use the Errata pattern
  (see research docs) instead of rewriting evidence documents; never delete another agent's findings —
  correct by attribution. See [`../AGENTS.md`](../AGENTS.md) for the full short rule list.
