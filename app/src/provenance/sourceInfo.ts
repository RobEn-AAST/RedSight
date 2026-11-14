import type { ReactNode } from 'react'

import type { ContractBadge, EngineConstant } from '@/lib/engineDataContext'
import { badgeToEvidence } from '@/map/format'
import type { EvidenceClass } from '@/types/layers'

/** Provenance helpers shared by the source cards (B5). Owner: Jana.
 *  Definitions are the repo's own (docs/challenge-in-plain-language.md §1). */

export const EVIDENCE_DEFINITION: Record<EvidenceClass, string> = {
  observed: 'Direct instrument measurement of or at Mars.',
  derived: 'Computed from observed data by a stated method.',
  scenario: 'Model, projection or team assumption: an estimate, not a measurement.',
  unavailable: 'No public data exists at the needed scale; shown as a scenario or left out.',
}

export interface SourceInfo {
  badge: EvidenceClass | ContractBadge
  /** Where the value comes from: a dataset, paper, or engine file. */
  source: ReactNode
  sourceUrl?: string
  /** Plausible range, shown when the value is a model choice. */
  range?: [number, number] | null
  unit?: string
  /** Extra caveat in plain words. */
  note?: ReactNode
}

export const toEvidence = (b: SourceInfo['badge']): EvidenceClass =>
  b === 'observed' || b === 'derived' || b === 'scenario' || b === 'unavailable' ? b : badgeToEvidence(b)

/** Source info for one constants.json entry, or null if the key is absent. */
export function constantInfo(c: EngineConstant | undefined): SourceInfo | null {
  if (!c) return null
  return { badge: c.badge, source: c.source, range: c.range, unit: c.unit }
}

export function formatConstant(c: EngineConstant): string {
  if (c.unit === 'fraction') return `${Math.round(c.value * 100)} %`
  if (c.unit === '×') return `× ${c.value}`
  return `${c.value} ${c.unit}`
}
