import { useState } from 'react'
import { MapPin, Radar } from 'lucide-react'

import { useEngineData } from '@/lib/useEngineData'
import { opsBox as fallbackOpsBox } from '@/lib/stopsData'
import { LayerPanel } from '@/map/LayerPanel'
import { MapCanvas } from '@/map/MapCanvas'
import { RouteCards } from '@/map/RouteCards'
import { StopPicker } from '@/map/StopPicker'
import { MissionReplay } from '@/replay/MissionReplay'
import { TurnBackPanel } from '@/turnback/TurnBackPanel'
import { EmptyState } from '@/ui/EmptyState'
import { LedDot } from '@/ui/LedDot'

/**
 * Map workspace (Tier 1, B1–B3): the ops-area map with the stop picker, the
 * A/B route cards and the layer panel beside it. Everything shown comes from
 * the §15 contract files; a file that is missing shows as missing.
 */
export function MapWorkspace() {
  const engine = useEngineData()
  const [layerChoice, setLayerChoice] = useState<Record<string, boolean>>({})
  const [showPreview, setShowPreview] = useState(true)
  const [showHazards, setShowHazards] = useState(true)
  const [showOpsBox, setShowOpsBox] = useState(true)

  const layers = engine.layers ?? []
  const available = layers.filter((l) => l.available)
  // Until the operator chooses, the first two available layers are on.
  const enabledLayers = Object.fromEntries(
    layers.map((l) => [l.id, layerChoice[l.id] ?? available.slice(0, 2).includes(l)]),
  )
  const box = engine.meta?.ops_box ?? fallbackOpsBox

  return (
    <div className="flex min-h-full flex-col gap-4 lg:grid lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_22rem]">
      {/* Map frame */}
      <div className="relative h-[58dvh] min-h-80 flex-none overflow-hidden border border-seam bg-inset lg:h-auto">
        {engine.probed ? (
          <MapCanvas
            box={box}
            enabledLayers={enabledLayers}
            showPreview={showPreview}
            showHazards={showHazards}
            showOpsBox={showOpsBox}
          />
        ) : null}

        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-seam/60 bg-void/75 px-4 py-2 backdrop-blur-sm">
          <Radar size={13} aria-hidden className="flex-none text-observed" />
          <span className="label-console text-ink-dim">Mount Sharp boxwork, Gale crater</span>
          {engine.mock && (
            <span className="label-console border border-scenario/50 bg-scenario-soft px-1.5 py-0.5 text-[10px] text-scenario">
              Mock data
            </span>
          )}
          <span className="ml-auto flex items-center gap-2">
            <LedDot tone={available.length > 0 ? 'green' : 'amber'} />
            <span className="label-console text-ink-faint">
              {layers.length === 0
                ? 'no layer list'
                : available.length === 0 && engine.preview
                  ? 'preview image only'
                  : `${available.length} of ${layers.length} image layers built`}
            </span>
          </span>
        </div>

        {engine.probed && !engine.meta && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-inset/90 p-6 pt-14">
            <EmptyState
              className="border-none bg-transparent"
              icon={<MapPin size={28} strokeWidth={1.5} />}
              title="Engine data not found"
              detail={
                <>
                  <span className="data-readout">app/public/data/meta.json</span> is missing or not in
                  the agreed shape, so the ops area, habitat and routes cannot be drawn.
                </>
              }
            />
          </div>
        )}
      </div>

      {/* Side column */}
      <div className="flex flex-col gap-4 lg:min-h-0 lg:overflow-y-auto">
        <StopPicker />
        <RouteCards />
        <TurnBackPanel />
        <MissionReplay />
        <LayerPanel
          enabledLayers={enabledLayers}
          onToggleLayer={(id, next) => setLayerChoice((s) => ({ ...s, [id]: next }))}
          showPreview={showPreview}
          onTogglePreview={setShowPreview}
          showHazards={showHazards}
          onToggleHazards={setShowHazards}
          showOpsBox={showOpsBox}
          onToggleOpsBox={setShowOpsBox}
        />
      </div>
    </div>
  )
}
