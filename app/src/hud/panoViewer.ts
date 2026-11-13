// 360° stop view (Tier 2, demo-focus-plan §10). Owner: Marwan (prototype on feat/marwan-hud).
// NASA Mastcam 360 mosaics are full circles horizontally but only ~80° tall, so the image is wrapped on the
// inside of an open cylinder (not a sphere) and the camera's pitch is limited to what the photo covers.
import * as THREE from 'three'

export interface PanoViewer {
  /** Look direction in degrees along the image (0 = image centre). */
  readonly yawDeg: number
  destroy(): void
}

export function createPanoViewer(
  container: HTMLElement,
  imageUrl: string,
  opts: { onReady?: () => void; onError?: (e: unknown) => void; onView?: (yawDeg: number, fovDeg: number) => void } = {},
): PanoViewer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  container.appendChild(renderer.domElement)
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.touchAction = 'none'

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#120c0a')
  // Start a little zoomed in: the NASA mosaic has black, non-rectangular edges top and bottom.
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 100)

  let yaw = 0 // radians
  let pitch = 0
  let maxPitch = 0.3
  let mesh: THREE.Mesh | null = null
  let disposed = false

  new THREE.TextureLoader().load(
    imageUrl,
    (tex) => {
      if (disposed) return tex.dispose()
      tex.colorSpace = THREE.SRGBColorSpace
      tex.wrapS = THREE.RepeatWrapping
      tex.repeat.x = -1 // seen from inside: flip so the image isn't mirrored
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
      const img = tex.image as { width: number; height: number }
      // Cylinder radius 10; height keeps the image's aspect: circumference 2πr ↔ image width.
      const r = 10
      const h = (2 * Math.PI * r * img.height) / img.width
      const geo = new THREE.CylinderGeometry(r, r, h, 128, 1, true)
      mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide }))
      scene.add(mesh)
      // Don't let the view leave the photo: half the image's vertical angle minus half the camera's view.
      const halfImg = Math.atan(h / 2 / r)
      maxPitch = Math.max(0, halfImg - THREE.MathUtils.degToRad(camera.fov / 2))
      opts.onReady?.()
    },
    undefined,
    (e) => opts.onError?.(e),
  )

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

  // Drag (mouse/touch/pen) to look around; wheel to zoom; arrow keys to turn.
  let drag: { x: number; y: number } | null = null
  const el = renderer.domElement
  const onDown = (e: PointerEvent) => {
    drag = { x: e.clientX, y: e.clientY }
    el.setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent) => {
    if (!drag) return
    const k = THREE.MathUtils.degToRad(camera.fov) / (container.clientHeight || 1)
    yaw += (e.clientX - drag.x) * k
    pitch += (e.clientY - drag.y) * k
    drag = { x: e.clientX, y: e.clientY }
  }
  const onUp = () => (drag = null)
  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    camera.fov = THREE.MathUtils.clamp(camera.fov + e.deltaY * 0.03, 35, 75)
    camera.updateProjectionMatrix()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') yaw += 0.08
    if (e.key === 'ArrowRight') yaw -= 0.08
  }
  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointercancel', onUp)
  el.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('keydown', onKey)

  let lastYaw = NaN, lastFov = NaN
  renderer.setAnimationLoop(() => {
    if (yaw !== lastYaw || camera.fov !== lastFov) {
      lastYaw = yaw
      lastFov = camera.fov
      opts.onView?.(THREE.MathUtils.radToDeg(yaw), camera.fov)
    }
    pitch = THREE.MathUtils.clamp(pitch, -maxPitch, maxPitch)
    camera.rotation.set(pitch, yaw, 0, 'YXZ')
    renderer.render(scene, camera)
  })

  return {
    get yawDeg() {
      return THREE.MathUtils.radToDeg(yaw)
    },
    destroy() {
      disposed = true
      renderer.setAnimationLoop(null)
      ro.disconnect()
      window.removeEventListener('keydown', onKey)
      if (mesh) {
        mesh.geometry.dispose()
        const mat = mesh.material as THREE.MeshBasicMaterial
        mat.map?.dispose()
        mat.dispose()
      }
      renderer.dispose()
      el.remove()
    },
  }
}
