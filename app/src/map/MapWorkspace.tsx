import { useState } from 'react'
import { Layers, MapPin, Radar, Footprints } from 'lucide-react'

import { Panel } from '@/ui/Panel'
import { EvidenceBadge } from '@/ui/Badge'
import { EmptyState } from '@/ui/EmptyState'
import { Toggle } from '@/ui/Toggle'
import { LedDot } from '@/ui/LedDot'
import { cn } from '@/lib/cn'
import { type EngineStop } from '@/lib/engineDataContext'
import { useEngineData } from '@/lib/useEngineData'
import { layerCatalog } from '@/lib/layersData'
import { fallbackStops, habitatNote, opsBox, type FallbackStop } from '@/lib/stopsData'

/**
 * Map workspace (Tier 1, B1/B2) — layer + stop selection controls are real
 * interface state; the rendered map stays an honest "data not loaded" instrument
 * frame until the engine lands tiles (app/public/data/, §15).
 */
export function MapWorkspace() {
  const engine = useEngineData()
  // Engine layers.json wins once present; research-era catalog is the fallback.
  const layers = engine.layers ?? layerCatalog.map((l) => ({ id: l.id, name: l.name }))
  const usingEngineLayers = engine.layers !== null

  const stops: Array<FallbackStop | (EngineStop & { detail?: string })> = engine.stops ?? fallbackStops
  const usingEngineStops = engine.stops !== null

  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(layers.slice(0, 2).map((l) => [l.id, true])),
  )
  const [selectedStop, setSelectedStop] = useState<string | null>(null)

  return (
    <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-0 lg:grid-cols-[1fr_20rem] lg:grid-rows-1">
      {/* Map frame */}
      <div className="relative min-h-72 border border-seam bg-inset lg:border-r-0">
        <div className="instrument-grid absolute inset-0" aria-hidden />
        {/* Corner brackets: reticle framing */}
        <div aria-hidden className="absolute left-3 top-3 h-5 w-5 border-l-2 border-t-2 border-observed/40" />
        <div aria-hidden className="absolute right-3 top-3 h-5 w-5 border-r-2 border-t-2 border-observed/40" />
        <div aria-hidden className="absolute bottom-3 left-3 h-5 w-5 border-b-2 border-l-2 border-observed/40" />
        <div aria-hidden className="absolute bottom-3 right-3 h-5 w-5 border-b-2 border-r-2 border-observed/40" />

        <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 border-b border-seam/60 bg-void/70 px-4 py-2 backdrop-blur-sm">
          <Radar size={13} aria-hidden className="text-observed" />
          <span className="label-console text-ink-dim">Ops area — Mount Sharp boxwork, Gale</span>
          <span className="ml-auto flex items-center gap-2">
            <LedDot tone={engine.probed && usingEngineLayers ? 'green' : 'off'} />
            <span className="label-console text-ink-faint">
              {usingEngineLayers ? 'engine layers.json' : 'no feed'}
            </span>
          </span>
        </div>

        <div className="absolute inset-0 flex items-center justify-center p-6 pt-14">
          <EmptyState
            className="border-none bg-transparent"
            icon={<MapPin size={28} strokeWidth={1.5} />}
            title="Map tiles not loaded"
            detail={
              <>
                Imagery, DEM products and science-site rasters are produced by the offline engine
                (plan B1) into <span className="data-readout">app/public/data/</span> (§15) and are
                not present in this build. Layer and stop controls are live interface state; nothing
                is rendered on the map yet, and no sites or routes are invented in their place.
              </>
            }
          />
        </div>

        <p className="data-readout absolute bottom-3 left-1/2 w-max max-w-[92%] -translate-x-1/2 text-center text-[10px] leading-relaxed text-ink-faint">
          ops box {opsBox.west}–{opsBox.east}°E / {opsBox.south}…{opsBox.north}° · ≈5.9×5.9 km ·
          proposed (D11), confirmed at the pilot gate
        </p>
      </div>

      {/* Right column: layers + stops */}
      <div className="flex min-h-0 flex-col border border-seam bg-panel lg:border-l lg:border-t-0">
        <Panel
          title={
            <span className="flex items-center gap-2">
              <Footprints size={13} aria-hidden /> Stops
            </span>
          }
          className="border-b-0"
          bodyClassName="p-0 overflow-y-auto max-h-64"
        >
          <ul className="divide-y divide-seam">
            {stops.map((stop) => {
              const active = selectedStop === stop.id
              return (
                <li key={stop.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedStop(active ? null : stop.id)}
                    aria-expanded={active}
                    className={cn(
                      'flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors',
                      active ? 'bg-signal-soft/40' : 'hover:bg-panel-2/60',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ink">{stop.name}</span>
                      <EvidenceBadge
                        evidence={stop.badge === 'scenario' ? 'scenario' : 'observed'}
                        className="ml-auto"
                      />
                    </span>
                    <span className="data-readout text-[11px] text-ink-faint">
                      sol {stop.sol} · {stop.lon.toFixed(5)}°E {stop.lat.toFixed(5)}°
                    </span>
                  </button>
                  {active && (
                    <div className="border-t border-seam bg-inset/50 px-4 py-3 text-xs leading-relaxed text-ink-dim">
                      <p>
                        {stop.detail ??
                          ('scienceText' in stop ? stop.scienceText : undefined) ??
                          'Stop card text ships with stops.json (§15).'}
                      </p>
                      <p className="mt-1.5 text-ink-faint">
                        {usingEngineStops
                          ? 'From engine stops.json — photos, panorama and route links arrive with the data contract files.'
                          : 'From NASA MMGIS waypoints via demo-focus-plan §6 (fallback list). Stop cards with real sol photos ship with engine stops.json (B2).'}
                      </p>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="border-t border-seam bg-scenario-soft/30 px-4 py-2.5 text-[11px] leading-relaxed text-scenario">
            {habitatNote}
          </p>
        </Panel>

        <Panel
          title={
            <span className="flex items-center gap-2">
              <Layers size={13} aria-hidden /> Layers
            </span>
          }
          className="min-h-0 flex-1"
          bodyClassName="p-0 overflow-y-auto"
        >
          <ul className="divide-y divide-seam">
            {layers.map((layer) => (
              <li key={layer.id} className="flex items-start gap-3 px-4 py-3">
                <div className="pt-1">
                  <Toggle
                    size="sm"
                    checked={enabled[layer.id] ?? false}
                    onChange={(next) => setEnabled((s) => ({ ...s, [layer.id]: next }))}
                    label={`Toggle layer: ${layer.name}`}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium text-ink">{layer.name}</span>
                    {!usingEngineLayers && (
                      <EvidenceBadge
                        evidence={
                          layerCatalog.find((c) => c.id === layer.id)?.evidence ?? 'derived'
                        }
                      />
                    )}
                  </span>
                  {!usingEngineLayers && (
                    <>
                      <span className="data-readout text-[11px] text-ink-faint">
                        {layerCatalog.find((c) => c.id === layer.id)?.resolution}
                      </span>
                      <span className="flex items-center gap-1.5 text-[11px] text-ink-faint">
                        <LedDot tone="off" />
                        verified source, not pulled into app
                      </span>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  )
}
