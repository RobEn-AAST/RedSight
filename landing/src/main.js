/* ── RedSight main · boot, journey, tilt, holographic UI wiring ─────── */
import './styles/tokens.css';
import './styles/base.css';
import './styles/sections.css';
import './styles/fonts.css';
import { createScene } from './mars/scene.js';
import { createJourney } from './journey.js';

/* ── CONFIG — the crew updates these when assets are ready ── */
const YOUTUBE_ID = '5RmfX-VD65E'; // registration pitch video — youtube.com/watch?v=5RmfX-VD65E
const PDF_URL = '';               // '/assets/RedSight-Proposal.pdf'
const PPTX_URL = '';              // '/assets/RedSight-Deck.pptx'

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = window.matchMedia('(max-width: 760px)').matches;
const lite = new URLSearchParams(location.search).has('lite');

window.__redsight = { lite };

/* ── boot sequence ── */
const bootLines = [
  'ROBEN UPLINK // ESTABLISHED',
  'TARGET ....... JEZERO CRATER',
  'LAYERS ....... 07 NASA DATASETS',
  'ENGINE ....... JPL TRAVERSABILITY MODEL',
  'ZERO-G MODE .. ENGAGED',
  'RED SIGHT .... ONLINE',
];

function runBoot() {
  const boot = document.getElementById('boot');
  const log = document.getElementById('boot-log');
  if (!boot) return;
  const finish = () => { boot.classList.add('done'); document.body.classList.add('booted'); };
  if (reducedMotion || sessionStorage.getItem('booted')) { boot.classList.add('done'); document.body.classList.add('booted'); return; }
  sessionStorage.setItem('booted', '1');
  boot.addEventListener('click', finish, { once: true });
  let li = 0, ci = 0, out = '';
  const type = () => {
    if (li >= bootLines.length) { setTimeout(finish, 260); return; }
    const line = bootLines[li];
    out += line[ci++];
    log.textContent = out + '▮';
    const done = ci >= line.length;
    if (done) { out += '\n'; li++; ci = 0; setTimeout(type, 80); }
    else setTimeout(type, 11);
  };
  type();
}
runBoot();
setTimeout(() => document.body.classList.add('booted'), 5200); // never stick

/* ── 3D layer ── */
const scene3d = createScene(document.getElementById('space'), { reducedMotion, mobile, lite });
scene3d.loadMarsTextures({ colorUrl: '/textures/mars-color-2k.jpg', bumpUrl: '/textures/mars-color-2k.jpg' });
scene3d.ready.then(() => { window.__redsight.ready = true; });

/* ── nav + rail state (declared before journey — its loop fires onArrive at once) ── */
const sections = [...document.querySelectorAll('[data-cam]')];
const railNodes = [...document.querySelectorAll('.rail-nodes a')];
function syncNav(idx) {
  const id = sections[idx]?.id;
  railNodes.forEach((a) => a.classList.toggle('is-active', a.dataset.w === id));
}

/* ── journey — replaces scrolling entirely ── */
const journey = createJourney({
  sections,
  scene3d,
  reducedMotion,
  onArrive(idx) {
    if (idx >= 0) syncNav(idx);
  },
});
window.__journey = journey;

/* ── starfield mouse parallax (camera only — DOM stays still) ── */
if (!reducedMotion) {
  window.addEventListener('mousemove', (e) => {
    scene3d.setMouse((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  }, { passive: true });
}

/* ── mode tabs ── */
const tabs = document.querySelectorAll('.mode-tab');
const panels = document.querySelectorAll('.mode-panel');
tabs.forEach((tab) => tab.addEventListener('click', () => {
  const mode = tab.dataset.mode;
  tabs.forEach((t) => { t.classList.toggle('is-active', t === tab); t.setAttribute('aria-selected', t === tab ? 'true' : 'false'); });
  panels.forEach((p) => {
    const on = p.dataset.mode === mode;
    p.classList.toggle('is-active', on);
    if (on) p.removeAttribute('hidden'); else p.setAttribute('hidden', '');
  });
}));

/* ── video facade (click-to-load YouTube) ── */
const facade = document.getElementById('video-facade');
const note = document.getElementById('video-note');
if (facade) {
  if (YOUTUBE_ID) {
    note.textContent = 'PLAY PITCH — 90 SECONDS';
    const play = () => {
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube-nocookie.com/embed/${YOUTUBE_ID}?autoplay=1&rel=0`;
      iframe.title = 'RedSight pitch video';
      iframe.allow = 'accelerometer; autoplay; encrypted-media; picture-in-picture';
      iframe.allowFullscreen = true;
      facade.replaceWith(iframe);
    };
    facade.addEventListener('click', play);
    facade.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(); } });
  } else {
    facade.addEventListener('click', () => note.textContent = 'PUBLISHES WITH REGISTRATION · NOV 10');
  }
}

/* ── document buttons unlock ── */
function armDoc(btnId, url) {
  const btn = document.getElementById(btnId);
  if (btn && url) { btn.href = url; btn.removeAttribute('aria-disabled'); btn.querySelector('.mono').textContent = 'DOWNLOAD'; }
}
armDoc('pdf-btn', PDF_URL);
armDoc('pptx-btn', PPTX_URL);

/* brand click → station 0 */
document.querySelector('.brand')?.addEventListener('click', (e) => { e.preventDefault(); journey.go(0); });

/* ── fit-to-viewport — every station's text fully visible at any aspect ── */
function fitStages() {
  const mobile = window.matchMedia('(max-width: 760px)').matches;
  const avail = window.innerHeight;
  document.querySelectorAll('.stage .wrap').forEach((wrap) => {
    if (mobile) { wrap.style.setProperty('--fit', 1); return; }
    const h = wrap.scrollHeight; // unaffected by the current scale
    const scale = h > avail ? Math.max(0.58, avail / h) : 1;
    wrap.style.setProperty('--fit', scale.toFixed(3));
  });
}

/* hero wordmark: measure the real rendered word, never let it clip */
function fitHeroTitle() {
  const line = document.querySelector('.hero-title .line');
  if (!line || !line.textContent) return;
  line.style.transform = 'none';
  const rect = line.getBoundingClientRect();
  const avail = window.innerWidth - rect.left - 48; // 48px right breathing room
  const scale = Math.min(1, avail / rect.width);
  line.style.transform = scale < 0.999 ? `scale(${scale.toFixed(4)})` : '';
  line.style.transformOrigin = 'left center';
}
function fitAll() { fitStages(); fitHeroTitle(); }
fitAll();
window.addEventListener('resize', fitAll);
if (document.fonts?.ready) document.fonts.ready.then(fitAll);
setTimeout(fitAll, 900);
