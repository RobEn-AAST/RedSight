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
      'The sulfate-bearing layer Curiosity is climbing through now. Every site in this area sits in it.',
    sourceName: 'Fraeman et al. 2016, JGR-Planets (10.1002/2016JE005095); Curiosity 2025 traverse',
    sourceUrl: 'https://agupubs.onlinelibrary.wiley.com/doi/10.1002/2016JE005095',
    caveat: 'Orbital spectra map the layer as a whole, not single rocks.',
  },
  {
    id: 'clay-unit',
    label: 'Fe/Mg smectite clays',
    evidence: 'derived',
    summary:
      'Clay-bearing rock lower down Mount Sharp, where the record of changing Martian water begins.',
    sourceName: 'Fraeman et al. 2016, JGR-Planets (10.1002/2016JE005095)',
    sourceUrl: 'https://agupubs.onlinelibrary.wiley.com/doi/10.1002/2016JE005095',
    caveat: 'The clay unit lies below this operations area, so no site here serves this goal.',
  },
  {
    id: 'boxwork',
    label: 'Boxwork Ca-sulfate veins',
    evidence: 'observed',
    summary:
      'Ridges 1–2 m tall left by groundwater, found by Curiosity in 2025. Four of the five sites here are boxwork sites.',
    sourceName: 'JPL press release 2025-06-23 “Curiosity Starts Unpacking Boxwork Formations”',
    sourceUrl: 'https://www.jpl.nasa.gov/news/nasas-curiosity-mars-rover-starts-unpacking-boxwork-formations',
    caveat: 'Identified by Curiosity mastcam/ChemCam — hosted in the CRISM-mapped sulfate unit.',
  },
]

/** Honest status of goals the data cannot support. */
export const unavailableGoalNote =
  'Sub-meter mineral mapping does not exist publicly for any Mars site; targets finer than CRISM’s host-unit resolution (or Curiosity ground truth) are UNAVAILABLE and will not be offered as map pins.'
