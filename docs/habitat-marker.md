# Habitat marker — a miniature 3D habitat on the map (spec, 2026-11-14)

> **Art brief moved:** the build brief for all three figures (habitat, rover, astronaut) is
> [`map-figures.md`](map-figures.md). This file keeps the habitat's map behaviour (§5) and reasoning.

**Owner:** Yassin. **Status:** spec only; the model is not built yet. **Tier:** polish (replaces the
`HAB` chip + square in `app/src/map/MapCanvas.tsx`). **Label:** the habitat position is a **Scenario**
(team-placed, `meta.json` → `habitat.badge`), and the marker must not suggest a real structure exists there.

## 1. The idea

Like the car in a ride-hailing app: a small, **pre-rendered 3D model seen from above at an angle**, with a soft
shadow, sitting on the map at the habitat point. It looks solid and physical, but it is just an image, so it
costs nothing on a phone. It replaces today's `HAB` text chip + square, so the crew's start and end point is
the most recognisable thing on the map.

```
   today                      target
   ┌─────┐                      ╭──▲──╮   ← mast
   │ HAB │                 ▓▓▓▓▓[════]▓▓  ← module on legs, soil berm
   └─────┘                    ░░░░░░░░    ← soft shadow
      ■
```

## 2. What the model shows

Built after the NASA reference ideas (Mars DRA 5.0, NASA/SP-2009-566: the habitat lands already built on its
lander), simplified until each part reads at 60 px:

| Part | Shape | Colour | Must read at 60 px? |
|---|---|---|---|
| Main module | Horizontal cylinder, length ≈ 2× diameter, rounded end caps | Off-white, **dust-stained beige on the lower half** | Yes: the silhouette |
| Lander legs | 4 short angled legs | Dark grey | Barely; keep them chunky |
| Soil berm | Low mound of red-brown soil against both long sides, up to about a third of the height | Mars soil `#9b6a4a`-ish, matte | Yes: it says "on Mars", not "on a pad" |
| Airlock | Short stubby tube on one end cap, with a darker hatch | Off-white + dark hatch | Yes: it gives a "front" |
| Comms mast | Thin mast with a tiny dish | Grey + **one small lit lamp** (cyan `#3fd0ff`) | The lamp is the one accent |
| Solar panels | 2 flat dark rectangles beside the module | Dark blue-grey, faint grid | Optional |
| Rover pad | Flat cleared rectangle by the airlock, 2 tyre tracks leading off | Lighter than the ground | Optional |

Leave out: windows, logos, people, text, flags. They become noise at this size, and a logo would imply a
real programme.

## 3. View and lighting

- **Camera:** looking down at **about 55–60° from horizontal**, rotated 45° (a 3/4 view), so the top and two
  sides show. Orthographic, not perspective, so the icon doesn't look distorted. Same angle for every future
  marker (rover, crew) so they belong together.
- **Orientation:** the airlock faces **south-east (bottom-right)**. The map never rotates (`dragRotate: false`,
  rotation disabled on touch), so one fixed render is enough; no per-heading images needed.
- **Light:** one soft key light from the **top-left** plus a dim fill. Compare with the HiRISE tiles' shadows
  before the final render and match their direction if it differs; mixed light directions are what make a
  sprite look pasted on.
- **Shadow:** a soft, slightly offset contact shadow under the model, baked into the PNG (semi-transparent
  black, blurred). This is what makes the car icon look "on" the map.

## 4. Asset to deliver

| | |
|---|---|
| Format | Transparent **PNG** (WebP also fine) |
| Sizes | `habitat@1x.png` 64×64, `habitat@2x.png` 128×128, `habitat@3x.png` 192×192 (phones are 2–3×) |
| Framing | Model centred; the **habitat's ground point (centre of the base) at the exact image centre**; about 6 px transparent margin |
| Weight | Under 40 KB per file |
| Source | Keep the `.blend` file next to it (`app/public/markers/src/`), so the rover and crew markers can reuse the camera and lights |
| Location | `app/public/markers/habitat@1x.png` etc. |

**Quick Blender recipe:** a cylinder (24 sides), rotated 90° with scaled end caps → 4 leg cylinders → a
displaced, flattened UV sphere for the berm → a small cylinder airlock → a thin cylinder mast + a small dish →
an orthographic camera at 55° tilt, 45° turn → render with a transparent background (Film → Transparent) →
add the contact shadow with a shadow-catcher plane.

## 5. How it goes on the map

- A MapLibre `Marker` with an `<img srcset>` of the three sizes, **anchor `center`**, at `meta.habitat.lonlat`.
  The ground point is the image centre, so the habitat sits exactly on its coordinate.
- **Constant screen size** (about 48–56 px) at normal zoom, like the car; above the zoom where a ~15 m habitat
  is bigger than the icon (about z18 on our Mars scale), it can grow with the map. A real habitat is only about
  5–6 px wide at the route view, so true scale is never used below that.
- **Label:** keep a small `Habitat` caption under the icon (sentence case), with `role="img"` and
  `aria-label="Habitat (Scenario position)"`; the title tooltip keeps the evidence badge.
- **Replay:** the Mission Replay crew dots start and end on this point; nothing else changes.
- **Fallback:** if the image fails to load, show today's square, so the start point never disappears.

## 6. Later, same style

The same camera, lights and shadow give a consistent set: **rover** (for the rover legs' **P** park point),
**crew pair** (for the replay), **sample kit** at a target. A real 3D model (glTF in a three.js layer, three.js
is already in the app for the HUD) only makes sense if the map ever tilts; it doesn't today.

## 7. Done when

- The icon reads as "a habitat on Mars" at 56 px on a phone, on both the HiRISE and the hillshade layer.
- It sits exactly on the habitat coordinate at every zoom (check against the route's first point).
- It loads under 40 KB, and the square fallback appears if the file is missing.
- The caption and tooltip still say the position is a Scenario.
