import { useState } from 'react'
import { Layers } from 'lucide-react'

import { useEngineData } from '@/lib/useEngineData'
import { MapCanvas } from '@/map/MapCanvas'
import { PlanSheet, PlanSummaryCard } from '@/map/PlanPanel'
import { EmptyState } from '@/ui/EmptyState'
import { usePlan } from '@/map/usePlan'
import { Toggle } from '@/ui/Toggle'

/**
 * Routes screen: the map fills the screen. A "Your walk" card floats on it with
 * the answer (time out and back, O₂ spare), and a bottom sheet holds the steps in
 * tabs: Stop, Route, Plan, Replay. Everything shown comes from the engine files;
 * a missing file shows as missing.
 */
export function MapWorkspace({ onOpenSources }: { onOpenSources: () => void }) {
  const engine = useEngineData()
  const { showCuriosityPath, setShowCuriosityPath, layerVisibility, setLayerVisibility } = usePlan()
  const [showImagery, setShowImagery] = useState(true)
  const [layersOpen, setLayersOpen] = useState(false)

  const layers = engine.layers ?? []
  const available = layers.filter((l) => l.available)
  // Until the crew chooses, the first available data layer is on.
  const enabledLayers = Object.fromEntries(
    layers.map((l) => [l.id, layerVisibility[l.id] ?? available[0]?.id === l.id]),
  )
  const box = engine.meta?.ops_box

  return (
    <div className="routes-screen relative h-full min-h-0 overflow-hidden bg-inset">
      {/* Map */}
      <div className="absolute inset-0">
        {engine.probed && engine.meta && box && (
          <MapCanvas box={box} enabledLayers={enabledLayers} showImagery={showImagery} />
        )}
        {engine.probed && !engine.meta && (
          <EmptyState
            className="absolute inset-0 border-none"
            title="Map data not found"
            detail="The planner could not load app/public/data/meta.json, so the map cannot be drawn."
          />
        )}

      </div>

      {/* The answer first, then the Layers button: one column under the legend strip, clear of the sheet. */}
      <div className="pointer-events-none absolute inset-x-3 top-[3.75rem] z-10 flex flex-col gap-2 sm:top-12 lg:left-[calc(26rem+1.5rem)] lg:right-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="lg:w-96">
          <PlanSummaryCard />
        </div>
        {/* Map layers: one button top-right; the bottom edge belongs to the replay bar and zoom. */}
        {(engine.preview || engine.curiosityPath || available.length > 0) && (
          <div className="pointer-events-auto flex flex-col items-end gap-1 self-end">
            <button
              type="button"
              onClick={() => setLayersOpen((o) => !o)}
              aria-expanded={layersOpen}
              aria-controls="map-layers"
              className="label-console flex min-h-10 items-center gap-1.5 border border-seam-lit bg-hull/90 px-3 text-ink hover:text-signal"
            >
              <Layers size={14} aria-hidden /> Layers
            </button>
            {layersOpen && (
              <div id="map-layers" className="flex flex-col gap-2.5 border border-seam bg-hull/95 px-3 py-2.5">
                {engine.preview && (
                  <label className="flex items-center justify-between gap-4 text-xs text-ink">
                    Orbital image
                    <Toggle size="sm" checked={showImagery} onChange={setShowImagery} label="Show orbital image" />
                  </label>
                )}
                {engine.curiosityPath && (
                  <label className="flex items-center justify-between gap-4 text-xs text-ink">
                    Curiosity's real path
                    <Toggle
                      size="sm"
                      checked={showCuriosityPath}
                      onChange={setShowCuriosityPath}
                      label="Show Curiosity's real path"
                    />
                  </label>
                )}
                {available.map((l) => {
                  const note = typeof l.legend === 'object' ? l.legend?.note : undefined
                  return (
                    <div key={l.id} className="flex flex-col gap-1">
                      <label className="flex items-center justify-between gap-4 text-xs text-ink">
                        {l.name}
                        <Toggle
                          size="sm"
                          checked={enabledLayers[l.id] ?? false}
                          onChange={(next) => setLayerVisibility(l.id, next)}
                          label={`Show ${l.name}`}
                        />
                      </label>
                      {/* Legend note (e.g. slope: display DEM differs from the routing DTM). */}
                      {note && enabledLayers[l.id] && (
                        <p className="max-w-60 text-[11px] leading-snug text-ink-faint">{note}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <PlanSheet onOpenSources={onOpenSources} />
    </div>
  )
}
