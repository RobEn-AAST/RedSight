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

**Why slides are the judged link and the video is not:** the rule is "video **or** slide deck" with one demo
link. Two judged demos could read as exceeding the limit. The deck carries more (members' names, data and
honesty slide) and plays GIFs, so it shows the app running. The video is the same story in 30 s for anyone
who prefers to watch. **Open question for the Local Lead:** is a supplementary video link acceptable? Added as
a question to ask; until answered, the video is never put in the demo field. If the team flips the decision, swap
D1/D2 roles; nothing else in this plan changes.

**GIFs do not play in a PDF** (first frame only). So D1 is shared as Google Slides (GIFs play); a PDF export of
the deck is a backup only, with static frames. D3 uses still screenshots with captions.

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
