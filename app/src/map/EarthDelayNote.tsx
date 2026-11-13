import { useId, useState } from 'react'
import { ChevronDown, Radio } from 'lucide-react'

import { cn } from '@/lib/cn'
import { EARTH_DELAY_SPEC } from '@/map/earthDelay'
import { SourceCard } from '@/provenance/SourceCard'
import { EvidenceBadge } from '@/ui/Badge'

/**
 * Earth-delay note for the turn-back card (Tier 1, B6c — Derived).
 *
 * Explains why turn-back limits and the fastest-return switch are precomputed
 * for on-site crew decisions: Earth–Mars one-way signal delay reaches ≈ 22 min
 * (15–21 min during long surface stays), plus relay gaps and blackouts.
 */
export function EarthDelayNote({ className }: { className?: string }) {
  const [sourceOpen, setSourceOpen] = useState(false)
  const sourceId = useId()

  return (
    <div className={cn('flex flex-col gap-2 border border-seam bg-inset/50 p-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="label-console flex items-center gap-1.5 text-ink">
          <Radio size={12} aria-hidden className="text-derived" />
          Earth signal delay
        </span>
        <div className="flex items-center gap-2">
          <EvidenceBadge evidence={EARTH_DELAY_SPEC.badge} />
          <button
            type="button"
            aria-expanded={sourceOpen}
            aria-controls={sourceId}
            onClick={() => setSourceOpen((o) => !o)}
            className="label-console flex items-center gap-1 text-[10px] text-ink-dim hover:text-ink"
          >
            Source
            <ChevronDown size={11} aria-hidden className={cn('transition-transform', sourceOpen && 'rotate-180')} />
          </button>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-ink-dim">
        <span className="font-medium text-ink">Earth can&apos;t help in time:</span> a one-way signal takes{' '}
        <span className="data-readout text-derived">up to ≈ {EARTH_DELAY_SPEC.maxOneWayMin} min</span> (
        <span className="data-readout">
          {EARTH_DELAY_SPEC.longStayMinRange[0]}–{EARTH_DELAY_SPEC.longStayMinRange[1]} min
        </span>{' '}
        during long surface stays), with relay gaps and blackouts, so the crew decides on site.{' '}
        {EARTH_DELAY_SPEC.rationaleLine}{' '}
        <a
          href={EARTH_DELAY_SPEC.sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="text-observed underline-offset-4 hover:underline"
        >
          {EARTH_DELAY_SPEC.shortCitation}
        </a>
      </p>

      {sourceOpen && (
        <div id={sourceId}>
          <SourceCard
            info={{
              badge: EARTH_DELAY_SPEC.badge,
              source: EARTH_DELAY_SPEC.citation,
              range: [EARTH_DELAY_SPEC.longStayMinRange[0], EARTH_DELAY_SPEC.maxOneWayMin],
              unit: 'min one-way (long stay 15–21 min; max ≈ 22 min)',
              note: EARTH_DELAY_SPEC.provenanceNote,
              sourceUrl: EARTH_DELAY_SPEC.sourceUrl,
            }}
          />
        </div>
      )}
    </div>
  )
}
