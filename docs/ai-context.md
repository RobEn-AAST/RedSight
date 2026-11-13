# AI Context — State of the RedSight Workspace

**Updated:** 2026-11-13 (Cairo day 1), by the documentation editor; same day by the documentation reviewer
(pre-publication audit — see [`documentation-review.md`](documentation-review.md)). Read this first when you (human or
AI agent) start working in this repo: it says what exists, what is decided, what is pending, and where
every fact lives. Working rules for agents: [`../AGENTS.md`](../AGENTS.md).

## 1. What this is

**RedSight** — NASA Space Apps Challenge 2026 (Cairo, Nov 13–14) entry for the **Interplanetary
Survival Guide: Martian Map** challenge (Intermediate). A hyperlocal Marswalk decision-support planner
for **Gale crater / lower Mount Sharp**: layered NASA-data map, science-goal picker, modeled routes
with time/O2 estimates and turn-back marker, provenance inspector. **No app code exists yet** — the
repo currently contains strategy, requirements, and research documentation only (by design: the
official "no pre-work" rule; build happens inside the event window).

## 2. Document map (read order for a new agent)

| Priority | Doc | Role |
|---|---|---|
| 1 | [`challenge-in-plain-language.md`](challenge-in-plain-language.md) | The challenge, the glossary, the corrections, why-judges-care — start here |
| 2 | [`../requirements/competition-requirements.md`](../requirements/competition-requirements.md) | Every participation/submission/judging rule, each linked to its official source, plus the onsite checklist |
| 3 | [`../requirements/challenge-details-and-resources.md`](../requirements/challenge-details-and-resources.md) | Faithful section-by-section account of the official challenge Details + Resources tabs |
| 4 | [`../README.md`](../README.md) | Project pitch, planned scope, data summary, repo layout |
| 5 | [`competition-overview.md`](competition-overview.md) | Official requirements vs our proposal, mapping table, site choice, open decisions |
| 6 | [`technical-approaches.md`](technical-approaches.md) | Verified data inventory, claim verdicts, model constants, architecture recommendation, honesty guardrails |
| 7 | [`24-48-hour-plan.md`](24-48-hour-plan.md) | Must/Should/Stretch scope, phase plan, acceptance evidence, risks |
| 8 | [`research/mapping-options.md`](research/mapping-options.md), [`research/routing-options.md`](research/routing-options.md) | Deep evidence: datasets/live checks/CRS traps; graph/algorithms/PNR — keep as evidence, see their Errata headers |
| 9 | [`research/independent-architecture-review.md`](research/independent-architecture-review.md) | Adversarial review of the two research docs: verdicts V1–V13, findings F1–F8, pilot + gate |
| 10 | [`documentation-review.md`](documentation-review.md) | Pre-publication audit (2026-11-13): links, consistency, F1–F8 integration, .gitignore — verdict PASS |
| — | [`../requirements/decision-log.md`](../requirements/decision-log.md), [`../requirements/open-questions.md`](../requirements/open-questions.md), [`../requirements/quick-requirements.md`](../requirements/quick-requirements.md) | Decision history, unresolved claims (Cairo-local rules), superseded initial checklist |

## 3. Current decisions (all marked, none are challenge rules)

- **Project name:** RedSight (user-selected). Earlier drafts say "Marswalk Planner (working title)" — superseded.
- **Site:** Gale crater / lower Mount Sharp (user decision; challenge permits any site). Ops box
  ~137.30–137.45°E / −4.75…−4.55° assumed in research; final habitat/target coords still open (U1).
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
  technical-approaches §legend and plain-language §1). Banned wording: "safe route", "certified",
  "real-time", "validated" (routing-options §11).

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
- Curiosity = Gale (use its raw images via `mars.nasa.gov` JSON API; no precise per-image coordinates —
  pin approximately). Perseverance = Jezero. Mars Trek `curiosity_path` layer ends 2018/2019 — stale.
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
