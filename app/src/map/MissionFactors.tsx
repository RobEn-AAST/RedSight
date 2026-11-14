import { useMemo, useState } from 'react'
import { SlidersHorizontal, ShieldAlert } from 'lucide-react'

import { cn } from '@/lib/cn'
import type { PlanFile, PlanMember } from '@/lib/engineDataContext'
import { evaluateFactors, validateFactorPatch, describeRouting, type FactorDef, type FactorSettings } from '@/lib/factors'
import { daylightAt } from '@/lib/mars24'
import { useEngineData } from '@/lib/useEngineData'
import { useFactorDefs } from '@/lib/useFactorDefs'
import { useMission } from '@/lib/useMission'
import { Fold } from '@/map/Fold'
import { summarizeCrew } from '@/map/format'
import { usePlan } from '@/map/usePlan'
import { EvidenceBadge } from '@/ui/Badge'
import type { MissionConfig } from '@/types/mission'
import type { EvidenceClass } from '@/types/layers'

const evidence = (badge: string): EvidenceClass => (badge.toLowerCase() as EvidenceClass)

function settingsOf(c: MissionConfig): FactorSettings {
  return {
    radiationBudgetMsv: c.radiationBudgetMsv, sepEvent: c.sepEvent, startLocalHour: c.startLocalHour,
    daylightRequired: c.daylightRequired, coldLimitK: c.coldLimitK, stopMinutes: c.stopMinutes,
  }
}

/** Inputs for the ten mission factors. Every row is read from factors.json; edits are validated before they apply. */
export function MissionFactorsFold() {
  const defs = useFactorDefs()
  const { state, patchConfig } = useMission()
  const config = state.config
  if (!defs) return null

  const apply = (patch: Record<string, unknown>) => {
    if (validateFactorPatch(patch, defs) === null) patchConfig(patch as Partial<MissionConfig>)
  }
  const value = (field: string) => (config as unknown as Record<string, unknown>)[field]

  const control = (d: FactorDef) => {
    if (d.type === 'boolean') {
      return (
        <input type="checkbox" aria-label={d.label} checked={value(d.field) === true}
          onChange={(e) => apply({ [d.field]: e.target.checked })} />
      )
    }
    if (d.type === 'nullableNumber') {
      const v = value(d.field) as number | null
      return (
        <span className="flex items-center gap-2">
          <input type="checkbox" aria-label={`Enable ${d.label}`} checked={v !== null}
            onChange={(e) => apply({ [d.field]: e.target.checked ? (d.min ?? 0) + 25 : null })} />
          <input type="number" aria-label={d.label} disabled={v === null} min={d.min} max={d.max} step={d.step} value={v ?? ''}
            onChange={(e) => e.target.value !== '' && apply({ [d.field]: Number(e.target.value) })}
            className="w-20 border border-seam bg-inset p-1.5 text-ink disabled:opacity-40" />
        </span>
      )
    }
    if (d.type === 'number') {
      return (
        <input type="number" aria-label={d.label} min={d.min} max={d.max} step={d.step} value={value(d.field) as number}
          onChange={(e) => e.target.value !== '' && apply({ [d.field]: Number(e.target.value) })}
          className="w-20 border border-seam bg-inset p-1.5 text-ink" />
      )
    }
    return null
  }

  const summary = (d: FactorDef): string | null => {
    if (d.id === 'slope') return `${config.routeSlopeCapDeg}° (set above)`
    if (d.id === 'crewLoad') return `${config.crewCount} crew · ${config.bodyMassKg} kg · ${config.loadKg} kg load (Mission setup)`
    if (d.id === 'goal') return config.scienceGoalId || 'not chosen (Mission setup)'
    return null
  }

  return (
    <Fold icon={<SlidersHorizontal size={14} />} title="Mission factors" answer="10 Scenario inputs" defaultOpen={false}>
      <p className="text-xs leading-relaxed text-ink-dim">
        These change the modeled route or its modeled checks. They are Scenario inputs, not measurements along the route.
        You can also ask the copilot to set them for your situation.
      </p>
      <ul className="flex flex-col gap-3">
        {defs.factors.map((d) => (
          <li key={d.id} className="flex flex-col gap-1 border-t border-seam pt-2 first:border-t-0 first:pt-0">
            <div className="flex items-center justify-between gap-3 text-sm text-ink">
              <span className="flex items-center gap-2">{d.label} <EvidenceBadge evidence={evidence(d.badge)} /></span>
              <span className="flex items-center gap-2 text-ink-dim">
                {summary(d) ?? control(d)}
                {d.unit && !summary(d) && <span className="text-[11px] text-ink-faint">{d.unit}</span>}
              </span>
            </div>
            {d.requires && (
              <label className="flex items-center gap-2 text-xs text-ink-dim">
                <input type="checkbox" checked={config.daylightRequired} onChange={(e) => apply({ daylightRequired: e.target.checked })} />
                Require the EVA to fit inside daylight
              </label>
            )}
            <p className="text-[11px] leading-relaxed text-ink-faint">{d.effect} <span className="text-ink-faint/80">Source: {d.source}</span></p>
          </li>
        ))}
        {defs.phase2.map((p) => (
          <li key={p.id} className="border-t border-seam pt-2 text-[11px] leading-relaxed text-ink-faint">
            <span className="text-sm text-ink-dim">{p.label}</span> — not available yet. {p.reason}
          </li>
        ))}
      </ul>
    </Fold>
  )
}

const statusStyle = { within: 'text-ink', over: 'text-caution', off: 'text-ink-faint', unavailable: 'text-ink-faint' } as const
const statusText = { within: 'within limit', over: 'over limit', off: 'off', unavailable: 'unavailable' } as const

/** Modeled dose / daylight / cold checks for the route currently shown. */
export function FactorVerdictsCard({ plan, members }: { plan: PlanFile; members: PlanMember[] }) {
  const defs = useFactorDefs()
  const { state } = useMission()
  const { meta } = useEngineData()
  const { activeRoute } = usePlan()
  const config = state.config
  const [now] = useState(() => Date.now())

  const verdicts = useMemo(() => {
    if (!defs) return null
    const site = meta?.habitat.lonlat ?? null
    const sun = site ? daylightAt(now, site[0], site[1]) : null
    const roundTripS = summarizeCrew(members, plan.budget_l).roundTripS
    return evaluateFactors({ total_s: roundTripS }, settingsOf(config), defs, sun)
  }, [defs, meta, members, plan.budget_l, config, now])

  if (!verdicts) return null
  const anyOver = verdicts.some((v) => v.status === 'over')
  const why = activeRoute?.routing ? describeRouting(activeRoute.routing) : []

  return (
    <Fold icon={<ShieldAlert size={14} />} title="Mission factor checks" tone={anyOver ? 'caution' : 'plain'}
      answer={anyOver ? 'a modeled limit is exceeded' : 'within the limits you set'}>
      <ul className="flex flex-col gap-2">
        {verdicts.map((v) => (
          <li key={v.id} className="text-xs leading-relaxed">
            <span className={cn('font-medium', statusStyle[v.status])}>{v.label}: {statusText[v.status]}</span>{' '}
            <EvidenceBadge evidence="scenario" />
            <p className="text-ink-dim">{v.detail}</p>
          </li>
        ))}
      </ul>
      {why.length > 0 && (
        <div className="text-xs leading-relaxed text-ink-dim">
          <p className="text-ink">Why this route</p>
          <ul className="list-disc pl-4">{why.map((l) => <li key={l}>{l}</li>)}</ul>
        </div>
      )}
      <p className="text-[11px] text-ink-faint">Modeled estimates under the stated assumptions; not a safety system.</p>
    </Fold>
  )
}
