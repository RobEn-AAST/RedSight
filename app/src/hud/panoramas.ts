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
  /** Compass bearing (°) the viewer faces at start (yaw 0). Estimate until calibrated. */
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
    // Image centre ≈ north: NASA's caption puts the Gale crater rim at the top centre, and from S1 the rim lies
    // north across the crater floor (images-api.nasa.gov PIA26559, read 2026-11-13). Approximate; [ ] adjust.
    northOffsetDeg: 0,
    headingNote: "from NASA's caption (crater rim at centre)",
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
    // Estimate (±~30°). NASA's caption (Photojournal PIA26696, added 2026-04-28, read 2026-11-14) names no
    // landmark directions, so the heading is read from the image: the only long view out over the Gale crater
    // floor to the distant crater rim is centred ~146° left of the image centre (x ≈ 775 of 8192). From the
    // boxwork on lower Mount Sharp the crater floor and rim lie downslope to the north (Bradbury Landing,
    // ≈4.59°S 137.44°E, is ~15° from S2 at 4.808°S 137.381°E), so that view is taken as ≈ 5–15° → centre ≈ 146° + ~9° ≈ 155°.
    // Mount Sharp's layered buttes fill the other side of the mosaic, consistent with upslope to the south.
    northOffsetDeg: 155,
    headingNote: 'estimated from the image (crater-floor view taken as north)',
    // Distant crater-floor horizon sits ~15° above the mosaic's centre (by eye: y ≈ 500 of 1685 → atan(342·2π/8192)).
    horizonDeg: 15,
  },
}
