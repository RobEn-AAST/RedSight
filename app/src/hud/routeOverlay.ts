// AR route guide drawn into the 360 stop view (helmet AR simulation). Owner: Marwan.
// No tracking: the route's own coordinates are turned into directions as seen from the camera at the stop and
// drawn once; only the flowing chevrons animate. With a terrain grid (app/public/hud/terrain-<stop>.json, Derived
// from the Trek 2.5 m DEM) the route sits on the real ground height and the parts hidden behind a ridge are shown
// dashed and dim, the way AR navigation shows "behind the hill". Without it the ground is assumed flat.
import * as THREE from 'three'

type LonLat = [number, number]
const MARS_R = 3_389_500 // m, mean radius (same as build-hud-terrain.py)
const EYE_H = 1.97 // m, Mastcam height above ground (the photo's viewpoint)
const SHELL = 9 // draw just inside the photo sphere (radius 10), always on top of it
const NEAR_M = 6 // skip the first metres (they'd be under the camera)
const STEP_M = 2 // path resampling step

export interface RoutePath {
  coords: LonLat[]
  color: string
  opacity: number
  widthM: number
  arrows: boolean
}

export interface Terrain {
  origin: LonLat
  cellM: number
  n: number
  /** Heights relative to the stop's ground, metres, row 0 = north; NaN = no data. */
  h: Float32Array
}

export interface RouteOverlay {
  setNorthOffset(deg: number): void
  dispose(): void
}

/** Parse app/public/hud/terrain-<stop>.json. */
export function parseTerrain(doc: { origin: LonLat; cell_m: number; n: number; heights_dm: string; nodata: number }): Terrain {
  const bin = atob(doc.heights_dm)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const dm = new Int16Array(bytes.buffer)
  const h = new Float32Array(dm.length)
  for (let i = 0; i < dm.length; i++) h[i] = dm[i] === doc.nodata ? NaN : dm[i] / 10
  return { origin: doc.origin, cellM: doc.cell_m, n: doc.n, h }
}

/** Local east/north metres of p relative to origin o (small-area approximation). */
function enu(o: LonLat, p: LonLat): [number, number] {
  const r = Math.PI / 180
  return [(p[0] - o[0]) * r * MARS_R * Math.cos(o[1] * r), (p[1] - o[1]) * r * MARS_R]
}

/** Ground height (m, relative to the stop) at local east/north, bilinear; 0 without terrain. */
function heightAt(t: Terrain | null, shift: [number, number], e: number, n: number): number {
  if (!t) return 0
  const half = ((t.n - 1) * t.cellM) / 2
  const x = (e + shift[0] + half) / t.cellM
  const y = (half - (n + shift[1])) / t.cellM
  if (x < 0 || y < 0 || x > t.n - 1 || y > t.n - 1) return 0
  const x0 = Math.min(t.n - 2, Math.floor(x))
  const y0 = Math.min(t.n - 2, Math.floor(y))
  const fx = x - x0
  const fy = y - y0
  const v = (r: number, c: number) => t.h[r * t.n + c]
  const z = v(y0, x0) * (1 - fx) * (1 - fy) + v(y0, x0 + 1) * fx * (1 - fy) + v(y0 + 1, x0) * (1 - fx) * fy + v(y0 + 1, x0 + 1) * fx * fy
  return Number.isFinite(z) ? z : 0
}

interface PathPt {
  e: number
  n: number
  h: number
  s: number // metres along
  d: number // horizontal distance from the camera
  vis: number // 1 = in line of sight, 0 = behind terrain
}

/** Resample every STEP_M, smooth corners (grid staircase → natural line), add height and line of sight. */
function preparePath(coords: LonLat[], stop: LonLat, terrain: Terrain | null, shift: [number, number]): PathPt[] {
  const raw = coords.map((c) => enu(stop, c))
  const res: [number, number][] = []
  for (let i = 1; i < raw.length; i++) {
    const [a, b] = [raw[i - 1], raw[i]]
    const L = Math.hypot(b[0] - a[0], b[1] - a[1])
    for (let u = 0; u < L; u += STEP_M) res.push([a[0] + ((b[0] - a[0]) * u) / L, a[1] + ((b[1] - a[1]) * u) / L])
  }
  if (raw.length) res.push(raw[raw.length - 1])
  // Moving average ±5 points (±10 m), endpoints kept.
  const W = 5
  const sm = res.map((p, i) => {
    if (i < W || i >= res.length - W) return p
    let e = 0
    let n = 0
    for (let k = -W; k <= W; k++) {
      e += res[i + k][0]
      n += res[i + k][1]
    }
    return [e / (2 * W + 1), n / (2 * W + 1)] as [number, number]
  })
  const out: PathPt[] = []
  let s = 0
  for (let i = 0; i < sm.length; i++) {
    if (i) s += Math.hypot(sm[i][0] - sm[i - 1][0], sm[i][1] - sm[i - 1][1])
    const [e, n] = sm[i]
    const d = Math.hypot(e, n)
    if (d < NEAR_M) continue
    const h = heightAt(terrain, shift, e, n)
    out.push({ e, n, h, s, d, vis: 1 })
  }
  if (terrain) {
    // Line of sight from the eye to each point: hidden if the ground rises above the ray anywhere between.
    const step = terrain.cellM / 2
    for (const p of out) {
      const target = p.h + 0.4
      for (let u = step; u < p.d - step; u += step) {
        const k = u / p.d
        const ray = EYE_H + (target - EYE_H) * k
        if (heightAt(terrain, shift, p.e * k, p.n * k) > ray + 0.3) {
          p.vis = 0
          break
        }
      }
    }
  }
  return out
}

const VERT = /* glsl */ `
attribute float aAlong; attribute float aSide; attribute float aVis; attribute float aDist;
varying float vAlong; varying float vSide; varying float vVis; varying float vDist;
void main() {
  vAlong = aAlong; vSide = aSide; vVis = aVis; vDist = aDist;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
const FRAG = /* glsl */ `
uniform float uTime; uniform vec3 uColor; uniform float uArrows; uniform float uOpacity;
varying float vAlong; varying float vSide; varying float vVis; varying float vDist;
void main() {
  float a = abs(vSide);
  float edge = 1.0 - smoothstep(0.6, 1.0, a);
  float core = 1.0 - smoothstep(0.0, 0.3, a);
  float alpha = uOpacity * (0.45 * edge + 0.4 * core);
  // Flowing chevrons pointing along the direction of travel; spacing grows with distance.
  float sp = max(5.0, vDist * 0.05);
  float ph = fract((vAlong - uTime * 4.0) / sp);
  float d = ph + a * 0.32;
  float chev = smoothstep(0.30, 0.36, d) * (1.0 - smoothstep(0.44, 0.50, d)) * edge * uArrows;
  vec3 col = mix(uColor, vec3(1.0, 0.98, 0.88), clamp(chev * 0.95 + core * 0.2, 0.0, 1.0));
  alpha = max(alpha, chev * uOpacity * 1.2);
  // Dark rim for contrast against red-orange ground.
  float rim = smoothstep(0.72, 0.84, a) * (1.0 - smoothstep(0.93, 1.0, a));
  col = mix(col, vec3(0.12, 0.07, 0.0), rim * 0.7);
  alpha = max(alpha, rim * 0.55 * uOpacity);
  // Behind terrain: dim dashes, no chevrons.
  if (vVis < 0.5) {
    float dash = step(0.45, fract(vAlong / max(6.0, vDist * 0.03)));
    alpha = uOpacity * 0.32 * edge * dash;
    col = uColor;
  }
  alpha *= smoothstep(6.0, 14.0, vDist) * (1.0 - smoothstep(1400.0, 2200.0, vDist));
  gl_FragColor = vec4(col, alpha);
}`

/** Label sprite: crisp text on a dark plate (constant size on screen, since it lives on the drawing shell). */
function labelSprite(lines: { text: string; size: number; color: string }[], border: string, scale = 1, width = 512) {
  const c = document.createElement('canvas')
  c.width = width
  c.height = 40 + lines.reduce((s, l) => s + l.size * 1.25, 0)
  const g = c.getContext('2d')!
  g.fillStyle = 'rgba(10,8,4,0.78)'
  g.beginPath()
  g.roundRect(3, 3, c.width - 6, c.height - 6, 14)
  g.fill()
  g.strokeStyle = border
  g.lineWidth = 4
  g.stroke()
  g.textAlign = 'center'
  let y = 20
  for (const l of lines) {
    y += l.size
    g.fillStyle = l.color
    g.font = `700 ${l.size}px ui-monospace, Menlo, monospace`
    g.fillText(l.text, c.width / 2, y)
    y += l.size * 0.25
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true }))
  sp.renderOrder = 14
  sp.scale.set(2.2 * scale * (c.width / 512), (2.2 * scale * c.height) / 512, 1)
  return sp
}

export function createRouteOverlay(
  scene: THREE.Scene,
  onFrame: (cb: (tS: number) => void) => void,
  opts: { stop: LonLat; habitat: LonLat; paths: RoutePath[]; northOffsetDeg: number; terrain?: Terrain | null },
): RouteOverlay {
  const group = new THREE.Group()
  group.renderOrder = 10
  scene.add(group)
  let offset = (opts.northOffsetDeg * Math.PI) / 180
  let disposed = false
  const terrain = opts.terrain ?? null
  // The terrain grid is centred on its own origin (the stop); shift if the HUD's stop point differs.
  const shift: [number, number] = terrain ? enu(terrain.origin, opts.stop) : [0, 0]

  /** Ground point (east, north, height m relative to the stop ground) → position on the drawing shell. */
  const toView = (e: number, n: number, h: number) => {
    const f = e * Math.sin(offset) + n * Math.cos(offset) // forward (yaw 0)
    const rt = e * Math.cos(offset) - n * Math.sin(offset) // right
    return new THREE.Vector3(rt, h - EYE_H, -f).normalize().multiplyScalar(SHELL)
  }

  const lines = opts.paths.map((path) => ({ path, pts: preparePath(path.coords, opts.stop, terrain, shift) }))
  const mats: THREE.ShaderMaterial[] = []
  const meshes: { mesh: THREE.Mesh; build: () => void }[] = []

  for (const { path, pts } of lines) {
    if (pts.length < 2) continue
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(path.color) },
        uArrows: { value: path.arrows ? 1 : 0 },
        uOpacity: { value: path.opacity },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    mats.push(mat)
    const geo = new THREE.BufferGeometry()
    const mesh = new THREE.Mesh(geo, mat)
    mesh.renderOrder = path.arrows ? 12 : 11
    mesh.frustumCulled = false
    group.add(mesh)
    const build = () => {
      const pos: number[] = []
      const along: number[] = []
      const side: number[] = []
      const vis: number[] = []
      const dist: number[] = []
      const idx: number[] = []
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]
        const a = pts[Math.max(0, i - 1)]
        const b = pts[Math.min(pts.length - 1, i + 1)]
        const L = Math.hypot(b.e - a.e, b.n - a.n) || 1
        // Width grows with distance so the far route stays readable (a ground strip would shrink to nothing).
        const hw = Math.max(path.widthM / 2, p.d * 0.016)
        const nx = (-(b.n - a.n) / L) * hw
        const ny = ((b.e - a.e) / L) * hw
        for (const sgn of [1, -1]) {
          const v = toView(p.e + nx * sgn, p.n + ny * sgn, p.h + 0.05)
          pos.push(v.x, v.y, v.z)
          along.push(p.s)
          side.push(sgn)
          vis.push(p.vis)
          dist.push(p.d)
        }
        // Skip joining across a jump (a gap left by NEAR_M near the camera).
        if (i > 0 && p.s - pts[i - 1].s < STEP_M * 4) {
          const k = i * 2
          idx.push(k - 2, k - 1, k, k, k - 1, k + 1)
        }
      }
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      geo.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1))
      geo.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1))
      geo.setAttribute('aVis', new THREE.Float32BufferAttribute(vis, 1))
      geo.setAttribute('aDist', new THREE.Float32BufferAttribute(dist, 1))
      geo.setIndex(idx)
      geo.computeBoundingSphere()
    }
    build()
    meshes.push({ mesh, build })
  }

  // Distance markers along the guided path (the one with arrows): 100 m, 250 m, 500 m, 1 km.
  const markers: { sp: THREE.Sprite; p: PathPt }[] = []
  const guide = lines.find((l) => l.path.arrows)
  if (guide) {
    for (const m of [100, 250, 500, 1000]) {
      const p = guide.pts.find((q) => q.s >= m)
      if (!p || !p.vis) continue
      const sp = labelSprite([{ text: m >= 1000 ? `${m / 1000} km` : `${m} m`, size: 64, color: '#fff3b0' }], guide.path.color, 0.55, 220)
      group.add(sp)
      markers.push({ sp, p })
    }
  }
  const placeMarkers = () => {
    for (const { sp, p } of markers) sp.position.copy(toView(p.e, p.n, p.h + 0.05)).add(new THREE.Vector3(0, 0.3, 0))
  }
  placeMarkers()

  // Home beacon: a light pillar standing on the habitat's ground, a pulsing diamond and a label on top.
  const [he, hn] = enu(opts.stop, opts.habitat)
  const hh = heightAt(terrain, shift, he, hn)
  const habDist = Math.hypot(he, hn)
  const beamMat = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `varying float vY; attribute float aY; void main(){ vY = aY; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `uniform float uTime; varying float vY; void main(){
      float a = (1.0 - vY * 0.85) * (0.7 + 0.25 * sin(uTime * 3.0));
      gl_FragColor = vec4(1.0, 0.72, 0.2, a); }`,
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  mats.push(beamMat)
  const beam = new THREE.Mesh(new THREE.BufferGeometry(), beamMat)
  beam.renderOrder = 13
  beam.frustumCulled = false
  group.add(beam)
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.08),
    new THREE.MeshBasicMaterial({ color: '#ffb224', depthTest: false, depthWrite: false, transparent: true }),
  )
  diamond.renderOrder = 14
  group.add(diamond)
  const label = labelSprite(
    [
      { text: '⌂ HOME', size: 50, color: '#ffd27a' },
      { text: `${habDist >= 1000 ? (habDist / 1000).toFixed(2) + ' km' : Math.round(habDist) + ' m'} · habitat`, size: 34, color: '#ffe9c2' },
    ],
    '#ffb224',
  )
  group.add(label)
  let pinTop = new THREE.Vector3()
  function placePin() {
    const ground = toView(he, hn, hh)
    // Pillar ~ 60 m tall (in direction), at least 0.9 shell units on screen so it reads as a beacon.
    const top = toView(he, hn, hh + Math.max(60, habDist * 0.06))
    if (top.y - ground.y < 0.9) top.setY(ground.y + 0.9)
    pinTop = top
    const right = new THREE.Vector3().crossVectors(ground, new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(0.06)
    const pts = [ground.clone().sub(right), ground.clone().add(right), top.clone().sub(right), top.clone().add(right)]
    beam.geometry.setFromPoints(pts)
    beam.geometry.setAttribute('aY', new THREE.Float32BufferAttribute([0, 0, 1, 1], 1))
    beam.geometry.setIndex([0, 1, 2, 2, 1, 3])
  }
  placePin()

  onFrame((tS) => {
    if (disposed) return
    for (const m of mats) m.uniforms.uTime.value = tS
    const bob = Math.sin(tS * 2) * 0.05
    diamond.position.copy(pinTop).setY(pinTop.y + 0.06 + bob)
    diamond.rotation.y = tS * 1.5
    ;(diamond.material as THREE.MeshBasicMaterial).opacity = 0.75 + 0.25 * Math.sin(tS * 4)
    label.position.copy(pinTop).setY(pinTop.y + 0.55 + bob)
  })

  return {
    setNorthOffset(deg) {
      offset = (deg * Math.PI) / 180
      for (const m of meshes) m.build()
      placeMarkers()
      placePin()
    },
    dispose() {
      disposed = true
      scene.remove(group)
      group.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        const mt = m.material as (THREE.Material & { map?: THREE.Texture | null }) | undefined
        mt?.map?.dispose()
        mt?.dispose()
      })
    },
  }
}
