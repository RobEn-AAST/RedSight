# Handoff Spec: map figures in the app (habitat, rover, astronauts)

**Written:** 2026-11-14 by Yassin. **For:** the developer who wires the figures into the app. The art itself
(what the figures look like, file names, sizes) is specified in [`map-figures.md`](map-figures.md); this file
says how the app places, turns, animates and falls back. **Stack:** React + MapLibre GL 6
(`app/src/map/MapCanvas.tsx`), Mission Replay in plain JS (`app/src/replay/replay.js`, owner Marwan).

---

### Overview

Today the map marks places with text chips: `HAB` + a square at the habitat, `P` at the rover park point, and
the replay draws the crew as two coloured circles. The figures replace these with small 3/4-view 3D icons,
like the car in a ride-hailing app, so a crew member reads the map without a legend: *home is here, the rover
waits here, we are here and walking this way.*

| Figure | Where it appears | Moves? | Today |
|---|---|---|---|
| Habitat | `meta.json` → `habitat.lonlat` | No | `HAB` chip + square (`MapCanvas.tsx`, marker effect) |
| Rover, parked | Park point of the active plan (`member.coords[member.park_index]`) | No | `P` chip |
| Rover, driving | Along `drive` legs during the replay | Yes | Not shown (crew circle) |
| Astronaut A / B | Replay position of each crew member | Yes | Circle layer `replay-crew` (A `#ff5fd2`, B `#b98cff`) |

**Data honesty:** the habitat position is a **Scenario** (team-placed) and stays labelled so; the rover only
appears when the active plan really has rover legs (today plan files with rover legs are mock and hidden, so
the rover figure won't show until real rover plans exist; that's correct).

---

### Layout and placement

- **Anchor:** every figure image has its ground point at the **exact image centre** (art brief §2). Place the
  image centre on the coordinate: `Marker({ anchor: 'center' })` or symbol `icon-anchor: 'center'`. No offsets.
- **Screen size:** a constant **52 px** (`--figure-size`, see tokens) from the route view up to zoom 17; above
  that grow with the map: `size = 52 × 2^(zoom − 17)`, capped at **104 px**. A real 15 m habitat is only ~5 px
  wide at the route view, so true scale would be invisible.
- **Stacking (bottom → top):** route lines → replay trail → **rover / astronaut figures** → habitat → text chips
  (target labels, TURN, A/B). The habitat sits above moving figures so it never disappears under the crew at
  the start and end of a walk.
- **Caption:** the habitat keeps a small `Habitat` caption under the icon (body text, `text-ink`, 11 px, on a
  `bg-hull/90` pill). The rover and astronauts have no caption (the legend and replay panel name them).

---

### Design tokens used

| Token | Value | Usage |
|---|---|---|
| `--figure-size` (new, add to `tokens.css`) | 52px | Base on-screen size of every figure |
| `--figure-size-max` (new) | 104px | Cap when zoomed in |
| `hull` | `#0b0f15` | Caption pill background (90%) |
| `ink` | `#e9edf3` | Caption text |
| `scenario` | `#f59a5f` | Habitat tooltip badge "Scenario" |
| `ease-console` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Caption fade, if any |

Figures carry their own colours (art brief §2); the app never tints them.

---

### Components / implementation

| Piece | How | Notes |
|---|---|---|
| Habitat | MapLibre `Marker` with an `<img>` (`srcset` @1x/@2x/@3x), in the existing markers effect in `MapCanvas.tsx` | Replaces the `HAB` chip + square. Wrapper `role="img"`, `aria-label="Habitat (Scenario position)"`, `title` keeps the evidence badge |
| Parked rover | `Marker` with `<img>` at the park point; heading = direction of the **walk** leg that starts there (the rover faces the way the crew walked off) | Replaces the `P` chip; keep `title="Rover parks here; walk from here"` |
| Moving figures | One **symbol layer** `replay-figures` fed by a GeoJSON source, `icon-image` = `['get', 'icon']` (e.g. `astronaut-a-se`), `icon-allow-overlap: true`, `icon-ignore-placement: true`, `icon-size` by the zoom rule above | Not DOM markers: the replay updates ~60×/s, and a symbol layer redraws on the GPU without touching the page |
| Image loading | On map load: `map.loadImage()` each `@2x` file and `map.addImage(name, img, { pixelRatio: 2 })` — 1 habitat + 8 rover + 16 astronaut | 25 images, ~25 × 30 KB; load once, before the first replay frame |
| Replay hook | Add an opt-in option to `createReplay(map, { …, figures: true })` so replay writes features `{ icon, … }` into `replay-figures` instead of circles into `replay-crew` | `replay.js` is Marwan's: agree the option with him; with `figures: false` nothing changes |

**Heading rule (rover and astronauts):**

```
bearing = atan2(Δlon × cos(lat), Δlat) in degrees, clockwise from north (map north is always up)
sector  = ['n','ne','e','se','s','sw','w','nw'][round(bearing / 45) mod 8]
```

- Δ is taken between the figure's position now and its position **one replay second ahead**
  (`sampleAt(tl, t + 1)`), so the figure faces where it is going, not where it came from.
- **Stand still:** if it moved less than 0.5 m in that second, keep the last sector (no spinning when stopped
  at the stop or the habitat).
- **No flicker:** only change sector when the bearing is more than **30°** from the current sector's centre
  (a 7.5° dead band either side of the 22.5° boundary). Routes zigzag every few metres on steep ground; without
  this the icon would flip back and forth.
- **Who shows on a drive leg:** while `t` is inside a `drive` leg, show **one rover** (heading as above) and
  hide both astronauts (they ride in it); on walk legs, show the astronauts and the rover parked.

---

### States and interactions

| Element | State | Behaviour |
|---|---|---|
| Habitat | Default | Icon + `Habitat` caption |
| Habitat | Hover (mouse) / tap | Tooltip: "Habitat · position: Scenario (team-placed)". No other action |
| Habitat | Image loading | Show today's `HAB` chip + square until the image has decoded |
| Habitat | Image failed | Keep the chip + square (never an empty spot: the routes start here) |
| Parked rover | Default | Icon at the park point, facing the walk-off direction |
| Parked rover | No rover legs in the plan | Not shown (and no `P` chip) |
| Astronauts | Replay idle (t = 0) | Both at the habitat, facing the first leg |
| Astronauts | Playing | Move along the route; B trails A by the replay's `pairLagS` (45 s) on a together walk; in a crew split each follows its own route |
| Astronauts | Turned back / home | Face the way home; at the habitat they stay drawn until the replay is reset |
| Rover | Driving (inside a `drive` leg) | One rover moves; astronauts hidden |
| Any moving figure | Images not loaded yet | Fall back to today's circles (`replay-crew`) for that frame |
| Emergency (HUD "switch to fastest way home") | — | Figures follow the switched route; heading rule unchanged |

---

### Responsive behaviour

| Breakpoint | Changes |
|---|---|
| Desktop (≥ 1024 px) | 52 px figures; tooltips on hover |
| Tablet / phone (< 1024 px) | Same 52 px (≥ 44 px tap target); tooltip opens on tap and closes on the next tap anywhere |
| High-DPI screens | `srcset` / `pixelRatio` pick @2x or @3x; never upscale the @1x file |

---

### Edge cases

- **Habitat and a target overlap** (stop next to home): the habitat stays on top; the target chip keeps its
  label offset so both read.
- **Astronaut A and B overlap** (start, end, or a pause): draw B first, A on top; both stay visible because
  B is 45 s behind on the move.
- **Very short legs** (< 1 replay second): reuse the previous heading.
- **Route crosses the date line / antimeridian:** not possible in the ops box (137.3–137.4° E); no handling.
- **Missing `meta.json` habitat:** no habitat figure; the map's empty state already covers this.
- **Slow connection:** the 25 images load in parallel with the map; until then the chips/circles stand in.

---

### Animation / motion

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Astronauts / rover | Replay playing | Position follows the replay timeline every frame (no separate tween) | Replay length (30–120 s) | Linear in mission time |
| Heading change | Sector changes | Swap to the next image instantly (no rotation tween: the 8 renders are the rotation) | 0 | — |
| Habitat caption | First appearance | Fade in | 150 ms | `ease-console` |
| Rover ↔ astronauts swap | Entering / leaving a drive leg | Instant swap | 0 | — |

Reduced motion (`prefers-reduced-motion`): the replay only moves when the user presses play, so it stays; the
caption fade is skipped.

---

### Accessibility notes

- Habitat and parked rover are DOM markers: wrapper `role="img"` with `aria-label` ("Habitat (Scenario
  position)", "Rover park point"); they are not focusable (nothing to activate). The tooltip text is also in the
  `title`.
- Moving figures live in the map canvas and aren't announced; the replay panel's `aria-live` log already
  announces phases ("Walking out", "At the stop", turn-back, switch). Don't add per-frame announcements.
- Colour is never the only difference: crew A carries a red band (art brief §3c), not just a colour.

---

### Done when

- At 52 px the habitat, rover and astronauts are recognisable on the HiRISE layer and the hillshade layer.
- Each figure's centre sits on its coordinate at zoom 13, 15 and 18 (check against the route's first point).
- During a replay the astronauts face their direction of travel and don't flicker on zigzag segments.
- With the image files removed, the map shows today's chips and circles, nothing breaks.
- With `figures: false` (or before Marwan agrees), the replay behaves exactly as today.
