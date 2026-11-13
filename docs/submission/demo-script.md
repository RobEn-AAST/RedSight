# Demo script + slide outline (draft, 2026-11-13, Marwan)

Delivery pool items 2 (slides) and 4 (demo script) in [`../team-plan.md`](../team-plan.md) §3. This is a
**draft written against the app on `main` with mock routes**: retake every screenshot and recheck every
number once Ali's routes and Youssef's tiles land. Slide plan source: [`../demo-focus-plan.md`](../demo-focus-plan.md)
§14 and §17.

**Rules that shape this (Must, official):** the submitted demo is a **video ≤ 30 s or ≤ 7 slides** (title and
intro included), hosted publicly; slides carry the team name, member names and the challenge
([`../../requirements/competition-requirements.md`](../../requirements/competition-requirements.md), Submission
Guide). Over the limit = not eligible for Global Judging. Video vs slides is still open (U2 / D03); slides
are the default. Judges score Impact, Creativity, Validity, Relevance, Presentation (same file, §6).

**Wording (AGENTS rule 3):** say "modeled route", "modeled estimate", "turn-back point (Scenario)". Never
"safe route", "safe time remaining", "certified", "flight-safe", "real-time", "validated".

## 1. Live 60-second walkthrough (Cairo judging table)

What's built today is marked ✅; ⏳ = waiting on another owner (skip that line if it isn't merged).

| Time | Click | Say (short) | Status |
|---|---|---|---|
| 0–8 s | Open the **Map** workspace | "This is Mount Sharp in Gale crater, where Curiosity is driving now. Every layer is NASA data and carries a badge: Observed, Derived or Scenario." | ✅ (preview image; ⏳ real tiles) |
| 8–15 s | Click stop **S1** (first boxwork 360) | "We pick a science stop: real Curiosity sites (360 views, drill sites)." | ✅ |
| 15–22 s | Point at route cards **A / B** | "The engine plans two walks: fastest, and lowest-hazard. Time and oxygen for each are modeled, not measured." | ✅ mock routes · ⏳ real routes |
| 22–30 s | Choose **B · Lowest hazard**, drag the **turn-back** slider down | "Less oxygen in the suit, and the turn-back point moves toward the habitat. The reserve is never planned." | ✅ |
| 30–48 s | Press **▶** in Mission Replay (voice on) | "Two astronauts walk the plan. When the oxygen gets low, it switches to the fastest way home on its own and says so." (amber dot, callout) | ✅ |
| 48–55 s | Click **Suit leak ×2** | "A contingency drill: oxygen use doubles and the plan recomputes; if home no longer fits, it turns them around at once." | ✅ |
| 55–60 s | Open one **source card** | "Every number links to its NASA source." | ✅ |

**Setup before judges arrive:** crew 2, load 15 kg (mission setup); stop S1; route B; slider ≈ 155 L
(with mock routes this makes the switch happen before the stop; recheck the value with real routes); voice on,
sound up; browser zoom 100 %; no other tabs.

## 2. Video cut (≤ 30 s, only if the team picks video)

Screen recording, no faces or voices of anyone under 18 (Cairo compilation rule, unverified; keep anyway).

| s | Shot | Caption on screen |
|---|---|---|
| 0–4 | Title card | RedSight · Martian Map · team name |
| 4–9 | Map with layers + stops | Walk-scale map of Mount Sharp from NASA data |
| 9–14 | Route cards A/B | Two modeled walks: fastest vs lowest-hazard |
| 14–18 | Slider drag, turn-back marker moves | Less O₂ → turn back sooner (reserve never planned) |
| 18–26 | Replay running, amber switch, crew walks home | O₂ low → switches to the fastest way home |
| 26–30 | Source card + URL | Every number sourced · public link |

## 3. Seven slides (outline + speaker notes)

| # | Slide | Screenshot / content | Speaker note | Criterion |
|---|---|---|---|---|
| 1 | **RedSight**: Interplanetary Survival Guide: Martian Map | Team name, 6 member names, challenge name | One line: a walk planner for astronauts on Mars | (required) |
| 2 | **Problem** | Global/regional maps vs a 2-person walk | Existing maps are regional; a crew on foot needs a walk-scale plan with an oxygen budget. A one-way signal to Earth takes up to ≈ 22 min, so the crew decides on site (NASA Langley, ASCEND 2022, NTRS 20220013418) | Impact |
| 3 | **Our map** | Map workspace with layers + stops + badges | Gale crater / Mount Sharp boxwork, where Curiosity is driving; why this site | Relevance |
| 4 | **Plan a Marswalk** | Route cards A/B with time and O₂ | Crew of 2, load, samples → fastest vs lowest-hazard; numbers are modeled (Scenario) | Validity |
| 5 | **Getting home** | Replay frame: amber switch + crew walking home + O₂ gauge | Reserve never planned; turn-back point; automatic switch to the fastest way home; drills | Creativity |
| 6 | **NASA data + honesty** | Data list + badge legend | Data types and missions used; Observed / Derived / Scenario / Unavailable; what we don't have (no spatial radiation or weather map) | Validity, Relevance |
| 7 | **What's next + links** | URL + repo | Tier 2/3 (360 + HUD, rover mode, Vision Pro); public link; repo | Presentation |

## 4. Screenshots to retake with real data

- [ ] Map with real tiles (Youssef) and ≥ 3 layers on, legend visible
- [ ] Route cards A/B for S1 with real routes (Ali)
- [ ] Replay mid-switch (amber dot visible, "return: fastest way" in the panel)
- [ ] Source card open on one number
- [ ] Remove the "Mock data" chip from every shot (it disappears when no file has `"_mock": true`)

## 5. Open before final

- Video vs slides (U2 / D03); who submits; exact Cairo cutoff ([`../../requirements/open-questions.md`](../../requirements/open-questions.md)).
- Data list on slide 6 must match the final README "NASA Data" section (delivery item 3).
