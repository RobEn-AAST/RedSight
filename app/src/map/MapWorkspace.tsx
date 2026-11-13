import { useState } from 'react'

import { useEngineData } from '@/lib/useEngineData'
import { opsBox as fallbackOpsBox } from '@/lib/stopsData'
import { MapCanvas } from '@/map/MapCanvas'
import { PlanPanel } from '@/map/PlanPanel'
import { MissionReplay } from '@/replay/MissionReplay'
import { TurnBackPanel } from '@/turnback/TurnBackPanel'
import { EmptyState } from '@/ui/EmptyState'
import { Toggle } from '@/ui/Toggle'

/**
 * Routes screen: the map beside one panel that walks the crew through the
 * plan — where to sample, which route, who goes where, then the plan step by
 * step. Everything shown comes from the engine files; a missing file shows as
 * missing.
 */
export function MapWorkspace({ onOpenSources }: { onOpenSources: () => void }) {
  const engine = useEngineData()
  const [layerChoice, setLayerChoice] = useState<Record<string, boolean>>({})
  const [showImagery, setShowImagery] = useState(true)

  const layers = engine.layers ?? []
  const available = layers.filter((l) => l.available)
  // Until the crew chooses, the first available data layer is on.
  const enabledLayers = Object.fromEntries(
    layers.map((l) => [l.id, layerChoice[l.id] ?? available[0]?.id === l.id]),
  )
  const box = engine.meta?.ops_box ?? fallbackOpsBox

  return (
    <div className="flex min-h-full flex-col lg:grid lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_26rem]">
      {/* Map */}
      <div className="relative h-[60dvh] min-h-80 flex-none overflow-hidden bg-inset lg:h-auto">
        {engine.probed && engine.meta && (
          <MapCanvas box={box} enabledLayers={enabledLayers} showImagery={showImagery} />
        )}
        {engine.probed && !engine.meta && (
          <EmptyState
            className="absolute inset-0 border-none"
            title="Map data not found"
            detail="The planner could not load app/public/data/meta.json, so the map cannot be drawn."
          />
        )}

        {/* Map layers: the orbital image plus any tiled data layers that exist. */}
        {(engine.preview || available.length > 0) && (
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 flex-wrap items-center justify-center gap-x-4 gap-y-2 border border-seam bg-hull/90 px-3 py-1.5">
            {engine.preview && (
              <label className="flex items-center gap-2 text-xs text-ink">
                <Toggle size="sm" checked={showImagery} onChange={setShowImagery} label="Show orbital image" />
                Orbital image
              </label>
            )}
            {available.map((l) => (
              <label key={l.id} className="flex items-center gap-2 text-xs text-ink">
                <Toggle
                  size="sm"
                  checked={enabledLayers[l.id] ?? false}
                  onChange={(next) => setLayerChoice((s) => ({ ...s, [l.id]: next }))}
                  label={`Show ${l.name}`}
                />
                {l.name}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Plan panel */}
      <aside
        className="border-t border-seam bg-panel lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-t-0"
        aria-label="Plan"
      >
        <PlanPanel onOpenSources={onOpenSources} />
        {/* Jana's turn-back slider and Marwan's Mission Replay read usePlan().activeRoute. */}
        <div className="flex flex-col gap-3 border-t border-seam p-3">
          <TurnBackPanel />
          <MissionReplay />
        </div>
      </aside>
    </div>
  )
}
