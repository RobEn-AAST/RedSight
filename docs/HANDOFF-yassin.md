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

- **2026-11-14, branch `finalizing-frontend` (from main at `300d00d`, uncommitted):** ease-of-use pass, no
  feature removed.
  - **Phone map:** one finger scrolls the page, two fingers move the map (`cooperativeGestures` on coarse
    pointers under 1024 px, `MapCanvas.tsx`; taken from the restyle stash without the restyle).
  - **Sources dialog** scrolls inside itself (`App.tsx`; also from the stash).
  - **Route choice:** each type says what it means (Least time / Easier ground / A bit of both). The app
    checks the terrain service once (`/api/copilot/health`). Without it, Balanced and the slope box show as
    unavailable with the reason, instead of failing after a tap. With it, changing the slope prompts "Tap a
    route type to recalculate". The slope box is renamed "Steepest slope allowed" (`PlanPanel.tsx`).
  - **360° view:** S1/S2 rows carry a "360° view" tag, and the replay row reads "Replay + 360° view · Play ·
    look around S1". When S1 or S2 is selected, a **"360° view + helmet HUD for S1"** button sits right under
    the stop list (one tap instead of four). It fires `redsight:open-360` (`OPEN_360_EVENT`, exported from
    `MissionReplay.tsx`), which opens the replay's own 360° view. Its subtitle says a real Curiosity panorama
    stands in for the site and the readings are modeled, matching the view's own "photo stand-in" label.
  - **Wording rule from the user:** don't label the 360° view or HUD as a "simulation" or "proof of concept"
    anywhere in the repo.
  - Claude in Chrome could not open the local app (error page in every tab it opened; your own tab worked),
    so checks ran in the built-in browser at 375 px and 1366 px. 26/26 tests, build green.
  - Dev server: `.claude/launch.json` (outside the repo) now also passes `--host 127.0.0.1`.
  - **Split up scrapped (user decision, 2026-11-14):** no NASA source gives a walker-to-walker separation
    limit. NASA's *Tenets of Lunar EVAs for Artemis III* (tenet 2: buddy pairs, "at least 2 crewmembers
    together", https://ntrs.nasa.gov/citations/20230008183) points the other way, and the xEVA ConOps
    (EVA-EXP-0042 Rev B) only gives rover-to-rover "rescue range" and lander distances. The disabled
    "Split up" placeholder from `300d00d` is removed on this branch; "Who goes where" again shows only if
    split data ever exists. The Crew step already says the pair walks together.

- **2026-11-14, branch `ui-rework` (from `finalizing-frontend` at `e060951`, uncommitted):** simple,
  informative, smooth pass on the Routes screen.
  - **"Your walk" card** at the top of the panel: stop name, a one-line verdict (gets there and back, or turns
    back early), and Walk / Out / Home / O₂ spare at a glance, with the Scenario badge. Green border when it
    fits, red when it turns back (`PlanSummary` in `PlanPanel.tsx`; numbers from `summarizeCrew`).
  - **Smooth folds:** when a fold row opens, its detail fades and slides in (200 ms, opacity + transform);
    closing stays instant (`index.css`, class `fold` on `Fold`). A height animation via `::details-content`
    was tried and dropped: it did not open reliably.
  - **Plain status line:** "Modeled estimate · ready-made route · 15° slope limit" (was "Scenario estimate ·
    precomputed engine route · 15° cap").
  - Checked at 375 px and 1366 px in the built-in browser; 26/26 tests, build green.
  - **Layout redo (user decision: "full map + bottom sheet", replacing the long scrolling right panel):**
    - The map fills the Routes screen at every size (`MapWorkspace.tsx`, class `routes-screen`).
    - The **"Your walk" card** floats on the map under the legend, as a compact strip (stop name, verdict,
      Walk / Out / Home / O₂ spare in one row). The **Layers** button sits under it.
    - New **`ui/BottomSheet.tsx`**: grab handle, tab bar, one scrolling panel per tab. Three heights (small =
      handle + tabs, 92 px; half; full = map height minus 64 px). Drag or flick the handle; tap it or press
      Enter to step small → half → full; Escape lowers it. Past the ends it moves with friction. All panels stay
      mounted (hidden when inactive), so the replay keeps running on the map. It starts at half on phones
      and full on laptops, where it docks down the left edge (26rem wide).
    - Tabs (`PlanSheet` in `PlanPanel.tsx`): **Stop** (crew + Edit, where to sample, 360° button) · **Route**
      (route types, slope limit, why this route, split if data ever exists) · **Plan** (step-by-step walk,
      O₂ and turn-back, daylight, radiation, notes) · **Replay** (replay controls and the 360° view).
    - Map overlays kept clear: on phones the zoom control and replay bar sit above the small sheet (`index.css`),
      and the scale bar moves (`MapCanvas.tsx`). On laptops the replay bar centres in the space beside the sheet.
      Routes are framed in the visible part of the map (`routePadding()`).
    - One-finger map panning is back on phones (the map is no longer inside a scrolling page).
    - A drag ends with a click; a `justDragged` flag stops that click from also stepping the size.

- **2026-11-14, no-return line coming back (merged to main as PR #11; ring files generated in `20ca92c`):** the red
  dashed line was gone because Marwan removed the mock `plan/limits_*.geojson` files. User chose a line that
  **follows the O₂ slider**. Finding: at a full tank (288.75 L usable) the crew could walk out about 4 km, so
  that ring sits at or past the edge of the ~5.9 km ops box; the line only matters when the budget is lowered.
  - **Engine** (Ali's folder, tell him): `engine/route/reach.py` computes the round-trip O₂ field (fastest path
    out from the habitat, the same path back, `factor × (out + return_margin × back)`, the same rule as
    `engine/route/pnr.py`) and the outer edge of the reachable area per budget. `engine/tools/export_limits.py`
    writes `plan/limits_c1_l15_foot.geojson` and `..._c2_...`: one `no_return_line` feature per 25 L level up to
    the full budget, with `budget_l` and `clipped_by_model_edge`. `engine/tests/test_reach.py` covers it (5 tests);
    the field matches the routes' own `segment_cost` along the fastest path. Rover presets get no rings.
  - **App:** `map/noReturn.ts` `ringForBudget()` keeps the ring for the largest level at or below the slider
    (4 tests); the plan store exposes it as `noReturnLine` + `noReturnRing`; the O₂ row says which budget the line
    is for and when it meets the terrain model's edge. `check-data.mjs` validates limits files.
  - Verified with temporary made-up rings (deleted after): legend shows, the O₂ text names the ring, and the slider
    at 110 L picks the 100 L ring. 37/37 app tests, build green. `check:data` shows 54 hash "differs/stale" errors
    locally: Windows line endings (`core.autocrlf=true`), not this change.
  - **Done since:** the real ring files were generated and merged (`20ca92c`, "Complete native no-return ring export"). How they were made:
    ```sh
    python -m pip install "rasterio>=1.4" pytest
    python -m pytest engine/tests/test_reach.py
    python engine/tools/rebuild_pilot_inputs.py --out data/raw/engine-pilot-rebuild
    python -m engine.tools.export_limits --input-manifest data/raw/engine-pilot-rebuild/input-manifest.json       --constants app/public/data/constants.json --stops app/public/data/stops.json --out app/public/data
    cd app && npm run check:data
    ```
    Then look at the line on the map with the slider at a few budgets before committing the two files.
- **2026-11-14, branch `bug-fixes` (PR to main):**
  - **Replay reset on layer toggle, fixed.** The plan store built a new `activeRoute` object on every recompute
    (layers, Curiosity path, O₂ slider); the replay restarts on any new route (`setRoute` → `keepTime:false`).
    `activeRoute` is now cached per plan member (`cachedMemberRoute`, a WeakMap) in `map/planStore.tsx`.
    Checked: replay at T+0:25 stays at T+0:25 through layer and imagery toggles.
  - **Per-astronaut body mass.** New `bodyMassKgB` (default 82). The Crew step shows two steppers for a pair
    (A, B) and one for a solo walk. `lib/memberFactor.ts` turns each mass into an O₂ factor against the mass the
    route was modeled for: Pandolf power out and back per segment (speed does not depend on mass in the model);
    3 tests, incl. a match with the engine's stored power on 200 real S1 segments. The store shares
    `memberFactors` + `o2Scale`; the "Your walk" card, timeline turn-back, O₂ row (`summarizeMember` recomputes
    the no-return point with the engine rule), turn-back slider and replay (`setMemberFactors`) all use them.
    Checked: B at 105 kg drops spare O₂ from 200 to 178 L; the replay shows A 99 % · B 98 % ten minutes in.
  - **360° view opens on arrival.** The replay's `arrive` event pauses the walk and opens the 360° view + HUD
    at stops with a panorama (S1, S2). Checked in the browser.
  - **Error boundary** (`ui/ErrorBoundary.tsx`) around the lazy 360° view: a chunk that fails to load (dev
    "Outdated Optimize Dep", or an old tab after a redeploy) now shows a message instead of blanking the app.
  - **Goals:** "Open survey traverse" and "Custom goal" removed; an old saved goal that no longer exists must
    be picked again (`lib/validation.ts`). `targets.geojson` still tags `survey`; nothing reads it now.
  - **HUD label:** the 360° view's chip and demo-tour caption now read "AR HELMET VIEW" (user rule: never label
    the 360° view a "simulation" or "proof of concept" in the repo). `hud/StopHud.tsx` and `hud.css` are
    Marwan's: tell him. `docs/hud-plan.md` updated to match.
  - Dev note: the browser pane throttles animation frames when it is in the background, so maps and replays
    can look stuck there; a fresh tab or a screenshot makes it draw.

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

### PR #11 review completion (2026-11-14)

Generated both on-foot crew rings from the original local native input manifest
(`data/raw/engine-pilot/input-manifest.json`) with real rasterio/SciPy dependencies.
Added the exporter's scikit-image dependency. The UI labels the smoothed rings as
Scenario reference outlines for the default 82 kg / 15 kg fastest same-path model,
before sample pickup; other routes and mission factors can consume more O₂.
A clipped ring does not establish any O₂ limit outside the terrain model.

Review checks: engine pytest 57 passed / 7 skipped; ring, replay and turn-back unit
tests 35 passed; app build and lint passed; final data check 0 errors (existing
hazards size warning). The extra replay-adapter script still fails on its stale
`backAssumed === false` assertion; that checker, replay implementation and route
inputs are identical to main at `924bbfc`, so this is a pre-existing failure.
