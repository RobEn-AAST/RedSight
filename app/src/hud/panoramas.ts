// Real NASA panoramas available at stops (demo-focus-plan §10). Only real imagery: no invented scenery.
export interface StopPanorama {
  stopId: string
  url: string
  title: string
  pia: string
  credit: string
  taken: string
  source: string
  /** The image's 0° isn't tied to north yet, so the HUD can't point at the habitat on the photo. */
  northCalibrated: boolean
  /** Compass bearing (°) the viewer faces at start (yaw 0). Derived from PDS Mastcam pointing (±3°). */
  northOffsetDeg: number
  /** Short on-screen reason for northOffsetDeg (shown in the HUD footer while not calibrated). */
  headingNote: string
  /** Angle of the horizon above the image's vertical centre (°). Read off the image by eye: estimate. */
  horizonDeg: number
}

export const PANORAMAS: Record<string, StopPanorama> = {
  S1: {
    stopId: 'S1',
    url: 'pano/PIA26559.jpg',
    title: "Curiosity's first 360-degree view of boxwork patterns",
    pia: 'PIA26559',
    credit: 'NASA/JPL-Caltech/MSSS',
    taken: 'Mastcam, 291 images, 2025-05-15 to 05-18',
    source: 'https://images.nasa.gov/details/PIA26559',
    northCalibrated: false,
    // Derived from PDS pointing data (2026-11-14): NASA's caption puts the Gale crater rim at the top centre
    // (images-api.nasa.gov PIA26559, read 2026-11-13), and Mastcam pointing confirms it within ~5°. Four Mastcam-left
    // frames of the sol-4541 360° (sequence mcam07599, site 116 drive 408; PDS msl_mmm volume_0040_raw labels,
    // geom:instrument_azimuth, north-referenced site frame) were located in this image by cross-correlation
    // (az 33.1° → x 1690, 52.5° → 1851, 71.9° → 2006, 105.0° → 2270 of 2924; fit 8.04 px/° ≈ 360° wide,
    // residuals ≤ 0.3°) → image centre x 1462 ≈ 4–5°. Uncertainty ≈ ±3° (matching + rover-attitude knowledge).
    northOffsetDeg: 5,
    headingNote: 'from Mastcam pointing data (PDS), ±3°',
    // Distant crater-floor haze sits ~18° above the mosaic's centre (by eye, at the default zoom).
    horizonDeg: 18,
  },
  S2: {
    stopId: 'S2',
    // 6144 × 1263 px web resize (sips, JPEG q82, 2.7 MB) of NASA's 8192 × 1685 browse JPEG (14.0 MB):
    // https://assets.science.nasa.gov/content/dam/science/psd/photojournal/pia/pia26/pia26696/PIA26696.jpg
    url: 'pano/PIA26696.jpg',
    title: "Curiosity Captures a 360-Degree View at 'Nevado Sajama'",
    pia: 'PIA26696',
    credit: 'NASA/JPL-Caltech/MSSS',
    taken: 'Mastcam right (100 mm), 1,031 images, 2025-11-09 to 12-07 (sols 4714–4741)',
    source: 'https://science.nasa.gov/photojournal/curiosity-captures-a-360-degree-view-at-nevado-sajama/',
    northCalibrated: false,
    // Derived from PDS pointing data (2026-11-14), replacing the earlier image-based estimate of 155° (±30°).
    // PDS msl_mmm data_MSLMST volume_0042_raw labels for the mosaic's Mastcam-right frames (sols 4714–4741, all at
    // site 120 drive 82; geom:instrument_azimuth, north-referenced site frame; cross-check: rover yaw 215.9° from the
    // label quaternion + camera az 10.5° in rover frame ≈ 226.4° vs label 226.07°). Five frames located in the
    // 8192-px browse JPEG by cross-correlation: az 31.15° → x 1660.5, 35.11° → 1751.5, 39.66° → 1856.5 (sequences
    // mcam08636/08631) and 221.56° → 6016.5, 226.09° → 6122.5 (mcam08595/08593). Linear fit 22.88 px/° (a 360° wrap
    // is 22.76), residuals ≤ 0.05° → centre x 4096 ≈ 137.6°; left edge ≈ 318°. Uncertainty ≈ ±3° (matching +
    // rover-attitude knowledge). The crater-floor view on the left spans ≈ 318–40° (north), as the old estimate assumed.
    northOffsetDeg: 138,
    headingNote: 'from Mastcam pointing data (PDS), ±3°',
    // Distant crater-floor horizon sits ~15° above the mosaic's centre (by eye: y ≈ 500 of 1685 → atan(342·2π/8192)).
    horizonDeg: 15,
  },
}
