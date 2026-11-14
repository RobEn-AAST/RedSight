// Narrated walkthrough (≤ 60 s). Edit lines/shots here, then `npm run narrated`.
// Wording rules: AGENTS rule 3 + docs/submission/demo-production-plan.md §5 (Scenario labels, approach-only
// endpoint, no alternate fastest-return claim, HUD = prototype on a photo stand-in, no working-copilot claim).
export const voice = 'af_heart'
export const voiceSpeed = 1.18
export const url = 'mars.roben.club/demo'
export const repo = 'github.com/RobEn-AAST/RedSight'
export const team = 'RobEn'
export const challenge = 'Interplanetary Survival Guide: Martian Map'
export const xfade = 0.3

// shots: [{ clip, from, to }] split the scene time evenly. label: small top-left feature tag.
export const scenes = [
  { card: 'title',
    say: "We're Team RobEn from Cairo. This is RedSight, a Marswalk planner for Gale crater." },
  { shots: [{ clip: 'overview', from: 0.4, to: 5.9 }], label: ['The problem', 'Maps show regions, not one walk'],
    say: 'Mars maps show whole regions. An astronaut needs one walk, and enough oxygen to get home.' },
  { shots: [{ clip: 'setup', from: 0.6, to: 13.0 }], label: ['Mission setup', 'Crew · load · rover · science goal'],
    say: 'Pick the crew, load, rover, and a science goal: boxwork, left by ancient groundwater.' },
  { shots: [{ clip: 'map', from: 0.6, to: 20.5 }], label: ['NASA data', 'Six map layers + Curiosity’s real path'],
    say: 'The map stacks NASA data: HiRISE terrain, slope, THEMIS, CRISM, geology, and Curiosity’s path.' },
  { shots: [{ clip: 'routes', from: 0.4, to: 10.0 }], label: ['Route planning', 'Fastest vs lowest hazard · modeled'],
    say: 'Our engine plans the fastest and the lowest-hazard route on one-meter terrain.' },
  { shots: [{ clip: 'decision', from: 0.6, to: 6.9 }], label: ['The decision', 'Less O₂ → earlier turn-back point (Scenario)'],
    say: 'Cut the oxygen budget, and the turn-back point moves closer to home.' },
  { shots: [{ clip: 'replay', from: 1.5, to: 34.5 }], label: ['Mission replay', 'Turn back · the reserve is never planned'],
    say: 'Replay walks the plan. They turn back, and the science stop waits. The reserve is never planned.' },
  { shots: [{ clip: 'drill', from: 3.0, to: 13.0 }, { clip: 'rover', from: 0.3, to: 15.0 }], label: ['Drills + rover', 'Suit leak ×2 · drive, park, walk the last 100 m'],
    say: 'Drills like a suit leak test the plan. A rover drives most of the way.' },
  { shots: [{ clip: 'hud', from: 0.2, to: 33.0 }], label: ['Helmet HUD · prototype', 'Photo stand-in: a Curiosity panorama'],
    say: 'At the stop, a helmet display prototype shows the way home and oxygen left.' },
  { shots: [{ clip: 'sources', from: 0.4, to: 4.7 }], label: ['Evidence', 'Observed · Derived · Scenario'],
    say: 'Every number shows its evidence and its source.' },
  { card: 'end',
    say: 'RedSight. Know when to turn back.' },
]
