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
| `POST /api/copilot/chat` | SSE stream: `meta` → `token`* → `tool`? → `notice`? → `done` \| `error`; server-side memory per session id (`X-Copilot-Session` header) |
| `POST /api/copilot/reset` | forget a session's memory |

The chat endpoint builds the system prompt server-side (`prompt.mjs` — the runtime source of
truth, ported from `docs/ai/assistant-system-prompt.md`) and executes the copilot's ONE tool,
`search_mission_knowledge`, over `app/public/data` (`search.mjs`). The LLM can only *request*
the tool; unknown tools are refused.

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
