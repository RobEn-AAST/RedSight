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
    // Distant crater-floor haze sits ~18° above the mosaic's centre (by eye, at the default zoom).
    horizonDeg: 18,
  },
  // S2 (PIA26696) is not in the NASA Image Library; add it after it is downloaded with approval.
}
