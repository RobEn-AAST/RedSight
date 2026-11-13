/** Map layer + provenance card types. Evidence classes mirror docs/technical-approaches.md. */

export type EvidenceClass = 'observed' | 'derived' | 'scenario' | 'unavailable'

export interface LayerCard {
  id: string
  name: string
  instrument: string
  evidence: EvidenceClass
  resolution: string
  /** Access status as verified during research (2026-11-13); none are pulled into the app yet. */
  status: 'verified-source' | 'planned'
  sourceName: string
  sourceUrl: string
  note?: string
}

export const evidenceClassLabel: Record<EvidenceClass, string> = {
  observed: 'Observed',
  derived: 'Derived',
  scenario: 'Scenario',
  unavailable: 'Unavailable',
}
