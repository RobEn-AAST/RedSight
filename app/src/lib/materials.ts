import type { EvidenceClass } from '@/types/layers'

/**
 * Evidence-backed science-goal options for mission setup.
 * Every option cites its primary evidence; classes per technical-approaches §1.3.
 * Spectral resolution caveats are stated so targets are never oversold.
 */
export interface ScienceGoalOption {
  id: string
  label: string
  evidence: EvidenceClass
  summary: string
  sourceName: string
  sourceUrl: string
  caveat?: string
}

export const scienceGoalOptions: ScienceGoalOption[] = [
  {
    id: 'sulfate-unit',
    label: 'Sulfate-bearing unit',
    evidence: 'derived',
    summary:
      'Poly-sulfate mineral indicator mapped from CRISM spectra over lower Mount Sharp — the upper part of the curiosity traverse corridor.',
    sourceName: 'Mars Trek MC18_PolySulfate_Mineral_IndicatorV2 (CRISM-derived)',
    sourceUrl: 'https://trek.nasa.gov/mars/',
    caveat: 'CRISM resolves the host unit (~18 m/px targeted, ~200 m/px mapped), not individual veins.',
  },
  {
    id: 'clay-unit',
    label: 'Fe/Mg smectite clays',
    evidence: 'derived',
    summary:
      'Clay-bearing units at the base of Mount Sharp — the clay→sulfate transition that records changing Martian waters (Fraeman et al. 2016).',
    sourceName: 'Mars Trek CRISM Fe/Mg-smectite indicator; Fraeman et al. 2016, JGR-Planets (10.1002/2016JE005095)',
    sourceUrl: 'https://agupubs.onlinelibrary.wiley.com/doi/10.1002/2016JE005095',
    caveat: 'Same host-unit resolution limits as sulfates.',
  },
  {
    id: 'boxwork',
    label: 'Boxwork Ca-sulfate veins',
    evidence: 'observed',
    summary:
      'Ridges ~1–2 m tall across a miles-wide exposure in the sulfate layer — groundwater evidence identified by Curiosity imaging (2025), the ground truth orbital spectra cannot resolve.',
    sourceName: 'JPL press release 2025-06-23 “Curiosity Starts Unpacking Boxwork Formations”',
    sourceUrl: 'https://www.jpl.nasa.gov/news/nasas-curiosity-mars-rover-starts-unpacking-boxwork-formations',
    caveat: 'Identified by Curiosity mastcam/ChemCam — hosted in the CRISM-mapped sulfate unit.',
  },
  {
    id: 'survey',
    label: 'Open survey traverse',
    evidence: 'scenario',
    summary:
      'No fixed spectral target: plan a traverse that samples terrain variety (dunes, bedrock, scarps) using HiRISE imagery + slope layers.',
    sourceName: 'Team choice — terrain-guided planning',
    sourceUrl: 'https://github.com/RobEn-AAST/RedSight',
    caveat: 'Target selection is operator judgment, not a dataset.',
  },
]

/** Honest status of goals the data cannot support. */
export const unavailableGoalNote =
  'Sub-meter mineral mapping does not exist publicly for any Mars site; targets finer than CRISM’s host-unit resolution (or Curiosity ground truth) are UNAVAILABLE and will not be offered as map pins.'
