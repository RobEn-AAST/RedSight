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
  },
  // S2 (PIA26696) is not in the NASA Image Library; add it after it is downloaded with approval.
}
