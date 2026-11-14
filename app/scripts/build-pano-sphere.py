"""Bake a full-sphere (equirectangular 2:1) web panorama from a NASA Mastcam 360 mosaic. Owner: Marwan.

Used for the HUD's "full 360 stand-in" photo (docs/hud-plan.md). NASA Mastcam mosaics cover 360 deg of azimuth but
only part of the elevation range: the sky above the top frames and parts of the rover deck were never imaged (NASA's
own 360 video of PIA26363 marks them "sky not imaged" / "rover not imaged"). This script:

  1. places the mosaic at its true angles on a 2:1 sphere (360 deg across the width, same angle per pixel vertically,
     horizon row measured by eye on the far crater rim),
  2. fills the parts that were not photographed: sky = a smooth colour model fitted to the photographed sky
     (by elevation), ground = a smooth push-pull fill of the nearest photographed colours plus fine grain,
  3. feathers the seams and writes a high-quality JPEG.

The fill is NOT imagery; the HUD says "sky above the photo and the rover deck are colour-filled".

Usage (from repo root, raw file in the git-ignored data/raw/pano/):
  .venv/bin/python -I app/scripts/build-pano-sphere.py data/raw/pano/PIA26363.jpg app/public/pano/PIA26363-sphere.jpg \
      --horizon-row 1950 --width 8192
"""

import argparse

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

Image.MAX_IMAGE_PIXELS = None


def push_pull(img: np.ndarray, known: np.ndarray) -> np.ndarray:
    """Smooth fill of unknown pixels (membrane-like), wrapping horizontally. img HxWx3 float, known HxW bool."""
    levels = []
    c = img * known[..., None]
    w = known.astype(np.float32)
    while min(c.shape[0], c.shape[1]) > 4:
        levels.append((c, w))
        h2, w2 = c.shape[0] // 2 * 2, c.shape[1] // 2 * 2
        c = c[:h2, :w2].reshape(h2 // 2, 2, w2 // 2, 2, 3).sum(axis=(1, 3))
        w = w[:h2, :w2].reshape(h2 // 2, 2, w2 // 2, 2).sum(axis=(1, 3))
    # Coarsest level: fill any empties with the global mean.
    mean = c.sum(axis=(0, 1)) / max(1e-6, w.sum())
    filled = np.where(w[..., None] > 0, c / np.maximum(w, 1e-6)[..., None], mean)
    for c_l, w_l in reversed(levels):
        up = np.repeat(np.repeat(filled, 2, axis=0), 2, axis=1)
        up = np.pad(up, ((0, c_l.shape[0] - up.shape[0]), (0, c_l.shape[1] - up.shape[1]), (0, 0)), mode="edge")
        up = ndimage.uniform_filter(up, size=(3, 3, 1), mode="wrap")
        a = np.clip(w_l, 0, 1)[..., None]
        filled = a * (c_l / np.maximum(w_l, 1e-6)[..., None]) + (1 - a) * up
    return filled


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--horizon-row", type=float, required=True, help="row of the horizon in the source mosaic")
    ap.add_argument("--width", type=int, default=8192)
    ap.add_argument("--quality", type=int, default=86)
    args = ap.parse_args()

    src = Image.open(args.src).convert("RGB")
    W = args.width
    H = W // 2
    s = W / src.width
    mh = round(src.height * s)
    deg_px = W / 360.0
    top_elev = args.horizon_row / src.width * 360.0  # degrees above the horizon at the mosaic's top row
    y0 = round((90.0 - top_elev) * deg_px)
    print(f"mosaic {src.width}x{src.height} -> {W}x{mh} at row {y0}; elevation {top_elev:.1f} to "
          f"{top_elev - src.height / src.width * 360:.1f} deg")

    small = np.asarray(src.resize((W, mh), Image.LANCZOS), dtype=np.float32)
    sphere = np.zeros((H, W, 3), np.float32)
    known = np.zeros((H, W), bool)
    y1 = min(H, y0 + mh)
    sphere[y0:y1] = small[: y1 - y0]
    blackish = small[: y1 - y0].max(axis=2) <= 14  # never-imaged areas are pure black (JPEG noise allowed)
    # Only large black areas are gaps (small dark specks are shadows), then grow them over the dark JPEG fringe.
    lab, n = ndimage.label(blackish)
    sizes = ndimage.sum(blackish, lab, range(1, n + 1))
    border = np.unique(np.concatenate([lab[0], lab[-1]]))
    big = np.where(sizes >= 60000)[0] + 1
    gaps = np.isin(lab, np.union1d(border[border > 0], big))
    gaps = ndimage.binary_dilation(gaps, iterations=5)
    known[y0:y1] = ~gaps

    elev = 90.0 - (np.arange(H) + 0.5) / deg_px  # per row
    col_ids = np.arange(W)

    # Sky: per column, the colour of the photographed sky at the top edge of the photo (if that edge is sky),
    # smoothed sideways; above it the same hue, slowly darkening toward the zenith (brightest near the horizon).
    top_known = np.where(known.any(axis=0), known.argmax(axis=0), H)
    lum = sphere.mean(axis=2)
    edge_c = np.zeros((W, 3), np.float32)
    edge_ok = np.zeros(W, bool)
    for x in col_ids:
        t = top_known[x]
        if t >= H:
            continue
        band = sphere[t + 2 : t + 26, x]
        bl = band.mean(axis=1)
        # Sky-like: bright, smooth (low variation down the band).
        if bl.mean() > 110 and bl.std() < 8:
            edge_c[x] = band.mean(axis=0)
            edge_ok[x] = True
    print(f"columns with sky at the top edge: {edge_ok.mean():.0%}")
    sky_mean = edge_c[edge_ok].mean(axis=0)
    # Fill columns without sky at the edge (butte tops) by interpolation round the circle, then smooth.
    idx = np.where(edge_ok)[0]
    for k in range(3):
        edge_c[:, k] = np.interp(col_ids, np.concatenate([idx - W, idx, idx + W]), np.tile(edge_c[idx, k], 3))
    edge_c = ndimage.gaussian_filter1d(edge_c, 120, axis=0, mode="wrap")
    edge_e = elev[np.clip(top_known, 0, H - 1)]
    sky_img = np.zeros((H, W, 3), np.float32)
    for y in range(H):
        e = elev[y]
        up = np.clip((e - edge_e) / 40.0, 0, 1)  # 0 at the photo edge, 1 forty degrees above it
        zen = np.clip((e - 20) / 70.0, 0, 1) ** 0.9
        c = edge_c * (1 - up[:, None]) + sky_mean * up[:, None]
        sky_img[y] = c * (1 - 0.22 * zen) + np.array([-4, -2, 2]) * zen  # a touch cooler/darker overhead

    # Ground: smooth fill of photographed ground colours. Excluded: sky, bright/grey rover hardware, gap fringe.
    sat = sphere.max(axis=2) - sphere.min(axis=2)
    hardware = (lum > 175) | ((sat < 28) & (lum > 60)) | (sphere[..., 2] > sphere[..., 0])
    hardware = ndimage.binary_dilation(hardware, iterations=6)
    ground_known = known & (elev[:, None] < -3) & ~hardware
    ground_known &= ndimage.binary_erosion(known, iterations=6)
    ground = push_pull(sphere, ground_known)
    ground = ndimage.gaussian_filter(ground, (6, 6, 0), mode="wrap")
    # Toward the nadir, ease to the average ground colour (no streaks at the pole).
    nadir_c = sphere[ground_known & (elev[:, None] < -20)].mean(axis=0)
    kn = np.clip((-elev - 66) / 20, 0, 1)[:, None, None]
    ground = ground * (1 - kn) + nadir_c * kn
    # Fine grain so the filled ground isn't plastic-smooth.
    rng = np.random.default_rng(7)
    grain = ndimage.gaussian_filter(rng.normal(0, 1, (H, W)), 1.1)
    grain = grain / grain.std() * 6.0
    ground += grain[..., None] * (ground.mean(axis=2, keepdims=True) / 140)

    rows = np.arange(H)[:, None]
    above = rows < top_known[None, :]
    # Sky fill also under the feather band just inside a sky edge, so the photo fades into sky, not ground.
    near_top = (rows < top_known[None, :] + 40) & (elev[:, None] > -1)
    fill = np.where((above | near_top)[..., None], sky_img, ground)

    # Feather the photo into the fill over ~10 px (distance inside the photo), so frame edges don't show.
    dist = ndimage.distance_transform_edt(known)
    a = np.clip(dist / 12.0, 0, 1)[..., None]
    out = sphere * a + fill * (1 - a)
    out = np.clip(out, 0, 255).astype(np.uint8)
    img = Image.fromarray(out)
    img = img.filter(ImageFilter.UnsharpMask(radius=1.2, percent=30, threshold=2))
    img.save(args.out, quality=args.quality, optimize=True, progressive=True, subsampling="4:2:0")
    print(f"wrote {args.out} {W}x{H}")


if __name__ == "__main__":
    main()
