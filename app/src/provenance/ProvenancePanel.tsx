import type { ReactNode } from 'react'
import { ExternalLink, FileSearch, SlidersHorizontal, Radiation, CloudSun } from 'lucide-react'

import { Panel } from '@/ui/Panel'
import { EvidenceBadge } from '@/ui/Badge'
import { LedDot } from '@/ui/LedDot'
import { layerCatalog } from '@/lib/layersData'
import type { EngineCard } from '@/lib/engineDataContext'
import { useEngineData } from '@/lib/useEngineData'
import { SourceCard } from '@/provenance/SourceCard'
import { constantInfo, formatConstant } from '@/provenance/sourceInfo'

/**
 * Provenance inspector — first-class panel, not a footnote. Every dataset the
 * product cites, every model constant (constants.json) and the RAD/REMS
 * context cards, each with evidence class and source. Nothing is fabricated
 * here: constants and cards are read from the contract files, and a missing
 * file is shown as missing.
 */

/** Human names for the constants.json keys; unknown keys fall back to the key itself. */
const CONSTANT_LABEL: Record<string, string> = {
  suit_factor_kappa: 'Suit effect on walking cost (κ)',
  reserve_fraction: 'O₂ reserve share of the tank',
  slope_limit_foot_deg: 'Slope limit on foot',
  slope_limit_rover_deg: 'Slope limit for the rover',
  watts_to_o2_ml_per_min: 'O₂ per watt of work',
  o2_usable_primary_l: 'Usable primary O₂ per suit',
  gravity_mars: 'Mars surface gravity',
  walk_speed_kmh: 'Walking speed',
  crew_size_default: 'Crew size',
  body_mass_kg: 'Body mass',
  carried_load_kg: 'Carried load',
  sample_mass_per_stop_kg: 'Samples picked up per stop',
  reserve_minutes: 'Reserve walkback time',
  walkback_o2_lpm: 'Walkback O₂ rate',
  return_cost_margin: 'Return margin',
  emergency_supply_min: 'Emergency O₂ supply',
  o2_status_step: 'O₂ status callout step',
  radio_mast_height_m: 'Habitat radio mast height',
  blackout_warn_min: 'Radio blackout warning',
}

function ContextCard({ card, icon }: { card: EngineCard; icon: ReactNode }) {
  return (
    <li className="flex flex-col gap-2 px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-ink">{card.title}</h3>
      </div>
      <dl className="data-readout flex flex-col gap-1 text-xs text-ink-dim">
        {card.values.map((v) => (
          <div key={v.label} className="flex justify-between gap-3">
            <dt className="text-ink-faint">{v.label}</dt>
            <dd>
              {v.value}
              {v.pm != null ? ` ± ${v.pm}` : ''} {v.unit}
            </dd>
          </div>
        ))}
        {card.limits?.map((l) => (
          <div key={l.label} className="flex justify-between gap-3">
            <dt className="text-ink-faint">{l.label}</dt>
            <dd>
              {l.value} {l.unit}
              {l.source ? ` (${l.source})` : ''}
            </dd>
          </div>
        ))}
      </dl>
      <SourceCard
        info={{
          badge: card.badge,
          source: card.source,
          note: [card.note, card.date_range ? `Data period: ${card.date_range}.` : null].filter(Boolean).join(' '),
        }}
      />
    </li>
  )
}

export function ProvenancePanel() {
  const engine = useEngineData()
  const constants = engine.constants ? Object.entries(engine.constants) : []

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title={
          <span className="flex items-center gap-2">
            <FileSearch size={13} aria-hidden /> Provenance inspector
          </span>
        }
        bodyClassName="p-0"
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

      <Panel
        title={
          <span className="flex items-center gap-2">
            <SlidersHorizontal size={13} aria-hidden /> Model constants
          </span>
        }
        bodyClassName="p-0"
      >
        <p className="border-b border-seam bg-inset/50 px-4 py-3 text-xs leading-relaxed text-ink-faint">
          Every number the route model and the turn-back point use, read from{' '}
          <span className="data-readout">constants.json</span>. The app never hardcodes one.
        </p>
        {engine.probed && constants.length === 0 && (
          <p className="px-4 py-4 text-xs text-ink-faint">constants.json is missing or unreadable.</p>
        )}
        <ul className="divide-y divide-seam">
          {constants.map(([key, c]) => {
            const info = constantInfo(c)
            return (
              <li key={key} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm text-ink">{CONSTANT_LABEL[key] ?? key}</h3>
                  <span className="data-readout text-sm text-ink">{formatConstant(c)}</span>
                </div>
                <span className="data-readout text-[10px] text-ink-faint">{key}</span>
                {info && <SourceCard info={info} />}
              </li>
            )
          })}
        </ul>
      </Panel>

      <Panel title="Context cards (rover-local, not map layers)" bodyClassName="p-0">
        <ul className="divide-y divide-seam">
          {engine.cards.rad && (
            <ContextCard card={engine.cards.rad} icon={<Radiation size={13} aria-hidden className="text-ink-dim" />} />
          )}
          {engine.cards.rems && (
            <ContextCard card={engine.cards.rems} icon={<CloudSun size={13} aria-hidden className="text-ink-dim" />} />
          )}
          {engine.probed && !engine.cards.rad && !engine.cards.rems && (
            <li className="px-4 py-4 text-xs text-ink-faint">cards/rad.json and cards/rems.json are missing.</li>
          )}
        </ul>
      </Panel>
    </div>
  )
}
