/**
 * EVA radiation-dose estimate (Tier 1, B6c — Scenario).
 *
 * Pure module with no React or bundler-alias imports so it runs under both
 * Vite and `node --test`. Every input constant (Curiosity RAD surface dose
 * rate and NASA-STD-3001 career effective dose limit) is read from
 * app/public/data/cards/rad.json — never hardcoded in the UI.
 *
 * Suit and terrain sky-view shielding are NOT modeled.
 */

export interface RadCardValueLike {
  label: string
  value: number | string
  unit?: string
  pm?: number
  badge?: string
  note?: string
}

export interface RadCardLimitLike {
  label: string
  value: number | string
  unit?: string
  source?: string
  badge?: string
}

export interface RadCardLike {
  _mock?: boolean
  title: string
  badge?: string
  values: RadCardValueLike[]
  limits?: RadCardLimitLike[]
  note?: string
  claim_boundary?: string
  source: string
  source_urls?: string[]
  date_range?: string
}

export interface RadCardParams {
  rateMSvPerDay: number
  ratePmMSvPerDay: number | null
  rateLabel: string
  rateNote: string | null
  careerLimitMSv: number
  careerLimitLabel: string
  careerLimitSource: string | null
  sepValueText: string | null
  source: string
  primaryUrl: string | null
  dateRange: string | null
  mock: boolean
}

export interface EvaRadiationEstimate {
  evaDurationS: number
  evaHours: number
  rateMSvPerDay: number
  ratePmMSvPerDay: number | null
  rateMSvPerHour: number
  doseMSv: number
  doseMinMSv: number | null
  doseMaxMSv: number | null
  careerLimitMSv: number
  careerLimitPct: number
  shieldingModeled: false
  sepIncluded: false
}

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * Extracts Observed Curiosity RAD GCR dose rate (mSv/day) and NASA-STD-3001
 * career effective dose limit (mSv) from cards/rad.json. Returns null if
 * either required figure is missing or non-positive so the UI never invents
 * fallback numbers.
 */
export function parseRadCardParams(card: RadCardLike | null | undefined): RadCardParams | null {
  if (!card || !Array.isArray(card.values)) return null

  const rateEntry = card.values.find(
    (v) => typeof v.unit === 'string' && v.unit.trim().toLowerCase() === 'msv/day' && isFiniteNum(v.value),
  )
  const limitEntry = card.limits?.find(
    (l) => typeof l.unit === 'string' && l.unit.trim().toLowerCase() === 'msv' && isFiniteNum(l.value),
  )

  if (!rateEntry || !isFiniteNum(rateEntry.value) || rateEntry.value <= 0) return null
  if (!limitEntry || !isFiniteNum(limitEntry.value) || limitEntry.value <= 0) return null

  const sepEntry = card.values.find(
    (v) => v.label.toLowerCase().includes('sep') && (isFiniteNum(v.value) || typeof v.value === 'string'),
  )

  const nasaUrl = card.source_urls?.find((u) => u.includes('nasa.gov')) ?? card.source_urls?.[0] ?? null

  return {
    rateMSvPerDay: rateEntry.value,
    ratePmMSvPerDay: isFiniteNum(rateEntry.pm) && rateEntry.pm >= 0 ? rateEntry.pm : null,
    rateLabel: rateEntry.label,
    rateNote: typeof rateEntry.note === 'string' ? rateEntry.note : null,
    careerLimitMSv: limitEntry.value,
    careerLimitLabel: limitEntry.label,
    careerLimitSource: typeof limitEntry.source === 'string' ? limitEntry.source : null,
    sepValueText: sepEntry ? `${sepEntry.value}${sepEntry.unit ? ` ${sepEntry.unit}` : ''}` : null,
    source: card.source,
    primaryUrl: nasaUrl,
    dateRange: typeof card.date_range === 'string' ? card.date_range : null,
    mock: card._mock === true,
  }
}

/**
 * Scales the Observed RAD surface GCR rate by the modeled EVA duration in
 * hours and compares the unshielded Scenario dose against the NASA-STD-3001
 * career limit.
 */
export function computeEvaRadiationDose(
  evaDurationS: number,
  params: RadCardParams | null | undefined,
): EvaRadiationEstimate | null {
  if (!params || !isFiniteNum(evaDurationS) || evaDurationS < 0) return null
  if (!isFiniteNum(params.rateMSvPerDay) || !isFiniteNum(params.careerLimitMSv) || params.careerLimitMSv <= 0) {
    return null
  }

  const evaHours = evaDurationS / 3600
  const rateMSvPerHour = params.rateMSvPerDay / 24
  const doseMSv = rateMSvPerHour * evaHours
  const pm = params.ratePmMSvPerDay
  const doseMinMSv = pm != null ? Math.max(0, ((params.rateMSvPerDay - pm) / 24) * evaHours) : null
  const doseMaxMSv = pm != null ? ((params.rateMSvPerDay + pm) / 24) * evaHours : null

  return {
    evaDurationS,
    evaHours,
    rateMSvPerDay: params.rateMSvPerDay,
    ratePmMSvPerDay: pm,
    rateMSvPerHour,
    doseMSv,
    doseMinMSv,
    doseMaxMSv,
    careerLimitMSv: params.careerLimitMSv,
    careerLimitPct: (doseMSv / params.careerLimitMSv) * 100,
    shieldingModeled: false,
    sepIncluded: false,
  }
}

/** Formats mSv dose without rounding tiny non-zero EVAs down to 0.00. */
export function formatRadiationDoseMSv(doseMSv: number): string {
  if (!Number.isFinite(doseMSv) || doseMSv <= 0) return '0.00'
  if (doseMSv < 0.01) return doseMSv.toFixed(3)
  if (doseMSv < 10) return doseMSv.toFixed(2)
  return doseMSv.toFixed(1)
}

/** Formats career-limit share (%) cleanly for single-EVA magnitudes. */
export function formatCareerPct(pct: number): string {
  if (!Number.isFinite(pct) || pct <= 0) return '0.00'
  if (pct < 0.001) return '< 0.001'
  if (pct < 0.1) return pct.toFixed(3)
  return pct.toFixed(2)
}
