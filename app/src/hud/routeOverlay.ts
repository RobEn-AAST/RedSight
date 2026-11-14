// AR route guide drawn into the 360 stop view (AR helmet view). Owner: Marwan.
// No tracking: the route's own coordinates are turned into directions as seen from the camera at the stop and
// drawn once; only the flowing chevrons animate. With a terrain grid (app/public/hud/terrain-<stop>.json, Derived
// from the Trek 2.5 m DEM) the route sits on the real ground height and the parts hidden behind a ridge are shown
// dashed and dim, the way AR navigation shows "behind the hill". Without it the ground is assumed flat.
import * as THREE from 'three'

type LonLat = [number, number]
const MARS_R = 3_389_500 // m, mean radius (same as build-hud-terrain.py)
const EYE_H = 1.97 // m, Mastcam height above ground (the photo's viewpoint)
const SHELL = 9 // draw just inside the photo sphere (radius 10), always on top of it
const NEAR_M = 2.5 // start just in front of the feet (closer would be under the camera)
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

export interface TurnCue {
  /** Metres along the path from the stop to the turn. */
  distM: number
  dir: 'left' | 'right'
  /** Size of the turn, degrees. */
  angleDeg: number
  e: number
  n: number
}

const compass = (de: number, dn: number) => ((Math.atan2(de, dn) * 180) / Math.PI + 360) % 360
const turnBy = (from: number, to: number) => ((to - from + 540) % 360) - 180

/** First clear bend (> 30° between the 30 m before and the 30 m after a point), after the first 15 m. Display only. */
function findTurn(pts: PathPt[]): TurnCue | null {
  const at = (s: number) => pts.find((p) => p.s >= s) ?? null
  const head = (s0: number, s1: number) => {
    const a = at(s0)
    const b = at(s1)
    return a && b && b !== a ? compass(b.e - a.e, b.n - a.n) : null
  }
  const s0 = pts[0]?.s ?? 0
  for (let s = s0 + 15; s < s0 + 1500; s += 5) {
    const before = head(Math.max(s0, s - 30), s)
    const after = head(s, s + 30)
    if (before == null || after == null) break
    const t = turnBy(before, after)
    if (Math.abs(t) > 30) {
      const p = at(s)!
      return { distM: Math.max(10, Math.round((s - s0) / 10) * 10), dir: t > 0 ? 'right' : 'left', angleDeg: Math.abs(t), e: p.e, n: p.n }
    }
  }
  return null
}

/** Next-turn cue for a path seen from the stop (flat ground; same smoothing as the drawn line). */
export function nextTurn(coords: LonLat[], stop: LonLat): TurnCue | null {
  return findTurn(preparePath(coords, stop, null, [0, 0]))
}

const VERT = /* glsl */ `
attribute float aAlong; attribute float aSide; attribute float aVis; attribute float aDist;
varying float vAlong; varying float vSide; varying float vVis; varying float vDist;
void main() {
  vAlong = aAlong; vSide = aSide; vVis = aVis; vDist = aDist;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
// AR navigation track (car-HUD / Live View style): solid body, thin bright edge, dark outline for contrast on the
// red ground, crisp chevrons flowing in the direction of travel. Edges are anti-aliased with screen derivatives.
const FRAG = /* glsl */ `
uniform float uTime; uniform vec3 uColor; uniform float uArrows; uniform float uOpacity;
varying float vAlong; varying float vSide; varying float vVis; varying float vDist;
float band(float x, float lo, float hi, float w) { return smoothstep(lo - w, lo + w, x) * (1.0 - smoothstep(hi - w, hi + w, x)); }
void main() {
  float a = abs(vSide);
  float aw = max(fwidth(vSide), 0.02);
  float inside = 1.0 - smoothstep(1.0 - aw, 1.0, a);
  // Layers from the centre out: body, bright edge line, dark outline.
  float body = 1.0 - smoothstep(0.76 - aw, 0.76 + aw, a);
  float edgeL = band(a, 0.76, 0.86, aw);
  float outline = band(a, 0.86, 1.0, aw);
  vec3 col = uColor * (0.85 + 0.15 * (1.0 - a));
  float alpha = body * 0.78;
  col = mix(col, mix(uColor, vec3(1.0), 0.65), edgeL);
  alpha = max(alpha, edgeL * 0.95);
  col = mix(col, vec3(0.02, 0.04, 0.07), outline);
  alpha = max(alpha, outline * 0.45);
  // Chevrons: a V pointing along the direction of travel; spacing grows with distance so far ones stay readable.
  float sp = max(4.0, vDist * 0.06);
  float u = (vAlong - uTime * 3.0) / sp;
  float ph = fract(u);
  float d = ph + a * 0.38;
  float cw = max(fwidth(u) * 1.2, 0.01);
  float chev = band(d, 0.42, 0.62, cw) * body * uArrows;
  col = mix(col, vec3(1.0), chev);
  alpha = max(alpha, chev);
  alpha *= inside * uOpacity;
  // Behind terrain: dim dashes, no chevrons (like "behind the hill" in AR navigation).
  if (vVis < 0.5) {
    float dash = step(0.5, fract(vAlong / max(5.0, vDist * 0.035)));
    alpha = uOpacity * 0.38 * (body + edgeL) * dash * inside;
    col = mix(uColor, vec3(1.0), 0.3);
  }
  // Fade in over the first metres (no hard start under the feet) and out far away.
  alpha *= smoothstep(2.5, 7.0, vDist) * (1.0 - smoothstep(1500.0, 2300.0, vDist));
  gl_FragColor = vec4(col, alpha);
}`

/** Label sprite: crisp text on a dark plate (constant size on screen, since it lives on the drawing shell). */
function labelSprite(
  lines: { text: string; size: number; color: string }[],
  border: string,
  scale = 1,
  width = 512,
  fill = 'rgba(10,8,4,0.78)',
) {
  const c = document.createElement('canvas')
  c.width = width
  c.height = 40 + lines.reduce((s, l) => s + l.size * 1.25, 0)
  const g = c.getContext('2d')!
  g.fillStyle = fill
  g.globalAlpha = fill.startsWith('#') ? 0.92 : 1
  g.beginPath()
  g.roundRect(3, 3, c.width - 6, c.height - 6, 14)
  g.fill()
  g.globalAlpha = 1
  g.strokeStyle = fill.startsWith('#') ? 'rgba(255,255,255,0.9)' : border
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
        const hw = Math.max(path.widthM / 2, p.d * 0.014)
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

  // Distance markers along the guided path (the one with arrows): 100 m, 500 m, 1 km (not next to the turn sign).
  const markers: { sp: THREE.Sprite; p: PathPt }[] = []
  const guide = lines.find((l) => l.path.arrows)
  if (guide) {
    for (const m of [100, 500, 1000]) {
      const p = guide.pts.find((q) => q.s >= m)
      if (!p || !p.vis) continue
      const t = findTurn(guide.pts)
      if (t && Math.abs(t.distM - m) < 60) continue
      const sp = labelSprite([{ text: m >= 1000 ? `${m / 1000} km` : `${m} m`, size: 60, color: '#ffffff' }], guide.path.color, 0.5, 220)
      group.add(sp)
      markers.push({ sp, p })
    }
  }
  const placeMarkers = () => {
    for (const { sp, p } of markers) sp.position.copy(toView(p.e, p.n, p.h + 0.05)).add(new THREE.Vector3(0, 0.3, 0))
  }
  placeMarkers()

  // Next-turn sign over the guided path: a big arrow + distance, standing on the ground at the turn.
  const turn = guide ? findTurn(guide.pts) : null
  let turnSign: THREE.Sprite | null = null
  let turnH = 0
  if (turn) {
    turnSign = labelSprite(
      [
        { text: turn.dir === 'left' ? '⬅' : '➡', size: 84, color: '#ffffff' },
        { text: `${turn.distM} m`, size: 46, color: '#ffffff' },
      ],
      guide!.path.color,
      0.62,
      240,
      guide!.path.color,
    )
    turnH = heightAt(terrain, shift, turn.e, turn.n)
    group.add(turnSign)
  }
  const placeTurn = () => {
    if (turnSign && turn) turnSign.position.copy(toView(turn.e, turn.n, turnH + 0.05)).add(new THREE.Vector3(0, 0.75, 0))
  }
  placeTurn()

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

  // Ground ring around the habitat (destination), pulsing, so "home" reads as a place on the ground.
  const ringMat = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `attribute float aR; varying float vR; void main(){ vR = aR; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `uniform float uTime; varying float vR; void main(){
      float pulse = fract(uTime * 0.5);
      float ring = 1.0 - smoothstep(0.0, 0.12, abs(vR - pulse));
      float rim = smoothstep(0.82, 0.9, vR) * (1.0 - smoothstep(0.95, 1.0, vR));
      float a = max(ring * (1.0 - pulse) * 0.8, rim * 0.75) + 0.12 * (1.0 - vR);
      gl_FragColor = vec4(1.0, 0.75, 0.25, a); }`,
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  mats.push(ringMat)
  const ring = new THREE.Mesh(new THREE.BufferGeometry(), ringMat)
  ring.renderOrder = 12
  ring.frustumCulled = false
  group.add(ring)
  const ringR = Math.max(10, habDist * 0.025)
  function placeRing() {
    const pos: number[] = []
    const rr: number[] = []
    const idx: number[] = []
    const N = 48
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * Math.PI * 2
      for (const k of [0, 1]) {
        const R = k ? ringR : 0.001
        const v = toView(he + Math.cos(t) * R, hn + Math.sin(t) * R, hh + 0.1)
        pos.push(v.x, v.y, v.z)
        rr.push(k)
      }
      if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i, 2 * i - 1, 2 * i + 1)
    }
    ring.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    ring.geometry.setAttribute('aR', new THREE.Float32BufferAttribute(rr, 1))
    ring.geometry.setIndex(idx)
  }
  placeRing()

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
      placeTurn()
      placePin()
      placeRing()
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
