import { useId, useState, type ReactNode } from 'react'
import { ChevronDown, ExternalLink } from 'lucide-react'

import { cn } from '@/lib/cn'
import { useEngineData } from '@/lib/useEngineData'
import {
  EVIDENCE_DEFINITION,
  constantInfo,
  formatConstant,
  toEvidence,
  type SourceInfo,
} from '@/provenance/sourceInfo'
import { EvidenceBadge } from '@/ui/Badge'

/**
 * Source / provenance card (Tier 1, B5). Owner: Jana.
 *
 * Every layer and number in the UI should carry one: the value, its evidence
 * class (Observed / Derived / Scenario / Unavailable) and where it came from.
 * Definitions are the repo's own (docs/challenge-in-plain-language.md §1).
 * Color is never the only signal: the badge always prints its label.
 */

/** The card body: badge + definition, source, range, caveats. */
export function SourceCard({ info, title }: { info: SourceInfo; title?: ReactNode }) {
  const ev = toEvidence(info.badge)
  return (
    <div className="flex flex-col gap-2 border border-seam bg-inset/60 px-3 py-2.5 text-xs leading-relaxed">
      <div className="flex flex-wrap items-center gap-2">
        {title && <span className="font-semibold text-ink">{title}</span>}
        <EvidenceBadge evidence={ev} />
        {info.mock && (
          <span className="label-console border border-scenario/50 bg-scenario-soft px-1.5 py-0.5 text-[10px] text-scenario">
            Mock file
          </span>
        )}
      </div>
      <p className="text-ink-faint">{EVIDENCE_DEFINITION[ev]}</p>
      <p className="text-ink-dim">
        <span className="label-console mr-1.5 text-[9px] text-ink-faint">Source</span>
        {info.source}
      </p>
      {info.range && (
        <p className="data-readout text-[11px] text-ink-dim">
          <span className="label-console mr-1.5 text-[9px] text-ink-faint">Range</span>
          {info.range[0]}–{info.range[1]}
          {info.unit ? ` ${info.unit}` : ''}
        </p>
      )}
      {info.note && <p className="text-ink-dim">{info.note}</p>}
      {info.sourceUrl && (
        <a
          href={info.sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex w-fit items-center gap-1.5 text-observed underline-offset-4 hover:underline"
        >
          Open source <ExternalLink size={11} aria-hidden />
        </a>
      )}
    </div>
  )
}

/**
 * A labelled number with its badge; the badge button opens the source card
 * underneath. Use it for every number the UI shows.
 */
export function SourcedValue({
  label,
  value,
  info,
  emphasis,
  className,
}: {
  label: ReactNode
  value: ReactNode
  info: SourceInfo
  emphasis?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const ev = toEvidence(info.badge)
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-[11px] text-ink-faint">{label}</dt>
        <dd className="flex items-center gap-2">
          <span className={cn('data-readout', emphasis ? 'text-base text-ink' : 'text-xs text-ink-dim')}>
            {value}
          </span>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen((o) => !o)}
            title="Show source"
            className="flex items-center gap-0.5 hover:opacity-80"
          >
            <EvidenceBadge evidence={ev} />
            <ChevronDown
              size={11}
              aria-hidden
              className={cn('text-ink-faint transition-transform', open && 'rotate-180')}
            />
            <span className="sr-only">{open ? 'Hide source' : 'Show source'}</span>
          </button>
        </dd>
      </div>
      {open && (
        <div id={id}>
          <SourceCard info={info} />
        </div>
      )}
    </div>
  )
}

/**
 * A constants.json value by key, with its card. A missing key shows as
 * Unavailable with the key name: the UI never fills in a number of its own.
 */
export function ConstantValue({ k, label }: { k: string; label: ReactNode }) {
  const engine = useEngineData()
  const c = engine.constants?.[k]
  const info = constantInfo(c, engine.mock)
  if (!c || !info) {
    return (
      <SourcedValue
        label={label}
        value="—"
        info={{
          badge: 'unavailable',
          source: (
            <>
              <span className="data-readout">constants.json</span> has no{' '}
              <span className="data-readout">{k}</span> entry.
            </>
          ),
        }}
      />
    )
  }
  return <SourcedValue label={label} value={formatConstant(c)} info={info} />
}
