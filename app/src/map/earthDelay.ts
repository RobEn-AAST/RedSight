/**
 * Earth–Mars signal delay provenance and copy (Tier 1, B6c — Derived).
 *
 * Pure module with no React or bundler-alias imports so it runs under both
 * Vite and `node --test`. All figures come from NASA Langley's published
 * analysis (McBrayer, Chai & Judd, ASCEND 2022, NTRS 20220013418).
 */

export const EARTH_DELAY_SPEC = {
  maxOneWayMin: 22,
  longStayMinRange: [15, 21] as readonly [number, number],
  maxRoundTripMin: 44,
  badge: 'derived' as const,
  citation:
    'McBrayer, Chai & Judd (NASA Langley), "Communication Delays, Disruptions, and Blackouts for Crewed Mars Missions", ASCEND 2022 (NASA NTRS 20220013418)',
  shortCitation: 'NASA NTRS 20220013418',
  sourceUrl: 'https://ntrs.nasa.gov/citations/20220013418',
  summaryLine:
    "Earth can't help in time: a one-way signal takes up to ≈ 22 min (15–21 min during long surface stays), with relay gaps and blackouts, so the crew decides on site.",
  rationaleLine:
    'That is why RedSight precomputes the turn-back limit and switches to the fastest return on its own when modeled O₂ gets low.',
  provenanceNote:
    'Computed from Earth–Mars orbital separation and light speed (max ≈ 22 min one-way / ≈ 44 min round-trip; 15–21 min during long surface stays), alongside scheduled relay gaps and solar-conjunction blackouts.',
} as const
