import { useId, useMemo, useState } from 'react'
import { ChevronDown, Radiation } from 'lucide-react'

import { cn } from '@/lib/cn'
import type { EngineRoute, PlanFile, PlanMember } from '@/lib/engineDataContext'
import { useEngineData } from '@/lib/useEngineData'
import {
  computeEvaRadiationDose,
  formatCareerPct,
  formatRadiationDoseMSv,
  parseRadCardParams,
} from '@/map/evaRadiation'
import { formatDuration, summarizeMember } from '@/map/format'
import { usePlan } from '@/map/usePlan'
import { SourceCard } from '@/provenance/SourceCard'
import { o2PlanFromConstants, turnBackPoint } from '@/turnback/turnback'
import { EvidenceBadge } from '@/ui/Badge'

function memberAsRouteInput(plan: PlanFile, m: PlanMember): EngineRoute {
  return {
    _mock: plan._mock,
    id: `${plan.id}:${m.member}`,
    stop: m.targets[m.targets.length - 1] ?? plan.target,
    mode: plan.mode,
    crew: plan.crew,
    load_kg: plan.load_kg,
    badge: plan.badge,
    budget_l: plan.budget_l,
    constants_hash: '',
    coords: m.coords,
    seg: m.seg.map(({ distance_m, cost_terms, ...s }) => ({
      ...s,
      cost_terms: { distance_m, ...cost_terms },
    })),
    cum: m.cum,
    back: m.back,
    ...(m.back_fast ? { back_fast: m.back_fast } : {}),
    pnr_index: m.pnr_index,
  }
}

function plannedDurationS(members: PlanMember[], budgetL: number): number {
  let maxS = 0
  for (const m of members) {
    const s = summarizeMember(m, budgetL)
    const turnIdx = s.reachesTarget ? m.coords.length - 1 : s.pnrIndex
    maxS = Math.max(maxS, m.cum.t_s[turnIdx] + m.back.t_s[turnIdx])
  }
  return maxS
}

type O2Plan = ReturnType<typeof o2PlanFromConstants>['plan']

/** Modeled EVA duration (s) for the dose estimate, honouring the turn-back O₂ slider when set. */
function evaDuration(
  activePlan: PlanFile | null | undefined,
  activeMembers: PlanMember[],
  o2BudgetL: number | null | undefined,
  o2Plan: O2Plan,
): { evaDurationS: number; sliderAdjusted: boolean } {
  if (!activePlan || activeMembers.length === 0) {
    return { evaDurationS: 0, sliderAdjusted: false }
  }
  const baseS = plannedDurationS(activeMembers, activePlan.budget_l)
  if (o2BudgetL == null || !o2Plan) {
    return { evaDurationS: baseS, sliderAdjusted: false }
  }
  const effBudget = Math.min(Math.max(o2BudgetL, 0), o2Plan.maxBudgetL)
  let maxSliderS = 0
  for (const m of activeMembers) {
    const res = turnBackPoint(memberAsRouteInput(activePlan, m), effBudget, o2Plan.returnMargin)
    if (!res) return { evaDurationS: baseS, sliderAdjusted: false }
    const memberS = res.status === 'no-go' ? 0 : res.outTimeS + res.homeTimeS
    maxSliderS = Math.max(maxSliderS, memberS)
  }
  return {
    evaDurationS: maxSliderS,
    sliderAdjusted: effBudget < activePlan.budget_l - 0.05 && maxSliderS < baseS - 30,
  }
}

/**
 * EVA radiation-dose card (Tier 1, B6c — Scenario).
 *
 * Computes RAD surface GCR dose rate × modeled EVA hours and compares it
 * against the NASA-STD-3001 Vol 1 600 mSv career effective dose limit, reading
 * both constants from cards/rad.json and explicitly stating that suit and
 * terrain sky-view shielding are not modeled.
 */
export function EvaRadiationCard() {
  const engine = useEngineData()
  const { activePlan, activeMembers, o2BudgetL } = usePlan()
  const [sourceOpen, setSourceOpen] = useState(false)
  const sourceId = useId()

  const radParams = useMemo(() => parseRadCardParams(engine.cards.rad), [engine.cards.rad])
  const { plan: o2Plan } = useMemo(() => o2PlanFromConstants(engine.constants), [engine.constants])

  const { evaDurationS, sliderAdjusted } = useMemo(
    () => evaDuration(activePlan, activeMembers, o2BudgetL, o2Plan),
    [activePlan, activeMembers, o2BudgetL, o2Plan],
  )

  const estimate = useMemo(() => computeEvaRadiationDose(evaDurationS, radParams), [evaDurationS, radParams])

  if (!activePlan || activeMembers.length === 0) return null

  if (!radParams || !estimate) {
    if (!engine.probed) return null
    return (
      <div className="flex flex-col gap-2 border border-seam bg-inset/50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="label-console flex items-center gap-1.5 text-ink">
            <Radiation size={12} aria-hidden className="text-ink-dim" />
            EVA radiation dose
          </span>
          <EvidenceBadge evidence="unavailable" />
        </div>
        <p className="text-xs leading-relaxed text-ink-faint">
          <span className="data-readout">cards/rad.json</span> is missing or lacks RAD surface dose rate and
          NASA-STD-3001 limit values, so EVA dose is not estimated.
        </p>
      </div>
    )
  }

  const mock = engine.mock || !!activePlan._mock || radParams.mock
  const barPct = estimate.doseMSv > 0 ? Math.min(100, Math.max(estimate.careerLimitPct, 0.75)) : 0

  return (
    <div className="flex flex-col gap-2.5 border border-seam bg-inset/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="label-console flex items-center gap-1.5 text-ink">
          <Radiation size={12} aria-hidden className="text-scenario" />
          EVA radiation dose
        </span>
        <div className="flex items-center gap-2">
          <EvidenceBadge evidence="scenario" />
          <button
            type="button"
            aria-expanded={sourceOpen}
            aria-controls={sourceId}
            onClick={() => setSourceOpen((o) => !o)}
            className="label-console flex items-center gap-1 text-[10px] text-ink-dim hover:text-ink"
          >
            Source
            <ChevronDown size={11} aria-hidden className={cn('transition-transform', sourceOpen && 'rotate-180')} />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium text-ink">
          {estimate.evaDurationS > 0 ? (
            <>
              This <span className="data-readout">{formatDuration(estimate.evaDurationS)}</span> EVA ≈{' '}
              <span className="data-readout text-scenario">{formatRadiationDoseMSv(estimate.doseMSv)} mSv</span>
            </>
          ) : (
            <span className="text-caution">0.00 mSv (no-go at current O₂ budget)</span>
          )}
        </p>
        <p className="text-[11px] leading-relaxed text-ink-dim">
          {estimate.doseMinMSv != null && estimate.doseMaxMSv != null && radParams.ratePmMSvPerDay != null ? (
            <>
              <span className="data-readout">
                {formatRadiationDoseMSv(estimate.doseMinMSv)}–{formatRadiationDoseMSv(estimate.doseMaxMSv)} mSv
              </span>{' '}
              range from RAD ±{radParams.ratePmMSvPerDay} mSv/day spread
            </>
          ) : (
            <>Scaled from Curiosity RAD surface GCR baseline</>
          )}
          {sliderAdjusted && ' · adjusted to turn-back slider'}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-1.5">
        <div className="border border-seam bg-panel/70 px-2 py-1.5">
          <dt className="flex items-center justify-between gap-1">
            <span className="label-console text-[9px] text-ink-faint">RAD GCR rate</span>
            <span className="label-console text-[8px] text-observed">Observed</span>
          </dt>
          <dd className="data-readout mt-0.5 text-xs text-ink">
            {radParams.rateMSvPerDay}
            {radParams.ratePmMSvPerDay != null ? ` ± ${radParams.ratePmMSvPerDay}` : ''} mSv/day
          </dd>
          <dd className="data-readout text-[10px] text-ink-faint">{estimate.rateMSvPerHour.toFixed(3)} mSv/h</dd>
        </div>
        <div className="border border-seam bg-panel/70 px-2 py-1.5">
          <dt className="label-console text-[9px] text-ink-faint">NASA-STD-3001 limit</dt>
          <dd className="data-readout mt-0.5 text-xs text-ink">{radParams.careerLimitMSv} mSv career</dd>
          <dd className="data-readout text-[10px] text-ink-faint">
            {formatCareerPct(estimate.careerLimitPct)} % for this EVA
          </dd>
        </div>
      </dl>

      <div className="flex flex-col gap-1">
        <div className="h-1.5 w-full overflow-hidden border border-seam bg-hull" aria-hidden>
          <div className="h-full bg-scenario transition-[width]" style={{ width: `${barPct}%` }} />
        </div>
        <div className="data-readout flex justify-between text-[10px] text-ink-faint">
          <span>0 mSv</span>
          <span>{formatCareerPct(estimate.careerLimitPct)} % of career limit</span>
          <span>{radParams.careerLimitMSv} mSv</span>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-ink-faint">
        <span className="font-medium text-ink-dim">Suit and terrain sky-view shielding are not modeled.</span>{' '}
        Unshielded GCR baseline only; solar energetic particle (SEP) storms and walk-scale spatial radiation maps are
        not included.
      </p>

      {sourceOpen && (
        <div id={sourceId}>
          <SourceCard
            info={{
              badge: 'Scenario',
              source: (
                <>
                  {radParams.source} · modeled EVA duration from{' '}
                  <span className="data-readout">{activePlan.id}</span>
                </>
              ),
              note: [
                `Calculated as (${radParams.rateMSvPerDay} mSv/day ÷ 24 h) × ${estimate.evaHours.toFixed(2)} h = ${formatRadiationDoseMSv(estimate.doseMSv)} mSv, shown against the ${radParams.careerLimitMSv} mSv NASA-STD-3001 Vol 1 career effective dose limit.`,
                'Suit and terrain sky-view shielding are not modeled. RAD is a single rover-local dosimeter (no spatial radiation map exists at walk scale — Unavailable).',
                radParams.sepValueText
                  ? `Sept 2017 surface SEP event (${radParams.sepValueText}) is recorded separately and not included in this GCR baseline.`
                  : null,
              ]
                .filter(Boolean)
                .join(' '),
              sourceUrl: radParams.primaryUrl ?? undefined,
              mock,
            }}
          />
        </div>
      )}
    </div>
  )
}
