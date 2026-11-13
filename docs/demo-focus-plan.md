# RedSight — Demo Focus Plan (what we actually build and submit)

**Written:** 2026-11-13 (Cairo day 1), from the team planning session after a full read of the repo and a
same-day live re-check of the official pages and data services (sources in §11, all accessed 2026-11-13).
**Status:** working plan, **team choice** throughout. Not a challenge rule, and not a promise of a result.
**Relationship to other docs:** this narrows [`24-48-hour-plan.md`](24-48-hour-plan.md) to a demo we can
finish. Where the two conflict on **scope or ops area**, this file wins. Phase timing, the pilot gate,
acceptance evidence and risks still come from the 24–48 h plan. Rules come from
[`../requirements/competition-requirements.md`](../requirements/competition-requirements.md).

---

## 1. The final target: what we hand in

The challenge prescribes **no exact output format**. It requires one thing (**Must**): *"create a map,
tool, or interface a Mars astronaut could use during a surface exploration mission, using NASA data and
tools."* Style, format, site and features are ours to choose.

What we submit is **one project page** on spaceappschallenge.org (Submission Guide; full field list in
competition-requirements §5):

| Item | Our content |
|---|---|
| Project name + summary | RedSight: a hyperlocal Marswalk planning map for the Mount Sharp boxwork area |
| **Demo link** (Must: ≤7 slides **or** ≤30 s video; over the limit ⇒ ineligible for Global Judging) | **7 English slides** (team default, D03/U2) |
| **Final project link** (public, no login) | Static website + GitHub repo |
| Description · NASA Data field · SI disclosure · references | Drafted by the story owner during the night |

**Our base target in one sentence (team choice):** *a website where you pick a science stop on Mount
Sharp, see a modeled route to it over real NASA layers, and drag a slider that shows your modeled
turn-back point.*

> **Build order is strict (team rule, 2026-11-13):** **Tier 1 — Base** must be finished, deployed and
> submittable first. Only then **Tier 2 — Extras** (360° view at stops + HUD), then **Tier 3 — Bonus**
> (Apple Vision Pro). Extras never delay or break the base. Any session/agent picking up work: check
> which tier is complete before starting anything from a higher tier.

## 2. Rules versus ideas

| Class | Items |
|---|---|
| **Must** | Map/tool/interface for an astronaut · NASA data (≥1 for any Global Award) · English · demo within limits · public links · project page complete · SI disclosure |
| **Recommended** | "at least three kinds of data" (introduced with "you may consider") · route avoiding obstacles ("if possible") · safety context (radiation, suit mobility) |
| **Optional** | Habitat/tablet/HUD display · static vs interactive · point-of-view imagery · rovers/robots · paired astronauts |
| **Team choice** | Gale / Mount Sharp boxwork site · RedSight · turn-back marker · provenance cards · 360 + HUD · Vision Pro |

## 3. Scope in tiers (build strictly in order)

### Tier 1 — Base (do first; this is what gets submitted Saturday 09:00)

| # | Item | Done when (evidence) |
|---|---|---|
| B1 | 2D map of the ops box with ≥4 toggleable layers: HiRISE ortho, hillshade + slope, THEMIS, CRISM (§6) | Layers toggle on the public URL |
| B2 | 3 science stops at real Curiosity positions, with raw photos from those sols (§5) | Clicking a stop shows its card + photos + sources |
| B3 | Fastest + safest routes per stop, precomputed (scipy Dijkstra field, review F2) | Routes never cross a >15° cell (asserted in the engine) |
| B4 | **Turn-back slider**: budget → PNR marker moves along the route | Marker moves toward the habitat as the budget drops |
| B5 | Provenance card on every layer and number (Observed / Derived / Scenario) | No visible layer or number without a card |
| B6 | RAD + REMS context **cards** (not map layers) | Cards cite their PDS sources |
| B7 | Deployed public URL + 7 slides + project page submitted | Submitted page; links tested logged-out |

### Tier 2 — Extras (start only after Tier 1 is submitted)

| # | Item | Detail |
|---|---|---|
| E1 | 360° view at stops from real NASA panoramas (PIA26559, PIA26696) | §7 |
| E2 | HUD overlay on the 360 view | §7 |
| E3 | Resubmit with E1–E2 + updated slides | Only if the Lead confirms post-judging edits count |

### Tier 3 — Bonus (only after Tier 2 works on a normal browser)

| # | Item | Detail |
|---|---|---|
| X1 | Apple Vision Pro: same 360 + HUD page in WebXR | §8, demo-table bonus |
| X2 | 3D fly-along between stops (DEM + ortho) | Labeled visualization, not a photo |
| X3 | Chemical data at stops (ChemCam/APXS) | §6 row 7 |

### Not in this hackathon

AI assistant · rover/robot/buddy logic · in-browser re-routing (JS A\*) · comms line-of-sight · storm
re-route · spatial radiation/weather maps (**Unavailable**: never shown as maps) · street view *between*
stops (no such imagery exists).

Cut rule: no Tier 2 work starts before Tier 1 is submitted; no Tier 3 work before Tier 2 works on a
normal browser.

## 4. Architecture

```
 ┌──────────────── NASA DATA (downloaded once, cached) ───────────────────┐
 │ USGS STAC: HiRISE DTM 1 m + ortho 0.25 m (CC0)  │ Trek: CRISM minerals │
 │ USGS: THEMIS thermal inertia 100 m              │ USGS: SIM 3292 units │
 │ MMGIS: Curiosity waypoints (sol → lon/lat)      │ raw-image API → pics │
 │ PDS: RAD dose + REMS weather (point values)     │ JPL: 360 panoramas   │
 └───────────────────────┬────────────────────────────────────────────────┘
                         ▼  data/raw/  + data/PROVENANCE.md (URL, date, license)
 ┌──────────────── ENGINE (Python, offline, runs once) ──────────────────┐
 │ 1 clip to ops box → 10 m grid (600×600)                               │
 │ 2 slope (max → 15° hard block; mean → energy), hillshade  (review F4) │
 │ 3 cost grid = slope + sand proxy (THEMIS)                             │
 │ 4 scipy Dijkstra from habitat → return-cost field (turn-back data)    │
 │ 5 paths to 3 stops × {fastest, safest} + time/O2 (Pandolf model)      │
 │ 6 tiles (gdal2tiles z10–16)                                           │
 │   constants.json ← every number + source + badge                      │
 └───────────────────────┬───────────────────────────────────────────────┘
                         ▼  static files only: tiles/ routes.json field.png stops.json
 ┌──────────────── WEB APP (static, no server) ──────────────────────────┐
 │ MapLibre map ── layer toggles ── stop picker ── route cards (A/B)     │
 │      │                                    │                           │
 │  turn-back slider (budget → marker)   source card (click anything)    │
 │  photo pins (real sols)               RAD / REMS context cards        │
 │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ Tier 1 (base) above · Tier 2/3 below ─ ─ ─ ─ ─ ─ │
 │      │ click a stop                                                   │
 │      ▼                                                                │
 │  [T2] 360 view (three.js sphere) + HUD overlay ← routes.json          │
 │  [T3] same page in WebXR on Apple Vision Pro                          │
 └───────────────────────┬───────────────────────────────────────────────┘
                         ▼  upload the built folder (e.g. Netlify) → public URL, no login
                 Project page + 7 slides → Submit (Sat 09:00 Cairo)
```

Design rule: the browser never computes model numbers. The map, route cards and HUD all read the same
engine JSON, so they cannot disagree (review §7 integration contract).

Deployment note: `.gitignore` excludes `tiles/` and `app/dist/`, so a plain "GitHub Pages from the main
branch" deploy would ship without tiles. Deploy by uploading the built folder, or use a deploy branch.

## 5. Ops area: corrected (supersedes the research-era box)

**Finding (2026-11-13, Observed):** the box assumed in the research docs, 137.30–137.45°E / −4.75…−4.55°,
does **not contain the boxwork site**, and it is about **8.9 × 11.9 km**, not the "~6×6 km" it is
labeled as. Curiosity's own waypoint file places the boxwork campaign south of it:

| Stop (proposed) | Evidence | Sol(s) | Lon °E | Lat ° | Badge |
|---|---|---|---|---|---|
| **S1 — First boxwork 360** | PIA26559 (Mastcam, 2025-05-15…18) | 4539–4541, site 116 | 137.38592 | −4.79782 | Observed (rover position) |
| **S2 — Nevado Sajama 360** | PIA26696 (2025-11-09…12-07) | waypoints at sols 4711 / 4741, site 120 | 137.38100 | −4.80800 | Observed |
| **S3 — Current position** | MMGIS current waypoint | 5070, site 125 | 137.38915 | −4.82568 | Observed |
| Habitat | Placed on flat ground downslope (north) of S1 during the pilot, from the slope map | — | TBD | TBD | **Scenario** (fictional) |

Sol↔date conversion: sols from the MSL landing (2012-08-06 05:17:57 UTC, 88,775.244 s per sol), matched to the
nearest waypoint. The waypoint file is sparse (1,388 stops), so S2 uses the waypoints bracketing the
panorama's sols, where the rover was stationary.

**Proposed ops box (Team choice, confirm at the pilot gate): 137.335–137.435°E / −4.85…−4.75°**
(≈ 5.9 × 5.9 km). It contains S1–S3 and sits inside the Trek 1 m DEM footprint.

**Elevation models covering the stops** (USGS STAC, CC0-1.0, DTM URLs probed with ranged GETs 2026-11-13):

| Item | Bbox (not footprint) | DTM | Size |
|---|---|---|---|
| `DTEEC_009149_1750_009294_1750_U01` | 137.353–137.468°E / −4.923…−4.676° | HTTP 206 ✓ | 182 MB — **first choice** |
| `DTEEC_019698_1750_019988_1750_U01` | 137.312–137.439°E / −5.040…−4.729° | HTTP 206 ✓ | 266 MB — covers the box's west edge |
| `DTEEC_040770_1755_039280_1755_A01` | — | **HTTP 404** (still dead, review F3) | — |

A bbox is not a footprint (HiRISE strips are diagonal), so the pilot must check each stop against the actual
raster. Fallback per the F3 ladder: Trek `Gale_DEM_SMG_1m` (`format=tiff&compression=LZW&size=…`).

## 6. Data types: build order

"At least three kinds" is **Recommended**, not a threshold. We reach 3 on Friday night, then add more.
A layer counts only if it helps navigation or explains a stop.

| # | Type | Dataset | Use | Badge |
|---|---|---|---|---|
| 1 | Optical | HiRISE 0.25 m ortho + Curiosity 360s/photos | See the ground and the stops | Observed |
| 2 | Topographic | HiRISE 1 m DTM → slope, hillshade | Hard 15° block; the route depends on it | Observed DEM → Derived slope |
| 3 | Thermal | THEMIS thermal inertia, 100 m | Sand-likelihood proxy (soft cost) | Derived (proxy) |
| — | **3 reached: Friday-night target** | | | |
| 4 | Spectral | CRISM mineral indicators (Trek) | Why each stop matters (sulfate host unit) | Derived |
| 5 | Radiation | Curiosity RAD dose | **Card**: dose per walk duration | Observed point + Scenario |
| 6 | Atmospheric | Curiosity REMS | **Card**: typical conditions, daylight window | Observed point |
| 7 | Chemical | ChemCam/APXS results at stops | Stop detail (manual curation) | Observed — Sunday only |
| ✗ | Geophysical | Gravity/radar | ~100 km resolution, meaningless at 6 km | Skip, say why |

Which external sources are in or out (Kaggle *Surviving Mars* game data: rejected; NASA Life Sciences
Portal EVA/walkback records: citations for the O₂/turn-back cards; the 5 official resources by tier):
see [`research/external-sources-review.md`](research/external-sources-review.md).

Honesty rules: RAD and REMS are rover-local, so show them as cards and never as map layers. SIM 3292
geology is interpretation: show it as extra context, but don't count it as spectral or chemical.
Pitch line: *"6 NASA data types from 4 missions, each labeled Observed or Derived."*

**Label decision (fixes cross-doc drift):** DEM elevation = **Observed** (stereo product); slope, hillshade
and cost = **Derived**; THEMIS thermal inertia = **Derived** (a model product from Observed radiance). The
research docs disagree on the last two (technical-approaches §1 vs mapping-options §13); the app uses this
table.

## 7. Tier 2 — 360° view at stops + HUD (Optional per the challenge; Team choice; after Tier 1)

The challenge itself suggests both a helmet HUD and point-of-view images "so the astronaut knows what to
expect when they arrive at their destination".

- **Real panoramas, not invented scenery:** PIA26559 at S1, PIA26696 at S2 (credit NASA/JPL-Caltech/MSSS).
  Other stops get a strip of raw images from the same sol(s). Matching sol → waypoint gives each image the
  rover's position for that sol, which replaces the old "pin approximately" fallback for these stops.
- **Viewer:** a three.js textured sphere (MIT) rather than Pannellum, because three.js also gives a WebXR
  mode for Vision Pro (§8) with the same code. Use NASA's downsized versions (~8–16k px wide). Check
  whether each mosaic covers the full sphere and limit the vertical range if not.
- **HUD overlay:** heading · O2 remaining · distance/ETA to next stop · turn-back warning. All values come
  from `routes.json` (**Scenario** model outputs, badged as such on the HUD).
- **Limit stated on screen:** real imagery exists **only at stops**. Moving between stops is a jump, like
  street-view points. A 3D fly-along from DEM + ortho is a Sunday extra, labeled "visualization from
  orbital data, not a photograph". No AI-generated Mars scenery; if any is used, SI watermark rules apply.

| Order | Item | Estimate |
|---|---|---|
| 1 | Tier 1 base: map + layers + routes + turn-back slider + cards | Fri night |
| 2 | Submit the Tier 1 snapshot | Sat 09:00 |
| 3 | 360 view at S1/S2 | +2–3 h |
| 4 | HUD overlay | +2 h |
| 5 | Tier 3: Vision Pro, 3D fly-along | Only if Tier 2 works |

Prep that can be done without touching base work: downloading the two panoramas and recording their
credits in `data/PROVENANCE.md`. Building the viewer waits until Tier 1 is submitted.

## 8. Tier 3 — Apple Vision Pro (Optional, Team choice; a demo-table bonus, never a dependency; after Tier 2)

- **Path:** the same web page, entered through **WebXR `immersive-vr` in Safari on visionOS**. Apple's WebKit
  supports the immersive-vr session type; it is on by default since visionOS 2; input arrives as
  `transient-pointer` (gaze + pinch). The user grants permission when the session starts.
- **Limit:** the WebXR **AR module is not supported** in visionOS Safari, so a HUD floating over the user's
  real room is not possible from the web. A fully immersive Mars 360 with the HUD is possible.
- **Rejected for this window:** a native visionOS app (Xcode/RealityKit). Judges can't open it from a public
  link, and it needs a separate build.
- **Use:** pitch table / People's Choice, plus a short screen recording for the slides. The judged demo
  (slides + public URL) never relies on the headset.
- **To verify on the device (Unverified until tested):** the WebXR session starts from our deployed URL; the
  panorama texture size loads; HUD text is readable at the chosen distance.

## 9. First steps (now)

1. **Lock the ops box + stops (15 min):** confirm §5, record it in the decision log (D11).
2. **Start the download immediately (critical path):** `DTEEC_009149…` DTM + its ortho, retry loop,
   checksums into `data/PROVENANCE.md`. In parallel: person B scaffolds the empty MapLibre page; person C
   asks the Local Lead (judging start time, who submits, local edit lock) and starts the slides/text.
3. **Pilot gate (~2–3 h, independent review §6):** G1 file opens + license recorded · G2 landmark alignment ·
   G3 route never crosses >15°, PNR moves monotonically · G4 ≤3 h. Full build starts only after it passes.
4. **Build Tier 1 (B1–B7) → submit.** Only then Tier 2, then Tier 3 (§3).

## 10. Doc-hygiene findings from this pass (2026-11-13)

| Finding | Status |
|---|---|
| Ops box misses boxwork; mislabeled 6×6 km (§5) | Fixed here; errata added to mapping-options; ai-context updated |
| Machine-readable traverse exists (MMGIS waypoints JSON) — the research listed the format as unknown | Recorded here + ai-context |
| Cairo event officially started Fri 2026-11-13 07:00 Africa/Cairo; Cairo page has no `submissionDeadline` | open-questions updated |
| 4 links in `requirements/` point to `/home/ali/Downloads/…`; those files are not on this Mac | Noted in open-questions; supply copies to the team or treat as unavailable |
| Build plan M4 says "A\*" though F2 made the scipy Dijkstra field the core | Annotated in 24-48-hour-plan |
| `.gitignore` excludes `tiles/` ⇒ deploy by upload, not Pages-from-main (§4) | Noted here |
| ai-context banned-word list omitted "safe time remaining" and "flight-safe" | Fixed in ai-context |

## 11. Sources (all accessed 2026-11-13)

- Official challenge page (live text re-extracted; resources unchanged, 5 items):
  https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/
- Cairo Local Event page (schedule starts 2026-11-13T07:00, timezone Africa/Cairo, `submissionDeadline: null`):
  https://www.spaceappschallenge.org/2026/local-events/cairo/
- Curiosity waypoints (NASA MMGIS): https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json ·
  current: https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints_current.json
- USGS STAC search (`mro_hirise_socet_dtms`): https://stac.astrogeology.usgs.gov/api/search
- Curiosity raw images API (latest sol 5072): https://mars.nasa.gov/api/v1/raw_image_items/?condition=msl
- PIA26559 Curiosity's First 360-Degree View of Boxwork Patterns:
  https://www.jpl.nasa.gov/images/pia26559-curiositys-first-360-degree-view-of-boxwork-patterns/
- PIA26696 Curiosity Captures a 360-Degree View at Nevado Sajama:
  https://www.jpl.nasa.gov/images/pia26696-curiosity-captures-a-360-degree-view-at-nevado-sajama/
- JPL, Curiosity starts unpacking boxwork formations (2025-06-23):
  https://www.jpl.nasa.gov/news/nasas-curiosity-mars-rover-starts-unpacking-boxwork-formations/
- WebXR on visionOS. Apple Developer Forums (WebKit supports `immersive-vr`; AR module unsupported):
  https://developer.apple.com/forums/thread/743655 · https://developer.apple.com/forums/thread/756850 ·
  default-on in visionOS 2 (secondary report): https://roadtovr.com/visionos-2-webxr-support-vision-pro/
