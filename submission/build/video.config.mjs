// Edit text and timing here; re-run `npm run video`. Every caption follows AGENTS rule 3 wording and the
// caption rules in docs/submission/demo-production-plan.md §5 (Scenario labels, approach-only endpoint).
export const team = process.env.TEAM_NAME || '[Team name]'
export const url = process.env.APP_URL || '[public app link]'
export const challenge = 'Interplanetary Survival Guide: Martian Map'

// seg: { clip, from, to, speed } is cut from out/clips; card: title/end cards are rendered.
// cap.pos: 'bl' bottom-left, 'tl' top-left. Duration on screen = (to - from) / speed.
export const segments = [
  { card: 'title', dur: 3.2 },
  { clip: 'map', from: 0.6, to: 12.6, speed: 2.4,
    cap: { pos: 'bl', tag: 'Gale crater · Mount Sharp', head: 'A walk-scale map built from NASA data',
      sub: 'HiRISE terrain · THEMIS · CRISM · Curiosity’s real path' } },
  { clip: 'routes', from: 0.3, to: 8.8, speed: 1.9,
    cap: { pos: 'bl', tag: 'Science goal · boxwork veins (ancient groundwater)', head: 'Two modeled walks to the boxwork stop',
      sub: 'Fastest vs lowest hazard · 15° slope limit · Scenario estimates' } },
  { clip: 'decision', from: 0.4, to: 10.4, speed: 1.8,
    cap: { pos: 'bl', tag: 'The decision', head: 'Less oxygen? The turn-back point moves.',
      sub: 'Usable O₂ 288.8 L → 70 L: turn 950 m out, at 33 min (Scenario)' } },
  { clip: 'replay', from: 1.5, to: 34.5, speed: 6,
    cap: { pos: 'tl', tag: 'Mission replay', head: 'They turn back. The science stop waits.',
      sub: 'Return along the modeled path · the O₂ reserve is never planned' } },
  { clip: 'sources', from: 2.2, to: 7.4, speed: 1.4,
    cap: { pos: 'bl', tag: 'Know the limits', head: 'Every number shows its evidence',
      sub: 'Observed · Derived · Scenario · routes end at an approach point' } },
  { card: 'end', dur: 3.2 },
]
export const xfade = 0.25
