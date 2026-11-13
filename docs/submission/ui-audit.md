# UI wording + badge audit (2026-11-13, Marwan): delivery pool item 6

**Method:** headless Chrome on `main` (mock routes), visible text of every workspace (Mission, Map with stop
S1 picked, Provenance) checked against AGENTS rule 3 (banned wording) and rule 2 (every number carries a
badge); plus `grep` of `app/src`, `app/index.html` and `app/public/data`. Data files: `npm run check:data`
(also scans for banned wording).

**Result: no banned wording on any screen or in the data files.** Fixed during the audit:

| Finding | Where | Fix |
|---|---|---|
| Footer and page description said "not a **certified** safety system" | `App.tsx`, `index.html` | Now "modeled estimates, not measurements or guarantees" (earlier today) |
| README honesty statement said "not certified life-support numbers" | `README.md` | Reworded |
| Stop cards said "photos pending" although `stops.json` has 3–4 photos per stop | `lib/engineData.tsx` read only string photos; Ayman's are objects with `url` | Reader accepts both; S1 now shows "4 photos" |
| Map bar showed "O₂ 85%" without a badge | Mission Replay map bar | "Scenario" chip added |
| Leaving the Map screen crashed Mission Replay (TypeError in cleanup) | `replay.js` | Cleanup no longer redraws on a removed map |

**Badges:** stops (Observed), layers (Observed/Derived), route cards (Scenario per card), turn-back values
(one badge per value with "Show source"), constants (Derived/Scenario), replay panel + map bar (Scenario).

**Open, for owners (not changed):**
- Re-run this audit after real routes and tiles land, and on the deployed URL (Yassin), before the
  screenshots for the slides.
- The final check before submission: `cd app && npm run check:data -- --final` must report 0 errors (no mock
  files left).
