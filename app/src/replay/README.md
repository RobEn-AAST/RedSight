# Mission Replay (owner: Marwan)

Plays the planned Marswalk on the map: two crew markers walk out, reach the stop or turn back at the modeled
turn-back point, and walk home, while an O₂ gauge drains. Pure logic is in `replay-core.js` (tested);
`replay.js` draws it on a MapLibre map; `replay.css` styles the panel.

```js
import { createReplay } from "./replay/replay.js";
import "./replay/replay.css";
const replay = createReplay(map, { route, capacityL: 385, memberFactors: [1, 1.08], voice: false, onEvent: (e) => {} });
replay.play();
replay.setBudget(200);   // Jana's turn-back slider: usable budget (capacity − reserve)
replay.setCapacity(300); // or the full tank; reserve recomputed
replay.drill(2, "Suit leak"); // contingency from the current moment
replay.setRoute(other); // route card A/B switch (Yassin)
```

**Dev page:** `cd app && python3 -m http.server 8765` → http://localhost:8765/src/replay/dev.html
(uses the committed real contract route `public/data/routes/S1_fastest_2_15.json`; add `?route=<path>` for another;
the top-left slider stands in for Jana's turn-back slider). **Voice:** 🔇/🔊 button, or `createReplay(map, { voice: true })`. **Tests:** `node --test app/src/replay/replay-core.test.js`.

## Route file fields the replay reads (proposal for the §15 contract — Ali/Yassin please confirm)

| Field | Meaning |
|---|---|
| `coords` | `[[lon, lat], …]` habitat → stop, N points |
| `cum.t_s`, `cum.o2_l` | cumulative time (s) and O₂ per crew member (L) from the habitat to each point, N values, non-decreasing |
| `back.t_s`, `back.o2_l` *(required)* | complete directed time / O₂ to walk home from each outbound point on the same route geometry. Missing or misaligned arrays disable replay and turn-back; outbound costs are never substituted |
| alternate fastest return | Unavailable: production routes omit `back_fast` until complete legal geometry and matching costs are exported |
| `budget_l` | default usable O₂ budget per member (after reserve) |
| `stop`, `stop_name`, `mode`, `crew`, `load_kg`, `badge` | labels |

O₂ model and notifications: [`docs/demo-focus-plan.md`](../../../docs/demo-focus-plan.md) §9c. Turn rule (threshold only):
keep walking while `f × (cum.o2_l + m × back.o2_l) ≤ C − R`; the crew gets home with the reserve intact.
Return geometry follows the same route in reverse with directed edge costs. Fixture routes used in tests are not production data.

Replay and the turn-back slider use the complete same-path directed return table. They do not claim or
switch to an alternate fastest-home path while that geometry and its matching costs are unavailable.

**In the React app:** `MissionReplay.tsx` plays `plan.activeRoute` on `plan.map`, follows the turn-back slider
budget (`plan.o2BudgetL`) and docks the player in the side column.

## Next (if time)
3D terrain follow camera (needs Youssef's terrain tiles), radio-shadow events (needs the radio mask).
