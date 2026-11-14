// 360° stop view (Tier 2, demo-focus-plan §10). Owner: Marwan.
// NASA Mastcam 360 mosaics are full circles horizontally (360° across the image width, the same angle per pixel
// vertically) but only 70–95° tall, with black areas where no frame was taken (sky, rover deck). The photo is
// placed at its true angles on a full sphere, Street View style, and the parts the camera never imaged are filled
// with a blurred extension of the nearest photo colours, so no black holes show. The fill is not imagery: the
// HUD says so, and `showGaps` shows the gaps instead.
import * as THREE from 'three'

export interface PanoViewer {
  /** Look direction in degrees along the image (0 = image centre). */
  readonly yawDeg: number
  /** The three.js scene, for fixed overlays (route drawn on the ground). */
  readonly scene: THREE.Scene
  /** Called every frame with the time in seconds (for animated overlays). */
  onFrame(cb: (tS: number) => void): void
  /** Turn the view to a yaw (degrees, same sign as yawDeg). Smooth unless `instant`. */
  setYaw(deg: number, instant?: boolean): void
  /** Slow cinematic turn to a yaw/pitch (degrees) over `durS` seconds (guided tour). */
  panTo(yawDeg: number, pitchDeg: number, durS: number): void
  /** Show the areas the camera never imaged as dark (true) or filled (false, default). */
  showGaps(on: boolean): void
  destroy(): void
}

const FOV_MIN = 30
const FOV_MAX = 90
const PITCH_MAX = THREE.MathUtils.degToRad(85)

/** Pixels the mosaic never imaged: pure black (JPEG noise allowed). */
const isGap = (r: number, g: number, b: number) => r < 14 && g < 14 && b < 14

/**
 * Build the full-sphere (equirectangular, 2:1) texture: the photo at its true angles, the gaps filled.
 * Fill = push-pull (pyramid) interpolation of the photo colours at low resolution, scaled up = a soft blur.
 */
function buildSphereTextures(img: HTMLImageElement, horizonDeg: number, maxW: number) {
  const W = Math.min(img.width, maxW, 8192)
  const H = W / 2
  const s = W / img.width
  const degPerPx = 360 / img.width
  // Image centre row sits horizonDeg below the horizon (the mosaic's horizon is above its centre).
  const topElev = (img.height / 2) * degPerPx - horizonDeg
  const y0 = ((90 - topElev) / 180) * H
  const h = img.height * s

  // 1. Photo with gaps made transparent (so the fill shows through). The gap mask is grown by 2 px so the dark
  //    JPEG fringe along frame edges does not show as a dashed line.
  const photo = document.createElement('canvas')
  photo.width = W
  photo.height = Math.round(h)
  const pc = photo.getContext('2d', { willReadFrequently: true })!
  pc.drawImage(img, 0, 0, W, photo.height)
  const pd = pc.getImageData(0, 0, W, photo.height)
  const a = pd.data
  const PW = W
  const PH = photo.height
  let m = new Uint8Array(PW * PH)
  for (let i = 0; i < PW * PH; i++) m[i] = isGap(a[i * 4], a[i * 4 + 1], a[i * 4 + 2]) ? 1 : 0
  for (let pass = 0; pass < 2; pass++) {
    const n = new Uint8Array(m)
    for (let y = 0; y < PH; y++)
      for (let x = 0; x < PW; x++) {
        const i = y * PW + x
        if (m[i]) continue
        if ((x > 0 && m[i - 1]) || (x < PW - 1 && m[i + 1]) || (y > 0 && m[i - PW]) || (y < PH - 1 && m[i + PW])) n[i] = 1
      }
    m = n
  }
  for (let i = 0; i < PW * PH; i++) if (m[i]) a[i * 4 + 3] = 0
  pc.putImageData(pd, 0, 0)

  // 2. Low-res fill. Above the photo each column continues its top colour (sky), below it its bottom colour
  //    (ground), blended sideways more the farther from the photo; holes inside a column are interpolated.
  const fw = 512
  const fh = 256
  const small = document.createElement('canvas')
  small.width = fw
  small.height = fh
  const sc = small.getContext('2d', { willReadFrequently: true })!
  sc.drawImage(photo, 0, (y0 / H) * fh, fw, (h / H) * fh)
  const sd = sc.getImageData(0, 0, fw, fh).data
  const col = new Float32Array(fw * fh * 3)
  const known = new Uint8Array(fw * fh)
  const dist = new Float32Array(fw * fh) // rows away from the photo edge (for the sideways blend)
  for (let i = 0; i < fw * fh; i++)
    if (sd[i * 4 + 3] > 200) {
      known[i] = 1
      for (let k = 0; k < 3; k++) col[i * 3 + k] = sd[i * 4 + k]
    }
  const top = new Int32Array(fw).fill(-1)
  const bot = new Int32Array(fw).fill(-1)
  for (let x = 0; x < fw; x++) {
    for (let y = 0; y < fh; y++) if (known[y * fw + x]) { top[x] = y; break }
    for (let y = fh - 1; y >= 0; y--) if (known[y * fw + x]) { bot[x] = y; break }
  }
  // Columns with no photo at all borrow the nearest column's edges.
  for (let x = 0; x < fw; x++)
    if (top[x] < 0)
      for (let d = 1; d < fw; d++) {
        const xs = [(x + d) % fw, (x - d + fw) % fw].find((q) => top[q] >= 0)
        if (xs !== undefined) { top[x] = -2 - xs; break }
      }
  const edge = (x: number, y: number) => {
    let xs = x
    if (top[x] < -1) xs = -2 - top[x]
    const avg = (y0r: number, dir: number) => {
      const acc = [0, 0, 0]
      let n = 0
      for (let k = 0; k < 4; k++) {
        const yy = y0r + dir * k
        if (yy < 0 || yy >= fh || !known[yy * fw + xs]) continue
        for (let c = 0; c < 3; c++) acc[c] += col[(yy * fw + xs) * 3 + c]
        n++
      }
      return acc.map((v) => v / Math.max(1, n))
    }
    return y < top[xs] ? { c: avg(top[xs], 1), d: top[xs] - y } : { c: avg(bot[xs], -1), d: y - bot[xs] }
  }
  for (let y = 0; y < fh; y++)
    for (let x = 0; x < fw; x++) {
      const i = y * fw + x
      if (known[i]) continue
      const xs = top[x] < -1 ? -2 - top[x] : x
      if (y > top[xs] && y < bot[xs]) continue // inside the column: interpolated below
      const e = edge(x, y)
      for (let k = 0; k < 3; k++) col[i * 3 + k] = e.c[k]
      dist[i] = e.d
      known[i] = 2
    }
  // Holes inside a column: linear between the nearest known pixels above and below.
  for (let x = 0; x < fw; x++)
    for (let y = 0; y < fh; y++) {
      if (known[y * fw + x]) continue
      let ya = y - 1
      while (ya >= 0 && !known[ya * fw + x]) ya--
      let yb = y + 1
      while (yb < fh && !known[yb * fw + x]) yb++
      const t = (y - ya) / (yb - ya)
      for (let k = 0; k < 3; k++)
        col[(y * fw + x) * 3 + k] = col[(ya * fw + x) * 3 + k] * (1 - t) + col[(yb * fw + x) * 3 + k] * t
      dist[y * fw + x] = Math.min(y - ya, yb - y)
    }
  // Sideways blend (wraps round): radius grows with distance from the photo, so far fill is smooth.
  const out = sc.createImageData(fw, fh)
  const pre = new Float32Array((fw * 3 + 1) * 3)
  for (let y = 0; y < fh; y++) {
    for (let k = 0; k < 3; k++) pre[k] = 0
    for (let j = 0; j < fw * 3; j++) {
      const i = y * fw + (j % fw)
      for (let k = 0; k < 3; k++) pre[(j + 1) * 3 + k] = pre[j * 3 + k] + col[i * 3 + k]
    }
    for (let x = 0; x < fw; x++) {
      const i = y * fw + x
      const isPhoto = known[i] === 1
      const r = isPhoto ? 0 : Math.min(fw / 2 - 1, Math.round(6 + dist[i] * 4))
      const lo = x - r + fw
      const hi = x + r + fw
      for (let k = 0; k < 3; k++) {
        const v = r === 0 ? col[i * 3 + k] : (pre[(hi + 1) * 3 + k] - pre[lo * 3 + k]) / (2 * r + 1)
        out.data[i * 4 + k] = Math.round(isPhoto ? v : v * 0.9) // filled areas a little darker
      }
      out.data[i * 4 + 3] = 255
    }
  }
  sc.putImageData(out, 0, 0)

  const compose = (fill: boolean) => {
    const cv = document.createElement('canvas')
    cv.width = W
    cv.height = H
    const c = cv.getContext('2d')!
    if (fill) {
      c.imageSmoothingQuality = 'high'
      c.filter = `blur(${Math.round(W / 400)}px)`
      c.drawImage(small, 0, 0, W, H)
      c.filter = 'none'
    } else {
      c.fillStyle = '#0a0706'
      c.fillRect(0, 0, W, H)
    }
    c.drawImage(photo, 0, y0)
    return cv
  }
  return { filled: compose(true), gaps: compose(false), topElev, bottomElev: topElev - img.height * degPerPx }
}

export function createPanoViewer(
  container: HTMLElement,
  imageUrl: string,
  opts: {
    horizonDeg?: number
    /** 'sphere' = the image is already a full 2:1 equirectangular photo (no gap filling). */
    projection?: 'mosaic' | 'sphere'
    onReady?: () => void
    onError?: (e: unknown) => void
    onView?: (yawDeg: number, fovDeg: number) => void
  } = {},
): PanoViewer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  container.appendChild(renderer.domElement)
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.touchAction = 'none'

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#120c0a')
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100)

  // View state: current values ease toward targets (smooth turning and zooming, like Street View).
  let yaw = 0
  let pitch = 0
  let tYaw = 0
  let tPitch = 0
  let fov = 70
  let tFov = 70
  let vYaw = 0 // inertia after a drag, rad per frame
  let vPitch = 0
  let mesh: THREE.Mesh | null = null
  let textures: { filled: THREE.Texture; gaps: THREE.Texture } | null = null
  let disposed = false

  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    if (disposed) return
    try {
      const maxW = renderer.capabilities.maxTextureSize
      const built =
        opts.projection === 'sphere'
          ? (() => {
              // Already full-sphere: only scale down if the GPU can't hold it (some phones max out at 4096).
              const cv = document.createElement('canvas')
              cv.width = Math.min(img.width, maxW)
              cv.height = cv.width / 2
              const c = cv.getContext('2d')!
              c.imageSmoothingQuality = 'high'
              c.drawImage(img, 0, 0, cv.width, cv.height)
              return { filled: cv, gaps: cv }
            })()
          : buildSphereTextures(img, opts.horizonDeg ?? 0, maxW)
      const mk = (cv: HTMLCanvasElement) => {
        const t = new THREE.CanvasTexture(cv)
        t.colorSpace = THREE.SRGBColorSpace
        t.wrapS = THREE.RepeatWrapping
        t.offset.x = -0.25 // image centre (u = 0.5) faces -Z, the camera's yaw 0
        t.anisotropy = renderer.capabilities.getMaxAnisotropy()
        return t
      }
      const filled = mk(built.filled)
      textures = { filled, gaps: built.gaps === built.filled ? filled : mk(built.gaps) }
      const geo = new THREE.SphereGeometry(10, 128, 96)
      geo.scale(-1, 1, 1) // seen from inside, not mirrored
      mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: textures.filled }))
      scene.add(mesh)
      opts.onReady?.()
    } catch (e) {
      opts.onError?.(e)
    }
  }
  img.onerror = (e) => opts.onError?.(e)
  img.src = imageUrl

  function resize() {
    const w = container.clientWidth || 1
    const hgt = container.clientHeight || 1
    renderer.setSize(w, hgt, false)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    camera.aspect = w / hgt
    camera.updateProjectionMatrix()
  }
  const ro = new ResizeObserver(resize)
  ro.observe(container)
  resize()

  // Pointer: one finger/mouse drags the photo (grab), two fingers pinch-zoom. Wheel zooms. Double-click zooms in
  // toward the clicked point. Arrow keys turn/tilt, + and - zoom.
  const el = renderer.domElement
  const pts = new Map<number, { x: number; y: number }>()
  let pinch0: { d: number; fov: number } | null = null
  let lastMove = 0
  const radPerPx = () => THREE.MathUtils.degToRad(fov) / (container.clientHeight || 1)
  const pinchDist = () => {
    const [a, b] = [...pts.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }
  const onDown = (e: PointerEvent) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
    el.setPointerCapture(e.pointerId)
    vYaw = vPitch = 0
    tYaw = yaw
    tPitch = pitch
    if (pts.size === 2) pinch0 = { d: pinchDist(), fov: tFov }
  }
  const onMove = (e: PointerEvent) => {
    const p = pts.get(e.pointerId)
    if (!p) return
    if (pts.size === 2 && pinch0) {
      p.x = e.clientX
      p.y = e.clientY
      tFov = THREE.MathUtils.clamp((pinch0.fov * pinch0.d) / Math.max(1, pinchDist()), FOV_MIN, FOV_MAX)
      return
    }
    const k = radPerPx()
    const dy = (e.clientX - p.x) * k
    const dp = (e.clientY - p.y) * k
    yaw = tYaw = yaw + dy
    pitch = tPitch = THREE.MathUtils.clamp(pitch + dp, -PITCH_MAX, PITCH_MAX)
    const now = performance.now()
    const dt = Math.max(1, now - lastMove) / 16.7
    lastMove = now
    vYaw = dy / dt
    vPitch = dp / dt
    p.x = e.clientX
    p.y = e.clientY
  }
  const onUp = (e: PointerEvent) => {
    pts.delete(e.pointerId)
    if (pts.size < 2) pinch0 = null
    if (performance.now() - lastMove > 80) vYaw = vPitch = 0 // released without flicking
  }
  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    tFov = THREE.MathUtils.clamp(tFov * Math.exp(e.deltaY * 0.0012), FOV_MIN, FOV_MAX)
  }
  const onDbl = (e: MouseEvent) => {
    // Turn toward the clicked point and zoom in (or back out when already zoomed).
    const r = el.getBoundingClientRect()
    const k = radPerPx()
    tYaw = yaw - (e.clientX - r.left - r.width / 2) * k
    tPitch = THREE.MathUtils.clamp(pitch - (e.clientY - r.top - r.height / 2) * k, -PITCH_MAX, PITCH_MAX)
    tFov = tFov > 45 ? Math.max(FOV_MIN, tFov / 1.8) : 70
  }
  const onKey = (e: KeyboardEvent) => {
    const step = THREE.MathUtils.degToRad(fov / 6)
    if (e.key === 'ArrowLeft') tYaw += step
    else if (e.key === 'ArrowRight') tYaw -= step
    else if (e.key === 'ArrowUp') tPitch = Math.min(PITCH_MAX, tPitch + step)
    else if (e.key === 'ArrowDown') tPitch = Math.max(-PITCH_MAX, tPitch - step)
    else if (e.key === '+' || e.key === '=') tFov = Math.max(FOV_MIN, tFov / 1.25)
    else if (e.key === '-' || e.key === '_') tFov = Math.min(FOV_MAX, tFov * 1.25)
    else return
    vYaw = vPitch = 0
  }
  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointercancel', onUp)
  el.addEventListener('wheel', onWheel, { passive: false })
  el.addEventListener('dblclick', onDbl)
  window.addEventListener('keydown', onKey)

  let lastYaw = Infinity // so the first frame reports the view (NaN would never compare)
  let lastFov = Infinity
  const frameCbs: ((tS: number) => void)[] = []
  let pan: { y0: number; y1: number; p0: number; p1: number; t0: number; d: number } | null = null
  renderer.setAnimationLoop(() => {
    if (pan) {
      if (pts.size > 0) pan = null // the user took over
      else {
        const k = Math.min(1, (performance.now() - pan.t0) / pan.d)
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2 // ease in-out
        tYaw = yaw = pan.y0 + (pan.y1 - pan.y0) * e
        tPitch = pitch = pan.p0 + (pan.p1 - pan.p0) * e
        if (k >= 1) pan = null
      }
    }
    if (pts.size === 0 && (Math.abs(vYaw) > 1e-5 || Math.abs(vPitch) > 1e-5)) {
      tYaw += vYaw
      tPitch = THREE.MathUtils.clamp(tPitch + vPitch, -PITCH_MAX, PITCH_MAX)
      vYaw *= 0.92
      vPitch *= 0.92
    }
    yaw += (tYaw - yaw) * 0.18
    pitch += (tPitch - pitch) * 0.18
    fov += (tFov - fov) * 0.18
    if (Math.abs(fov - camera.fov) > 1e-4) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    if (Math.abs(yaw - lastYaw) > 1e-5 || Math.abs(camera.fov - lastFov) > 1e-4) {
      lastYaw = yaw
      lastFov = camera.fov
      opts.onView?.(THREE.MathUtils.radToDeg(yaw), camera.fov)
    }
    camera.rotation.set(pitch, yaw, 0, 'YXZ')
    for (const cb of frameCbs) cb(performance.now() / 1000)
    renderer.render(scene, camera)
  })

  return {
    scene,
    setYaw(deg, instant) {
      tYaw = THREE.MathUtils.degToRad(deg)
      // Take the short way round from the current yaw.
      tYaw = yaw + (((tYaw - yaw + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI
      vYaw = vPitch = 0
      if (instant) yaw = tYaw
    },
    panTo(yawDeg, pitchDeg, durS) {
      let y1 = THREE.MathUtils.degToRad(yawDeg)
      y1 = yaw + ((((y1 - yaw + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI
      vYaw = vPitch = 0
      pan = { y0: yaw, y1, p0: pitch, p1: THREE.MathUtils.degToRad(pitchDeg), t0: performance.now(), d: durS * 1000 }
    },
    showGaps(on) {
      if (!mesh || !textures) return
      ;(mesh.material as THREE.MeshBasicMaterial).map = on ? textures.gaps : textures.filled
      ;(mesh.material as THREE.MeshBasicMaterial).needsUpdate = true
    },
    onFrame(cb) {
      frameCbs.push(cb)
    },
    get yawDeg() {
      return THREE.MathUtils.radToDeg(yaw)
    },
    destroy() {
      disposed = true
      img.onload = null
      renderer.setAnimationLoop(null)
      ro.disconnect()
      window.removeEventListener('keydown', onKey)
      if (mesh) {
        mesh.geometry.dispose()
        ;(mesh.material as THREE.Material).dispose()
      }
      textures?.filled.dispose()
      if (textures && textures.gaps !== textures.filled) textures.gaps.dispose()
      renderer.dispose()
      el.remove()
    },
  }
}
