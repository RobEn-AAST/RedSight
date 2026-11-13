import { ExternalLink, FileSearch } from 'lucide-react'

import { Panel } from '@/ui/Panel'
import { EvidenceBadge } from '@/ui/Badge'
import { LedDot } from '@/ui/LedDot'
import { layerCatalog } from '@/lib/layersData'

/**
 * Provenance inspector — first-class panel, not a footnote. Every dataset the
 * product cites, with evidence class, resolution, and primary source. This is
 * real content from the research record; nothing is fabricated here.
 */
export function ProvenancePanel() {
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <FileSearch size={13} aria-hidden /> Provenance inspector
        </span>
      }
      bodyClassName="p-0 overflow-y-auto"
    >
      <p className="border-b border-seam bg-inset/50 px-4 py-3 text-xs leading-relaxed text-ink-faint">
        Every layer and constant in RedSight carries an evidence class — Observed (instrument
        measurement), Derived (computed from observed data), Scenario (model or team assumption),
        Unavailable (no public data at this scale). Sources verified against primary pages on
        2026-11-13.
      </p>
      <ul className="divide-y divide-seam">
        {layerCatalog.map((layer) => (
          <li key={layer.id} className="flex flex-col gap-2 px-4 py-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <h3 className="text-sm font-semibold text-ink">{layer.name}</h3>
              <EvidenceBadge evidence={layer.evidence} />
              <span className="ml-auto flex items-center gap-1.5 text-[11px] text-ink-faint">
                <LedDot tone={layer.status === 'verified-source' ? 'green' : 'off'} />
                {layer.status === 'verified-source' ? 'source verified' : 'planned product'}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-ink-dim">{layer.note}</p>
            <div className="data-readout flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-faint">
              <span>{layer.instrument}</span>
              <span>{layer.resolution}</span>
            </div>
            <a
              href={layer.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex w-fit items-center gap-1.5 text-xs text-observed underline-offset-4 hover:underline"
            >
              {layer.sourceName}
              <ExternalLink size={11} aria-hidden />
            </a>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
