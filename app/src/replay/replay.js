// Mission Replay — MapLibre layer + player panel. Owner: Marwan.
// Usage: const r = createReplay(map, { route, budgetL }); r.play();
import { buildTimeline, sampleAt, trailAt, formatClock } from "./replay-core.js";

const SRC = { crew: "replay-crew", trail: "replay-trail", turn: "replay-turn" };
const DURATIONS = [30, 60, 120]; // seconds of screen time for the whole walk

export function createReplay(map, opts) {
  let route = opts.route;
  let budgetL = opts.budgetL ?? route.budget_l;
  let durationS = opts.durationS ?? 60;
  const lagS = opts.pairLagS ?? 45; // second crew member trails by this much mission time
  const crewSize = opts.crew ?? route.crew ?? 2;
  const onEvent = opts.onEvent ?? (() => {});
  let tl = buildTimeline(route, { budgetL, dwellS: opts.dwellS, dwellO2L: opts.dwellO2L });
  let t = 0, playing = false, raf = 0, last = 0, firedUpTo = -1;

  addLayers();
  const ui = buildPanel(map.getContainer());
  render();

  function addLayers() {
    const empty = { type: "FeatureCollection", features: [] };
    for (const id of Object.values(SRC)) if (!map.getSource(id)) map.addSource(id, { type: "geojson", data: empty });
    if (!map.getLayer(SRC.trail)) map.addLayer({ id: SRC.trail, type: "line", source: SRC.trail,
      paint: { "line-color": "#ffd166", "line-width": 4, "line-opacity": 0.9 } });
    if (!map.getLayer(SRC.turn)) map.addLayer({ id: SRC.turn, type: "circle", source: SRC.turn,
      paint: { "circle-radius": 7, "circle-color": "#ef476f", "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
    if (!map.getLayer(SRC.crew)) map.addLayer({ id: SRC.crew, type: "circle", source: SRC.crew,
      paint: { "circle-radius": 6, "circle-color": ["get", "color"], "circle-stroke-color": "#111", "circle-stroke-width": 2 } });
  }

  function render() {
    const s = sampleAt(tl, t);
    const pts = [{ pt: s.pt, color: "#06d6a0" }];
    if (crewSize >= 2) pts.push({ pt: sampleAt(tl, Math.max(0, t - lagS)).pt, color: "#118ab2" });
    map.getSource(SRC.crew).setData(fc(pts.map((p) => pointF(p.pt, { color: p.color }))));
    map.getSource(SRC.trail).setData(fc([{ type: "Feature", properties: {},
      geometry: { type: "LineString", coordinates: trailAt(tl, t) } }]));
    map.getSource(SRC.turn).setData(fc(!tl.reachStop && tl.turnPoint ? [pointF(tl.turnPoint, {})] : []));

    const frac = tl.budgetL > 0 ? Math.max(0, s.o2Left) / tl.budgetL : 0;
    ui.bar.style.width = `${(frac * 100).toFixed(1)}%`;
    ui.bar.dataset.level = frac < 0.25 ? "low" : frac < 0.5 ? "mid" : "ok";
    ui.o2.textContent = `${Math.max(0, s.o2Left).toFixed(1)} L of ${tl.budgetL.toFixed(1)} L budget`;
    ui.clock.textContent = formatClock(t);
    ui.dist.textContent = `${(s.distM / 1000).toFixed(2)} km walked`;
    ui.phase.textContent = { out: "Walking out", stop: "At the stop", back: "Walking home", home: "At the habitat" }[s.phase];
    ui.scrub.value = tl.totalS > 0 ? String((t / tl.totalS) * 1000) : "0";
    ui.play.textContent = playing ? "❚❚" : "▶";
    ui.note.textContent = tl.backAssumed ? "Return cost assumed equal to the way out (engine back data missing)." : "";
    fireEvents();
  }

  function fireEvents() {
    for (const e of tl.events) {
      if (e.t <= t && e.t > firedUpTo) {
        ui.event.textContent = e.label;
        ui.event.dataset.type = e.type;
        onEvent(e);
      }
    }
    firedUpTo = t;
  }

  function tick(now) {
    const dt = (now - last) / 1000;
    last = now;
    t = Math.min(tl.totalS, t + dt * (tl.totalS / durationS));
    if (t >= tl.totalS) playing = false;
    render();
    if (playing) raf = requestAnimationFrame(tick);
  }

  function play() {
    if (playing) return;
    if (t >= tl.totalS) seek(0);
    playing = true;
    last = performance.now();
    raf = requestAnimationFrame(tick);
    render();
  }
  function pause() { playing = false; cancelAnimationFrame(raf); render(); }
  function seek(sec) {
    t = Math.max(0, Math.min(tl.totalS, sec));
    // Jumping doesn't fire callbacks for skipped events; the label shows the latest event before t.
    firedUpTo = t === 0 ? -1 : t;
    const lastEv = [...tl.events].reverse().find((e) => e.t <= t);
    ui.event.textContent = t === 0 ? "" : lastEv?.label ?? "";
    ui.event.dataset.type = t === 0 ? "" : lastEv?.type ?? "";
    render();
  }
  function rebuild() {
    const keep = tl.totalS > 0 ? t / tl.totalS : 0;
    tl = buildTimeline(route, { budgetL, dwellS: opts.dwellS, dwellO2L: opts.dwellO2L });
    firedUpTo = -1;
    seek(keep * tl.totalS);
  }

  function buildPanel(container) {
    const el = document.createElement("div");
    el.className = "replay-panel";
    el.innerHTML = `
      <div class="replay-row">
        <button class="replay-play" aria-label="Play or pause">▶</button>
        <input class="replay-scrub" type="range" min="0" max="1000" value="0" aria-label="Replay position">
        <select class="replay-speed" aria-label="Replay length">
          ${DURATIONS.map((d) => `<option value="${d}" ${d === durationS ? "selected" : ""}>${d} s</option>`).join("")}
        </select>
      </div>
      <div class="replay-gauge"><div class="replay-bar"></div></div>
      <div class="replay-row replay-stats">
        <span class="replay-o2"></span><span class="replay-clock"></span><span class="replay-dist"></span>
      </div>
      <div class="replay-row"><span class="replay-phase"></span><span class="replay-event"></span></div>
      <div class="replay-foot"><span class="replay-badge">Scenario</span> modeled estimate from the route file, not a measurement.
        <span class="replay-note"></span></div>`;
    container.appendChild(el);
    const q = (c) => el.querySelector(c);
    const refs = { el, play: q(".replay-play"), scrub: q(".replay-scrub"), speed: q(".replay-speed"), bar: q(".replay-bar"),
      o2: q(".replay-o2"), clock: q(".replay-clock"), dist: q(".replay-dist"), phase: q(".replay-phase"),
      event: q(".replay-event"), note: q(".replay-note") };
    refs.play.onclick = () => (playing ? pause() : play());
    refs.scrub.oninput = () => { pause(); seek((+refs.scrub.value / 1000) * tl.totalS); };
    refs.speed.onchange = () => { durationS = +refs.speed.value; };
    return refs;
  }

  return {
    play, pause, seek,
    /** Called by the turn-back slider (Jana) when the budget changes. */
    setBudget(l) { budgetL = l; rebuild(); },
    setRoute(r) { route = r; budgetL = budgetL ?? r.budget_l; rebuild(); },
    get timeline() { return tl; },
    destroy() {
      pause();
      ui.el.remove();
      for (const id of Object.values(SRC)) { if (map.getLayer(id)) map.removeLayer(id); if (map.getSource(id)) map.removeSource(id); }
    },
  };
}

const fc = (features) => ({ type: "FeatureCollection", features });
const pointF = (pt, properties) => ({ type: "Feature", properties, geometry: { type: "Point", coordinates: pt } });
