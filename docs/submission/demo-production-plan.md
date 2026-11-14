# Demo production plan: 7 slides + 30 s video + project PDF (2026-11-14, Marwan)

Owner: Marwan (delivery pool items 2, 4, 7, 7a in [`../team-plan.md`](../team-plan.md) §3). Rules come from
[`../../requirements/cairo-participant-guidance.md`](../../requirements/cairo-participant-guidance.md) §A–B and
[`../../requirements/competition-requirements.md`](../../requirements/competition-requirements.md). Shot list and
slide outline: [`demo-script.md`](demo-script.md). This file says **how** we make them and how we remake them fast
when the UI changes.

## 1. What we ship (Must unless marked)

| # | Deliverable | Limit (official) | Where it goes |
|---|---|---|---|
| D1 | **7-slide deck**: the **judged demo link** (Team choice, D03 default) | ≤ 7 slides incl. title; English; team, project, members, challenge on slide 1 | Google Slides, public view-only link → NASA "demo" field **and** Cairo form (same link) |
| D2 | **30 s video** (Team choice: supplementary) | ≤ 30 s; English captions | YouTube unlisted; linked from slide 7, the project PDF, the README and the project page text |
| D3 | **Project description PDF** (Cairo Must) | No length limit; 5 sections (§A) | Google Drive, public view link → Cairo "project documentation" field |
| D4 | GIFs + screenshots (Recommended) | Project-page uploads: JPG/PNG/GIF ≤ 10 MB each | Slides 3–5, project page gallery, README |

**Decision (Marwan, 2026-11-14):** build **both** D1 and D2 to final quality; choose which one is the judged demo
link at submit time. The text below is the default reasoning, not the final choice.

**Why slides are the default judged link:** the rule is "video **or** slide deck" with one demo
link. Two judged demos could read as exceeding the limit. The deck carries more (members' names, data and
honesty slide) and plays GIFs, so it shows the app running. The video is the same story in 30 s for anyone
who prefers to watch. **Open question for the Local Lead:** is a supplementary video link acceptable? Added as
a question to ask; until answered, the video is never put in the demo field. If the team flips the decision, swap
D1/D2 roles; nothing else in this plan changes.

**PDF style (Marwan, 2026-11-14):** D3 is read, never presented. Keep it short and visual: one idea per page,
a big screenshot with a one-line caption, tables and bullets instead of paragraphs, plain English, large
type. Still cover the 5 required sections (§A), but in as few words as the guide allows.

**GIFs do not play in a PDF** (first frame only). So D1 is shared as Google Slides (GIFs play); a PDF export of
the deck is a backup only, with static frames. D3 uses still screenshots with captions.

## 1b. Story (user-approved, 2026-11-14)

Editorial notes from the other RedSight session, endorsed by the user: [`story-notes-2026-11-14.txt`](story-notes-2026-11-14.txt).
One scientifically motivated expedition (boxwork, ancient groundwater) → one route choice → one changed Scenario
assumption → one understandable turn-back decision → the evidence behind it and its limits. All other features
stay, in supporting roles. Fact checks before captions: show only the return behaviour the current route arrays
support (the older "auto-switch to fastest return" line in `demo-script.md` must be re-verified); routes end at a
Derived **approach point**, so never claim exact arrival at or sampling of the Observed target; RAD/REMS are
rover-local context; no "first/unique" claims (NASA BASALT studied crew science decisions under delay).

## 2. Built to be re-made: the capture pipeline

The UI is still changing (teammate polishing it; another deploying). So every visual is produced by a script and
can be re-made in minutes from the latest `main` or the deployed URL:

```
submission/
  capture/shots.mjs     Playwright: opens the app, performs each shot, records 1920×1080 video + PNG stills
  capture/selectors.mjs  the only file to touch when the UI changes (text/role selectors, no app edits)
  build/clips.sh         ffmpeg: trim, speed-up, GIF (palette, ≤ 10 MB), MP4 per shot
  build/video            FilmCraft project that references the clips by path → re-render = new video
  build/slides           deck source → Google Slides (GIFs) + PDF backup
  build/pdf              DesignCraft document for D3 → PDF
  out/                   generated (git-ignored; large media stays out of git)
```

- **Shots (same list for video, GIFs and stills):** S-map (layers + stops) · S-routes (A/B cards) · S-slider
  (turn-back marker moves) · S-replay (amber switch, walk home) · S-drill (suit leak) · S-source (source card) ·
  S-hud (Tier 2, labelled prototype).
- Capture runs against `npm run dev` now and the **deployed URL** at the end (that also proves the public link
  works). No change to `app/` code: selectors only.
- Captions are text in the build files (one source), so the video subtitles, slide text and PDF wording stay
  consistent, as the Cairo guide asks.

## 3. Order of work

| Step | What | Done when |
|---|---|---|
| 1 | Capture pipeline + shot script on current `main` | All 7 shots record cleanly, no "Mock data" chip |
| 2 | **v1 of all three** (D1–D3) with today's UI | A complete, submittable set exists even if nothing else lands |
| 3 | Rules check (§4) on v1 | Every line ticked |
| 4 | UI freeze from the UI teammate → re-run capture → v2 | Visuals match the final app |
| 5 | Deployed URL live → final capture against it, links into slides/PDF | URLs tested in a private window |
| 6 | Upload (needs the team's go: publishing step) | Same demo link on NASA page and Cairo form |

## 4. Rules check (each deliverable)

- [ ] Slides: exactly 7, English, slide 1 = RedSight + team name + 6 members + "Interplanetary Survival Guide:
      Martian Map"; Video: ≤ 30.0 s measured with `ffprobe`, English captions burned in.
- [ ] Problem, solution, NASA data role, benefit all shown (Demo Guidelines §B).
- [ ] Honest labels: modeled / Scenario; Tier 2/3 parts (HUD, 360 stand-in, rover) marked prototype or next.
      No banned wording (AGENTS rule 3).
- [ ] Credits for every outside image/music/font; no NASA logos in anything we made.
- [ ] AI/SI: any generated image/video watermarked; AI voice (if used) acknowledged; tools listed in D3 §5.
- [ ] No one under 18 in any image, voice or name.
- [ ] Links open with no login in a private window; view-only (no edit access).
- [ ] Names, numbers and features match across slides, video, PDF, project page and the app.

## 5. Feature coverage matrix (every contribution has a planned place)

Source of truth for behaviour and limits: [`feature-audit-2026-11-14.txt`](feature-audit-2026-11-14.txt) (item numbers
in brackets). Status: ✅ shown working in a capture · ⚠ works but with a limit to caption · ⛔ not shipped, mention
only as a limit or next step. Shots/stills are produced by `submission/capture/shots.mjs`.

| Feature family [audit #] | Slide | Video (≤ 30 s) | PDF | Capture | Status / caption rule |
|---|---|---|---|---|---|
| Setup: crew, load, rover, goal, review [01–04] | 4 (inset) | 2 s, sped up | Details | `setup` | ⚠ static plans are load 15 kg only; never show an edited field "recalculating" |
| Science goal + 4 boxwork targets [04–05] | 2 | 0–4 s caption | Summary | `setup-end` | ✅ boxwork = ancient groundwater; 10 m circles are access bounds, not deposits |
| Stop photos [06] | — | — | Data | — | ⚠ no photo gallery in the UI; NASA photos only as sourced editorial figures |
| Six layers + Curiosity path [07–14] | 3 | 4–9 s | Data (one line per layer) | `map`, `map-layers` | ⚠ THEMIS/CRISM/geology are context, not route costs; CRISM = PDS ODE FRT000058A3 |
| Hazard reasons [15] | PDF only | — | Details | `map-route` | ⚠ coarse "too steep" cells ≠ native 1 m route mask |
| Fastest vs lowest hazard [16–17] | 4 | 9–14 s | Details | `routes` | ⚠ corridor-limited optima; S1 routes differ by ~36 s |
| Balanced / custom slope cap [18] | 7 (status) | — | Limits | — | ⚠ needs the native route service; credit only if it works on the deploy |
| Directed return costs [19] | 5 | — | Details | `decision-before` | ✅ Scenario: ~50 min out / 55 min home |
| Why this route + elevation profile [20] | 4 (inset) | — | Figure | `profile`, `profile-hover` | ✅ height change integrated from slopes |
| Rover drive / park / walk [21] | 4 (inset) | — | Figure | `rover`, `rover-plan` | ✅ Scenario, Apollo LRV analog speed; no rock/battery model |
| Split crew [22] | — | — | Limits | — | ⛔ not modeled |
| O₂ budget slider + turn-back point [23–24] | **5 (hero)** | 14–23 s | Central result | `decision` | ✅ S1 foot, 288.8 L → 70 L: turn at 950 m / 33 min (Scenario) |
| Area no-return line, alternate fastest home [25–26] | — | — | Limits | — | ⛔ not shipped; return is along the same path. Remove older claims |
| Mission Replay [27] | 5 | 14–23 s | Figure | `replay` | ✅ compressed time, not real duration |
| Drills (suit leak, hard work) [28] | 5 (caption) | — | Details | `drill` | ✅ Scenario multipliers from the current moment |
| Approach-only endpoint [29] | 6 | 23–27 s | Limits | `decision-before` (timeline line) | ⚠ never "arrived/sampled"; HUD log says "Arrived": caption it "modeled approach point" |
| Daylight [30] | PDF only | — | Figure | `daylight` | ⚠ sunset margin is not an O₂-backed sampling allowance (app copy says "time left for sampling": flag to UI owner) |
| EVA radiation dose, REMS [31–32] | 6 (one line) | — | Figure | `radiation` | ⚠ rover-local RAD/REMS, not route measurements |
| Earth delay [33] | 2 | — | Summary | `decision-before` | ✅ cited ≤ ~22 min; HUD's 11 min is today's light-time |
| 360 + AR helmet HUD [34–37] | 7 (prototype) | optional 2 s | Figure | `hud`, `hud-details`, `hud-emergency` | ⚠ PHOTO STAND-IN (Gediz Vallis PIA26363), route on flat ground; comms are simulated |
| Copilot voice/chat + app actions + avatar [38–40] | 7 (status) | — | Details + AI disclosure | `copilot` (drawer only) | ⚠ backend not running in capture: no "working copilot" claim until a real action is captured on the deploy |
| Provenance inspector + 4 evidence classes [41] | 6 | 23–27 s | Data | `sources` | ⚠ some catalog statuses stale (slope "planned", CRISM attribution): use data/PROVENANCE.md for captions |
| Links, team, credits, SI disclosure | 1, 7 | 27–30 s | Sections 4–5 | — | Must |
