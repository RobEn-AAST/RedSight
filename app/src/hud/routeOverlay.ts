// Fixed route drawn into the 360 stop view (Tier 2 prototype). Owner: Marwan.
// No tracking: the route's own coordinates (lon/lat) are turned into directions as seen from the camera at the
// stop (bearing + distance on assumed flat ground, camera at Mastcam height) and drawn once. Only the arrows move,
// to show the direction of travel. Hills are not modeled, so the line can show "through" a ridge: approximate.
import * as THREE from 'three'

type LonLat = [number, number]
const MARS_R = 3_389_500 // m, mean radius
const EYE_H = 1.97 // m, Mastcam height above ground (the photo's viewpoint)
const SHELL = 9 // draw just inside the photo cylinder (radius 10), always on top of it
const NEAR_M = 8 // skip the first metres (they'd be under the camera)

export interface RoutePath {
  coords: LonLat[]
  color: string
  opacity: number
  widthM: number
  arrows: boolean
}

export interface RouteOverlay {
  setNorthOffset(deg: number): void
  dispose(): void
}

/** Local east/north metres of p relative to origin o (small-area approximation). */
function enu(o: LonLat, p: LonLat): [number, number] {
  const r = Math.PI / 180
  return [(p[0] - o[0]) * r * MARS_R * Math.cos(o[1] * r), (p[1] - o[1]) * r * MARS_R]
}

/** Resample a polyline (metres) every `step` m, returning points with their distance along. */
function resample(pts: [number, number][], step: number) {
  const out: { p: [number, number]; s: number }[] = []
  let s = 0
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]]
    const L = Math.hypot(b[0] - a[0], b[1] - a[1])
    for (let u = 0; u < L; u += step) {
      const k = u / L
      out.push({ p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], s: s + u })
    }
    s += L
  }
  if (pts.length) out.push({ p: pts[pts.length - 1], s })
  return out
}

export function createRouteOverlay(
  scene: THREE.Scene,
  onFrame: (cb: (tS: number) => void) => void,
  opts: { stop: LonLat; habitat: LonLat; paths: RoutePath[]; northOffsetDeg: number },
): RouteOverlay {
  const group = new THREE.Group()
  group.renderOrder = 10
  scene.add(group)
  let offset = (opts.northOffsetDeg * Math.PI) / 180
  let disposed = false

  /** Ground point (east, north metres from the stop) → position on the drawing shell. */
  const toView = (e: number, n: number) => {
    const f = e * Math.sin(offset) + n * Math.cos(offset) // forward (yaw 0)
    const rt = e * Math.cos(offset) - n * Math.sin(offset) // right
    return new THREE.Vector3(rt, -EYE_H, -f).normalize().multiplyScalar(SHELL)
  }
  const mat = (color: string, opacity: number) =>
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide })

  const lines = opts.paths.map((path) => ({
    path,
    pts: resample(path.coords.map((c) => enu(opts.stop, c)), 2).filter((q) => Math.hypot(...q.p) >= NEAR_M),
  }))

  // Ribbons: a flat strip `widthM` wide on the ground, projected into the view (narrows with distance).
  const ribbons: THREE.Mesh[] = []
  const arrowSets: { mesh: THREE.Mesh; pts: { p: [number, number]; s: number }[] }[] = []
  function buildRibbons() {
    for (const m of ribbons) {
      group.remove(m)
      m.geometry.dispose()
    }
    ribbons.length = 0
    for (const { path, pts } of lines) {
      if (pts.length < 2) continue
      const pos: number[] = []
      for (let i = 0; i < pts.length - 1; i++) {
        const [a, b] = [pts[i].p, pts[i + 1].p]
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
        const nx = (-(b[1] - a[1]) / L) * (path.widthM / 2)
        const ny = ((b[0] - a[0]) / L) * (path.widthM / 2)
        const q = [toView(a[0] + nx, a[1] + ny), toView(a[0] - nx, a[1] - ny), toView(b[0] + nx, b[1] + ny), toView(b[0] - nx, b[1] - ny)]
        for (const v of [q[0], q[1], q[2], q[2], q[1], q[3]]) pos.push(v.x, v.y, v.z)
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      const m = new THREE.Mesh(g, mat(path.color, path.opacity))
      m.renderOrder = 10
      group.add(m)
      ribbons.push(m)
    }
  }
  buildRibbons()

  // Moving chevrons along each path that has arrows (direction of travel). Size grows with distance so far
  // arrows stay visible; spacing too.
  const N = 90
  for (const { path, pts } of lines) {
    if (!path.arrows || pts.length < 2) continue
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 6 * 3), 3))
    const m = new THREE.Mesh(g, mat('#fff3b0', 0.95))
    m.renderOrder = 11
    m.frustumCulled = false
    group.add(m)
    arrowSets.push({ mesh: m, pts })
  }
  const at = (pts: { p: [number, number]; s: number }[], s: number) => {
    let lo = 0
    let hi = pts.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (pts[mid].s <= s) lo = mid
      else hi = mid
    }
    const [a, b] = [pts[lo], pts[hi]]
    const k = b.s === a.s ? 0 : (s - a.s) / (b.s - a.s)
    const p: [number, number] = [a.p[0] + (b.p[0] - a.p[0]) * k, a.p[1] + (b.p[1] - a.p[1]) * k]
    const L = Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1]) || 1
    return { p, d: [(b.p[0] - a.p[0]) / L, (b.p[1] - a.p[1]) / L] as [number, number] }
  }
  onFrame((tS) => {
    if (disposed) return
    for (const { mesh, pts } of arrowSets) {
      const arr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
      const s0 = pts[0].s
      const end = pts[pts.length - 1].s
      let s = s0 + ((tS * 3) % 6) // 3 m/s, first gap 6 m
      let i = 0
      for (; i < N && s < end; i++) {
        const dist = Math.hypot(...at(pts, s).p)
        const size = Math.max(0.7, dist * 0.025)
        const { p, d } = at(pts, s)
        const nx = -d[1] * size
        const ny = d[0] * size
        const tip = toView(p[0] + d[0] * size, p[1] + d[1] * size)
        const l = toView(p[0] - d[0] * size * 0.6 + nx, p[1] - d[1] * size * 0.6 + ny)
        const r = toView(p[0] - d[0] * size * 0.6 - nx, p[1] - d[1] * size * 0.6 - ny)
        const c = toView(p[0] - d[0] * size * 0.1, p[1] - d[1] * size * 0.1)
        const v = [tip, l, c, tip, c, r]
        v.forEach((q, j) => arr.setXYZ(i * 6 + j, q.x, q.y, q.z))
        s += Math.max(6, dist * 0.12)
      }
      for (; i < N; i++) for (let j = 0; j < 6; j++) arr.setXYZ(i * 6 + j, 0, 0, 0)
      arr.needsUpdate = true
    }
  })

  // Habitat pin: a post from the ground up, plus a label.
  const [he, hn] = enu(opts.stop, opts.habitat)
  const habDist = Math.hypot(he, hn)
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.font = '600 26px ui-monospace, Menlo, monospace'
  ctx.fillStyle = 'rgba(4,20,28,0.7)'
  ctx.fillRect(0, 0, 256, 64)
  ctx.strokeStyle = '#ffb224'
  ctx.lineWidth = 3
  ctx.strokeRect(1.5, 1.5, 253, 61)
  ctx.fillStyle = '#ffd27a'
  ctx.textAlign = 'center'
  ctx.fillText(`HABITAT ${(habDist / 1000).toFixed(2)} km`, 128, 42)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false }))
  sprite.renderOrder = 12
  sprite.scale.set(1.2, 0.3, 1)
  group.add(sprite)
  const postMat = new THREE.LineBasicMaterial({ color: '#ffb224', depthTest: false, transparent: true, opacity: 0.9 })
  const post = new THREE.Line(new THREE.BufferGeometry(), postMat)
  post.renderOrder = 12
  group.add(post)
  function placePin() {
    const g = toView(he, hn)
    const top = g.clone().setY(g.y + 1.1)
    post.geometry.setFromPoints([g, top])
    sprite.position.copy(top).setY(top.y + 0.2)
  }
  placePin()

  return {
    setNorthOffset(deg) {
      offset = (deg * Math.PI) / 180
      buildRibbons()
      placePin()
    },
    dispose() {
      disposed = true
      scene.remove(group)
      group.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        const mt = m.material as THREE.Material | undefined
        mt?.dispose()
      })
      tex.dispose()
    },
  }
}
