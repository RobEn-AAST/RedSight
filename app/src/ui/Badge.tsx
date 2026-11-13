import { cn } from '@/lib/cn'
import type { EvidenceClass } from '@/types/layers'
import { evidenceClassLabel } from '@/types/layers'

/**
 * Evidence taxonomy badge — Observed / Derived / Scenario / Unavailable.
 * Color is never the only signal: the label text is always present.
 */
const badgeStyles: Record<EvidenceClass, string> = {
  observed: 'bg-observed-soft text-observed border-observed/40',
  derived: 'bg-derived-soft text-derived border-derived/40',
  scenario: 'bg-scenario-soft text-scenario border-scenario/40',
  unavailable: 'bg-unavailable-soft text-unavailable border-unavailable/40',
}

export function EvidenceBadge({
  evidence,
  className,
}: {
  evidence: EvidenceClass
  className?: string
}) {
  return (
    <span
      className={cn(
        'label-console inline-flex items-center border px-1.5 py-0.5 text-[10px] tracking-[0.12em]',
        badgeStyles[evidence],
        className,
      )}
    >
      {evidenceClassLabel[evidence]}
    </span>
  )
}
