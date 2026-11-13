# RedSight Voice Copilot — Implementation Plan (STATUS: WIRED 2026-11-13 — see the update note)

**Written:** 2026-11-13 (hackathon day 1) by the web-foundation worker, from the user's request and
live official docs (sources §9, all accessed 2026-11-13).
**Scope note (records a precise exception):** decision D12 (decision-log) excludes an AI assistant
from this hackathon's shipped scope. On 2026-11-13 the **user explicitly authorized** the
spacecraft-station UI plus **planning for** an English voice/chat copilot: this document, the system
prompt, and an honest not-configured chat panel in the app.
**Update (later on 2026-11-13, same day):** the **user explicitly directed the wiring session** —
backend built (`server/`, run notes in `server/README.md`), the copilot panel connected with
streaming replies, cloud STT + an in-browser Whisper fallback, TTS **added** (was deferred; see
§1 note), and server-side memory + the mission-knowledge search tool live. Honest deviations are
recorded in `server/README.md` ("Honest deviations"); the runtime system prompt now lives in
`server/prompt.mjs` (this doc remains the design rationale). Still true: **no key has been used
yet** (the user supplies it after this session), the §7 route-mutation tool contracts stay
UNCONNECTED, and shipping a live AI feature at judging remains gated on the team decision (U4)
with the demo never depending on it.

---

## 1. Interaction requirements (from the user)

- Language: **English only** for copilot interaction.
- Host: **laptop**, "very fast" interaction feel — the operator is mid-planning; long dead air is
  unacceptable.
- Modality: speech-to-text (STT) input **and** text chat; streaming responses; cancellable.
- TTS (spoken replies): originally **not requested** — deferred. **Added 2026-11-13 (wiring
  session, user request):** Kokoro-82M in-browser (`kokoro-js`, q8 ≈ 80 MB, cached, WebGPU/WASM)
  with a `speechSynthesis` fallback — fully local, no audio leaves the device.

## 2. End-to-end pipeline (planned)

```
[Operator] ──push-to-talk (Space or mic button)──▶ getUserMedia({audio})
   │ MediaRecorder → audio/webm chunks (or raw PCM via WebAudio Worklet)
   ▼
[Transcription adapter]  local-WASM STT  ──or──▶  server-side Groq STT (whisper-large-v3-turbo)
   │ partial/final transcript → operator bubble (editable before send)
   ▼
[LLM adapter]  server-side proxy ──▶ Groq chat completion (streaming SSE)
   │                                    or Gemini generateContentStream
   ▼
[Render] streamed markdown → copilot bubble; tool-call intents ─▶ app validation ─▶ engine lookup
   │                                                     (LLM NEVER executes anything itself)
   ▼
[Effect] proposed intent card ("Set crew to 2?") — operator confirms; app state is authoritative
```

Key states to implement per stage: `idle → requesting-mic → mic-denied → recording (elapsed, cancel)
→ transcribing → editing-transcript → sending → streaming-reply (cancel) → done | error(retry)`.

- **Capture:** `navigator.mediaDevices.getUserMedia` requires a secure context (https or localhost) —
  fine for the deployed static site. Push-to-talk (hold Space) beats always-on streaming for a
  planning console: explicit, private, and cancels trivially. `MediaRecorder` (webm/opus) is the
  lowest-effort path; a WebAudio PCM path is the fallback if a provider rejects webm.
- **Transcription:** see §3. Show the transcript in an **editable** field before sending (the
  operator fixes recognition errors; nothing sends on voice alone).
- **LLM:** see §4. Stream tokens (SSE) so first tokens render in well under a second of provider
  time; show a cancel affordance the whole time.
- **Cancellation:** AbortController at every hop (recorder stop → upload abort → SSE close). The UI
  must never be stuck in a "thinking" state without an escape.
- **Errors:** mic-permission denied, offline (`navigator.onLine` + fetch failure), provider 4xx/5xx,
  rate limit, empty transcript. Each has a named message + recovery path (retry / switch to typing /
  check backend).

## 3. STT: local lightweight vs Groq-hosted (tradeoffs, honest)

| Option | What it is | Pros | Cons | Verdict |
|---|---|---|---|---|
| **Groq hosted STT** `whisper-large-v3-turbo` | Whisper served by Groq (`/openai/v1/audio/transcriptions`-compatible) | $0.04/h, ~216× real-time factor, best WER-per-dollar, zero client download, English excellent | Network round-trip per utterance; audio leaves the laptop; needs the key-holding backend | **Proposed default** for the demo posture: fast, cheap, trivial to wire |
| **Groq hosted STT** `whisper-large-v3` | Larger Whisper | WER 10.3% vs turbo's 12% | $0.111/h; slower than turbo | Swap-in when accuracy matters more than cents |
| **Local browser STT (WASM)** — whisper.cpp compiled to WASM, or transformers.js `whisper-tiny.en/base` (ONNX) | Runs on the laptop's CPU/GPU | Fully offline after first load; audio never leaves the device; no per-use cost | First-load model download (tens of MB) or a large bundled asset; CPU transcription of a 5–10 s clip can take longer than the clip on modest laptops; adds real bundle/complexity; GPU (WebGPU) helps only on supporting browsers | **Deferred.** Documented as the offline fallback path if the team wants airgap-adjacent privacy, not built now |
| **Web Speech API** (`webkitSpeechRecognition`) | Browser built-in | No code deps | On Chrome it is a **hidden cloud service**, not local; unreliable/absent on Linux Firefox; no official cross-browser contract | Rejected — appears "local" but is neither dependable nor private |

**Latency honesty.** No latency numbers are claimed anywhere without measurement. Three distinct
things must not be conflated: (a) *laptop responsiveness* — UI feedback on keypress/mic-stop, fully
in our control, target: instant (<100 ms visual ack); (b) *network + provider latency* — STT upload +
LLM first-token over the internet; measurable only with the real backend, on the demo network; the
streaming design exists to hide it; (c) *local CPU/GPU load* — only relevant for the WASM path (§3
row 3) and for the app itself. Cloud STT does **not** execute locally — the audio is processed on
the provider's machines; "fast" on the laptop means the UI stays responsive while waiting, not that
transcription happens on-device. Offline availability = typing-only (chat text still needs the LLM
backend, so the whole copilot is honestly offline-unavailable until a local stack exists).

## 4. LLM providers (verified 2026-11-13 against official docs)

| Provider | Current production models (exact IDs) | Notes |
|---|---|---|
| **Google Gemini** | `gemini-4-hydrogen` (everyday, fast/efficient), `gemini-4-argon`, `gemini-4-carbon` (strongest reasoning; all 1M context); stable 3.x line: `gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-3.5-flash-lite`; voice: `gemini-3.8-live` (Live API, native audio streaming) | Strongest grounding/tool-use ecosystem; free tier exists; 2.5 models deprecated (auto-route after 2026-12-01) |
| **Groq** | `openai/gpt-oss-120b` (~500 tok/s, $0.15/$0.60 per 1M, featured default), `openai/gpt-oss-20b` (~1000 tok/s, $0.075/$0.30); `llama-3.1-8b-instant` / `llama-3.3-70b-versatile` now Enterprise-tier | Same backend as the STT choice → one key, one vendor, OpenAI-compatible chat-completions API with SSE streaming |

**Proposed default (reasoning):** **Groq** for both hops — one vendor, one key, one proxy; gpt-oss-120b
at ~500 tok/s gives the "very fast" feel over SSE, and whisper-large-v3-turbo is the cheapest
dependable English STT. **Gemini (`gemini-3.6-flash` or `gemini-4-hydrogen`) as the second adapter**:
better for grounded long-context answers over the provenance corpus and for a future Live-API
voice loop. Both fit the adapter below; the choice is a config value, not an architecture change.

## 5. Provider adapter architecture (planned code shape)

```ts
interface SttProvider  { id: string; transcribe(blob: Blob, opts: { signal: AbortSignal }): Promise<string> }
interface LlmProvider  {
  id: string
  stream(req: { system: string; messages: ChatMsg[]; tools?: ToolSchema[]; signal: AbortSignal })
    : AsyncIterable<StreamEvent>   // 'token' | 'tool_call' | 'done' | 'error'
}
// registerAdapters({ stt: [groqStt], llm: [groqLlm, geminiLlm] }) — selected by server config, not client
```

The client knows only `/api/copilot/*` endpoints (below) — provider selection lives server-side so
swapping Gemini↔Groq touches no client code. The shipped panel implements the **state machine and
transcript UI only**; adapters are typed stubs marked UNCONNECTED.

## 6. Keys & minimal backend proposal (nothing silently introduced now)

- **Hard rule:** API keys are **server-side only** — never `VITE_*` env vars, never in the client
  bundle, never in localStorage, never in the repo (`.gitignore` already blocks `.env*`). This build
  ships zero key handling and makes zero provider calls; no paid usage has occurred from this repo.
- **Minimal backend proposal** (to build only when the user approves + provides keys): one small
  Node process (or a single edge function on the static host) with exactly three endpoints:
  - `POST /api/copilot/stt` — multipart audio in → transcript out (holds GROQ_API_KEY).
  - `POST /api/copilot/chat` — SSE stream out (holds GROQ_API_KEY or GEMINI_API_KEY; enforces the
    system prompt server-side so the client can never bypass it; passes along, but never trusts,
    tool-call requests).
  - `GET /api/copilot/health` — provider-configured probe the client uses to show its honest
    "provider not configured / backend unreachable" states.
  - Rate-limit per session, request logging disabled (privacy default), CORS locked to the app origin.
- Static core app stays static; the backend is optional and additive — the demo must work with it down.

## 7. Future typed tool contracts (UNCONNECTED — schemas now, execution later)

The LLM may **propose** structured intents; the app validates and executes them against the
authoritative engine/state. The LLM never computes numbers (plan §4 rule), never mutates state
directly, and every proposal renders as a confirm-card first. TypeScript mirrors live in
`app/src/types/copilot.ts` (marked UNCONNECTED).

```jsonc
// setMissionParams — propose crew/load/samples/rover/goal changes
{ "tool": "setMissionParams",
  "args": { "crewCount": 2, "loadKg": 15, "loadBasis": "perAstronaut",
            "sampleKgPerStop": 2, "roverAvailable": false, "scienceGoalId": "boxwork" } }
// validation: reuse app/src/lib/validation.ts (crew 1–2, body 43–110, load 0–40/astronaut,
// samples 0–10 — team model limits, plan §8); unknown keys rejected, not ignored.

// searchMaterialTargets — ask for evidence-backed targets inside the current ops box
{ "tool": "searchMaterialTargets", "args": { "goalId": "sulfate-unit", "query": "boxwork veins" } }
// validation: results only from engine stops.json + layers coverage (§15); the tool may
// return "no covered target in the current box" — it must never synthesize coordinates.

// compareRoutePresets — fastest vs lowest-hazard for the active mission
{ "tool": "compareRoutePresets", "args": { "modes": ["fastest", "safest"], "budget": { "kind": "oxygen", "value": 4 } } }
// validation: all figures copied verbatim from routes/*.json by the app; the LLM quotes, never computes.

// proposeRouteRecalc — re-select a precomputed route after parameter changes
{ "tool": "proposeRouteRecalc", "args": { "mode": "safest", "budget": { "kind": "time", "value": 6 } } }
// validation: resolves to an existing {stop}_{mode}_{crew}_{bucket}.json; if absent → honest
// "not precomputed for this key" card, never an interpolated route.
```

Contract rules: one tool call per assistant turn; malformed or out-of-range args → the app rejects
with a visible reason string the copilot must relay; results embed the engine's constants hash so a
stale mission context is detectable.

## 8. Recommended in-scope AI feature list (small, honest, prioritized)

1. **P1 — Grounded science/dataset explanations.** Retrieval over a tiny local corpus we author
   (provenance cards, constants.json entries, FAQ). Lowest hallucination risk; direct Validity help.
2. **P2 — Voice mission setup.** "Set crew to two, 15 kilos, boxwork goal" → the four §7 tools on
   mission params only. High demo value; no engine dependency beyond stops.json presence checks.
3. **P3 — Route rationale with provenance.** Copilot explains an engine-computed route from its
   per-segment `cost_terms` + provenance cards ("detours 400 m to avoid a 17° slope — Derived from
   the 1 m DEM"). Ships only after B3 exists; numbers quoted, never invented.

All three ship behind the U4 team gate, disabled by default, with the static UI fully usable without
them (technical-approaches §6 guardrails; SI disclosure on the project page).

## 9. Sources (accessed 2026-11-13)

- Gemini models & deprecations: https://aistudio.google.com/docs/models (redirect target of
  ai.google.dev/gemini-api/docs/models) · pricing: https://ai.google.dev/gemini-api/docs/pricing
- Groq speech-to-text (whisper-large-v3 $0.111/h WER 10.3%; turbo $0.04/h WER 12%):
  https://console.groq.com/docs/speech-to-text
- Groq production LLMs (gpt-oss-120b/20b; llama models now Enterprise):
  https://console.groq.com/docs/models
- Secure-context requirement for getUserMedia / MediaRecorder:
  https://developer.mozilla.org/docs/Web/API/MediaDevices/getUserMedia

Companion: [`assistant-system-prompt.md`](assistant-system-prompt.md) (identity + guardrails the
backend must enforce).
