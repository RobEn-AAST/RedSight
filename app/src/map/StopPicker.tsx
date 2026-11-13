import { Footprints } from 'lucide-react'

import { cn } from '@/lib/cn'
import type { EngineStop } from '@/lib/engineDataContext'
import { useEngineData } from '@/lib/useEngineData'
import { badgeToEvidence } from '@/map/format'
import { usePlan } from '@/map/usePlan'
import { EvidenceBadge } from '@/ui/Badge'
import { Panel } from '@/ui/Panel'

const KIND_LABEL: Record<string, string> = {
  panorama: '360° site',
  rover: 'Rover position',
  drill: 'Drill site',
}

function solText(sols: number[]): string {
  if (sols.length === 0) return 'sol not given'
  return `sol ${sols.join('–')}`
}

/** Placeholder text in a mock file is reported as pending, not shown as content. */
function scienceText(stop: EngineStop): string | null {
  const text = stop.science?.trim()
  return text && !/^todo\b/i.test(text) ? text : null
}

export function StopPicker() {
  const { stops, meta, probed } = useEngineData()
  const { selectedStopId, selectStop } = usePlan()

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Footprints size={13} aria-hidden /> Stops
        </span>
      }
      className="flex-none"
      bodyClassName="p-0"
    >
      {!stops || stops.length === 0 ? (
        <p className="px-4 py-3 text-xs leading-relaxed text-ink-faint">
          {probed ? 'stops.json is not loaded, so no stops are shown.' : 'Loading stops…'}
        </p>
      ) : (
        <ul className="divide-y divide-seam">
          {stops.map((stop) => {
            const active = selectedStopId === stop.id
            const science = scienceText(stop)
            return (
              <li key={stop.id}>
                <button
                  type="button"
                  onClick={() => selectStop(active ? null : stop.id)}
                  aria-pressed={active}
                  className={cn(
                    'flex w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors',
                    active ? 'bg-signal-soft/40' : 'hover:bg-panel-2/60',
                  )}
                >
                  <span className="flex items-start gap-2">
                    <span
                      className={cn(
                        'data-readout mt-0.5 flex-none border px-1.5 py-0.5 text-[11px] leading-none',
                        active ? 'border-signal bg-signal text-void' : 'border-seam-lit text-ink-dim',
                      )}
                    >
                      {stop.id}
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-medium text-ink">{stop.name}</span>
                    <EvidenceBadge evidence={badgeToEvidence(stop.badge)} className="flex-none" />
                  </span>
                  <span className="data-readout text-[11px] text-ink-faint">
                    {KIND_LABEL[stop.kind] ?? stop.kind} · {solText(stop.sols)} · {stop.lon.toFixed(5)}°E{' '}
                    {stop.lat.toFixed(5)}°{stop.approx ? ' (approximate)' : ''}
                  </span>
                </button>
                {active && (
                  <div className="border-t border-seam bg-inset/50 px-4 py-3 text-xs leading-relaxed text-ink-dim">
                    <p>{science ?? 'Science text for this stop is not written yet.'}</p>
                    {stop.evidence && (
                      <p className="data-readout mt-1.5 text-[11px] text-ink-faint">
                        Evidence: {stop.evidence}
                        {stop.photos.length === 0 ? ' · photos pending' : ` · ${stop.photos.length} photos`}
                      </p>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {meta?.habitat && (
        <p className="border-t border-seam bg-scenario-soft/30 px-4 py-2.5 text-[11px] leading-relaxed text-scenario">
          Habitat (HAB on the map) is a Scenario point, not a real site
          {meta.habitat.note ? `. ${meta.habitat.note}.` : '.'}
        </p>
      )}
    </Panel>
  )
}
