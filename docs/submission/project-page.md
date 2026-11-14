# Project page text (draft, 2026-11-13, Marwan): delivery pool item 3

One section per required field of the Space Apps project page (Submission Guide; list in
[`../../requirements/competition-requirements.md`](../../requirements/competition-requirements.md) §5). English.
**Before pasting:** recheck every "built" claim against the deployed app, replace the bracketed placeholders,
and have the team confirm the SI answer. Wording rule: AGENTS rule 3 (no "safe route", "certified",
"real-time", "validated", …).

---

## Project Name

RedSight

## High-Level Project Summary (≈ 150 words)

RedSight is a walk planner for astronauts exploring Mount Sharp in Gale crater, where NASA's Curiosity rover
is driving today. NASA's Mars maps are built for regional and global views; a crew of two on foot needs a
plan for the next few kilometres and the oxygen it carries. RedSight layers NASA orbital and rover data on a
walk-scale map, lets the crew pick a science stop (Curiosity's boxwork 360 sites and drill sites), and plans
two modeled routes: fastest and lowest-hazard. For each it estimates time and oxygen, keeps a reserve that is
never planned, and marks the modeled turn-back point. Mission Replay then plays the walk: two astronauts move
along the route, the oxygen gauge drains, and when oxygen gets low the plan switches to the fastest way home
on its own and says so. Every number carries its source and an Observed, Derived or Scenario label.

## Link to Project Demo

[≤ 30 s video or ≤ 7 slides link]: script and outline in [`demo-script.md`](demo-script.md).

## Link to Final Project

[public app URL] · code: https://github.com/RobEn-AAST/RedSight

## Detailed Project Description

**What it does.** On a map of the Mount Sharp boxwork area (about 6 × 6 km at 137.335–137.435°E,
4.75–4.85°S), the crew:
1. sees NASA imagery and data layers, each labeled Observed / Derived / Scenario;
2. picks a science stop at a real Curiosity position (boxwork 360 sites, drill sites, the rover's current
   position), with Curiosity's own raw photos from that sol [check: the stop card shows "photos pending" on
   2026-11-13; drop this clause if the photos aren't on screen];
3. compares two modeled routes (fastest vs lowest-hazard) with time and oxygen per crew member;
4. drags a turn-back slider: with less oxygen, the modeled turn-back point moves toward the habitat;
5. plays Mission Replay: the walk with an oxygen gauge, status callouts every 10 %, an automatic switch to the
   fastest way home when the lowest-hazard return no longer fits, and drills (suit leak, hard work).

**How it works.** A Python engine turns the elevation model into slope and a walking cost, and finds routes
with a shortest-path search (scipy Dijkstra) from the habitat. Time and oxygen come from a published walking
metabolic model with a suit factor [Ali: confirm the model you shipped]. The browser app (React, MapLibre)
only reads the engine's files and compares numbers against the budget, so what's on screen is the engine's
numbers. All constants live in one file with their sources.

**The oxygen model (Scenario).** Usable suit oxygen 385 L (EMU data); a reserve of max(25 % of the tank,
30 min at the Apollo walkback rate) is never planned; the way home is planned 20 % more expensive than
expected; a pair is limited by the hungrier suit. Sources: [`../demo-focus-plan.md`](../demo-focus-plan.md) §9c.

**Why it matters.** A one-way signal to Earth takes up to about 22 minutes, so the crew has to decide on
site (NASA Langley, ASCEND 2022, NTRS 20220013418). RedSight precomputes the plan and its limits so those
decisions are quick.

**Honesty.** This is a decision-support prototype. Routes, times and oxygen are modeled estimates, not
measurements or guarantees. Radiation (RAD) and weather (REMS) are single rover-local measurements; no
walk-scale radiation or weather map exists, and the app says so.

**Tools.** Python (NumPy, SciPy, GDAL) [confirm], TypeScript/React, MapLibre GL JS, Vite, Node test runner.

## Use of Super Intelligence (SI)

*Updated 2026-11-14 from the repository and the team's answers.*

**Idea and decisions: people, not SI.** The team chose the problem framing, the site (Gale crater / lower
Mount Sharp, boxwork), the features, the oxygen model's sources and the data sources. Per the Submission
Guide, SI was not used to come up with how to solve the challenge.

**SI used to build it (development tools):**
- **Claude Code** (Anthropic; models Claude Opus 5.5 and Claude Sonnet 5.5, credited as co-author on ~96
  commits): helped write and test code (app, engine, server, capture scripts), summarize papers and
  documentation, and edit text. Team members reviewed, ran and tested every change before merging.
- **Claude (claude.ai)** and **Manus AI**: research help, drafting and editing text, and planning; the team checked
  every claim against primary sources before using it.

**SI inside the app (runtime features, labeled in the UI):**
- **Voice/text copilot:** a large language model answers questions about the mission plan and can operate
  mission controls through checked app actions (Groq `openai/gpt-oss-120b` / `gpt-oss-20b`, or Google Gemini
  ; a Gemini Live voice version is in progress). Its answers use the app's own modeled numbers; it is a prototype aid, not a
  safety system.
- **Speech-to-text:** Whisper (Groq `whisper-large-v3-turbo` in the cloud, or `whisper-tiny.en` in the browser).
- **Text-to-speech:** Kokoro-82M (Apache-2.0) or the browser's speech voice.

**SI-generated media in our submission (disclosed):**
- **AI-generated audio:** the narration of the walkthrough video and the two astronaut voice clips on
  slide 6 of the deck are synthetic voices (Kokoro TTS). Stated on the video's end card, in its file metadata
  and in the slide notes.
- **AI-generated image:** the landing page's share image (`landing/public/assets/og-image.jpg`) is AI-generated;
  it carries a visible "AI-GENERATED IMAGE" mark.
- **No other AI-generated images or video:** map and photos are NASA/USGS data, screen recordings are of the
  working app, and the 3D astronaut model (`app/src/copilot/assets/astronaut.glb`) was made by the team.
- No NASA logos or branding in any AI-generated content.

## NASA Data

Only list what the final app actually shows. Status on 2026-11-13: ✅ in the app now, ⏳ planned (owner).

| Data | How we use it | Status |
|---|---|---|
| HiRISE mosaic of Gale, via NASA/JPL Mars Trek (`curiosity_hirise_mosaic`) | Base map image of the ops area | ✅ preview image · ⏳ tiles (Youssef) |
| HiRISE 1 m DTM of lower Mount Sharp (Mars Trek / PDS) | Elevation → slope, hillshade, walking cost, routes | ⏳ (Ali, Youssef) |
| Curiosity rover waypoints (NASA MMGIS `MSL_waypoints.json`) | Positions of the science stops and the rover today | ✅ |
| Curiosity raw images (mars.nasa.gov raw image API) | Photos at each stop, matched by sol | ✅ in `stops.json` |
| JPL Photojournal PIA26559, PIA26696 (Mastcam 360 views) | Boxwork 360 stops | ✅ (cards) |
| MSL RAD (PDS PPI) + Hassler et al. 2014 | Surface radiation dose card | ✅ |
| MSL REMS (PDS Geosciences) | Weather context card | ✅ |
| THEMIS thermal inertia (Mars Odyssey) | Sand proxy layer | ⏳ (Youssef) |
| CRISM mineral indicators (Mars Trek) | Mineral layer | ⏳ (Youssef) |
| USGS SIM 3292 geologic map | Geologic units layer | ⏳ (Youssef) |
| NASA EMU data (usable O₂), Apollo walkback planning, NASA-STD-3001 | Constants of the oxygen model and dose limit | ✅ (constants file) |

## Space Agency Partner Data and Other References

- Hassler et al. 2014, *Science* 343:1244797 (RAD surface dose); Gómez-Elvira et al. 2014, *JGR-Planets* (REMS).
- Norcross et al., NASA/TP-2010-216115 (suit metabolic factor); McBrayer et al., ASCEND 2022, NTRS 20220013418
  (Earth communication delay).
- Full source lists with access dates: [`../technical-approaches.md`](../technical-approaches.md),
  [`../demo-focus-plan.md`](../demo-focus-plan.md) §19.
- No partner-agency data used so far. [Add HRSC/ESA here only if used: CC BY-SA 3.0 IGO.]
