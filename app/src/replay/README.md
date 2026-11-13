# Mission Replay (owner: Marwan)

Plays the planned Marswalk on the map: two crew markers walk out, reach the stop or turn back at the modeled
turn-back point, and walk home, while an O₂ gauge drains. Pure logic is in `replay-core.js` (tested);
`replay.js` draws it on a MapLibre map; `replay.css` styles the panel.

```js
import { createReplay } from "./replay/replay.js";
import "./replay/replay.css";
const replay = createReplay(map, { route, budgetL: 90, onEvent: (e) => {/* voice callouts later */} });
replay.play();
replay.setBudget(60);   // Jana's turn-back slider calls this
replay.setRoute(other); // route card A/B switch (Yassin)
```

**Dev page:** `cd app && python3 -m http.server 8765` → http://localhost:8765/src/replay/dev.html
(uses the mock contract route `public/data/routes/S1_fastest_2_15.json`; add `?route=<path>` for another;
the top-left slider stands in for Jana's turn-back slider). **Voice:** 🔇/🔊 button, or `createReplay(map, { voice: true })`. **Tests:** `node --test app/src/replay/replay-core.test.js`.

## Route file fields the replay reads (proposal for the §15 contract — Ali/Yassin please confirm)

| Field | Meaning |
|---|---|
| `coords` | `[[lon, lat], …]` habitat → stop, N points |
| `cum.t_s`, `cum.o2_l` | cumulative time (s) and O₂ per crew member (L) from the habitat to each point, N values, non-decreasing |
| `back.t_s`, `back.o2_l` *(optional)* | time / O₂ to walk home **from** each point (the engine's return field sampled on the route). If missing, the replay assumes the way home costs the same as the way out and says so on the panel |
| `budget_l` | default usable O₂ budget per member (after reserve) |
| `stop`, `stop_name`, `mode`, `crew`, `load_kg`, `badge` | labels |

Turn-back rule (threshold only, no modeling in the browser): the crew keeps walking while
`cum.o2_l[i] + back.o2_l[i] ≤ budget`; the exact turn spot is interpolated inside the crossing segment.
Return leg = the same path reversed (lite). Mock routes live in `app/public/data/routes/` (see that folder's README).

## Next (if time)
3D terrain follow camera, auto-switch to the fastest return
when the zones fields arrive, radio-shadow events.
