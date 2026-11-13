import { Layers } from 'lucide-react'

import { useEngineData } from '@/lib/useEngineData'
import { badgeToEvidence } from '@/map/format'
import { EvidenceBadge } from '@/ui/Badge'
import { Panel } from '@/ui/Panel'
import { Toggle } from '@/ui/Toggle'

function OverlayRow({
  name,
  detail,
  swatch,
  checked,
  onChange,
}: {
  name: string
  detail: string
  swatch: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="pt-0.5">
        <Toggle size="sm" checked={checked} onChange={onChange} label={`Toggle overlay: ${name}`} />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex items-center gap-2 text-sm font-medium text-ink">
          <span aria-hidden className="h-0 w-5 flex-none border-t-2 border-dashed" style={{ borderColor: swatch }} />
          {name}
        </span>
        <span className="text-[11px] leading-relaxed text-ink-faint">{detail}</span>
      </div>
    </li>
  )
}

export function LayerPanel({
  enabledLayers,
  onToggleLayer,
  showPreview,
  onTogglePreview,
  showHazards,
  onToggleHazards,
  showOpsBox,
  onToggleOpsBox,
}: {
  enabledLayers: Record<string, boolean>
  onToggleLayer: (id: string, next: boolean) => void
  showPreview: boolean
  onTogglePreview: (next: boolean) => void
  showHazards: boolean
  onToggleHazards: (next: boolean) => void
  showOpsBox: boolean
  onToggleOpsBox: (next: boolean) => void
}) {
  const { layers, hazards, constants, probed, preview } = useEngineData()
  const slopeLimit = constants?.slope_limit_foot_deg

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Layers size={13} aria-hidden /> Layers
        </span>
      }
      className="flex-none"
      bodyClassName="p-0"
    >
      {!layers ? (
        <p className="px-4 py-3 text-xs leading-relaxed text-ink-faint">
          {probed ? 'layers.json is not loaded, so no data layers are listed.' : 'Loading layers…'}
        </p>
      ) : (
        <ul className="divide-y divide-seam">
          {layers.map((layer) => (
            <li key={layer.id} className="flex items-start gap-3 px-4 py-3">
              <div className="pt-0.5">
                <Toggle
                  size="sm"
                  checked={layer.available && (enabledLayers[layer.id] ?? false)}
                  onChange={(next) => onToggleLayer(layer.id, next)}
                  label={`Toggle layer: ${layer.name}`}
                  disabled={!layer.available}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-medium text-ink">{layer.name}</span>
                  <EvidenceBadge evidence={badgeToEvidence(layer.badge)} />
                </span>
                <span className="data-readout text-[11px] leading-relaxed text-ink-faint">
                  {layer.provenance.source}
                  {layer.provenance.resolution ? ` · ${layer.provenance.resolution}` : ''}
                </span>
                {layer.legend && <span className="text-[11px] text-ink-dim">{layer.legend}</span>}
                {!layer.available && (
                  <span className="text-[11px] text-ink-faint">Tiles not built yet</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {preview && (
        <div className="flex items-start gap-3 border-t border-seam bg-signal-soft/20 px-4 py-3">
          <div className="pt-0.5">
            <Toggle
              size="sm"
              checked={showPreview}
              onChange={onTogglePreview}
              label={`Toggle layer: ${preview.name}`}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-medium text-ink">{preview.name}</span>
              <EvidenceBadge evidence={badgeToEvidence(preview.badge)} />
            </span>
            <span className="data-readout text-[11px] leading-relaxed text-ink-faint">
              {preview.source} · {preview.resolution}
              {preview.retrieved ? ` · retrieved ${preview.retrieved}` : ''}
            </span>
            <span className="text-[11px] leading-relaxed text-ink-dim">
              Temporary: one image of the operations area, shown until the tiled layers are built.
              {preview.alignment ? ` ${preview.alignment}` : ''}
            </span>
          </div>
        </div>
      )}
      <p className="label-console border-y border-seam bg-hull/60 px-4 py-2 text-[9px] text-ink-faint">
        Overlays
      </p>
      <ul className="divide-y divide-seam">
        <OverlayRow
          name="Blocked areas"
          detail={
            hazards
              ? `Ground the router will not cross${
                  slopeLimit ? `, such as slopes over ${slopeLimit.value}°` : ''
                }.`
              : 'hazards.geojson is not loaded.'
          }
          swatch="#ff6d6d"
          checked={showHazards}
          onChange={onToggleHazards}
        />
        <OverlayRow
          name="Operations area"
          detail="The box the planner covers. Nothing is routed outside it."
          swatch="#56d8f4"
          checked={showOpsBox}
          onChange={onToggleOpsBox}
        />
      </ul>
    </Panel>
  )
}
