import { ScanEye, Compass, Wind, Flag } from 'lucide-react'

import { Panel } from '@/ui/Panel'
import { EmptyState } from '@/ui/EmptyState'
import { EvidenceBadge } from '@/ui/Badge'

const plannedReadouts = [
  {
    icon: Compass,
    label: 'Heading',
    detail: 'Computed from the modeled route polyline bearing — derived geometry, not a live sensor.',
  },
  {
    icon: Wind,
    label: 'O₂ remaining (modeled)',
    detail: 'Countdown from the engine’s time/O₂ table (Pandolf-based model with cited constants).',
  },
  {
    icon: Flag,
    label: 'Return recommendation',
    detail: 'Current zone (green/amber/red) + auto-switch to the fastest return when modeled O₂ runs low (§9).',
  },
]

/**
 * HUD workspace — the helmet-style HUD is a Tier 2 feature (plan §10, E2) that
 * rides on the 360° panoramas after Tier 1 is submitted. All values will come
 * from engine routes.json; this build shows the plan honestly, no simulated
 * readings.
 */
export function HudWorkspace() {
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <ScanEye size={13} aria-hidden /> Helmet HUD — Tier 2
        </span>
      }
    >
      <div className="flex h-full flex-col gap-5">
        <EmptyState
          icon={<ScanEye size={28} strokeWidth={1.5} />}
          title="Tier 2 — starts after the Tier 1 base is submitted"
          detail="The walk-through (real NASA 360° panoramas at S1/S2 with a HUD overlay) is the first Tier 2 extra. It depends on the Tier 1 engine JSON and a three.js sphere; per the team's build order, nothing here runs before the base is deployed and submitted. No simulated readings are shown."
        />
        <div className="grid gap-3 sm:grid-cols-3">
          {plannedReadouts.map((r) => (
            <div key={r.label} className="flex flex-col gap-2 border border-seam bg-inset/40 p-3.5">
              <span className="flex items-center gap-2 text-ink-faint">
                <r.icon size={14} aria-hidden />
                <span className="label-console">{r.label}</span>
              </span>
              <p className="text-[11px] leading-relaxed text-ink-faint">{r.detail}</p>
              <EvidenceBadge evidence="scenario" className="mt-auto w-fit" />
            </div>
          ))}
        </div>
      </div>
    </Panel>
  )
}
