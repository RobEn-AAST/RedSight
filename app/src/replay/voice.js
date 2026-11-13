// Spoken callouts for Mission Replay (Web Speech API). Optional: silent when unsupported or muted.
export function createVoice({ enabled = false, rate = 1.05, lang = "en-US" } = {}) {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
  const supported = !!synth && typeof window.SpeechSynthesisUtterance === "function";
  let on = enabled && supported;
  return {
    supported,
    get enabled() { return on; },
    setEnabled(v) { on = !!v && supported; if (!on && supported) synth.cancel(); },
    say(text) {
      if (!on || !text) return;
      synth.cancel(); // newest callout wins; avoids a queue lagging behind a fast replay
      const u = new SpeechSynthesisUtterance(text);
      u.rate = rate;
      u.lang = lang;
      synth.speak(u);
    },
  };
}

/** Short spoken form of a replay event. */
export function calloutFor(e) {
  return {
    depart: "Leaving the habitat.",
    "turnback-ahead": "Turn-back point ahead.",
    turnback: "Turn-back point. Heading home.",
    low: "Oxygen budget low.",
    arrive: "Arrived at the stop.",
    return: "Heading home.",
    home: "Back at the habitat.",
    "no-go": "Budget too small to leave.",
  }[e.type] ?? e.label;
}
