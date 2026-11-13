# RedSight — Hyperlocal Marswalk Planner (Gale Crater / Mount Sharp)

> A hyperlocal Marswalk decision-support tool for Gale crater / Mount Sharp: pick a science goal, set your crew,
> load and time budget — get reachable sites, modeled routes, time/O2 estimates and your modeled turn-back point,
> on a map layered with real NASA data.

**NASA Space Apps Challenge 2026 — Cairo · Challenge: Interplanetary Survival Guide: Martian Map (Intermediate)**

> ⚠️ **Draft prepared during strategy phase (2026-11-13).** Project name decided: **RedSight** (was "Marswalk
> Planner, working title"). Links, badges and license are placeholders pending team decisions (see docs). No code
> exists yet — sections marked *(planned)* describe the 24–48 h build.

**Start here:** [docs/challenge-in-plain-language.md](docs/challenge-in-plain-language.md) (the challenge, the
glossary, and the corrections behind our framing) · [docs/ai-context.md](docs/ai-context.md) (workspace state &
navigation) · [AGENTS.md](AGENTS.md) (working rules for agents & teammates) ·
**[docs/demo-focus-plan.md](docs/demo-focus-plan.md) (current plan: Tier 1 base → Tier 2 360/HUD → Tier 3 Vision Pro)**.

---

## Why

Every existing NASA Mars mapping tool (Mars Trek, USGS maps) is, in the challenge's own words, "built for
regional and global views rather than the hyperlocalized areas" an astronaut actually walks. This project is the
missing hyperlocal layer: an operations-area-scale planner that fuses terrain, hazard, science-target,
atmospheric and radiation data into a walkable plan — with honest labels on what is measured, derived, or
simulated.

## What it does *(planned scope — Must tier; see [docs/24-48-hour-plan.md](docs/24-48-hour-plan.md))*

*Current scope is tiered — full detail in [docs/demo-focus-plan.md](docs/demo-focus-plan.md) §3.*

**Tier 1 — base (submitted first):**
- **Layered map** of a ~6×6 km area at the Mount Sharp **boxwork site** (137.335–137.435°E, 4.75–4.85°S):
  HiRISE optical (0.25 m), DEM hillshade & derived slope (1 m), THEMIS thermal inertia (sand proxy),
  CRISM-derived mineral indicators, geologic units.
- **Science stops** at real Curiosity positions: boxwork 360 sites, drill sites (Altadena, Valle de la Luna),
  today's rover position — each with real photos from that sol and the evidence behind it.
- **Crew setup** — crew of 1–2 (two by default, buddy rule), body mass, carried load, sample mass per stop.
- **Route planner** — fastest vs lowest-hazard routes over a precomputed Dijkstra return-cost field; modeled
  time and O2 from a cited metabolic model; **turn-back marker**, green/amber/red **return zones**, a
  **"don't go beyond" line**, and an automatic switch to the fastest way home when modeled O2 runs low — all
  *scenario estimates*, never a safety guarantee.
- **Provenance inspector** — every layer and model constant shows its NASA source, resolution, date, and an
  **Observed / Derived / Scenario** badge. RAD radiation and REMS weather appear as rover-local context cards.

**Tier 2 — extras:** rover vs foot mode (why the rover can't go somewhere, park-and-walk plan, walkback
check) · real NASA 360° panoramas at stops with a helmet-style HUD.
**Tier 3 — bonus:** the same 360 + HUD in Apple Vision Pro (WebXR) · 3D fly-along between stops.

## Data & provenance *(summary — full table with URLs, resolutions, dates in
[docs/technical-approaches.md](docs/technical-approaches.md))*

| Data | Type | Source (primary) | Status |
|---|---|---|---|
| HiRISE 0.25 m optical mosaic (Gale) | Optical | NASA/JPL Mars Trek / HiRISE (U. Arizona) | Verified accessible |
| 1 m DEM, lower Mount Sharp | Topographic | Mars Trek `Gale_DEM_SMG_1m` (PDS HiRISE DTM product) | Verified accessible |
| THEMIS IR / thermal inertia | Thermal | ASU Mars Odyssey THEMIS | Verified accessible |
| CRISM-derived mineral indicators | Spectral | NASA/JPL Mars Trek CRISM layers (JHU/APL instrument) | Verified accessible |
| Geologic map (global, SIM 3292) | Geologic | USGS Astrogeology | Verified accessible |
| REMS weather (Curiosity) | Atmospheric | PDS / CAB INTA-CSIC | Verified accessible |
| RAD surface radiation (Curiosity) | Radiation | PDS PPI | Verified accessible |
| Curiosity raw images | Optical (surface) | mars.nasa.gov raw-image API | Verified accessible |

**Honesty statement.** This is a *decision-support prototype*. Radiation is a single-point measurement at the
Curiosity rover (no spatial map exists); weather is rover-local climatology + global-model scenarios; time/O2
figures are model estimates from published physiology, not certified life-support numbers. The UI labels all of
this explicitly. See the provenance inspector in the app.

## Repository layout *(planned)*

```
├── README.md                 # this file
├── AGENTS.md                 # project working rules (agents & teammates)
├── LICENSE                   # team decision pending (Apache-2.0 proposed for our code)
├── docs/
│   ├── challenge-in-plain-language.md  # challenge explained + glossary + corrections
│   ├── ai-context.md                  # workspace state & navigation
│   ├── competition-overview.md
│   ├── technical-approaches.md
│   ├── 24-48-hour-plan.md
│   └── research/             # evidence: mapping-options.md, routing-options.md,
│                             #   independent-architecture-review.md (+ errata headers)
├── requirements/             # competition rules, challenge account, decisions, open questions
├── data/
│   ├── raw/                  # original downloads (not committed if large)
│   ├── processed/            # planning rasters, site lists, route graphs (committed if small)
│   └── PROVENANCE.md         # every file: URL, date, license/credit, transform applied
├── engine/                   # Python: DEM→rasters, cost grid, Dijkstra field (+A* re-route), O2 model, export
├── app/                      # web front-end (map, planner, inspector, HUD)
├── assets/                   # screenshots, demo GIF/video, poster
└── .github/ISSUE_TEMPLATE/   # build-task templates
```

## Credits & usage terms *(to finalize)*

- NASA/JPL-Caltech/MSSS/Univ. of Arizona (HiRISE, Curiosity imagery) · NASA/JPL Mars Trek · NASA/GSFC MOLA ·
  ASU THEMIS team (credit: NASA/JPL-Caltech/Arizona State University) · NASA/JHUAPL CRISM team ·
  USGS Astrogeology (SIM 3292) · NASA PDS (REMS, RAD) · CAB (CSIC-INTA) REMS team ·
  LMD Mars Climate Database (if used) · JPL Horizons (sun angles).
- U.S. Government works are generally public domain (credit requested); non-U.S. sources carry their own terms —
  collected in `data/PROVENANCE.md`. ESA/DLR HRSC products are CC BY-SA 3.0 IGO if used.
- **License:** the official Space Apps 2026 Terms require original content to be OSI-licensed (or
  restriction-free) **with license documentation included**, and state that unspecified content is distributed by
  NASA under Apache 2.0. We therefore propose an explicit **Apache-2.0 LICENSE** — team sign-off pending.
- No NASA logos/branding in any AI-generated content (Space Apps SI rule).

## Super Intelligence (AI) disclosure *(placeholder — complete before submit)*

AI tools were used for: research summarization, boilerplate code, copy editing. The core idea, architecture and
data selection are the team's. AI-generated imagery (if any) will be watermarked. Details on the project page.

## Demo & links *(fill at submission)*

- Live app: `<public-URL>` · Demo (≤30 s video or 7 slides): `<link>` · Project page: `<link>`

## Team

Space Apps Cairo 2026 — team `<name>`, members listed on the project page.
