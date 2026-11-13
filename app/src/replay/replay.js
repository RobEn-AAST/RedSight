// Mission Replay — MapLibre layer + player panel. Owner: Marwan.
// Usage: const r = createReplay(map, { route }); r.play();
import { buildTimeline, sampleAt, trailAt, formatClock, formatDuration } from "./replay-core.js";
import { createVoice, calloutFor } from "./voice.js";

const SRC = { ends: "replay-ends", trail: "replay-trail", turn: "replay-turn", crew: "replay-crew" };
const DURATIONS = [30, 60, 120]; // seconds of screen time for the whole walk
const DRILLS = [
  { id: "leak", label: "Suit leak", factor: 2 },
  { id: "work", label: "Hard work", factor: 1.5 },
];
// Trail/crew colours chosen to stand out from the app's route lines (fastest amber, lowest-hazard green).
const OUT = "#f4f1ea", BACK = "#4cc9f0", CREW_A = "#ff5fd2", CREW_B = "#b98cff";
const pct = (x, c) => `${Math.round((x / c) * 100)}%`;

export function createReplay(map, opts) {
  let route = opts.route;
  const model = { ...opts }; // capacityL, reserveL, returnMargin, memberFactors, statusStep, …
  let durationS = opts.durationS ?? 60;
  const lagS = opts.pairLagS ?? 45; // second crew member trails by this much mission time
  const onEvent = opts.onEvent ?? (() => {});
  const showEnds = opts.showEnds ?? true; // false when the host map already draws habitat + stop markers
  const voice = createVoice({ enabled: opts.voice ?? false });
  let tl = build();
  let t = 0, playing = false, raf = 0, last = 0, firedUpTo = -1;
  const log = [];

  addLayers();
  const ui = buildPanel(opts.panelContainer ?? map.getContainer());
  render();

  function build() { return buildTimeline(route, model); }

  function addLayers() {
    const empty = { type: "FeatureCollection", features: [] };
    for (const id of Object.values(SRC)) if (!map.getSource(id)) map.addSource(id, { type: "geojson", data: empty });
    if (!map.getLayer(SRC.ends)) map.addLayer({ id: SRC.ends, type: "circle", source: SRC.ends,
      paint: { "circle-radius": 8, "circle-color": ["get", "color"], "circle-stroke-color": "#111", "circle-stroke-width": 2 } });
    if (!map.getLayer(SRC.trail)) map.addLayer({ id: SRC.trail, type: "line", source: SRC.trail,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": ["get", "color"], "line-width": ["get", "width"], "line-opacity": 0.95 } });
    if (!map.getLayer(SRC.turn)) map.addLayer({ id: SRC.turn, type: "circle", source: SRC.turn,
      paint: { "circle-radius": 7, "circle-color": "#ef476f", "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
    if (!map.getLayer(SRC.crew)) map.addLayer({ id: SRC.crew, type: "circle", source: SRC.crew,
      paint: { "circle-radius": 6, "circle-color": ["get", "color"], "circle-stroke-color": "#111", "circle-stroke-width": 2 } });
  }

  function render() {
    const s = sampleAt(tl, t);
    const C = tl.capacityL, R = tl.reserveL;
    const pts = [{ pt: s.pt, color: CREW_A }];
    if (tl.members.length >= 2) pts.push({ pt: sampleAt(tl, Math.max(0, t - lagS)).pt, color: CREW_B });
    map.getSource(SRC.crew).setData(fc(pts.map((p) => pointF(p.pt, { color: p.color }))));
    const tr = trailAt(tl, t);
    map.getSource(SRC.trail).setData(fc([
      ...(tr.out.length > 1 ? [lineF(tr.out, { color: OUT, width: 4 })] : []),
      ...(tr.back.length > 1 ? [lineF(tr.back, { color: BACK, width: 6 })] : []),
    ]));
    map.getSource(SRC.ends).setData(fc(!showEnds ? [] : [
      pointF(route.coords[0], { color: "#ffffff" }), // habitat
      pointF(route.coords[route.coords.length - 1], { color: "#9b5de5" }), // stop
    ]));
    map.getSource(SRC.turn).setData(fc(tl.turnPoint ? [pointF(tl.turnPoint, {})] : []));

    // Tank gauge: [reserve | home needed | spare margin] … empty. Fill = O2 left (worst member).
    const left = Math.max(0, s.o2Left), home = Math.max(0, s.homeL);
    const margin = left - R - home;
    ui.fill.style.width = `${(left / C) * 100}%`;
    ui.fill.dataset.level = left < R ? "reserve" : margin < 0.1 * C ? "tight" : "ok";
    ui.reserve.style.width = `${(R / C) * 100}%`;
    ui.home.style.left = `${(R / C) * 100}%`;
    ui.home.style.width = `${(Math.min(home, Math.max(0, left - R)) / C) * 100}%`;
    ui.o2.textContent = `O₂ ${pct(left, C)} · ${left.toFixed(0)} L · ≈${formatDuration(s.minutesLeft * 60)} at walkback rate`;
    ui.need.textContent = `Home needs ${pct(home, C)} · reserve ${pct(R, C)} · spare ${pct(Math.max(0, margin), C)}`;
    ui.members.textContent = tl.members.length >= 2
      ? s.members.map((l, i) => `${"AB"[i] ?? i + 1} ${pct(Math.max(0, l), C)}`).join(" · ") + " (plan uses the lower)"
      : "";
    ui.clock.textContent = `T+${formatClock(t)}`;
    ui.dist.textContent = `${(s.distM / 1000).toFixed(2)} km`;
    ui.phase.textContent = { out: "Walking out", stop: "At the stop", back: "Walking home", home: "At the habitat" }[s.phase];
    ui.scrub.value = tl.totalS > 0 ? String((t / tl.totalS) * 1000) : "0";
    ui.play.textContent = playing ? "❚❚" : "▶";
    ui.summary.textContent = t >= tl.totalS && tl.totalS > 0 ? arrivalText() : "";
    ui.note.textContent = tl.backAssumed ? " Return cost assumed equal to the way out (engine back data missing)." : "";
    if (playing) fireEvents();
  }

  function arrivalText() {
    const C = tl.capacityL;
    const base = `Home with ${pct(tl.arrivalL, C)} (${tl.arrivalL.toFixed(0)} L ≈ ${formatDuration(tl.arrivalMin * 60)} at walkback rate)`;
    if (tl.arrivalL < 0) return `${base}: primary O₂ ran out; emergency supply needed.`;
    if (tl.reserveUsedL > 0.05) return `${base}: used ${tl.reserveUsedL.toFixed(0)} L of the reserve.`;
    return `${base}: reserve intact.`;
  }

  function fireEvents() {
    for (const e of tl.events) {
      if (e.t <= t && e.t > firedUpTo) {
        pushLog(e);
        voice.say(calloutFor(e));
        onEvent(e);
      }
    }
    firedUpTo = t;
  }
  function pushLog(e) {
    log.unshift(e);
    log.length = Math.min(log.length, 4);
    ui.log.innerHTML = log.map((x) => `<li data-type="${x.type}"><b>T+${formatClock(x.t)}</b> ${x.label}</li>`).join("");
  }

  function tick(now) {
    // rAF's frame timestamp can be earlier than the performance.now() taken in play(); never step backwards.
    const dt = Math.max(0, (now - last) / 1000);
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
    // Jumping doesn't fire skipped events; the log shows the latest ones before t.
    firedUpTo = t === 0 ? -1 : t;
    log.length = 0;
    // At t = 0 nothing has happened yet; play() fires the departure itself.
    if (t > 0) tl.events.filter((e) => e.t <= t).slice(-4).forEach(pushLog);
    else ui.log.innerHTML = "";
    render();
  }
  function rebuild({ keepTime = true } = {}) {
    const keep = keepTime && tl.totalS > 0 ? t / tl.totalS : 0;
    tl = build();
    const at = keepTime ? Math.min(t, tl.totalS) : keep * tl.totalS;
    seek(at);
  }

  function buildPanel(container) {
    const el = document.createElement("div");
    el.className = opts.panelContainer ? "replay-panel replay-panel--docked" : "replay-panel";
    el.innerHTML = `
      <div class="replay-row">
        <button class="replay-play" aria-label="Play or pause">▶</button>
        <input class="replay-scrub" type="range" min="0" max="1000" value="0" aria-label="Replay position">
        <select class="replay-speed" aria-label="Replay length">
          ${DURATIONS.map((d) => `<option value="${d}" ${d === durationS ? "selected" : ""}>${d} s</option>`).join("")}
        </select>
        <button class="replay-voice" aria-label="Spoken callouts" title="Spoken callouts">🔇</button>
      </div>
      <div class="replay-tank" title="Suit O₂: reserve (striped) is never planned; amber = needed to get home">
        <div class="replay-fill"></div><div class="replay-reserve"></div><div class="replay-home"></div>
      </div>
      <div class="replay-o2"></div>
      <div class="replay-need"></div>
      <div class="replay-members"></div>
      <div class="replay-legend"><i style="background:${CREW_A}"></i>crew ${showEnds ? '<i style="background:#fff"></i>habitat <i style="background:#9b5de5"></i>stop' : ""}
        <i style="background:#ef476f"></i>turn-back <i style="background:${OUT}"></i>walked out <i style="background:${BACK}"></i>walked home</div>
      <div class="replay-row replay-stats"><span class="replay-phase"></span><span class="replay-clock"></span><span class="replay-dist"></span></div>
      <ul class="replay-log" aria-live="polite"></ul>
      <div class="replay-summary"></div>
      <div class="replay-row replay-drills">
        <span>Drill:</span>
        ${DRILLS.map((d) => `<button data-drill="${d.id}" title="O₂ use ×${d.factor} from now">${d.label} ×${d.factor}</button>`).join("")}
        <button data-drill="none">Clear</button>
        <select class="replay-step" aria-label="Status callout step">
          <option value="0.1">O₂ call every 10%</option><option value="0.05">every 5%</option>
        </select>
      </div>
      <div class="replay-foot"><span class="replay-badge">Scenario</span> modeled estimate, not a measurement.<span class="replay-note"></span></div>`;
    container.appendChild(el);
    const q = (c) => el.querySelector(c);
    const r = { el, play: q(".replay-play"), scrub: q(".replay-scrub"), speed: q(".replay-speed"), voice: q(".replay-voice"),
      fill: q(".replay-fill"), reserve: q(".replay-reserve"), home: q(".replay-home"), o2: q(".replay-o2"), need: q(".replay-need"),
      members: q(".replay-members"), phase: q(".replay-phase"), clock: q(".replay-clock"), dist: q(".replay-dist"),
      log: q(".replay-log"), summary: q(".replay-summary"), note: q(".replay-note"), step: q(".replay-step") };
    r.play.onclick = () => (playing ? pause() : play());
    r.scrub.oninput = () => { pause(); seek((+r.scrub.value / 1000) * tl.totalS); };
    r.speed.onchange = () => { durationS = +r.speed.value; };
    if (!voice.supported) r.voice.hidden = true;
    r.voice.onclick = () => { voice.setEnabled(!voice.enabled); r.voice.textContent = voice.enabled ? "🔊" : "🔇"; };
    r.step.value = String(model.statusStep ?? 0.1);
    r.step.onchange = () => { model.statusStep = +r.step.value; rebuild(); };
    for (const b of el.querySelectorAll("[data-drill]")) {
      b.onclick = () => {
        const d = DRILLS.find((x) => x.id === b.dataset.drill);
        model.drill = d ? { atS: t, factor: d.factor, label: d.label } : undefined;
        rebuild();
      };
    }
    return r;
  }

  return {
    play, pause, seek,
    /** Turn-back slider (Jana): usable O2 budget per member (capacity − reserve). */
    setBudget(l) { model.budgetL = l; rebuild(); },
    /** Suit capacity (full tank); reserve is recomputed from it. */
    setCapacity(l) { model.capacityL = l; delete model.budgetL; delete model.reserveL; rebuild(); },
    setRoute(r2) { route = r2; rebuild({ keepTime: false }); },
    drill(factor, label = "Contingency") { model.drill = { atS: t, factor, label }; rebuild(); },
    clearDrill() { delete model.drill; rebuild(); },
    get timeline() { return tl; },
    voice,
    destroy() {
      pause();
      voice.setEnabled(false);
      ui.el.remove();
      for (const id of Object.values(SRC)) { if (map.getLayer(id)) map.removeLayer(id); if (map.getSource(id)) map.removeSource(id); }
    },
  };
}

const fc = (features) => ({ type: "FeatureCollection", features });
const lineF = (coordinates, properties) => ({ type: "Feature", properties, geometry: { type: "LineString", coordinates } });
const pointF = (pt, properties) => ({ type: "Feature", properties, geometry: { type: "Point", coordinates: pt } });
