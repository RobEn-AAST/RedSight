/**
 * Mars solar time and daylight at a site, after NASA GISS Mars24
 * (Allison & McEwen 2000, Planet. Space Sci. 48, 215–235; steps A-1…D-5 at
 * https://www.giss.nasa.gov/tools/mars24/help/algorithm.html, accessed 2026-11-13).
 *
 * Derived, not Observed: sunrise/sunset is when the Sun's centre crosses a flat
 * horizon. Crater walls, Mount Sharp's shadow, dust and refraction are not
 * modeled, so real light at a spot can start later and end earlier.
 *
 * Times are local true solar time (LTST) in Mars hours: 1 sol = 24 Mars hours,
 * 1 Mars hour = 3698.97 Earth seconds. Kept free of app imports so the Node
 * test runner can load it directly.
 */

const DEG = Math.PI / 180

/** One sol in Earth seconds (Mars24 C-2: 1.0274912517 Earth days). */
export const SOL_S = 1.0274912517 * 86400
/** One Mars hour (1/24 sol) in Earth seconds. */
export const MARS_HOUR_S = SOL_S / 24

/** Leap seconds since 1972 (IERS bulletins); TT − UTC = 32.184 s + leap. */
const LEAP_SECONDS: [number, number][] = [
  [Date.UTC(2017, 0, 1), 37],
  [Date.UTC(2015, 6, 1), 36],
  [Date.UTC(2012, 6, 1), 35],
  [Date.UTC(2009, 0, 1), 34],
  [Date.UTC(2006, 0, 1), 33],
  [Date.UTC(1999, 0, 1), 32],
]

function ttMinusUtc(millis: number): number {
  const leap = LEAP_SECONDS.find(([from]) => millis >= from)?.[1] ?? 32
  return 32.184 + leap
}

const mod = (x: number, m: number) => ((x % m) + m) % m

/** Mars24 B-3 perturbers: [A (deg), τ (Julian years), φ (deg)]. */
const PBS: [number, number, number][] = [
  [0.0071, 2.2353, 49.409],
  [0.0057, 2.7543, 168.173],
  [0.0039, 1.1177, 191.837],
  [0.0037, 15.7866, 21.736],
  [0.0021, 2.1354, 15.704],
  [0.002, 2.4694, 95.528],
  [0.0018, 32.8493, 49.095],
]

export interface MarsSunState {
  /** Days since J2000 (TT). */
  dtJ2000: number
  /** Areocentric solar longitude, deg (season: 0 spring equinox N, 90 summer N, 180 autumn N, 270 winter N). */
  ls: number
  /** Equation of time, deg. */
  eotDeg: number
  /** Mean solar time at the prime meridian, Mars hours. */
  mst: number
  /** Solar declination, deg. */
  declDeg: number
}

/** Mars24 A-1 … D-1 for one Earth instant. */
export function marsSun(millis: number): MarsSunState {
  const jdUT = 2440587.5 + millis / 8.64e7 // A-2
  const jdTT = jdUT + ttMinusUtc(millis) / 86400 // A-4, A-5
  const dt = jdTT - 2451545.0 // A-6
  const M = 19.3871 + 0.52402073 * dt // B-1
  const aFMS = 270.3871 + 0.524038496 * dt // B-2
  const pbs = PBS.reduce((sum, [A, tau, phi]) => sum + A * Math.cos(((0.985626 * dt) / tau + phi) * DEG), 0) // B-3
  const m = M * DEG
  const nuMinusM = // B-4
    (10.691 + 3.0e-7 * dt) * Math.sin(m) +
    0.623 * Math.sin(2 * m) +
    0.05 * Math.sin(3 * m) +
    0.005 * Math.sin(4 * m) +
    0.0005 * Math.sin(5 * m) +
    pbs
  const ls = mod(aFMS + nuMinusM, 360) // B-5
  const l = ls * DEG
  const eotDeg = 2.861 * Math.sin(2 * l) - 0.071 * Math.sin(4 * l) + 0.002 * Math.sin(6 * l) - nuMinusM // C-1
  const mst = mod(24 * ((jdTT - 2451549.5) / 1.0274912517 + 44796.0 - 0.0009626), 24) // C-2
  const declDeg = Math.asin(0.42565 * Math.sin(l)) / DEG + 0.25 * Math.sin(l) // D-1
  return { dtJ2000: dt, ls, eotDeg, mst, declDeg }
}

/** Mars24 C-3, C-4: local true solar time (Mars hours) at an east-positive longitude. */
export function localTrueSolarTime(millis: number, lonEastDeg: number): number {
  const s = marsSun(millis)
  const lonWest = mod(-lonEastDeg, 360)
  const lmst = mod(s.mst - lonWest / 15, 24)
  return mod(lmst + s.eotDeg / 15, 24)
}

export interface Daylight {
  /** LTST in Mars hours; null during polar day/night (never at Gale). */
  sunrise: number | null
  sunset: number | null
  /** Daylight length in Mars hours. */
  dayLength: number
  ls: number
  declDeg: number
}

/**
 * Sunrise and sunset (LTST) on the sol that contains `millis`, at a site.
 * Uses Mars24 D-5 with solar zenith = 90° (flat horizon, no refraction).
 * Over one sol Ls moves about 0.5°, so one declination per sol is enough.
 */
export function daylightAt(millis: number, lonEastDeg: number, latDeg: number): Daylight {
  const s = marsSun(millis)
  const phi = latDeg * DEG
  const delta = s.declDeg * DEG
  const cosH = -Math.tan(phi) * Math.tan(delta)
  if (cosH <= -1) return { sunrise: null, sunset: null, dayLength: 24, ls: s.ls, declDeg: s.declDeg }
  if (cosH >= 1) return { sunrise: null, sunset: null, dayLength: 0, ls: s.ls, declDeg: s.declDeg }
  const halfDay = Math.acos(cosH) / DEG / 15 // Mars hours from noon to sunset
  void lonEastDeg // LTST noon is the Sun's transit at every longitude.
  return { sunrise: 12 - halfDay, sunset: 12 + halfDay, dayLength: 2 * halfDay, ls: s.ls, declDeg: s.declDeg }
}

/** Earth seconds → Mars hours. */
export const earthSecondsToMarsHours = (s: number) => s / MARS_HOUR_S

/** "07:05" from Mars hours (wraps past 24). */
export function formatMarsClock(hours: number): string {
  const total = Math.round(mod(hours, 24) * 60)
  const h = Math.floor(total / 60) % 24
  return `${String(h).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Mars season name for the southern hemisphere (Gale sits at 4.6°S). */
export function southernSeason(ls: number): string {
  if (ls < 90) return 'southern autumn'
  if (ls < 180) return 'southern winter'
  if (ls < 270) return 'southern spring'
  return 'southern summer'
}
