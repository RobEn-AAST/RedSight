// One-way signal delay Mars → Earth for a given date (Derived). Owner: Marwan.
// Earth–Mars distance from JPL's "Approximate Positions of the Planets" (E. M. Standish), Keplerian elements
// valid 1800–2050 AD, https://ssd.jpl.nasa.gov/planets/approx_pos.html (Table 1). Accuracy is far better than
// needed for minutes of light time. Divided by the speed of light.

const AU_KM = 149_597_870.7
const C_KMS = 299_792.458
const D2R = Math.PI / 180

// [a, e, I, L, longPeri, longNode] and their rates per Julian century (Table 1, 1800–2050).
const EARTH = {
  el: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
  rate: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
}
const MARS = {
  el: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
  rate: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
}

/** Heliocentric ecliptic position (AU) at Julian centuries T past J2000. */
function position(p: { el: number[]; rate: number[] }, T: number): [number, number, number] {
  const [a, e, I, L, w̃, Ω] = p.el.map((v, i) => v + p.rate[i] * T)
  const ω = w̃ - Ω
  let M = (L - w̃) % 360
  if (M > 180) M -= 360
  if (M < -180) M += 360
  // Kepler's equation, in degrees (Standish's iteration).
  const eDeg = e / D2R
  let E = M + eDeg * Math.sin(M * D2R)
  for (let k = 0; k < 10; k++) {
    const dM = M - (E - eDeg * Math.sin(E * D2R))
    const dE = dM / (1 - e * Math.cos(E * D2R))
    E += dE
    if (Math.abs(dE) < 1e-8) break
  }
  const x1 = a * (Math.cos(E * D2R) - e)
  const y1 = a * Math.sqrt(1 - e * e) * Math.sin(E * D2R)
  const [cw, sw, cO, sO, cI, sI] = [ω, ω, Ω, Ω, I, I].map((v, i) => (i % 2 ? Math.sin(v * D2R) : Math.cos(v * D2R)))
  return [
    (cw * cO - sw * sO * cI) * x1 + (-sw * cO - cw * sO * cI) * y1,
    (cw * sO + sw * cO * cI) * x1 + (-sw * sO + cw * cO * cI) * y1,
    sw * sI * x1 + cw * sI * y1,
  ]
}

/** Earth–Mars distance (km) on a date. */
export function earthMarsKm(date: Date): number {
  const jd = date.getTime() / 86_400_000 + 2_440_587.5
  const T = (jd - 2_451_545.0) / 36_525
  const e = position(EARTH, T)
  const m = position(MARS, T)
  return Math.hypot(m[0] - e[0], m[1] - e[1], m[2] - e[2]) * AU_KM
}

/** One-way light time Mars → Earth (seconds) on a date. */
export function oneWayDelayS(date: Date): number {
  return earthMarsKm(date) / C_KMS
}
