# Handoff Spec: RedSight planner (setup → routes)

**Written:** 2026-11-14 by Yassin, from the code on `main` (`app/src/`). No Figma file exists; the code is
the design source. **Stack:** React 19 + TypeScript, Tailwind v4 (tokens in `app/src/styles/tokens.css`),
MapLibre GL 6, motion, lucide-react. Companion docs: [`app-redesign.md`](app-redesign.md) (why the flow is
this way), [`habitat-marker.md`](habitat-marker.md), [`hud-plan.md`](hud-plan.md).

Not covered here: the 360° view + HUD (`app/src/hud/`, Marwan, spec in `hud-plan.md`) and the copilot drawer
(`app/src/copilot/`, Ali). An unmerged restyle exists as a local stash (cockpit colours, B612 type); this spec
describes **main as it is**.

---

### Overview

A crew member plans one Mars walk from the habitat in Gale crater. Two screens, used in order:

1. **Set up**: five short questions (crew, load, rover, science goal, review).
2. **Routes**: a map beside one numbered panel: *where to sample → pick a route → (who goes where) → your
   plan*.

The user is an astronaut-planner, possibly on a tablet or phone in the habitat. Every number on screen comes
from engine files in `app/public/data/`; the UI sums and compares, never models. Every number carries an
evidence label (Observed / Derived / Scenario / Unavailable), and the wording rules in `AGENTS.md` rule 3 apply
(no "safe route", "real-time", "validated"…).

---

### Layout

**Shell** (`App.tsx`): full viewport height (`h-dvh`), column:

```
┌ header ────────────────────────────────────────────────┐  bg hull, 1px seam below
│ [mark] REDSIGHT  Gale crater · Mount Sharp   (1)Set up ── (2)Routes   [Mock data] [Sources] │
├ main (flex-1, scrolls on phone, fixed on desktop) ─────┤
│  Set up screen  OR  Routes screen                       │
└─────────────────────────────────────────────────────────┘
                                         [copilot button, floating]
```

**Set up** (`mission/MissionSetup.tsx`): step bar (5 chips) → one question at a time in a centred column
(`max-w-2xl`, padding `p-4` / `sm:p-6`, gap `gap-6`) → footer bar with Back · "Step n / 5" · Next (last step:
**Show routes**). The question area scrolls; the step bar and footer stay.

**Routes** (`map/MapWorkspace.tsx`):

```
Desktop ≥ 1024 px (lg)                         Phone / tablet < 1024 px
┌──────────────────────────────┬───────────┐   ┌──────────────────┐
│ map (fills height)           │ panel     │   │ map  60dvh       │
│  legend strip (top)          │ 26rem     │   │  (min 320 px)    │
│  [Layers] (top right)        │ scrolls   │   ├──────────────────┤
│  scale (bottom left)         │ on its    │   │ panel (full      │
│  replay bar (bottom centre)  │ own       │   │ width, page      │
│  zoom (bottom right)         │           │   │ scrolls)         │
└──────────────────────────────┴───────────┘   └──────────────────┘
```

Grid: `lg:grid-cols-[minmax(0,1fr)_26rem]`. Map always left/top; panel always right/bottom, so on a phone the
map is seen first and the plan is a scroll away.

---

### Design Tokens Used

All colours are Tailwind theme tokens (`bg-<name>`, `text-<name>`, `border-<name>`). Map-only colours live in
`map/format.ts` because MapLibre paint needs literal values; keep the two in step.

| Token | Value | Usage |
|---|---|---|
| `void` | #06080b | Page background behind everything |
| `hull` | #0b0f15 | Header, floating bars on the map, dialogs |
| `panel` / `panel-2` | #10151d / #151b25 | Plan panel / raised rows |
| `inset` | #0a0e14 | Map background, input fields, stat tiles |
| `seam` / `seam-lit` | #1e2733 / #2c3947 | Dividers, borders / hovered or stronger borders |
| `ink` / `ink-dim` / `ink-faint` | #e9edf3 / #9aa6b5 / #7d8895 | Text: primary / secondary / tertiary (faint still ≥ 4.5:1 on `panel-2`) |
| `signal` (+`-soft`) | #ffb224 | The one lit control: primary button, current step, focus ring, selection |
| `caution` (+`-soft`) | #ff6d6d | Warnings: turn back, after sunset, no-return note |
| `go` (+`-soft`) | #4fd08a | "Fits the budget" states |
| `hazard` | #b98cff | Too-steep ground (legend + popup border) |
| `observed` / `derived` / `scenario` / `unavailable` (+`-soft`) | #56d8f4 / #b9a4f5 / #f59a5f / #8a94a3 | Evidence badges **only**, plus sample areas (observed) |
| `font-display` | Chakra Petch 500–700 | Brand, headings, `label-console` labels |
| `font-body` | IBM Plex Sans 400–600 | Body text |
| `font-data` | IBM Plex Mono 400–500, tabular nums | All numbers (`data-readout`) |
| `label-console` | display, 11px, 500, `0.14em`, uppercase | Section titles, button labels, chips |
| `ease-console` | cubic-bezier(0.2, 0.8, 0.2, 1) | All UI motion |

| Map colour (`format.ts`) | Value | Usage |
|---|---|---|
| `MODE_COLOR.fastest` | #ffb224 | Fastest route line + card bar |
| `MODE_COLOR.safest` | #4fd08a | Lowest-hazard route line + card bar |
| `MEMBER_B_COLOR` | #e9edf3 | Astronaut B's route in a crew split |
| `NO_RETURN_COLOR` | #ff6d6d | No-return line (dashed) |
| `HAZARD_COLOR` / `UNKNOWN_GROUND_COLOR` | #b98cff / #9aa3b2 | Too steep / no elevation data or map edge |
| Sample areas / sites | #56d8f4 | Target fill + outline, or site ring |

Spacing uses Tailwind's 4 px scale; panel sections are `px-4 py-4` with `gap-3` inside; map overlays sit
`3` (12 px) from the edges. Corners are square (no radius) across the app.

---

### Components

| Component | File | Variant / props | Notes |
|---|---|---|---|
| Button | `ui/Button.tsx` | `variant`: primary · ghost · quiet; `size`: md (min-h 44px) · sm (min-h 36px) | Primary = signal fill, dark text. One primary per screen |
| StepTabs | `App.tsx` | 2 steps; current = signal number box | "Routes" disabled until setup is confirmed |
| Section | `map/PlanPanel.tsx` | `step`, `title` | Numbered because the panel **is** a sequence |
| TargetPicker | `PlanPanel.tsx` | list of goal targets | Row: id chip + name + substances; selected row = observed border/fill |
| RouteChoice | `PlanPanel.tsx` | 2 radio cards (Fastest / Lowest hazard) | Each: colour bar, label, round-trip time (mono, large), "% of O₂", steepest slope; caption under both |
| CrewChoice | `PlanPanel.tsx` | Walk together / Split up | Only when the plan file has a `split` (crew of 2) |
| MemberTimeline | `PlanPanel.tsx` | per astronaut | Steps: drive / walk / sample / home, icon + title + detail |
| Fold | `map/Fold.tsx` | `icon`, `title`, `answer`, `tone`: plain · caution | Native `<details>`; the closed row shows its answer |
| OxygenFold | `PlanPanel.tsx` | — | No-return note + turn-back slider (`TurnBackPanel bare`) |
| DaylightNote | `map/DaylightNote.tsx` | — | Fold; Earth date + leave time → sunrise / back home / sunset |
| Replay fold | `PlanPanel.tsx` | — | `MissionReplay bare` (+ the 360° button for S1/S2) |
| EvaRadiationCard, RouteBreakdown | `map/` (Ayman) | — | Dose card; elevation profile + "why this route" |
| EvidenceBadge | `ui/Badge.tsx` | `evidence` | Label text always present; colour never the only signal |
| MapCanvas | `map/MapCanvas.tsx` | `box`, `enabledLayers`, `showImagery` | See map layers below |
| Layers menu | `MapWorkspace.tsx` | button + popover | Orbital image, Curiosity path, every `available` tile layer |
| SourcesDialog | `App.tsx` | modal | Wraps `ProvenancePanel` |

**Map layers, bottom to top:** context image → ops-box image → tile layers (if on) → dim mask outside the box
→ box outline → no-go ground (fill + outline, coloured by reason) → sample areas/sites → Curiosity path →
no-return line → other route (faint dotted) → chosen route (casing + line; drive = dashed, walk = solid) →
markers (targets, HAB, P park point, A/B ends) → replay layers.

---

### States and Interactions

| Element | State | Behavior |
|---|---|---|
| Primary button | Hover / active | Lighter / darker signal fill |
| Any button | Disabled | 40% opacity, `not-allowed` cursor |
| Any control | Focus (keyboard) | 2px signal outline, 2px offset (`:focus-visible`) |
| Step tab "Routes" | Before setup confirmed | Disabled, faint |
| Target row / map chip | Tap | Selects the target; map refits to its routes |
| Route card | Tap | Switches mode; map redraws chosen route on top, other faint dotted |
| Fold | Tap summary | Opens/closes; chevron rotates 180° |
| No-go area | Tap | Popup with the reason ("Too steep", "No elevation data", …) and the engine's note; cursor `help` on hover |
| Curiosity waypoint | Hover | Tooltip "Curiosity · Sol n" (top right) |
| Layers button | Tap | Toggles the popover (`aria-expanded`) |
| Turn-back slider | Drag | Moves the TURN marker along the route; replay uses the same budget |
| Daylight inputs | Change | Recomputes instantly; caution tone if home after sunset / out before sunrise |
| Sources | Tap | Opens the modal; Esc or backdrop closes; focus goes to Close |

---

### Responsive Behavior

| Breakpoint | Changes |
|---|---|
| Desktop (≥ 1024 px, `lg`) | Map + 26rem panel side by side; page fixed, panel scrolls on its own |
| Tablet (640–1023 px) | Stacked like phone; header shows the brand text and step labels |
| Phone (< 640 px) | Stacked: map 60dvh (min 320 px), panel below, the page scrolls; brand text, inactive step labels and "Mock data" badge hidden; Sources shows the icon only |

---

### Edge Cases

- **No target for the goal** (e.g. clay): caution notice "No known site for … inside the operations area. All
  sites are shown instead." and the full list.
- **No routes for the exact setup:** the nearest preset is shown with a scenario-coloured note ("No plan exists
  yet for your exact setup. Showing crew 2, 15 kg, on foot instead."). Real routes exist for crew 2, 15 kg only.
- **Rover chosen, no rover legs in the data:** note "Rover legs are not in the engine output yet. This plan is
  on foot."
- **Mock files:** header badge "Mock data" when any shown file has `_mock`; mock plan files are ignored when
  real route files exist; mock target outlines are drawn as site rings, not areas.
- **Loading:** text states ("Loading routes…"); no skeletons. Map shows its background until tiles arrive.
- **Missing `meta.json`:** the map is replaced by an empty state "Map data not found".
- **Missing tiles:** a layer marked `available` but without files simply draws nothing; `npm run check:data`
  reports it.
- **Long names:** target names wrap; the selected map chip shows "S1 · First boxwork 360", others only the id.
- **Slow connection:** `hazards.geojson` is 6.4 MB and loads before no-go ground appears; the rest of the map
  works meanwhile.

---

### Animation / Motion

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Sources backdrop | Open / close | Fade | 150 ms | linear |
| Sources dialog | Open / close | Fade + 12 px rise | 180 ms | `ease-console` |
| Map | Target / route change | `fitBounds` to the route | MapLibre default; **0 with reduced motion** | MapLibre |
| Fold chevron | Open / close | Rotate 180° | Tailwind default (150 ms) | — |
| Raster layers | Load | No fade (`raster-fade-duration: 0`) | 0 | — |

`MotionConfig reducedMotion="user"` plus the global reduced-motion rule in `tokens.css` turn motion off for
users who ask for it.

---

### Accessibility Notes

- **Focus order:** header (steps → Sources) → map (canvas, Layers, zoom) → panel top to bottom (Edit → targets →
  route cards → crew → folds → footer link) → copilot button.
- **Roles / labels:** steps `ol[aria-label="Steps"]` with `aria-current="step"`; route cards `role="radio"` +
  `aria-checked`; map chips are buttons with `aria-label="Target S1: …"` and `aria-pressed`; Sources
  `role="dialog" aria-modal`; Layers button `aria-expanded` + `aria-controls`; map container
  `aria-label="Map of the operations area"`.
- **Keyboard:** everything is a native button, input or `<details>`; Esc closes Sources; the map takes arrow
  keys and +/− when focused.
- **Contrast:** text tokens meet WCAG AA on their surfaces (`ink-faint` checked on `panel-2`); evidence is
  always written, never colour alone.
- **Touch targets:** md buttons and fold rows are ≥ 44 px; sm buttons 36 px.

---

### Known issues on main (to fix)

| Issue | Where | Fix (already written in the stashed restyle) |
|---|---|---|
| Sources dialog list can't scroll: 8,563 px of content in a 744 px box | `App.tsx` `SourcesDialog` | Wrap `ProvenancePanel` in `min-h-0 flex-1 overflow-y-auto overscroll-contain`, keep Close outside it |
| On a phone the map takes one-finger swipes, so most of the screen can't scroll the page | `MapCanvas.tsx` | `cooperativeGestures` when `(pointer: coarse) and (max-width: 1023px)` |
| The 360° view is four taps deep (inside the closed replay fold) | `PlanPanel.tsx` | A "360° view" button on S1/S2 in *Where to sample* |
| Map tiles are not in git | deploy | Run `engine/data/download.py` + `engine/tiles/build_tiles.py` before building |
