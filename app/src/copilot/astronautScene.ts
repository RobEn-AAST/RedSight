import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import astronautUrl from './assets/astronaut.glb?url'

export type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking'
export interface AvatarController {
  setState: (state: AvatarState) => void
  setPaused: (paused: boolean) => void
  wave: () => void
  resetView: () => void
  dispose: () => void
}

function disposeModel(root: THREE.Object3D) {
  const textures = new Set<THREE.Texture>()
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return
    node.geometry.dispose()
    if (node instanceof THREE.SkinnedMesh) node.skeleton.dispose()
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value)
      material.dispose()
    }
  })
  textures.forEach((texture) => {
    if (typeof ImageBitmap !== 'undefined' && texture.source.data instanceof ImageBitmap) texture.source.data.close()
    texture.dispose()
  })
}

export async function createAstronaut(host: HTMLDivElement, signal?: AbortSignal): Promise<AvatarController> {
  // Decode before allocating a WebGL context; closing a loading chat aborts fetch.
  const response = await fetch(astronautUrl, { signal })
  if (!response.ok) throw new Error(`Astronaut download failed (${response.status})`)
  const data = await response.arrayBuffer()
  signal?.throwIfAborted()
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  const gltf = await loader.parseAsync(data, '')
  if (signal?.aborted) {
    disposeModel(gltf.scene)
    signal.throwIfAborted()
  }
  let renderer: THREE.WebGLRenderer
  try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' }) }
  catch (error) { disposeModel(gltf.scene); throw error }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.25
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xffffff, 0x778899, 2.5))
  const key = new THREE.DirectionalLight(0xffead7, 3)
  key.position.set(2, 3, 4)
  scene.add(key)
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100)
  const model = gltf.scene
  scene.add(model)
  model.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(model)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const pivot = new THREE.Group()
  scene.remove(model)
  pivot.add(model)
  scene.add(pivot)
  const frontAngle = -Math.PI / 2
  pivot.rotation.y = frontAngle
  model.position.sub(center)
  const height = Math.max(size.y, 0.01)
  camera.position.set(0, height * 0.02, height * 2.7)
  camera.lookAt(0, 0, 0)
  const mixer = new THREE.AnimationMixer(model)
  const actions = new Map(gltf.animations.map((clip) => [clip.name, mixer.clipAction(clip)]))
  let active: THREE.AnimationAction | undefined
  let state: AvatarState = 'idle'
  let appliedState: AvatarState = 'idle'
  let disposed = false
  let paused = false
  let visible = true
  let timer: ReturnType<typeof setTimeout> | undefined
  let previous = 0
  let dirty = true
  let dragX: number | null = null
  let dragged = false
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const canvas = renderer.domElement
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.touchAction = 'pan-y'
  host.append(canvas)

  function play(name: string, once = false) {
    const next = actions.get(name) ?? actions.get('idle')
    if (!next || (next === active && next.isRunning())) return
    next.reset().setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity)
    next.clampWhenFinished = once
    next.enabled = true
    next.setEffectiveWeight(1).play()
    if (active && active !== next) active.crossFadeTo(next, 0.3, false)
    active = next
    dirty = true
    schedule()
  }
  const running = () => !paused && !motion.matches && active?.isRunning()
  function schedule() {
    if (disposed || timer !== undefined || !visible || document.hidden) return
    if (!dirty && !running()) return
    timer = setTimeout(frame, Math.ceil(1000 / 24))
  }
  function frame() {
    timer = undefined
    if (disposed || !visible || document.hidden) return
    const now = performance.now()
    const delta = previous ? Math.min((now - previous) / 1000, 0.1) : 0
    previous = now
    if (running()) mixer.update(delta)
    renderer.render(scene, camera)
    dirty = false
    schedule()
  }
  function suspend() {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    previous = 0
  }
  function applyState() {
    if (motion.matches || paused || appliedState === state) return
    appliedState = state
    play(state === 'thinking' ? 'look_around' : state === 'speaking' ? 'agree' : 'idle', state === 'thinking' || state === 'speaking')
  }
  function refresh() { suspend(); applyState(); dirty = true; schedule() }
  function resize() {
    const { width, height: h } = host.getBoundingClientRect()
    if (!width || !h) return
    renderer.setSize(width, h, false)
    camera.aspect = width / h
    camera.updateProjectionMatrix()
    refresh()
  }
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(host)
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
    refresh()
  })
  intersection.observe(host)
  function idle() { play('idle') }
  mixer.addEventListener('finished', idle)
  document.addEventListener('visibilitychange', refresh)
  motion.addEventListener('change', refresh)
  function down(event: PointerEvent) {
    dragX = event.clientX
    dragged = false
    canvas.setPointerCapture(event.pointerId)
  }
  function move(event: PointerEvent) {
    if (dragX === null) return
    const dx = event.clientX - dragX
    if (Math.abs(dx) > 3) dragged = true
    if (dragged) { pivot.rotation.y += dx * 0.012; dirty = true; schedule() }
    dragX = event.clientX
  }
  function up() {
    if (dragX !== null && !dragged) wave()
    dragX = null
  }
  function cancel() { dragX = null }
  function wave() { if (!motion.matches && !paused) play('greet_01', true) }
  canvas.addEventListener('pointerdown', down)
  canvas.addEventListener('pointermove', move)
  canvas.addEventListener('pointerup', up)
  canvas.addEventListener('pointercancel', cancel)
  canvas.addEventListener('webglcontextlost', suspend)
  idle()
  // Still pose also has the skeleton matrices initialized under reduced motion.
  mixer.update(0)
  resize()
  return {
    setState(next) { state = next; applyState() },
    setPaused(value) { paused = value; refresh() },
    wave,
    resetView() { pivot.rotation.y = frontAngle; dirty = true; schedule() },
    dispose() {
      disposed = true
      suspend()
      resizeObserver.disconnect()
      intersection.disconnect()
      document.removeEventListener('visibilitychange', refresh)
      motion.removeEventListener('change', refresh)
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', cancel)
      canvas.removeEventListener('webglcontextlost', suspend)
      mixer.removeEventListener('finished', idle)
      mixer.stopAllAction()
      mixer.uncacheRoot(model)
      disposeModel(model)
      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
    },
  }
}
