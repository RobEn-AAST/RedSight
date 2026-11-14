# Yassin's session handoff (2026-11-14)

Read this first in a new chat. It says where the work stands, what is uncommitted, what was decided and
what is next. Project context lives in [`ai-context.md`](ai-context.md) (doc map), [`team-plan.md`](team-plan.md)
§3/§4c (who owns what) and `../AGENTS.md` (hard rules). Read those before changing anything.

## 1. Who / what

- **Project:** RedSight, a NASA Space Apps 2026 Cairo entry (Martian Map challenge). It's a Marswalk planner
  for Gale crater / lower Mount Sharp. The team is 6 people, each on their own branch; **Marwan merges to `main`**.
- **Yassin owns:** the app shell + routes UI + **deploy**. Worked on `feat/yassin-app` until 2026-11-14; **now
  works on `main`** (user decision, overrides the branch-per-person rule for Yassin).
  - Must-ship that is still open: **deploy `main` to a public URL** and test it logged out on a phone and a
    laptop (delivery pool item 5).
  - Optional extras: a shareable plan link, an EN/AR toggle, a printable cuff card.
- **User preferences:**
  - No Claude attribution in commits or PRs (no `Co-Authored-By`, no "Generated with").
  - No "learn by doing" TODOs: explain instead.
  - Ask before pushing; the user often says "don't edit, just pull".
  - Keep markdown docs updated.

## 2. Repo state right now

- **Update 2026-11-14 (later): we work on `main` now** (user decision). Local `main` was fast-forwarded to
  `origin/main` at `2edc464` and is identical to it (0 ahead / 0 behind). `feat/yassin-app` stays as it was
  (`bfe9b4e`, local only, not pushed).
- The old uncommitted code edits were **not** carried to main: main now builds every plan from real routes,
  so the real-data switch is likely obsolete. They are kept in **`stash@{0}` "real-data switch + ai-context
  rows (pre-main, 2026-11-14)"** (4 files: `engineData.tsx`, `engineDataContext.ts`, `MapCanvas.tsx`,
  `docs/ai-context.md`), not applied. Note: that stash holds the `ai-context.md` index rows 7h–7k, so the rows
  were re-added by hand on main (2026-11-14) and the new docs below are indexed.
- **Committed to main 2026-11-14 (were untracked):**

  | File | What |
  |---|---|
  | `docs/habitat-marker.md`, `docs/map-figures.md` | Habitat spec; art brief for 3 map figures (habitat, rover 8 headings, astronaut A/B 8 headings). Main has since added its own figures (`632da0b`, `e4b5a81`), so check these against main |
  | `docs/handoff-app.md` | Dev handoff for the setup + routes screens as on main (tokens, components, states, a11y, known issues) |
  | `docs/handoff-map-figures.md` | Dev handoff for wiring the figures in (placement, 8-sector heading rule with dead band, replay `figures` opt-in for Marwan) |
  | `docs/HANDOFF-yassin.md` | This file |

- **Stash `stash@{1}` "cockpit restyle + scroll fixes (2026-11-14)"** (was `stash@{0}`): 14 files, not applied. The user has said
  **don't reapply it** for now. It contains:
  - a cockpit-convention retheme: magenta active route, cyan selectable, B612 font, bezel + black screens;
  - 3 scroll fixes:
    - the plan panel scroll, caused by the restyle's `.screen{overflow:hidden}`, so it only matters with the
      restyle;
    - the Sources dialog list not scrolling;
    - the phone map grabbing one-finger swipes (`cooperativeGestures`).

  The Sources and phone-map scroll bugs **also exist on main** (listed in `handoff-app.md`, "Known issues").
- **Local data, not in git:**
  - `app/public/tiles/<6 layers>/` (501 PNGs each);
  - `data/raw/*`;
  - `data/processed/*.npy`.

  They were built with `python engine/data/download.py` then `python engine/tiles/build_tiles.py`. This needs
  a network that doesn't block Amazon S3 / USGS / PyPI: the first network did (curl exit 35), and a phone
  hotspot worked.
- Dev server: `.claude/launch.json` entry `redsight-app` (port 5210). After pulls that add packages, run
  `npm install` and delete `app/node_modules/.vite`.

## 3. What was built in this session (all on main now unless marked)

- **Astronaut-first redesign:** two screens (Set up → Routes); a numbered plan panel
  (where to sample → pick a route Fastest / Lowest hazard → who goes where → your plan); a no-return line;
  rover drive/walk legs; a crew split; context imagery. See `app-redesign.md`.
- **Daylight window:** `lib/mars24.ts` follows NASA GISS Mars24 (tests reproduce both GISS worked examples).
  It's a fold under *Your plan*.
- **Panel tidy-up:** *Your plan* has 3 folding rows:
  - **O₂ and turn-back**, which contains Jana's slider (`TurnBackPanel bare`);
  - **Daylight**;
  - **Replay the walk**, which contains Marwan's replay (`MissionReplay bare`) and the **360° button** for
    S1/S2.

  One turn-back marker. Layers moved behind a button.
- **No-go ground:** real `hazards.geojson` (2,207 areas) drawn as a light tint by reason (violet = steep,
  grey = no data), with the reason in a tap popup.
- Uncommitted: the real-data switch and site rings (above).

## 4. Data status (what's real)

| Real | Still mock |
|---|---|
| Routes (Ali, crew 2 / 15 kg only), hazards, stops/cards (Ayman), Curiosity path, constants, layers + tiles (Youssef, local), crew-2 on-foot plan files (Marwan) | `plan/index.json`, crew-1 and rover plans, no-return `limits_*.geojson`, `targets.geojson` outlines |

Ali changed the O₂ model on main (`fix/engine-o2`), but **the routes haven't been re-exported yet**.

## 5. Findings worth remembering

- Trek's ready-made sulfate and clay indicator layers don't cover Gale. **Correction:** Youssef's download
  found CRISM scene `FRT000058A3`, covering 34–99% of the box. `app-redesign.md` finding 1 says there is no
  CRISM scene over the box, so **it needs an errata note**.
- No clay site lies inside the ops box (the clay goal shows a notice and every site).
- On S1 the "Lowest hazard" route is steeper (15°) than "Fastest" (14°). Raise this with Ali.
- Ali pushed his copilot server work onto `feat/yassin-app` (now merged to main as PR #7). Agree with him which
  branch it belongs on.

- **2026-11-14:** notes from the Cairo organizers' guidance (Project Description PDF Guidelines, Demo
  Guidelines, Tips and Tricks video) are in
  [`../requirements/cairo-participant-guidance.md`](../requirements/cairo-participant-guidance.md) (indexed in
  `ai-context.md`, uncommitted). Key: a **project description PDF is a Cairo local requirement** (unowned);
  Cairo judges get **no live presentation**, so the planned live walkthrough can't be the judged demo; a
  **working deployed URL** is expected (a repo link alone isn't enough), which makes the deploy more urgent.
  Follow-ups done the same day (uncommitted): `team-plan.md` delivery pool **item 7a** (project description
  PDF, unclaimed); `open-questions.md` "Update — 2026-11-14"; a no-live-pitch warning on
  `submission/demo-script.md` §1.

- **2026-11-14, UI simplification (uncommitted, on main):** the routes panel is shorter and plainer.
  - "Why this route" and the radiation dose are now `Fold` rows (one-line answer, detail on tap), like O₂,
    Daylight and Replay (`RouteBreakdown.tsx`, `EvaRadiationCard.tsx`).
  - The terrain-factor tile and reason are hidden while the penalty is a flat 1.00× (`routeProfile.ts`).
  - Sample-area rows drop the inline citations ("stops.json science, NASA source", "Fraeman et al. 2016")
    in display only; `targets.geojson` is unchanged (`PlanPanel.tsx`).
  - Goal cards keep the caveat; the source line shows only on the selected card (`MissionSteps.tsx`).
  - The copilot moved from a floating bubble (it covered **Next** and the panel) into the header next to
    Sources (`App.tsx`).
  - Console buttons scale to 0.97 on press, off with reduced motion (`ui/Button.tsx`).
  - Checked: typecheck, oxlint, 26/26 unit tests, `npm run build`, browser at phone and narrow widths.
  - Follow-up: the **O₂ and turn-back** fold now starts open (`Fold defaultOpen`), so the O₂ budget slider is
    visible without a tap.
  - **Crew split is not shown, by data, not by this change:** `build-plans.mjs` writes `split: null` because no
    primary-sourced separation limit exists, and the app hides "Who goes where" when there is no split data.
    Bringing it back needs a sourced limit and new plan files (Marwan's script).
  - **User decision (2026-11-14):** for pairs, "Who goes where" now always shows: **Walk together** (selected) and
    **Split up** disabled, "Not modeled yet", with a one-line reason. When split data returns, the full choice
    shows again automatically (`PlanPanel.tsx` `CrewChoice`).
- **Sources rule (checked 2026-11-14):** the NASA Submission Guide requires listing every source **in the
  submission** (NASA Data field, references; Cairo also wants them in the PDF). Showing the source next to
  every number in the app is a **team choice** (demo-focus-plan B5), not a rule. Keep the evidence badges;
  full citations can live behind "Source" toggles and the Sources dialog.

## 6. Next steps (suggested order)

1. Real-data switch: now parked in `stash@{0}`; main builds real plans, so most likely drop
   it (check the app on main first).
2. **Deploy** (must-ship). It's a static Vite build, but the **tiles aren't in git**, so the deploy has to run
   the two data scripts or upload `app/public/tiles/`. `hazards.geojson` is 6.4 MB.
3. Fix the two scroll bugs on main (the code is in the stash and `handoff-app.md`).
4. Move the 360° button to S1/S2 in *Where to sample* (today it's 4 taps deep).
5. Add an errata note to `app-redesign.md` finding 1 (CRISM).
6. When the figure art arrives (`map-figures.md`), wire it in per `handoff-map-figures.md`. Agree the replay
   `figures` option with Marwan first.
7. Optional extras: shareable plan link, cuff card, EN/AR.

## 7. Useful commands

```bash
cd "D:/Productivity/code projects/RedSight"
git checkout main && git fetch --all --prune && git merge --autostash --no-edit origin/main   # "pull" (on main now)
cd app && npm install && npm run build && npx oxlint src && npm run check:data
node --experimental-strip-types --test src/lib/mars24.test.mjs src/map/*.test.mjs
git stash show -p stash@{1}        # look at the restyle without applying it
```
