/* ── RedSight 3D layer · Mars + living starfield + meteors ──────────── */
import * as THREE from 'three';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (v) => v * v * (3 - 2 * v);
const lerp = (a, b, t) => a + (b - a) * t;

/** Camera keyframes — one per [data-cam] section, in document order. */
const CAM = {
  hero:     { x:  1.9, y: -0.15, scale: 1.35, tilt: 0.10, spin: 0.0,  dim: 1.0 },
  problem:  { x: -2.7, y: -1.05, scale: 1.00, tilt: -0.06, spin: 0.6,  dim: 0.9 },
  concept:  { x:  2.5, y:  1.35, scale: 0.68, tilt: 0.22, spin: 1.6,  dim: 0.55 },
  science:  { x:  0.0, y: -2.55, scale: 1.55, tilt: -0.14, spin: 2.6,  dim: 0.32 },
  briefs:   { x:  3.35, y: 0.72, scale: 0.70, tilt: 0.05, spin: 3.4,  dim: 0.75 },
  proposal: { x: -2.7, y: -0.70, scale: 1.30, tilt: -0.10, spin: 4.4,  dim: 0.7 },
  crew:     { x:  0.0, y:  0.40, scale: 0.80, tilt: 0.16, spin: 5.2,   dim: 0.85 },
  footer:   { x:  0.0, y: -2.95, scale: 2.75, tilt: -0.22, spin: 6.0,  dim: 0.72 },
};

/* soft radial sprite texture (nebulae / star glow) */
function radialTexture(hex, inner = 0.9) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, `rgba(${hex},${inner})`);
  g.addColorStop(0.4, `rgba(${hex},${inner * 0.35})`);
  g.addColorStop(1, `rgba(${hex},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* meteor streak texture — bright head fading tail */
function meteorTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 16;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, 'rgba(255,240,220,0)');
  g.addColorStop(0.75, 'rgba(255,240,220,0.55)');
  g.addColorStop(1, 'rgba(255,250,240,1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 16);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createScene(canvas, { reducedMotion = false, mobile = false, lite = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lite, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(lite ? 1 : Math.min(window.devicePixelRatio, mobile ? 1.5 : 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 120);
  camera.position.set(0, 0, 6);

  /* ── lights ── */
  const sun = new THREE.DirectionalLight(0xFFF1E0, 3.2);
  sun.position.set(-4, 1.6, 2.5);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x22304a, 0.55));

  /* ── Mars ── */
  const marsGroup = new THREE.Group();
  scene.add(marsGroup);
  const RADIUS = 1.6;
  const seg = lite ? 48 : (mobile ? 72 : 104);
  const marsMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.96, metalness: 0.0,
    map: null, bumpMap: null, bumpScale: 0.02,
  });
  const mars = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, seg, seg), marsMat);
  mars.rotation.z = 0.42;
  marsGroup.add(mars);

  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(RADIUS * 1.035, 64, 64),
    new THREE.ShaderMaterial({
      transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
      vertexShader: `
        varying vec3 vN; varying vec3 vP;
        void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vP = mv.xyz; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        varying vec3 vN; varying vec3 vP;
        void main(){
          float rim = pow(1.0 - abs(dot(normalize(vN), normalize(-vP))), 3.2);
          vec3 col = mix(vec3(0.35,0.18,0.10), vec3(0.95,0.48,0.28), rim);
          gl_FragColor = vec4(col, rim * 0.9);
        }`,
    })
  );
  marsGroup.add(atmo);

  /* ── living starfield — twinkle shader, 5 depth shells ── */
  const shells = lite
    ? [[1100, 1.2, 0.55], [700, 2.0, 0.75], [300, 3.0, 0.9]]
    : [[3600, 1.1, 0.5], [2500, 1.6, 0.65], [1500, 2.2, 0.8], [800, 3.1, 0.95], [340, 4.2, 1.0]];
  const total = shells.reduce((s, x) => s + x[0], 0);
  const starPos = new Float32Array(total * 3);
  const starSize = new Float32Array(total);
  const starPhase = new Float32Array(total);
  const starSpeed = new Float32Array(total);
  const starAlpha = new Float32Array(total);
  const starTint = new Float32Array(total);
  let i0 = 0;
  for (const [count, size, alpha] of shells) {
    for (let i = 0; i < count; i++) {
      const k = i0 + i;
      const r = 30 + Math.random() * 34;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      starPos[k * 3] = r * Math.sin(ph) * Math.cos(th);
      starPos[k * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.72;
      starPos[k * 3 + 2] = r * Math.cos(ph);
      starSize[k] = size * (0.7 + Math.random() * 0.6);
      starPhase[k] = Math.random() * Math.PI * 2;
      starSpeed[k] = 0.4 + Math.random() * 1.6;
      starAlpha[k] = alpha * (0.7 + Math.random() * 0.3);
      starTint[k] = Math.random();
    }
    i0 += count;
  }
    const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(starSize, 1));
  starGeo.setAttribute('aPhase', new THREE.BufferAttribute(starPhase, 1));
  starGeo.setAttribute('aSpeed', new THREE.BufferAttribute(starSpeed, 1));
  starGeo.setAttribute('aAlpha', new THREE.BufferAttribute(starAlpha, 1));
  starGeo.setAttribute('aTint', new THREE.BufferAttribute(starTint, 1));
  const starMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPR: { value: renderer.getPixelRatio() } },
    vertexShader: `
      attribute float aSize; attribute float aPhase; attribute float aSpeed;
      attribute float aAlpha; attribute float aTint;
      uniform float uTime; uniform float uPR;
      varying float vAlpha; varying float vTint;
      void main(){
        float tw = 0.72 + 0.28 * sin(uTime * aSpeed + aPhase);
        vAlpha = aAlpha * tw;
        vTint = aTint;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPR * (0.85 + 0.3 * tw);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vAlpha; varying float vTint;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = 1.0 - smoothstep(0.24, 0.5, d);
        vec3 cool = vec3(0.78, 0.85, 1.0);
        vec3 warm = vec3(1.0, 0.87, 0.76);
        gl_FragColor = vec4(mix(cool, warm, vTint), a * vAlpha);
      }`,
  });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

/* ── near dust — floating motes ── */
  const dustCount = lite ? 60 : (mobile ? 110 : 190);
  const dustPos = new Float32Array(dustCount * 3);
  const dustSeed = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 11;
    dustPos[i * 3 + 1] = (Math.random() - 0.5) * 7;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 4 + 1.2;
    dustSeed[i] = Math.random() * Math.PI * 2;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0xE0905F, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.3, depthWrite: false,
  }));
  scene.add(dust);

  /* ── meteors — occasional streaks + travel warp bursts ── */
  const meteorMat = new THREE.SpriteMaterial({
    map: meteorTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const meteors = [];
  const METEOR_POOL = 10;
  for (let i = 0; i < METEOR_POOL; i++) {
    const s = new THREE.Sprite(meteorMat.clone());
    s.scale.set(3.2, 0.055, 1);
    s.visible = false;
    scene.add(s);
    meteors.push({ spr: s, t: 1, dur: 1, from: new THREE.Vector3(), to: new THREE.Vector3(), next: 5 + i * 7 + Math.random() * 6, warp: false });
  }

  /* ── interaction state ── */
  const state = { ...CAM.hero, spin: 0 };
  const target = { ...CAM.hero };
  const mouse = { x: 0, y: 0 };
  const mouseL = { x: 0, y: 0 };
  let scrollP = 0;
  let warpV = 0;          // travel velocity (station units / frame), drives fov + streaks
  let warpCooldown = 0;

  function setMouse(nx, ny) { mouse.x = Math.max(-1, Math.min(1, nx)); mouse.y = Math.max(-1, Math.min(1, ny)); }

  function applyCam(a, b, t) {
    for (const k of ['x', 'y', 'scale', 'tilt', 'spin', 'dim']) target[k] = lerp(a[k] ?? 1, b[k] ?? 1, t);
    if (mobile) { target.x *= 0.42; target.y *= 0.8; }
  }

  function setScrollProgress(progress) {
    const names = Object.keys(CAM);
    const seg = clamp01(progress) * (names.length - 1);
    const i = Math.min(names.length - 2, Math.floor(seg));
    applyCam(CAM[names[i]], CAM[names[i + 1]], smooth(clamp01(seg - i)));
    scrollP = clamp01(progress);
  }

  /** travel velocity between stations — fov kick, star rush, streak bursts */
  function setVelocity(v) {
    warpV = Math.max(-1.5, Math.min(1.5, v));
  }

  /* ── Mars textures ── */
  const loader = new THREE.TextureLoader();
  let resolveReady;
  const ready = new Promise((r) => (resolveReady = r));
  let loaded = 0, bumpWanted = null;
  const loadTexture = (url, key) => loader.load(url, (tex) => {
    tex.colorSpace = key === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    marsMat[key] = tex;
    if (key === 'bumpMap') marsMat.bumpScale = 0.03;
    marsMat.needsUpdate = true;
    if (++loaded >= (bumpWanted ? 2 : 1)) resolveReady();
  });
  function loadMarsTextures({ colorUrl, bumpUrl }) {
    bumpWanted = bumpUrl;
    loadTexture(colorUrl, 'map');
    if (bumpUrl) loadTexture(bumpUrl, 'bumpMap');
  }

  /* ── loop ── */
  const clock = new THREE.Clock();
  let raf = 0, running = true;
  const kPos = reducedMotion ? 1 : (lite ? 0.6 : 0.06);
  const kSpin = lite ? 0.5 : 0.05;

  function spawnMeteor(m, t, warp = false) {
    if (!warp) m.next = t + 7 + Math.random() * 9;
    m.t = 0;
    m.dur = warp ? (0.32 + Math.random() * 0.22) : (0.8 + Math.random() * 0.7);
    const x = -7 + Math.random() * 10;
    const y = 1.0 + Math.random() * 3.4;
    m.from.set(x, y, -5.5);
    m.to.set(x + 6 + Math.random() * 4, y - (warp ? 1.2 : 2.4) - Math.random() * 1.6, -5.5);
    m.spr.material.rotation = Math.atan2(m.to.y - m.from.y, m.to.x - m.from.x);
    m.spr.scale.set(warp ? 5.5 : 3.2, warp ? 0.045 : 0.055, 1);
    m.warp = warp;
    m.spr.visible = true;
  }

  function frame() {
    raf = requestAnimationFrame(frame);
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    for (const k of ['x', 'y', 'scale', 'tilt', 'dim']) state[k] = lerp(state[k] ?? CAM.hero[k], target[k], kPos);
    state.spin = lerp(state.spin, target.spin, kSpin);
    sun.intensity = 3.2 * (state.dim ?? 1);

    /* camera: choreography + mouse parallax + warp fov kick */
    mouseL.x = lerp(mouseL.x, mouse.x, 0.04);
    mouseL.y = lerp(mouseL.y, mouse.y, 0.04);
    camera.position.set(mouseL.x * 0.3, -mouseL.y * 0.22, 6);
    camera.lookAt(0, 0, 0);
    const fovKick = Math.abs(warpV) * 14;
    if (Math.abs(camera.fov - (42 + fovKick)) > 0.05) {
      camera.fov = lerp(camera.fov, 42 + fovKick, 0.18);
      camera.updateProjectionMatrix();
    }

    marsGroup.position.set(state.x, state.y, 0);
    marsGroup.scale.setScalar(state.scale);
    mars.rotation.y = reducedMotion ? 0.8 : state.spin + t * 0.018;
    mars.rotation.x = state.tilt;

    /* starfield: twinkle + scroll yaw + warp rush */
    starMat.uniforms.uTime.value = t;
    stars.rotation.y = scrollP * 0.35 + t * 0.004 + warpV * 0.02;
    stars.rotation.z = scrollP * 0.05;

    if (!reducedMotion) {
      const rush = 1 + Math.abs(warpV) * 5;
      dust.rotation.z = t * 0.006 + warpV * 0.01;
      const dp = dustGeo.attributes.position.array;
      for (let i = 0; i < dustCount; i++) {
        dp[i * 3 + 1] += (Math.sin(t * 0.35 + dustSeed[i]) * 0.0009 - warpV * 0.004) * rush;
        dp[i * 3 + 2] += warpV * 0.02 * rush;
        if (dp[i * 3 + 2] > 5) dp[i * 3 + 2] = -3;         // recycled past camera
        if (dp[i * 3 + 2] < -4) dp[i * 3 + 2] = 4;
      }
      dustGeo.attributes.position.needsUpdate = true;
      dust.material.opacity = 0.3 + Math.min(0.45, Math.abs(warpV) * 0.5);

      warpCooldown = Math.max(0, warpCooldown - dt);
      if (Math.abs(warpV) > 0.18 && warpCooldown <= 0) {
        const m = meteors.find((x) => x.t >= 1 && x.warp !== true || (x.t >= 1 && Math.random() < 0.5));
        if (m) { spawnMeteor(m, t, true); warpCooldown = 0.09; }
      }

      for (const m of meteors) {
        if (m.t >= 1) {
          if (!m.warp && t >= m.next && Math.abs(mouseL.x) < 0.9) spawnMeteor(m, t, false);
          else continue;
        }
        m.t += dt / m.dur;
        if (m.t >= 1) { m.spr.visible = false; m.warp = false; continue; }
        const p = m.from.clone().lerp(m.to, m.t);
        m.spr.position.copy(p);
        m.spr.material.opacity = Math.sin(Math.PI * m.t) * (m.warp ? 0.95 : 0.85);
      }
    }

    warpV *= 0.86; // decay — journey module refreshes it each frame
    renderer.render(scene, camera);
  }
  frame();

  document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running) clock.getDelta(); });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    starMat.uniforms.uPR.value = renderer.getPixelRatio();
  });

  return { loadMarsTextures, setScrollProgress, setMouse, setVelocity, renderer, ready };
}
