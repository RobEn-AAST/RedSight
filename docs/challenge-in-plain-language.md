# The Martian Map Challenge in Plain Language — RedSight Team Guide

**Written:** 2026-11-13 (Cairo day 1), by the documentation editor from the user's own plain-English
interpretation of the official challenge page, fact-checked against the live official text.
**Official page (single source of truth for the challenge wording):**
[Interplanetary Survival Guide: Martian Map](https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/)
— Details and Resources tabs, verified live 2026-11-13.
**Companion docs:** full section-by-section account with quotes in
[`../requirements/challenge-details-and-resources.md`](../requirements/challenge-details-and-resources.md);
participation/submission/judging rules in
[`../requirements/competition-requirements.md`](../requirements/competition-requirements.md);
our answer in [`competition-overview.md`](competition-overview.md).

This page keeps the useful everyday-language explanation the team already wrote, **with the errors
corrected** (§5 lists every correction). Any teammate or AI agent should be able to understand the
competition, what is actually required, what our project idea is, where its scientific limits are, and
what happens next — from this one page.

---

## 1. How to read every claim in this repo (label vocabulary)

| Label | Means | Example |
|---|---|---|
| **Must** | Required by an official rule; failing it risks ineligibility | "≥1 NASA data/resource for any Global Award" (Submission Guide) |
| **Recommended** | The challenge text encourages it, but the words are permissive ("you may consider", "if possible") | "at least three kinds of data" |
| **Optional** | Official text says "you may (but are not required to)" | HUD, tablet, habitat-display formats |
| **Team choice** | Our decision, not a rule of the competition | Site = Gale/Mount Sharp; name = RedSight |
| **Observed** | Direct instrument measurement of/at Mars | HiRISE image, RAD dose rate at the rover |
| **Derived** | Computed from observed data by a stated method | Slope from a DEM, mineral indicators from CRISM spectra |
| **Scenario** | Model, projection, or team assumption — an estimate, not a measurement | O2/time figures, radiation extrapolations, weather windows |
| **Unavailable** | No public data exists at the needed scale; must be shown as scenario or omitted | Spatial radiation map; rock-by-rock walkability |

Nothing in this repo is a guarantee of winning. Judging scores projects 1–5 on five criteria
(Impact, Creativity, Validity, Relevance, Presentation — [Judging & Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide/));
feature checklists below only describe how our demo *aims* to score well.

## 2. The challenge in one paragraph

NASA has decades of Mars data from robotic missions, but it is not yet layered together at the scale
of a single human outing. **Your challenge (official core wording):** "create a layered, integrated
view of a location or route on the Martian surface that pulls together data from multiple NASA science
missions and could help a human explorer plan and carry out a successful Marswalk while conducting new
and exciting science along the way." In everyday words: build one map screen — like a Google-Maps-style
layered view, but for Mars — where an astronaut can see the ground, the hazards, the weather/radiation
context, and the science targets of one walk, together.

## 3. Section-by-section, in plain language

### 3.1 The summary paragraph — **Must** (this is the actual deliverable)

- **What it asks for:** a map/tool/interface for an astronaut on a Mars surface mission, using NASA
  data and tools, showing a location or route as a layered, integrated view from multiple NASA
  science missions.
- **Plain reading:** one screen that fuses several NASA datasets for a small operations area, in the
  service of planning and executing one excursion ("Marswalk").
- **Why judges care:** *Relevance* — this sentence is the challenge; a project that answers it
  literally (layers + NASA data + astronaut use) scores on target. *Creativity* — how you fuse and
  present the layers is where originality shows.

### 3.2 Background — context, no deliverable

- **What it says:** astronauts (as in the Artemis II lunar flyby) add real-time judgment robots can't;
  existing tools — JPL's Mars Trek and the USGS–NASA Planetary Geologic Mapping Program — are "built
  for regional and global views rather than the hyperlocalized areas" astronauts will actually walk.
- **Plain reading:** don't map all of Mars; pick a small local operations area and do it deeply. The
  1-km-zone example the user gave is **illustrative (team framing), not mandated** — the official text
  never names a size.
- **Why judges care:** *Impact* — the pitch "existing tools are regional; we are the missing hyperlocal
  layer, built on their data" is exactly the gap the challenge text describes.

### 3.3 Objectives — the actual asks

**A. Choose a science goal and a location — effectively required (the tool must be *for* something), the specific choice is yours.**
The page's worked example: learning about **boxwork** formations — ridges formed where mineral-filled
cracks in rock resisted erosion better than the surrounding rock, so they stand out after erosion —
which **Curiosity studied in 2025 in the Mount Sharp region (Gale crater)**. You may instead pick a
well-explored rover site (rich data) *or* a less-studied area (harder, also allowed). Gale and Jezero
are **not the only permitted sites** — they are just the two with surface rovers on them.
*Why judges care:* Relevance (a clear science purpose) and Validity (your data actually covers the site).

**B. Data kinds — recommended, not a mandatory threshold.**
Official wording: "**You may consider including at least three kinds of data**—optical, thermal,
spectral, topographic, geophysical, atmospheric, radiation, and chemical are a few examples—layered or
combined…". "You may consider" = suggestion. Three is not a pass/fail gate, and the list is open-ended
("a few examples"). Everyday meanings:
- **optical** — normal camera images (orbital or surface);
- **topographic** — heights and slopes (a DEM);
- **atmospheric** — weather context (pressure, temperature, wind, dust);
- **radiation** — exposure context;
- **thermal** — ground-temperature/thermal-inertia data (how the ground holds heat);
- **spectral / chemical** — rock composition from reflected-light fingerprints or measured chemistry;
- **geophysical** — gravity, subsurface radar, etc.

Two honesty notes the user asked us to verify:
- **USGS geologic maps alone are not spectral or chemical data.** They are human *interpretations*
  (Derived) of what units are where — useful context and site evidence, but they do not by themselves
  satisfy "spectral" or "chemical". Spectral needs CRISM-type data; "chemical" would need, e.g., rover
  APXS/ChemCam measurements at stations.
- **Rover weather (REMS) and radiation (RAD) are measured at the rover, not along your route.** They are
  rover-local time series, not per-route-cell safety sensors (see §5, corrections 7–8).
*Why judges care:* Validity — layers honestly labeled by what they really are; Relevance — "NASA data
is integral to the project's success" is a scored criterion.

**C. Astronaut safety and a route — safety framing encouraged; the route itself is "if possible".**
Official wording: "consider what information might help a crew move safely" (radiation environment,
space weather, suit mobility, carried equipment) and "**if possible**, include a route map that shows
where the astronaut will travel… while avoiding significant obstacles such as large rock formations."
Plain reading: a route with obstacle avoidance is a *recommended* feature that strengthens the demo —
not a submission requirement. Our route outputs must be worded as **modeled routes/estimates**; the
data cannot certify a "safe route" or "safe time remaining" (see §5, correction 9).
*Why judges care:* Validity — overclaimed safety is the easiest way to lose points with a
science-literate judge; honest labels protect it.

### 3.4 Potential considerations — **all optional**

Introduced by "You may (but are not required to) consider the following": habitat/tablet/HUD (or any
format you imagine); static, interactive, or map-generating tools; inspiration from maps of Earth, the
Moon, other planets, exoplanets; past/future/no time frame; point-of-view (POV) surface imagery;
rovers/robots transporting crew or astronauts in pairs. The user's clickable web/tablet/HUD prototype
idea is a **team choice** exercising these options — a good demo shape, not a requirement.

> **Dated note:** the user heard "the Resources tab unlocks tomorrow (Friday Nov 13)". That is stale —
> **the Resources tab is live** (verified 2026-11-13). The page only warns that *more* resources may be
> added before the hackathon; recheck before final submission.

### 3.5 Resources tab — five suggested starting points, not a dataset manifest

| Resource | What it really is | Watch out |
|---|---|---|
| [JPL Mars Trek](https://trek.nasa.gov/mars/) | NASA's Mars map portal with landing-site data layers | Great for bulk export; its Curiosity path layer ends in 2018/2019 — stale (see research docs) |
| [USGS–NASA Planetary Geologic Mapping Program](https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars) | Standardized geologic maps of Mars | Interpretation (Derived), coarse at Marswalk scale; not spectral/chemical data by itself |
| [Curiosity's proposed path up Mount Sharp](https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/) | An animation/map of a *proposed* route and regions of interest | A 2019 proposal and style reference — not the actual traverse, not astronaut-route data |
| [NASA Worldview](https://worldview.earthdata.nasa.gov/) | **Earth** satellite imagery (NASA Earthdata) | **Not Mars imagery.** Inspiration for map interaction only |
| [Perseverance Raw Images](https://mars.nasa.gov/mars2020/multimedia/raw-images/) | 1M+ surface images from Perseverance | Perseverance is at **Jezero**; for Gale use [Curiosity raw images](https://mars.nasa.gov/msl/multimedia/raw-images/) |

Using all five is not required; the challenge's third-party rule (follow each non-U.S.-Government
site's data-use parameters) and the Submission Guide's full-source-disclosure rule still apply.

### 3.6 Rules that actually gate us (from the official 2026 guides, not the challenge page)

- **Must:** team of 1–6, all **confirmed (not waitlisted)** at the same Local Event (Cairo); one team,
  one challenge; project page fully filled (8 fields incl. **NASA Data** and **SI disclosure**);
  **≥1 NASA data/resource** for any Global Award; demo = ≤30 s video (English subtitles if non-English)
  **or** ≤7 English slides, public link — exceeding limits ⇒ ineligible for Global Judging; English
  project page; no minors' images/names/voices; SI content watermarked and without NASA branding.
- **Timing:** project submission opens **Sat Nov 14, 9:00 a.m.** Local-Event time; closes **Sun Nov 15,
  11:59 p.m.** (Africa/Cairo). Cairo's Saturday includes local judging ⇒ working rule: **submit before
  Saturday's Cairo judging** (confirm exact local cutoff with the Local Lead — open question #1).
- **Edit-and-resubmit:** the official global rule says you may edit and resubmit "as many times as
  you'd like until the end of the hackathon; only your last saved submission will be reviewed." The
  supplied Cairo compilation's claim that *nothing can be changed after submission* is **unverified and
  contradicted by the global guide** — treat it as a possible local rule and get any local lock in
  writing from the Lead before relying on post-submission fixes.
- Full checklist with links: [`../requirements/competition-requirements.md`](../requirements/competition-requirements.md).

## 4. Our answer in one screen (RedSight — team choice)

**RedSight** (name and site are team decisions, not requirements): a hyperlocal Marswalk
decision-support planner for **Gale crater / lower Mount Sharp** — layered map (HiRISE optical, DEM
slope/hillshade, THEMIS thermal inertia as a sand *proxy*, CRISM-derived mineral indicators, geologic
units), science-goal picker, modeled routes with time/O2 estimates and a turn-back
(point-of-no-return) marker, and a provenance inspector that badges every layer and constant
(Observed / Derived / Scenario / Unavailable). Full plan: [`competition-overview.md`](competition-overview.md)
and [`technical-approaches.md`](technical-approaches.md).

The user's quick checklist — preserved as a **proposed competitive demo, not a requirement and not a
win guarantee**:
1. Site: Gale / Mount Sharp (user decision; challenge permits any site). ✅ decided
2. One map screen as tablet/HUD-style demo. *(our planner UI; HUD is a Should-tier stretch)*
3. Three–four toggleable layers: optical, slope/obstacles, geologic/spectral, weather/radiation context.
4. One modeled route with photos. *(route = recommended by the challenge, core to our demo; photos
   pinned approximately — see correction 10)*

## 5. Corrections to the user's interpretation (kept where right, fixed where not)

| # | User's reading | Verdict | Correction |
|---|---|---|---|
| 1 | "You only need to pick 3 data kinds" | **Suggested, not mandatory** | Official wording is "you may consider including at least three kinds"; not a threshold, and the list is examples |
| 2 | Route "must" draw a safe walking line with green/red zones and alerts | **Route is optional ("if possible"); "safe" claims unsupported** | We deliver a modeled route as a demo centerpiece; copy says *modeled*, never *safe*; alerts would be scenario cards, not real-time sensor warnings |
| 3 | Mount Sharp or Jezero as the pick | **Team choice, not a constraint** | Challenge permits any site, including poorly studied ones; we chose Gale/Mount Sharp (user decision D02) |
| 4 | Worldview as a mapping resource | **Worldview is Earth imagery** | Inspiration only; never a Mars data source |
| 5 | (implied by site talk) Curiosity/Perseverance interchangeable | **Perseverance = Jezero; Curiosity = Gale** | Match imagery to site; Curiosity for Gale |
| 6 | Three layers table incl. USGS geology as composition | **Geologic maps are interpretation, not spectral/chemical data** | Spectral claims need CRISM-type data (or rover-chemistry for "chemical"); SIM 3292 = context layer |
| 7 | Weather widget per location | **REMS is rover-local** | No spatial weather product at walk scale; show a rover-local climatology card + scenario window (MCD is a coarse global model) |
| 8 | Radiation alerts per route cell | **RAD is a single rover-local dosimeter** (the only one on Mars) | No spatial radiation data exists; context card + labeled scenario modulation only |
| 9 | "Safe route" / "safe time remaining" outputs | **Unsupported safety promises** | Banned wording; use "modeled route / turn-back estimate within stated assumptions"; reserve = labeled team policy |
| 10 | Rover photos pinned at exact spots | **Photos may not have exact coordinates** | Raw images carry sol/site/camera metadata; pin by region and label approximate |
| 11 | "Resources tab unlocks tomorrow (Nov 13)" | **Stale** | Tab verified live 2026-11-13 |
| 12 | JPL as a NASA branch | **JPL is a NASA-sponsored federally funded research and development center (FFRDC) managed by Caltech** | See [nasa.gov/ffrdc](https://www.nasa.gov/ffrdc) and [jpl.nasa.gov](https://www.jpl.nasa.gov) — "a NASA center managed by Caltech" is the safe phrasing |
| 13 | Gale = "only site with a functioning weather station" (heard in team discussion) | **Jezero also has one — MEDA on Perseverance** | Gale holds the *longest-running* station (REMS, since 2012) and the *only* surface radiation monitor (RAD); Jezero has MEDA since 2021 ([JPL: first weather report from Jezero](https://www.jpl.nasa.gov/news/nasas-first-weather-report-from-jezero-crater-on-mars)) |

**Thermal inertia, precisely:** THEMIS thermal inertia (~100 m/px) is a *coarse proxy* for surface
material — low values suggest finer, looser material (potential sand/dust), high values suggest
rockier or cemented ground. It is **not proof of a sand sink** at boot scale; a 6×6 km ops box contains
only ~60×60 THEMIS cells. We use it as a labeled soft-cost proxy, displayed at its true blocky
footprint. (Also: thermal inertia ≠ proof of anything per-step — "walking hazard" would be our
invented transfer function, labeled as such.)

## 6. Why judges care — the five criteria mapped (scores 1–5 at every level)

| Criterion (official) | What it rewards | Where RedSight aims |
|---|---|---|
| **Impact** | Significant problem, who benefits | Human-Mars excursion planning gap the challenge itself names |
| **Creativity** | Original/novel vs existing ideas | Hyperlocal fusion + provenance inspector + turn-back field interaction |
| **Validity** | Scientifically sound, feasible, evidenced, usable | Verified datasets, cited constants, Observed/Derived/Scenario labels, tests in the build plan |
| **Relevance** | Engages the challenge's goals; NASA data integral | Every layer is NASA/USGS/PDS-sourced; the tool *is* the challenge sentence |
| **Presentation** | Story, structure, clarity; judges score the demo + full project | 7-slide/30-second demo plan, honest one-sentence pitch, working public URL |

Aiming well on all five is our strategy — it is still a competition; nothing here guarantees an outcome.

## 7. Glossary (everyday definitions)

- **Marswalk / EVA** — extravehicular activity: an astronaut's walk outside the habitat/ship in a
  spacesuit. **Habitat** — the crew's shelter/base. **HUD** — heads-up display projected on the helmet
  visor. **POV imagery** — photos taken from a rover's/astro­naut's eye level.
- **Artemis II** — NASA's crewed lunar-flyby mission (2026), cited by the challenge as evidence for
  why humans in the field matter. **JPL** — NASA's Jet Propulsion Laboratory: a NASA-sponsored FFRDC
  managed by Caltech; built Curiosity and Perseverance and runs Mars Trek.
- **Layered, integrated view** — one map where several datasets stack and interoperate (like map apps'
  traffic/satellite/transit toggles).
- **Regional/global vs hyperlocal** — whole-Mars or whole-crater views vs the ~km-scale box one
  astronaut actually walks. **Operations (ops) area** — our ~6×6 km demo box (team choice).
- **Curiosity (MSL)** — NASA rover at **Gale crater** since 2012; hosts REMS and RAD.
  **Perseverance (Mars 2020)** — NASA rover at **Jezero crater** since 2021; hosts MEDA.
- **Mount Sharp (Aeolis Mons)** — the layered mountain Gale's floor encircles; Curiosity is climbing
  its lower slopes. **Boxwork** — erosion-resistant mineral-vein ridges; Curiosity's 2025 study
  (sulfate layer) is the challenge's example science goal.
- **HiRISE** — high-resolution camera (0.25–0.5 m/px) on Mars Reconnaissance Orbiter; also makes **DTMs**
  (digital terrain models via stereo pairs). **DEM** — digital elevation model (heights grid; slope is
  derived from it). **CTX** — context camera, ~5–6 m mosaic. **MOLA** — laser altimeter global DEM,
  463 m/px (far too coarse for walking routes). **THEMIS** — thermal imager; its **thermal inertia**
  products hint at particle size (sand vs rock) at ~100 m scale. **CRISM** — spectrometer mapping
  minerals from light fingerprints (~18 m targeted, ~200 m mapping).
- **RAD** — Curiosity's Radiation Assessment Detector: the only surface radiation measurement on Mars
  (rover-local point, ~0.64–0.67 mSv/day GCR average). **REMS** — Curiosity's weather station
  (rover-local). **MEDA** — Perseverance's weather station at Jezero. **MCD** — Mars Climate Database,
  a coarse (~200–330 km cells) global climate model.
- **PDS** — NASA's Planetary Data System (the archive of mission data). **USGS Astrogeology** — the
  U.S. Geological Survey's planetary mapping branch; SIM 3292 = its global geologic map of Mars.
- **Sol** — a Martian day (~24 h 39 m). **Ls (solar longitude)** — Mars season coordinate.
- **Planetocentric vs planetographic latitude** — two latitude definitions that differ by ~3.3 km at
  Gale's latitude; mixing them silently shifts maps (a real trap — see research docs).
- **SEP** — solar energetic particle event (a radiation storm from the Sun); no operational Mars SEP
  forecast exists (research only) — labeled Scenario/Unavailable in our app.
- **PNR / turn-back point** — point of no return: farthest point from which the crew can still return
  within a reserved consumables budget (our modeled estimate — Scenario).
- **RedSight** — our project name (team choice). Earlier drafts said "Marswalk Planner (working
  title)"; superseded.

## 8. Source hierarchy (what overrides what, when documents disagree)

1. **Official 2026 challenge page** (Details/Resources) and **official global guides** — Project
   Submission Guide, Judging & Awards Guide, Participant FAQs, Terms ([spaceappschallenge.org](https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/), [/resources/](https://www.spaceappschallenge.org/resources/)).
2. **Official Cairo Local Event page** ([2026/local-events/cairo](https://www.spaceappschallenge.org/2026/local-events/cairo/)) — schedule and local specifics; ask the Local Lead when it conflicts.
3. **Supplied Cairo compilation** (`~/Downloads/space-apps-cairo-2026-requirements.md`) — organizer
   guidance whose original source URL is still missing; items verified against (1) are marked, the rest stay **unverified**.
4. **The user's interpretation** (this page's origin) — faithful where verified, corrected where not (§5).
5. **Team design proposals** (competition-overview, technical-approaches, research docs) — choices and
   evidence, never rules.

Primary NASA/JPL/USGS/PDS sources are required for any *new* factual claim; organizer-specific
unknowns (leader-only submission, local edit lock, exact Cairo cutoff) stay explicitly flagged in
[`../requirements/open-questions.md`](../requirements/open-questions.md) until answered in writing.
