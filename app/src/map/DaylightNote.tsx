import { useMemo, useState } from 'react'
import { Sun, TriangleAlert } from 'lucide-react'

import { cn } from '@/lib/cn'
import type { PlanFile, PlanMember } from '@/lib/engineDataContext'
import {
  MARS_HOUR_S,
  daylightAt,
  earthSecondsToMarsHours,
  formatMarsClock,
  southernSeason,
} from '@/lib/mars24'
import { useEngineData } from '@/lib/useEngineData'
import { Fold } from '@/map/Fold'
import { formatDuration, summarizeCrew } from '@/map/format'
import { EvidenceBadge } from '@/ui/Badge'

/**
 * Daylight window (demo-focus-plan §17, Tier 2 E4): sunrise and sunset at the
 * habitat for the planned sol, and whether the walk is home before dark.
 * Sun times follow NASA GISS Mars24; the walk time is the plan's own round trip.
 */

const todayIso = () => new Date().toISOString().slice(0, 10)
/** "09:30" → 9.5 */
const parseClock = (v: string) => {
  const [h, m] = v.split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h + m / 60 : null
}
/** Mars hours as Earth-clock duration text (the rest of the panel uses Earth minutes). */
const marsSpan = (hours: number) => formatDuration(hours * MARS_HOUR_S)

export function DaylightNote({ plan, members }: { plan: PlanFile; members: PlanMember[] }) {
  const { meta } = useEngineData()
  const [date, setDate] = useState(todayIso)
  const [leaveAt, setLeaveAt] = useState('09:00')

  const site = meta?.habitat.lonlat ?? null
  const day = useMemo(() => {
    const noonUtc = Date.parse(`${date}T12:00:00Z`)
    if (!site || !Number.isFinite(noonUtc)) return null
    return daylightAt(noonUtc, site[0], site[1])
  }, [date, site])

  if (!day || day.sunrise == null || day.sunset == null) return null

  const trip = earthSecondsToMarsHours(summarizeCrew(members, plan.budget_l).roundTripS)
  const leave = parseClock(leaveAt) ?? 9
  const back = leave + trip
  const beforeSunrise = leave < day.sunrise
  const afterSunset = back > day.sunset
  const latestStart = day.sunset - trip
  const warn = beforeSunrise || afterSunset

  return (
    <Fold
      icon={<Sun size={14} />}
      title="Daylight"
      tone={warn ? 'caution' : 'plain'}
      answer={
        beforeSunrise
          ? 'Leaves before sunrise'
          : afterSunset
            ? 'Home after sunset'
            : `Back ${formatMarsClock(back)} · sunset ${formatMarsClock(day.sunset)}`
      }
    >
      <EvidenceBadge evidence="derived" className="self-start" />

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-ink-dim">
          Earth date
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="data-readout min-h-10 border border-seam-lit bg-inset px-2 text-sm text-ink focus:border-signal/60 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-ink-dim">
          Leave at (Mars time)
          <input
            type="time"
            step={900}
            value={leaveAt}
            onChange={(e) => e.target.value && setLeaveAt(e.target.value)}
            className="data-readout min-h-10 border border-seam-lit bg-inset px-2 text-sm text-ink focus:border-signal/60 focus:outline-none"
          />
        </label>
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          ['Sunrise', formatMarsClock(day.sunrise)],
          ['Back home', formatMarsClock(back)],
          ['Sunset', formatMarsClock(day.sunset)],
        ].map(([k, v]) => (
          <div key={k} className="border border-seam bg-inset px-1 py-1.5">
            <dt className="text-[10px] uppercase tracking-wider text-ink-faint">{k}</dt>
            <dd className={cn('data-readout text-sm', k === 'Back home' && afterSunset ? 'text-caution' : 'text-ink')}>{v}</dd>
          </div>
        ))}
      </dl>

      <p className="text-xs leading-relaxed text-ink-dim">
        {beforeSunrise ? (
          <span className="flex gap-1.5 text-caution">
            <TriangleAlert size={13} aria-hidden className="mt-0.5 flex-none" />
            Leaves {marsSpan(day.sunrise - leave)} before sunrise.
          </span>
        ) : afterSunset ? (
          <span className="flex gap-1.5 text-caution">
            <TriangleAlert size={13} aria-hidden className="mt-0.5 flex-none" />
            Gets home {marsSpan(back - day.sunset)} after sunset.{' '}
            {latestStart >= day.sunrise ? `Leave by ${formatMarsClock(latestStart)} to be back in daylight.` : 'This walk is longer than the day.'}
          </span>
        ) : (
          <>
            Home {marsSpan(day.sunset - back)} before sunset: that is the time left for sampling. Latest start{' '}
            {formatMarsClock(latestStart)}.
          </>
        )}
      </p>
      <p className="text-[11px] leading-relaxed text-ink-faint">
        Local solar time at the habitat, Ls {Math.round(day.ls)}° ({southernSeason(day.ls)}), day {marsSpan(day.dayLength)}.
        From NASA GISS Mars24 (Allison &amp; McEwen 2000) for a flat horizon: crater walls and dust can shorten the light.
        Walk time excludes time spent sampling.
      </p>
    </Fold>
  )
}
