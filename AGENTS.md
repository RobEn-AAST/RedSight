# AGENTS.md — RedSight (NASA Space Apps 2026, Martian Map challenge)

Short, project-specific working rules for any agent (or teammate) editing this workspace. Global
style rules come from the outer AGENTS files; this file adds only what is specific to RedSight.

## Project facts that must not drift

- **Project name:** RedSight. **Challenge:** Interplanetary Survival Guide: Martian Map (Intermediate),
  NASA Space Apps 2026, Cairo Local Event (Fri Nov 13 – Sat Nov 14, 2026). **Site:** Gale crater /
  lower Mount Sharp (team choice — the challenge permits any site). Name and site are **team choices,
  never stated as challenge requirements**.
- **Read [`docs/ai-context.md`](docs/ai-context.md) first** for the document map and current state.

## Source hierarchy (resolve conflicts by rank)

1. Official 2026 challenge page + official global guides (Submission/Judging/FAQs/Terms).
2. Official Cairo Local Event page; Local Lead answers in writing outrank guesses.
3. Supplied Cairo compilation (`~/Downloads/space-apps-cairo-2026-requirements.md`) — unverified
   organizer guidance; keep ✅/❌ verdicts against rank 1 visible.
4. The user's plain-language interpretation (corrected form lives in
   `docs/challenge-in-plain-language.md`).
5. Team design proposals (this repo's docs/) — choices and evidence, never rules.

## Hard rules

**Stay within scope.** Every AI session must keep its work within the current user request, the
user-approved RedSight scope, and the applicable NASA Space Apps Martian Map requirements in
`requirements/`. Do not add features, change the project purpose or site, or expand architecture,
research, or implementation beyond that scope unless the user explicitly directs it. Optional NASA
suggestions, stretch ideas, and research recommendations are not approval to implement them. If a
task requires expanding scope, explain the need and wait for explicit user direction before doing
the additional work.

1. **New factual claims need a primary source** (NASA / Space Apps / JPL / USGS / PDS / peer-reviewed),
   linked and dated. Organizer-specific unknowns (leader-only submit, local edit lock, Cairo cutoff)
   stay flagged in `requirements/open-questions.md` until answered in writing — do not silently
   resolve them.
2. **Label every capability claim**: Must / Recommended / Optional / Team choice for competition
   items; Observed / Derived / Scenario / Unavailable for data items (definitions in
   `docs/challenge-in-plain-language.md` §1). Never present scenario math as measurement, and never
   present a feature checklist as a guarantee of winning.
3. **Banned wording in any shipped copy:** "safe route", "safe time remaining", "certified",
   "flight-safe", "real-time", "validated" — use "modeled route/estimate" + stated assumptions. The
   turn-back/PNR marker is a Scenario estimate, never a guarantee.
4. **Preserve evidence, correct by errata.** `docs/research/*.md` are the evidence record: do not
   rewrite or delete findings (even refuted ones); add a dated correction/errata note pointing at the
   newer evidence (the independent review's findings F1–F8 are handled this way). High-level strategy
   docs (README, overview, technical-approaches, plan) absorb corrections inline.
5. **No pre-work violations:** the official rule forbids building the challenge project before the
   hackathon. Research/planning docs are fine; app code, dataset pulls for the build, and environment
   setup belong inside the event window unless the Local Lead explicitly permits otherwise
   (open-questions #3).
6. **No submission-side actions by agents:** no `git init`, remotes, pushes, publishing, deployment,
   or competition submissions without explicit user instruction. LICENSE placeholder stays until team
   sign-off (proposed Apache-2.0).
7. **Verify relative links and cross-references after editing** Markdown; new docs get an entry in
   `docs/ai-context.md` §2.
8. **Editing scope:** documentation only unless tasked otherwise — do not modify source code or
   `data/` content in documentation tasks; other agents may own those areas concurrently.
