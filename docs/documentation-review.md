# RedSight — Documentation Review (pre-publication)

**Reviewer:** documentation-review worker (task `task_7ef6b3cbc2c9`). **Written:** 2026-11-13 (Cairo day 1,
~15:30 EET), after the consolidation task had settled (last prior edit 15:19).
**Scope:** independent pre-publication audit of every Markdown file in this repo plus `AGENTS.md`, against
the project rules in [`AGENTS.md`](../AGENTS.md), the official challenge account
([`../requirements/competition-requirements.md`](../requirements/competition-requirements.md),
[`../requirements/challenge-details-and-resources.md`](../requirements/challenge-details-and-resources.md)),
and the adversarial [`research/independent-architecture-review.md`](research/independent-architecture-review.md).
This review owns `.gitignore` and makes only targeted fixes to documented errors; it does not rewrite the
research evidence record (Errata policy, AGENTS rule 4).

**Verdict: PASS for repo initialization and publication of the documentation** — after the fixes in §3
(three total: two cross-reference fixes on the first pass; one `.gitignore` publication blocker found by
the coordinator on a second pass, fixed and fixture-verified). No blockers remain. Items that remain open (§7) are open *by design*
(Cairo-local rules awaiting written Lead answers) or are minor verify-at-submission notes; none blocks
publishing this docs-only repo.

---

## 1. What was checked, and how

| Check | Method | Result |
|---|---|---|
| **Every local Markdown link** | script: extracted every Markdown link target from all 15 `.md` files, resolved each relative path against its file's directory | **61 local file-path links, 0 broken** at audit time; final re-run including this file and its map entry: **16 files, 68 links, 0 broken**. No intra-file `#anchor` links are used. External URLs were *not* re-fetched today (they were live-verified 2026-11-13 by the technical and review workers; see their source registers) |
| **Banned wording** (AGENTS rule 3: "safe route", "safe time remaining", "certified", "flight-safe", "real-time", "validated") | grep across all 15 files; every hit read in context | **No violations in shipped-copy position.** All 25 hits are: the ban lists themselves, "never say…" guardrails, corrections explaining the ban, internal research prose about third parties (e.g. "unvalidated visual proxy"), or a factual note that OLTARIS is "validated vs RAD" (third-party claim, cited — see §7) |
| **Name consistency (RedSight)** | grep for the superseded "Marswalk Planner" title | Live docs use **RedSight** everywhere. Old title survives only in research-doc titles/eras explicitly covered by Errata rename notes (allowed by rule 4) and as the generic descriptor "hyperlocal Marswalk planner" (lowercase, descriptive — intentional) |
| **Site consistency (Gale / lower Mount Sharp)** | read-through of all six strategy docs | Every doc marks Gale as **team choice** ("challenge permits any site"); none states it as a requirement. Curiosity=Gale / Perseverance=Jezero kept straight everywhere, including the Resources-tab warning (Worldview = Earth imagery; Perseverance images = wrong site for Gale) |
| **Mandatory vs optional rules** | audit of the four rule-carrying docs | Consistent: core deliverable = **Must**; "at least three kinds of data" and route map = **Recommended** ("you may consider…", "if possible"); HUD/habitat/tablet = **Optional**; site/name/architecture = **Team choice**; ≥1 NASA data for Global Awards, demo limits, English page = **Must** with ineligibility consequences stated |
| **Scientific-claim consistency** | cross-doc number matrix (no external re-verification — see §8) | Internally consistent everywhere: RAD 0.64–0.67 mSv/day (only surface dosimeter; rover-local); MOLA 463 m/px (context only); THEMIS 100 m/px sand *proxy* (~60×60 cells per 6×6 km box); CRISM ~18 m targeted / ~200 m mapping (sulfate **host unit**; boxwork attributed to **Curiosity imaging**, never "CRISM-detected"); SIM 3292 unit **Htu** at the mound; Gale pressure 700–920 Pa; MCD v6.2 @ 5.625°×3.75°; Mars gravity 3.71–3.73 m/s²; 1 L O₂ ≈ 20.9 kJ ⇒ ~2.9 mL/min per W; MEDA-on-Perseverance correction present in both docs that discuss weather stations; stale Trek `curiosity_path` flagged in all four places it matters |
| **Research-corrections integration (F1–F8)** | matrix in §4 | All eight findings integrated where required; preserved research text carries Errata headers per rule 4 |
| **Stale dates / decisions** | date and decision-ID audit | All docs dated 2026-11-13; event (Fri Nov 13–Sat Nov 14), submission window (Sat 14 Nov 9:00 a.m. → Sun 15 Nov 11:59 p.m. Africa/Cairo), and judging dates (Nominees Dec 3 / Finalists Dec 17 / Winners Jan 2027) agree across all docs. `quick-requirements.md` and `decision-log.md` correctly self-identify as superseded initial artifacts with pointers to the verified docs. Two dangling refs found → fixed (§3) |
| **Label vocabulary** (Must/Recommended/Optional/Team choice; Observed/Derived/Scenario/Unavailable) | read-through | Applied consistently; definitions live once (plain-language §1, technical-approaches legend) and are referenced rather than divergently redefined |
| **Pre-work compliance** (AGENTS rule 5) | `find` over the repo | Repo contains **only** 15 `.md` files + `.gitignore` — no app code, no `data/`, no environment setup. Compliant |
| **AGENTS.md scope** | read-through | Accurate and concise (~60 lines); its project facts match the verified docs; source-hierarchy and errata rules are stated and (verified above) followed |

## 2. Verification results (meaningful evidence)

- Link check: **15 files, 61 local links, 0 broken** at audit time — run twice (before and after fixes; fixes changed no link targets); final state including this review file: **16 files, 68 links, 0 broken**.
- Banned-word grep: **0 shipped-copy violations** (25 hits, all legitimate contexts, itemized in §1).
- Consistency greps: no occurrences of "Zeitler", "600–900" Pa, or wrong "eHsu" outside the corrections that fix them; both external source files referenced by `requirements/` exist in `~/Downloads/` (checked).
- F1–F8: **8/8 integrated** (matrix below).
- No TODO/FIXME/TBD markers anywhere.
- `.gitignore` fixture check (same-day second pass): **28/28 `git check-ignore` assertions PASS** in an isolated temporary Git fixture, plus a differential run reproducing the removed-rule bug — evidence in §6.

## 3. Findings fixed by this review (3)

| # | Finding | Where | Fix applied |
|---|---|---|---|
| R1 | **Dangling references "open-questions #6–#8"** — `open-questions.md` has 5 still-open items (+ a 6-row cross-check table); #6–#8 do not exist (leftovers from a longer earlier list) | `requirements/competition-requirements.md` §7 step 3; `docs/ai-context.md` §5 | Both now cite **#1–#3**, with a pointer for the under-18-venue item (§1 Participation/FAQs) and a note that the People's-Choice/English-pitch asks live inside #1 |
| R2 | **Imprecise cross-reference** — 24-48-hour-plan risk row said "PDS/ODE fallbacks listed in technical-approaches §2", but §2 is the claim-verdict table; the fallback paths are in §1.1 (Access column) and the plan's own A2 ladder | `docs/24-48-hour-plan.md` §4 risk table | Reworded to point at the A2 ladder (STAC → Trek → PDS ODE) and technical-approaches §1.1 |
| R3 | **`.gitignore` publication blocker (coordinator-found, second pass)** — the blanket `!data/processed/**` negation re-included *nested* files under `data/processed/`, overriding the secret and raster exclusions: `data/processed/.env`, `private.key`, and `huge.tif` would all have been committable | `.gitignore` | Negation removed. Small processed JSON/GeoJSON/PNG artifacts remain trackable **by default** (no rule ignores them); secrets and raw-format rasters stay ignored at any depth. Verified with `git check-ignore` in an isolated temp Git fixture — 28/28 assertions pass, including a differential run that reproduces the old bug (evidence in §6) |

R1–R2 are reference-text only; R3 changes one rules file (`.gitignore`, §6). No factual content was
altered, and no other agent's findings were reverted.

## 4. F1–F8 integration matrix (independent review → strategy docs)

| Finding | Required integration | Verified present in |
|---|---|---|
| F1 tile budget (~2.75× understated; z16+z17-core plan) | corrected numbers in strategy docs; research preserved w/ errata | technical-approaches header ✓ · 24-48-hour-plan B5 ✓ · mapping-options Errata ✓ |
| F2 scipy Dijkstra 0.25 s replaces hand-written A* (6.5 s) on critical path | B3 rewritten; A* demoted to 48 h JS + oracle | plan B3 ✓ · technical-approaches header ✓ · ai-context §3 ✓ · routing Errata ✓ |
| F3 dead ARD DTM + retry ladder; Trek `format=tiff` spelling | A2 probe-and-retry ladder; risk row; dead ID kept only as evidence | plan A2 + §4 risk ✓ · technical-approaches header ✓ · mapping Errata ✓ (dead ID remains in preserved §3.2 with errata — correct per rule 4) |
| F4 mean- vs max-slope aggregation | B1 decision line | plan B1 ✓ · technical-approaches header ✓ |
| F5 A* heuristic scaling / single V(θ) definition | errata in routing; noted in technical header | routing Errata ✓ · technical-approaches header ✓ |
| F6 technical-approaches.md missing | file written | exists ✓ (283 lines); all three former ghost-references resolve ✓ |
| F7 MapLibre BSD-3-Clause; service-count drift | credit corrected in live docs | technical-approaches §7 ✓ ("corrected from BSD-2") · mapping Errata ✓ (preserved "BSD-2" rows carry the errata header) |
| F8 LOS planar-fallback curvature | layer-card note when fallback ships | technical-approaches header ✓ · routing Errata ✓ |

## 5. Consistency audits — detail notes

- **"Marswalk Planner" occurrences** (7 hits): README subtitle (generic descriptor), overview ×2 (generic), ai-context + plain-language (documenting the rename), routing + mapping titles (preserved era, Errata-covered). No action needed.
- **curiosity_path staleness** is quoted as "ends 2018" (technical-approaches §1.6) and "2018/2019 (~sol 2230)" (mapping §3.9) — a ≤1-year variance in a *warning against using the layer*; both docs agree it must not be presented as current. No action.
- **"live O2 countdown"** (README Should-tier) — reviewed: it describes the HUD animating the engine's precomputed per-segment table (mapping §6.2), not real-time sensor data; does not trip the banned-word list ("real-time"). Kept.
- Event/submission/judging dates: identical in AGENTS.md, ai-context, plain-language, requirements, overview, plan. The one "tomorrow (Friday Nov 13)" quote is an explicitly labeled *stale user-heard claim* with its correction attached (plain-language §3.4 + correction 11).

## 6. `.gitignore` — created by this review (it did not exist)

`/home/ali/Nasa_Hackathon/.gitignore` now covers, with comments tied to the README layout and the F1 tile budget:

- **Secrets/environments:** `.env`, `.env.*` (with `!.env.example`), `*.pem`, `*.key`, `secrets.*`, `credentials*`, token/service-account JSON.
- **Python (engine/):** `__pycache__/`, `*.py[cod]`, egg-info, `.venv/`/`venv/`, pytest/mypy/ruff caches, `.ipynb_checkpoints/`, coverage, `dist/`, `build/`.
- **Node (app/):** `node_modules/`, `.npm/`, `.pnpm-store/`, debug logs, `*.tsbuildinfo`, `app/dist/`.
- **Large planetary data:** `data/raw/` (never committed; provenance in `data/PROVENANCE.md`), raw-format rasters anywhere (`*.tif`, `*.tiff`, `*.img`, `*.hgt`, `*.nc`, `*.h5`), tile pyramids (`tiles/`, `**/tiles/` — 100s of MB per F1).
- **Still allowed:** all documentation (`docs/`, `requirements/`, README, AGENTS) and small `data/processed/` artifacts (JSON/GeoJSON/PNG — no rule ignores them, matching README "committed if small"). The only explicit negations remaining are `!.env.example` and `!.vscode/extensions.json`.

Deliberate choices: screenshots/GIFs in `assets/` are **not** globally ignored (README plans to commit demo
assets); the judged video is hosted externally per the Submission Guide, so no `*.mp4` rule was imposed —
the team should still avoid committing large videos (noted, not enforced).

**Same-day amendment (R3, coordinator-reported blocker).** The file as first created ended with a blanket
`!data/processed/**` negation intended to keep small processed artifacts trackable — but a later `!`
re-includes *everything* it matches, so it also re-included nested secrets and rasters under
`data/processed/`. `git check-ignore` differential in an isolated temporary Git fixture (project untouched,
no project Git operations): **with the old rule**, `data/processed/.env`, `data/processed/private.key`, and
`data/processed/huge.tif` were all "allowed"; **without it** they are ignored while
`data/processed/route.json` stays allowed. The negation was removed (small JSON/GeoJSON need no negation —
nothing ignores them). Full fixture result, 28/28 assertions PASS:

- **ignored as required:** `data/processed/{.env, private.key, secrets.json, huge.tif, sub/deep.key, model.nc}` · `data/raw/{huge.tif, foo.json}` · `.env` · `app/.env.production` · `deploy.pem` · `node_modules/` (root and `app/`) · `engine/__pycache__/` · tile pyramids `tiles/` and `app/tiles/` · `dist/`
- **allowed as required:** `data/processed/{route.json, sites.geojson, costgrid.npz, thumb.png}` · `data/PROVENANCE.md` · `.env.example` · `docs/documentation-review.md` · `requirements/competition-requirements.md` · `README.md` · `assets/screenshot.png` · `.vscode/extensions.json`

Fixture lived in `/tmp` and was deleted after the run.

## 7. Unresolved / accepted items (none blocking publication)

1. **Cairo-local rules unconfirmed** (by design, in [`../requirements/open-questions.md`](../requirements/open-questions.md)): exact local cutoff, leader-only submit, local edit lock, pre-work boundary for downloads, the unverified Nov 7 local-registration rumor, People's Choice format. These need *written* Local Lead answers; the docs correctly refuse to resolve them silently.
2. **LICENSE sign-off pending (U3)** — placeholder by AGENTS rule 6; Apache-2.0 proposed with Terms-based rationale in technical-approaches §7.
3. **Artemis II gloss "(2026)"** (plain-language §7) — not re-verified against the current NASA schedule in this pass; recheck before final submission copy.
4. **OLTARIS "validated vs RAD (Slaba et al. 2025)"** (technical-approaches §1.4) — cited third-party claim, not content-verified by the independent review or this one; keep as cited context, never as validation of *our* outputs.
5. **THEMIS "~20% accuracy / 10–15% precision"** — already flagged by the independent review §5 as not content-verified; the softening recommendation ("~10–25%" on-screen or verify from the PDF) still stands for any slide/UI copy.
6. Cosmetic, left as-is: `overview §5` calls license "open-questions #4 partially closed" while `open-questions.md` itself doesn't annotate #4 (its "Unknown specifics" text is compatible); `competition-requirements` line 32 maps the FAQ-vs-Cairo-page date conflict to open-questions #2 (loose but defensible); `mapping-options` §15 says "rules/open-questions #3" (stale "rules/" prefix inside the preserved research record — Errata policy, not worth an entry).

## 8. What this review did NOT check (stated plainly)

- **External URLs/DOIs were not re-fetched** — live verification was done 2026-11-13 by the technical-approaches worker and the independent review (their source registers); this review checked internal consistency and integration only.
- **Scientific numbers were checked for cross-document consistency**, not re-derived or re-verified against papers (the independent review re-derived/benchmarked the load-bearing ones; its §9 "not verified" list still applies).
- The official challenge page and global guides were **not re-fetched** today; the audit assumes the 2026-11-13 captures in `requirements/` are current (the docs themselves carry the "recheck before final submission" warning).
- No code, build, or data pipeline exists yet, so nothing executable was tested.

*End of review. Files modified by this review: `.gitignore` (created), `requirements/competition-requirements.md`, `docs/ai-context.md`, `docs/24-48-hour-plan.md` (the two fixes in §3 + this file's map entry), `docs/documentation-review.md` (this file). No git operations were performed.*
