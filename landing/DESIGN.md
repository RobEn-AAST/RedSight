---
version: 1.0
name: redsight-identity
description: "Mission-hardware cinematic: Bugatti's black-ladder austerity and Bugatti/Mono tracking discipline fused with IBM's single-accent engineering semantics. The only voltage on the page is the living Mars render. Warm white type on a blue-black void; rust is the signature, blue is only for touching."
colors:
  void: "#070A12"          # canvas — blue-black space
  surface-1: "#0C101B"     # raised panel
  surface-2: "#141A28"     # card steel
  hairline: "#1D2637"      # panel borders
  hairline-strong: "#2A3550"
  ink: "#E9E4DA"           # warm white text
  ink-muted: "#9BA3B4"
  ink-faint: "#5E6678"
  rust: "#E0653A"          # SIGNATURE — Mars rust (headlines accents, route lines, display spans)
  rust-bright: "#F0854F"   # hover ramp
  rust-deep: "#8F3A1F"     # pressed/ghost
  blue: "#5B8CFF"          # INTERACTIVE ONLY — links, buttons, focus
  blue-hover: "#8AA9FF"
  success: "#6FBF8F"
  warning: "#E8B34B"
fonts:
  display: "Syne"          # 700/800, wide tracking — the alien-geometric voice
  body: "Switzer"          # 400/500/600 — invisible workhorse
  mono: "IBM Plex Mono"    # 400/500 — telemetry, coordinates, formulas
rounded: "2px — mission hardware. Squares with 2px forgiveness."
spacing: "8px base. Sections breathe 120–160px vertical."
---

# RedSight — mars.roben.club

## Overview
A cinematic single-page mission briefing for the RedSight project (NASA Space Apps 2026,
"Interplanetary Survival Guide: Martian Map") by the RobEn Software & AI team, AASTMT.
One persistent actor — a slowly rotating photoreal Mars — is choreographed by scroll
through the entire page. Content panels float over the void like HUD elements.
Dialect mix: **Bugatti** (black ladder #070A12→#141A28, uppercase letterspaced display,
mono captions with 2px+ tracking, hairlines instead of shadows, one voltage source)
+ **IBM** (single confident accent for interaction, engineering-grade restraint,
2px corners, data presented as spec sheets). Divergence from both: an orbital 3D
actor that reacts to scroll, warm-white ink (not pure white), rust signature (not blue).

## Colors
- `void` is never pure black; panels step up a ladder (void → surface-1 → surface-2).
- `rust` is reserved for the brand voice: display accents, the route motif, key data.
- `blue` appears ONLY where the user can act (links, buttons, focus rings). Never decoration.
- Text hierarchy: ink → ink-muted → ink-faint (60% range). No 100% white anywhere.
- Gradients: banned except the planet's own lighting and one 1px panel top-edge.

## Typography
- Display: Syne 800, uppercase, letter-spacing 0.04–0.12em, line-height 0.95–1.1.
- Body: Switzer 400/500, 16–18px, line-height 1.6, max 68ch measure.
- Telemetry: IBM Plex Mono 400/500, 11–13px, uppercase, +0.16em tracking — used for
  coordinates, section markers, formulas, button labels. Purposeful, never filler chrome.
- Never: Inter/Poppins/Space Grotesk as identity; italic accents in headlines.

## Layout
- Single column of full-bleed sections; content constrained to 1200px, generous margins.
- Asymmetry over grids: statements sit large-left or large-right; lists are readouts,
  not card rows. No three identical icon cards. No bento. No zig-zag ×3.
- Panels: hairline borders, surface-1/2 fills, 2px radius, corner tick brackets
  (HUD reticle motif) on KEY panels only.
- One oversized moment per page: the hero display + planet.

## Elevation & depth
- No drop shadows. Depth = the ladder (void < panel < hairline < ink).
- The 3D layer (stars, dust, Mars) sits behind all content at z-0; content z-10.
- Floating feel via slow parallax on panels (translateY ±12px) — never bounce.

## Shapes
- Rectangles with 2px radius. Reticle: circle + tick marks as the logo/motif.
- The route line (SVG dashed arc with rust stroke) recurs as section connector.

## Motion signature
- ONE orchestrated moment: the scroll-choreographed Mars (position, scale, tilt,
  and rotation speed interpolate per section; continuous 0.02 rad/s idle spin).
- Everything else: opacity/4px-translate reveals on enter, 0.6s, power2.out,
  staggered ≤80ms. Hover states 150ms. No elastic, no infinite loops on static info.
- prefers-reduced-motion: static hero framing, reveals become instant opacity.

## Do's
- Credit every dataset inline (mission + instrument) — it's the point of the project.
- Tabular numerals for all data. Real constants with citations on screen.
- Boot sequence ≤1.8s, skippable, once per session.

## Don'ts
- No NASA meatball/worm/seal logos anywhere; no "official NASA" phrasing; footer disclaimer mandatory.
- No invented metrics, no fake dashboards, no glassmorphism, no glow text,
  no "Scroll to explore", no emoji, no decorative middle-dot strings as chrome.
- No purple, no gradients on text, no pure #000/#fff.
