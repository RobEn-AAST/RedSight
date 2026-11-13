---
version: 1
slug: "app"
primary_target: "app"
related_targets: []
---

# Surface brief — RedSight mission console (app/)

Scope: the whole single-page console (mission setup → workspaces: map, routes, provenance, HUD,
copilot). Visitor mode: **Operate** — the operator completes planning tasks; scanability, states, and
keyboard operability outrank expression. Platform: web (desktop-first, mobile-responsive).

Audience & job: an astronaut-class operator (demo persona) sets up a Marswalk mission and reviews
evidence-backed layers; judges verify honesty mechanics in seconds. Proof: taxonomy badges, provenance
cards, honest empty states, working controls. Constraints: no invented data, banned wording list,
no NASA insignia in generated content, no backend for core app, provider panel must show
not-configured truth.

## Direction contract

THESIS: the console is the inside of a station — structural panel grid, instrument typography,
restrained signal lighting — refusing the category default of a centered marketing page with cards.
The screen is a working surface you inhabit, not a page you read.

OWN-WORLD: deep near-black blue-charcoal surfaces with thin luminous panel seams; one signal amber
for operator-attention states plus taxonomy badge colors (observed cyan / derived violet / scenario
amber / unavailable gray); condensed industrial sans for labels, tabular numerals for readouts;
chamfered panel corners (clipped, not rounded-card); scanline-thin dividers; stepper-driven mission
setup; per-panel headers with status LEDs. Recognizable with all content removed.

STORY: the visitor first sees MISSION SETUP as a lit console step sequence; completing it "powers"
the console into workspaces (map/routes/provenance/HUD) that honestly report what is and is not
loaded; the copilot dock states its unconfigured status plainly. The operator believes the numbers
because every one carries a badge and a source.

FIRST VIEWPORT: full-viewport console. Left rail = station identity + mission clock + workspace
switcher (desktop; becomes top bar on mobile). Center = active workspace panel with header strip
(title, status LED, taxonomy badge legend). First-run center = mission setup stepper (crew → load →
rover → science goal → review) with primary action "Confirm mission" bottom-right of the panel.

FORM: pinned by the user's brief (spacecraft/station interior) — brief-pinned direction beats the
roll; no seed key. Code-led build (no image generation in this harness; the ambition lives in this
contract).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the
verdict, DESIGN.md, and every shipping raster carrying its provenance.
