# RedSight — Competition Overview & User Proposal

**Owner:** Agent4 (technical strategy); edited 2026-11-13 by the documentation editor (project named
RedSight; MEDA/weather-claim correction; independent-review integration). **Written:** 2026-11-13 (Cairo day 1).
**Status:** Draft v1 — research-informed; dataset verdicts live in [`technical-approaches.md`](technical-approaches.md);
adversarially reviewed in [`research/independent-architecture-review.md`](research/independent-architecture-review.md)
(verdict: architecture sound and feasible after its corrections — F1–F8 now folded into the strategy docs).

This document separates **what the competition officially requires** (sourced from
[`requirements/competition-requirements.md`](../requirements/competition-requirements.md), verified against the
official 2026 global guides) from **what our team proposes** (the user's concept, below). Nothing in the
"User Proposal" section is an official requirement.

---

## 1. Official challenge — the parts that bind us

Condensed from the verified requirements file; full detail and links there.

| Dimension | Official rule (source: official 2026 guides / challenge page) |
|---|---|
| Core deliverable | "a map, tool, or interface a Mars astronaut could use during a surface exploration mission, using NASA data or tools" that gives "a layered, integrated view of a location or route on the Martian surface" |
| Data bar | "at least three kinds of data — optical, thermal, spectral, topographic, geophysical, atmospheric, radiation, and chemical" (introduced by "you may consider…": a **suggestion**, not a mandatory threshold; the list is examples) |
| Route map | Only "if possible" — route + obstacle avoidance is recommended, not mandatory |
| HUD / habitat / tablet formats | Explicitly optional ("You may (but are not required to)") |
| NASA data | ≥1 NASA data/resource mandatory for any Global Award; dedicated "NASA Data" project-page field; all sources fully disclosed |
| Third-party data | Must comply with each site's data-use parameters |
| AI / SI | Allowed with disclosure; must not generate the core idea; no NASA branding in generated content; watermark on SI images/video |
| Demo | ≤30 s video (English subtitles if non-English) OR ≤7 slides (English); public link; exceeding limits ⇒ ineligible for Global Judging |
| Language | English on project page and linked materials |
| Deadline | Project tab opens Sat Nov 14 9:00 a.m. Cairo; hard close Sun Nov 15 11:59 p.m. Africa/Cairo; Cairo local judging Saturday — working rule: **submit before Saturday judging** |
| Judging | Impact · Creativity · Validity · Relevance · Presentation, each 1–5 |

**Schedule reality (Cairo):** event runs Fri Nov 13 (opening, team allocation, mentorship, overnight build) and
Sat Nov 14 (judging, People's Choice). Effective build window ≈ **24 h to local judging, 48 h to global close**.
The "no pre-work" rule means all project artifacts must be produced inside this window; ask the Local Lead where
the boundary sits for dataset downloads and environment setup (open-questions #3).

## 2. USER PROPOSAL — hyperlocal Marswalk planner (team concept, not a rule)

As presented by the user; condensed but faithful. *Agent4's four-step reading of the concept — if the intended
outline differs, correct this section.*

### Step 1 — Choose a science goal
Rock/mineral target (e.g. boxwork veins, clays), or photo-documentation objective. The app then shows which
candidate sites in the operations area satisfy the goal.

### Step 2 — Configure the excursion
Solo or two astronauts (buddy rule) · foot, rover, or mixed · optional robot helper · carried load (kg) ·
time budget or auto-computed daylight/weather window.

### Step 3 — Engine computes reachability & routes
Cost grid + A* over hard constraints (slope, obstacles, sand/loose terrain, line-of-sight comms to habitat,
radiation/weather hazards), with return-reserve logic; one or two route options for comparison.

### Step 4 — Astronaut reviews and walks the plan
Habitat planner: 3D terrain with ≥3 toggleable data layers, science-site selection, routes, source/uncertainty
inspector. First-person HUD walk-through: heading, O2 state, next stop, turn-back / point-of-no-return marker.
Contextual real Curiosity photographs at matching locations.

### Extras (declared Stretch)
Mixed rover+walking legs; robot load-carrying support; two-astronaut buddy constraints; storm-abort/shelter
logic; weather time window; rover stereo photogrammetry as an input; AI/chatbot assistant.

### Proposed data inputs (user's list, to be verified in `technical-approaches.md`)
Slope/elevation (MOLA + HiRISE DTMs) · obstacles & sand (HiRISE, THEMIS thermal inertia) · science targets
(CRISM minerals, geology maps) · radiation (Curiosity RAD, NASA DONKI storm events) · weather/light (Curiosity
REMS, Mars Climate Database, sun angle) · suit/load & Mars gravity · comms line-of-sight to habitat ·
rovers/robots & partner · time/O2 consumption model.

## 3. How the proposal maps to the official challenge

| Official element | Our answer | Confidence |
|---|---|---|
| Core tool for an astronaut | Marswalk planner (map + route + consumables) | Direct hit |
| ≥3 data types layered (suggested, not required) | We target 6 verified types: topographic (HiRISE DEM), optical (HiRISE/Curiosity imagery), spectral (CRISM-derived), thermal (THEMIS), atmospheric (REMS/MCD), radiation (RAD) | Achievable — see inventory |
| Route map "if possible" | Modeled route with obstacles = center of the product (return-cost Dijkstra field core; A\* for interactive re-routes per review F2) | Above bar |
| Optional HUD/habitat formats | Both planned (planner UI first, HUD as Should/Stretch) | Feasible |
| NASA data integral | Every layer is NASA/JPL/USGS/PDS-sourced; provenance inspector is a feature | Differentiator |
| Validity criterion | Observed/Derived/Scenario/Unavailable labeling per layer; no safety claims beyond data | Differentiator — most teams will skip this |

**Strategic framing for judges:** the challenge text itself warns that existing tools (Mars Trek, USGS maps) are
"built for regional and global views rather than the hyperlocalized areas" — our product is exactly the
hyperlocal layer those tools lack, built on their data. That is the one-sentence pitch.

## 4. Site choice

**Gale crater / Mount Sharp (−4.6°, 137.4°E)** — the challenge's own worked example (2025 boxwork), among the
best-covered field sites on Mars (per the mapping research), holder of the longest-running surface weather
record (REMS, since 2012 — Jezero also has a functioning weather station, MEDA on Perseverance, since 2021;
[JPL weather report from Jezero](https://www.jpl.nasa.gov/news/nasas-first-weather-report-from-jezero-crater-on-mars)),
and the **only** surface radiation monitor on Mars (Curiosity RAD — verified; no dosimeter on any other lander).
The challenge permits any site, including less-studied ones; Gale is our team choice. Decided by the user
(D02 in the decision log closes with this confirmation).

## 5. Open decisions that gate strategy

1. **License** — research-resolved (open-questions #4 partially closed): official Space Apps Terms require an
   OSI license (or unrestricted content) **plus license documentation**, and default unspecified content to
   Apache 2.0 ⇒ propose **Apache-2.0**; per-source data credits mandatory regardless (PDS/USGS public domain;
   THEMIS credit line; HRSC CC BY-SA if used). Team sign-off pending.
2. **Demo format** — 7 slides vs ≤30 s video; pick by Friday night (D03).
3. **Hosting** — must be judge-accessible without login; static site (GitHub Pages/Netlify) preferred (D08).
4. **Cairo cutoff & local lock** — ask Local Lead before Saturday (open-questions #1).
5. **Pre-work boundary** — dataset downloads before/during the event (open-questions #3).

*Verdicts on every dataset claim in the user's input list, with primary sources, are in
[`technical-approaches.md`](technical-approaches.md).*
