# Copilot backend — run notes

The key-holding backend for the RedSight copilot (`docs/ai/voice-copilot-plan.md` §6, wired
2026-11-13). One zero-dependency Node process (Node ≥ 18): no `npm install` needed here.

## Run

```bash
node server/index.mjs            # http://127.0.0.1:8788
# or from app/: npm run dev:copilot
```

- **Dev:** run this + `npm run dev` in `app/` — Vite proxies `/api/*` here.
- **Demo/production:** `npm run build` in `app/` first; this process then serves `app/dist`
  itself (one process, SPA fallback included).

## Adding the key (server-side only — never in the client)

```bash
cp server/.env.example server/.env   # then edit
```

`server/.env` is git-ignored. Set **one** of:

| Var | Unlocks | Notes |
|---|---|---|
| `GROQ_API_KEY` | chat (`openai/gpt-oss-120b`) **+ cloud STT** (`whisper-large-v3-turbo`) | one vendor, one key — the plan's default |
| `GEMINI_API_KEY` | chat (`gemini-3.6-flash`) + native Google-Search grounding | no cloud STT; dictation falls back to the in-browser Whisper |

Groq keys start `gsk_`, Gemini keys start `AIza` — anything else is treated as not configured
(guards against same-named variables from other tools). Optional overrides: `GROQ_MODEL`,
`GEMINI_MODEL`, `STT_MODEL`, `GEMINI_WEB_SEARCH`, `PORT`, `HOST`, `ALLOWED_ORIGINS` (CSV —
add your deployed origin in production).

## Endpoints

| Route | What |
|---|---|
| `GET /api/copilot/health` | which provider/STT/model are configured — never the key |
| `POST /api/copilot/stt` | audio blob (≤12 MB) → `{text}` (Groq Whisper, English pinned) |
| `POST /api/copilot/chat` | SSE stream: `meta` → `token`* → `action`? → `tool`? → `notice`? → `done` \| `error`; server-side memory per session id (`X-Copilot-Session` header) |
| `POST /api/copilot/action-result` | App returns applied/failed state for a streamed command UUID; stale and duplicate results are rejected |
| `POST /api/copilot/reset` | forget a session's memory |

The chat endpoint builds the system prompt server-side (`prompt.mjs`) and exposes typed mission,
destination, layer, route and knowledge-search functions. The app validates UI actions and returns
actual applied state before the model finishes its reply. Routing calls the FastAPI engine service.

## Native terrain routing service

Install Python API/runtime dependencies with `python3 -m pip install -r engine/requirements-api.txt`.
Provide the ignored SHA-256-checked native terrain bundle at
`data/raw/engine-pilot/input-manifest.json` (or set `REDSIGHT_ENGINE_MANIFEST`). Start FastAPI and
Node in separate terminals:

```bash
uvicorn engine.api:app --host 127.0.0.1 --port 8790
node server/index.mjs
```

Node connects to `ROUTING_API_URL` (default `http://127.0.0.1:8790`). FastAPI admits one CPU-bound
request at a time to a persistent worker that caches verified terrain arrays. It computes fastest,
lowest-modeled-hazard or balanced paths under the requested slope constraint. Dynamic responses carry
full same-path directed return time/O₂ arrays and PNR; alternate `back_fast` is omitted, so no
separate fastest-return switch is claimed. Missing terrain is reported as unavailable; the service
never substitutes static presets or mock data. See
[`../docs/ai/function-execution.md`](../docs/ai/function-execution.md) for constraint details.

## Security posture

- Keys never reach the client bundle, logs, or error messages; `.env` is git-ignored.
- CORS allowlist (dev origins + `ALLOWED_ORIGINS`); requests with a foreign `Origin` get 403.
- Per-IP token-bucket rate limit (each STT call costs 10× a chat token — cost guard).
- Body caps (audio 12 MB, JSON 64 KB), message length cap, session-id pattern check.
- Upstream timeouts, SSE heartbeat, abort passthrough on client disconnect.
- Request bodies are never logged (privacy default); access lines carry method/path/status only.

## Latency architecture (2026-11-14 rework — measured)

A trivial voice lookup took **13.5s to first visible token**: gpt-oss at default
`medium` reasoning effort generates thousands of hidden thinking tokens, and TTS
waited for the full reply. The rework overlaps every stage:

| Stage | Text chat | Voice call |
|---|---|---|
| STT | manual stop → cloud Whisper | **VAD auto-stop on 750 ms silence** → transcription starts the instant the operator pauses |
| LLM | `gpt-oss-120b`, low reasoning | **`gpt-oss-20b` + `reasoning_format: hidden` + 350-token cap**; answers from CONTEXT first, search tool only for missing facts |
| TTS | speaks on done (toggle) | **sub-sentence streaming**: sentences cut from the live token stream, synthesized in parallel, played in order — first audio starts while the LLM is still generating |

Measured after (same question): first token **0.46 s** (no tool) / **2.0 s** (with
search-tool round); full reply ≈ first token + 0.05 s. End-to-end voice turn ≈
STT (~0.5–1 s) + first token + first audio (~0.5 s, overlapped) ≈ **1.5–3 s**.

## Honest deviations from the plan docs (dated 2026-11-13, wiring session)

1. **TTS was added** — the plan had deferred it; the user requested it. Kokoro-82M runs fully
   in-browser (`kokoro-js`, q8 ≈ 80 MB, cached; browser `speechSynthesis` fallback). No audio
   leaves the device; the backend has no TTS endpoint.
2. **Local STT fallback was built** (plan said "deferred"): `onnx-community/whisper-tiny.en`
   via transformers.js in a Web Worker — used automatically when no Groq key is set.
3. **Honesty filter flags instead of regenerating** (`assistant-system-prompt.md` note 4):
   the server detects banned phrases post-stream and emits a `notice` event rather than a
   second completion — a voice loop must stay single-pass. The strict prompt + low temperature
   remain the primary defense.
4. **Web search**: Gemini path only (native Google-Search grounding, `GEMINI_WEB_SEARCH`).
   The plan's "local corpus only" posture holds on Groq.

## Bundle note

`app/dist` now includes the ONNX WASM runtimes (~48 MB, lazy-fetched only when voice is used).
They make the build self-contained/offline for the demo; if the static deploy must shrink,
point `env.backends.onnx.wasm.wasmPaths` at a CDN instead (transformers.js docs).

## Gemini Live voice calls (2026-11-14)

With `GEMINI_API_KEY` set (`AIza…` or `AQ.…`), the call button uses **Gemini Live**
(`GEMINI_LIVE_MODEL`, default `gemini-3.1-flash-live-preview`) instead of the STT → chat → TTS loop.
Lowest-latency path: the browser streams 16 kHz PCM straight to Google over one WebSocket and plays the
24 kHz reply; Google's voice-activity detection ends turns after 300 ms of silence and lets the operator
interrupt.

- `POST /api/copilot/live/token` creates a single-use ephemeral token (30 min, new session within 60 s) with
  the model, the server system prompt (voice mode + current mission state), the tool list and VAD settings
  **locked in**. The API key never reaches the browser and the client cannot change the prompt or tools.
- `POST /api/copilot/live/tool` runs `search_mission_knowledge` here and computes native-terrain routes for
  route actions; the app validates and applies every action with the same code as text chat and returns the
  authoritative result to the model.
- Text chat keeps the existing provider order (Groq first). Optional `GEMINI_LIVE_VOICE` picks a prebuilt voice.
