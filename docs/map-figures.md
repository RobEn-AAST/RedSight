# Map figures brief — habitat, rover, astronaut (2026-11-14)

**For:** whoever builds the figures (Blender, or Figma). Everything you need is in this file; you don't need
to read the app code. **Owner on the app side:** Yassin (he wires the files in). Earlier, habitat-only draft:
[`habitat-marker.md`](habitat-marker.md); this file replaces it for the art.

## 1. What we need, in one paragraph

Three small **3D-looking map icons**, like the car in a ride-hailing app: a real little 3D model, rendered from
above at an angle with a soft shadow, saved as a transparent PNG. They sit on a satellite map of Mars (grey
orbital photos of rocky, layered terrain). The **habitat** marks home; the **rover** shows where the crew drives
and parks; the **astronauts** move along the route during a replay. They must read instantly at about
**48–56 px on a phone**, look like one family, and look like real NASA-style equipment, not sci-fi toys.

## 2. Shared style (all three)

| Rule | Value | Why |
|---|---|---|
| View | Orthographic camera, **tilted 55° down from horizontal**, turned **45°** (3/4 view: top + two sides show) | Same as the car icon; looks solid but stays readable |
| Light | One soft key light from the **top-left** (north-west on the map), weak fill, no coloured lights | Matches the map photos; mixed light directions look pasted on |
| Shadow | Soft contact shadow on the ground, ~30% black, baked into the PNG | Makes the icon sit *on* the map |
| Detail | Low poly, chunky shapes; anything thinner than ~2 px at 56 px will vanish, so thicken it or drop it | Icons, not models for close-up |
| Materials | Matte, slightly rough. Off-white `#E8E4DC`, mid grey `#8A8F96`, dark grey `#3A3E44`, Mars dust beige `#C9A27E` (dust on the lower parts), soil red-brown `#9B6A4A` | Everything on Mars gets dusty from the bottom up |
| Accent | **One** small accent per figure, nothing else saturated: cyan `#3FD0FF` lamp/visor glint | The map already uses colour for routes; figures must not compete |
| No | Text, logos, flags, faces, national markings, glowing outlines, black outlines | Logos imply a real programme; outlines look cartoonish |
| Ground point | The point where the figure touches the ground = **exact centre of the image** | The app pins the image centre on the map coordinate |

## 3. The three figures

### 3a. Habitat (1 image)

Look: the first base on Mars, landed already built.

- Main module: horizontal cylinder, length ≈ 2× diameter, rounded end caps, off-white, **dust beige on the lower
  third**.
- 4 short, chunky lander legs (dark grey).
- **Soil berm**: low red-brown mound piled against both long sides, up to a third of the height (radiation
  shielding).
- Airlock: short stubby tube on one end cap with a darker hatch, facing **bottom-right** in the render.
- Comms mast: thin mast + tiny dish; **cyan lamp** on top (the accent).
- Optional: 2 flat dark solar panels beside it; a lighter cleared pad with two tyre tracks by the airlock.
- Footprint in the icon: about 80% of the image width.

### 3b. Rover (8 images, one per heading)

Look: an open crew rover, a bigger, dustier cousin of the Apollo lunar rover; 2 seats, no cabin.

- Low flat chassis, **6 wheels** (3 per side), wheels large and chunky with visible treads, dark grey.
- 2 seats side by side near the front; a cargo rack at the back with 2–3 sample boxes (grey).
- Small high-gain dish on a short mast; **cyan lamp** on the mast (the accent).
- Dust beige on the wheels and lower body.
- **Front** must be obvious: seats/console at the front, rack at the back, a slightly different front bumper.
- No crew sitting in it (the astronaut figures cover people).

### 3c. Astronaut (8 headings × 2 crew = 16 images)

Look: a person in a white surface suit with a backpack, walking.

- Suit: white/off-white, bulky, rounded helmet with a dark gold-tinted visor (**cyan glint** on the visor = the
  accent), large life-support backpack (PLSS) on the back, darker boots and gloves, dust beige on the boots and
  lower legs.
- Pose: mid-stride, walking forward, arms slightly out (suits are stiff).
- **Two crew variants**, same model:
  - `astronaut-a`: a **red band** on each upper arm and around the helmet base (Apollo commanders wore red
    stripes so crews could tell each other apart, and we follow that idea);
  - `astronaut-b`: all white, no band.
- Scale: in the icon the astronaut is taller than wide; the head + backpack must still read at 48 px.

## 4. Headings (rover and astronauts)

The map never rotates (north is always up), but the rover and the astronauts **face the way they move**. A 3/4
view can't simply be spun like a flat top-down icon, so render **8 headings, 45° apart**, by rotating the model
(not the camera) about its vertical axis:

| File suffix | Facing (on screen) | Model rotation |
|---|---|---|
| `-n` | up | 0° |
| `-ne` | up-right | 45° |
| `-e` | right | 90° |
| `-se` | down-right | 135° |
| `-s` | down | 180° |
| `-sw` | down-left | 225° |
| `-w` | left | 270° |
| `-nw` | up-left | 315° |

Keep the camera, light and shadow fixed, so the light stays top-left in every image. The habitat needs only its
one default view.

## 5. Files to deliver

| | |
|---|---|
| Format | Transparent PNG (RGBA). WebP also accepted |
| Sizes | Every image at **@1x 64×64, @2x 128×128, @3x 192×192** |
| Weight | Under 40 KB per @3x file |
| Names | `habitat@2x.png`; `rover-ne@2x.png`; `astronaut-a-sw@3x.png` (figure, crew, heading, scale) |
| Folder | `app/public/markers/` (images) and `app/public/markers/src/` (the `.blend` or Figma link + one preview sheet) |
| Preview sheet | One PNG with all 25 images laid out on a mid-grey background, labelled, to check them side by side |
| Count | 1 habitat + 8 rover + 16 astronaut = **25 figures × 3 sizes = 75 files** |

## 6. How to build it

**Blender (recommended, it gives real 3D shading and true headings):**

1. Model each figure from primitives (cylinders, cubes, spheres) as in §3; bevel the edges slightly so light
   catches them.
2. Camera: orthographic, rotation X 55°, Z 45°; frame so the figure fills ~80% (habitat) / ~70% (rover) /
   ~60% (astronaut, it is tall) of a square.
3. Light: one Sun light from the top-left, low strength fill; World colour dark grey.
4. Shadow: a plane under the figure with *Shadow Catcher* on; Film → *Transparent*.
5. Headings: rotate the model in 45° steps (a short script or keyframes 1–8) and render each.
6. Render at 192×192 (@3x), then downscale to 128 and 64 (so the small ones stay sharp, not re-rendered
   blurry).

**Figma (if no 3D tool):** draw each figure as an isometric illustration with flat light/mid/dark faces (top
lightest, left mid, right darkest, matching a top-left light), a blurred ellipse for the shadow, and export
PNGs at 1×/2×/3×. Do the 8 headings as 8 drawings. Don't mirror one heading to get another: mirroring moves
the light to the top-right, and the set would no longer match.

## 7. How the app uses them (so you can check your work)

- Each icon is shown at about **48–56 px** with its centre on the map point; it doesn't grow with zoom until the
  map is zoomed in very far.
- The map underneath is grey orbital photography (light rock, dark sand, cliffs). Test every icon on a grey
  textured background and on a darker one.
- The rover picks the heading image closest to its direction of travel; at the park point it sits still. The
  astronauts do the same while walking.
- Next to the route colours (amber, green, red dashed) the figures should stay neutral.

## 8. Done when

- At 48 px on a phone, someone who hasn't seen them says "base", "rover", "astronaut" without a caption.
- All 25 figures share the same light direction, shadow, camera angle and colours.
- Crew A and B are told apart at 48 px (the red band shows).
- The front of the rover and the walking direction of the astronauts are obvious in every heading.
- The ground point is at the image centre in every file; files are under 40 KB at @3x.
- The preview sheet is in `app/public/markers/src/`.
