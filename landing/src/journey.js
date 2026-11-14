/* ── Journey engine — no document scroll; wheel/touch/keys travel
      between zero-gravity stations. Stations assemble on arrival,
      scatter on departure. ─────────────────────────────────────────── */

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (v) => v * v * (3 - 2 * v);

export function createJourney({ sections, scene3d, reducedMotion, onArrive }) {
  const N = sections.length;
  let target = 0;          // station index (int)
  let cur = 0;             // eased position (float, station units)
  let prev = 0;
  let holdoff = 0;         // ms until next wheel step is accepted

  /* per-stage scatter offsets — every child flees its own way */
  const stages = sections.map((el) => {
    el.classList.add('stage');
    const wrap = el.querySelector('.wrap') || el;
    const kids = [...wrap.children];
    kids.forEach((k, i) => {
      k.style.setProperty('--i', Math.min(i, 8));
      const a = Math.random() * Math.PI * 2;
      k.style.setProperty('--sx', `${(Math.cos(a) * (30 + Math.random() * 46)).toFixed(0)}px`);
      k.style.setProperty('--sy', `${(Math.sin(a) * (22 + Math.random() * 40) + 18).toFixed(0)}px`);
    });
    return { el, wrap, kids };
  });

  function go(i) {
    target = Math.max(0, Math.min(N - 1, i));
  }
  const step = (dir) => go(Math.round(target + dir));

  /* ── input ── */
  const WHEEL_HOLD = reducedMotion ? 350 : 620;   // one station per gesture
  window.addEventListener('wheel', (e) => {
    e.preventDefault();
    const now = performance.now();
    if (now < holdoff) return;
    const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (Math.abs(d) < 8) return;
    if (Math.abs(cur - target) < 0.12) step(Math.sign(d));
    holdoff = now + WHEEL_HOLD;
  }, { passive: false });

  let tY = null, tWrap = null;
  const activeWrap = () => stages[Math.round(cur)]?.el.querySelector('.wrap');
  window.addEventListener('touchstart', (e) => {
    tY = e.touches[0].clientY;
    tWrap = e.target.closest?.('.wrap') || null;
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1) return;
    const w = tWrap || activeWrap();
    const scrollable = w && w.scrollHeight > w.clientHeight + 12;
    if (!scrollable) e.preventDefault(); // own the gesture when there is nothing to scroll
  }, { passive: false });
  window.addEventListener('touchend', (e) => {
    if (tY === null) return;
    const dy = tY - e.changedTouches[0].clientY;
    if (Math.abs(dy) > 46) {
      const w = tWrap || activeWrap();
      const scrollable = w && w.scrollHeight > w.clientHeight + 12;
      let atEdge = true;
      if (scrollable) {
        atEdge = dy < 0 ? w.scrollTop <= 2 : w.scrollTop >= w.scrollHeight - w.clientHeight - 2;
      }
      if (atEdge) step(Math.sign(dy));
    }
    tY = null; tWrap = null;
  }, { passive: true });

  window.addEventListener('keydown', (e) => {
    if (['ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); step(1); }
    else if (['ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); step(-1); }
    else if (e.key === 'Home') { e.preventDefault(); go(0); }
    else if (e.key === 'End') { e.preventDefault(); go(N - 1); }
  });

  /* rail / nav jumps */
  document.querySelectorAll('[data-goto]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const el = document.querySelector(a.getAttribute('href'));
      const idx = el ? sections.indexOf(el) : -1;
      if (idx >= 0) { e.preventDefault(); go(idx); }
    });
  });

  /* ── render loop ── */
  let raf = 0;
  const K = reducedMotion ? 1 : 0.11;
  function frame() {
    raf = requestAnimationFrame(frame);
    prev = cur;
    cur = Math.abs(cur - target) < 0.004 ? target : lerp(cur, target, K);
    const vel = cur - prev;
    scene3d.setScrollProgress(cur / (N - 1));
    scene3d.setVelocity(vel);

    for (let i = 0; i < N; i++) {
      const { el } = stages[i];
      const d = cur - i;                       // signed distance in stations
      const ad = Math.abs(d);
      const vis = 1 - smooth(clamp01((ad - 0.12) / 0.88));
      if (vis <= 0.012) {
        if (el.style.visibility !== 'hidden') {
          el.style.visibility = 'hidden';
          el.setAttribute('inert', '');
          el.classList.remove('is-active', 'is-settled');
          if (onArrive) onArrive(-1, i);
        }
        continue;
      }
      el.style.visibility = 'visible';
      el.style.opacity = vis.toFixed(3);
      el.style.transform = `translate3d(0, ${(d * -46).toFixed(1)}px, 0) scale(${(1 - Math.min(ad * 0.06, 0.12)).toFixed(3)})`;
      el.style.zIndex = String(20 - Math.round(ad * 10));
      const active = ad < 0.5;
      if (active && !el.classList.contains('is-active')) {
        el.classList.add('is-active');
        el.removeAttribute('inert');
        el.classList.remove('is-leaving');
        clearTimeout(el._settleT);
        el._settleT = setTimeout(() => el.classList.add('is-settled'), reducedMotion ? 0 : 850);
        if (onArrive) onArrive(i, -1);
      } else if (!active && el.classList.contains('is-active')) {
        el.classList.remove('is-active', 'is-settled');
        el.classList.add('is-leaving');
        el.setAttribute('inert', '');
        clearTimeout(el._settleT);
      }
    }
  }
  frame();

  /* initial state */
  stages.forEach(({ el }, i) => { if (i !== 0) el.setAttribute('inert', ''); });

  return { go, get cur() { return cur; }, get target() { return target; }, get index() { return Math.round(cur); } };
}
