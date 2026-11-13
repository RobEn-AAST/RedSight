import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  Bot,
  Loader2,
  Mic,
  RotateCcw,
  Search,
  SendHorizonal,
  ShieldAlert,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'

import { Button } from '@/ui/Button'
import { LedDot } from '@/ui/LedDot'
import { cn } from '@/lib/cn'
import { useMission } from '@/lib/useMission'
import { useEngineData } from '@/lib/useEngineData'
import { totalLoadKg } from '@/types/mission'
import {
  copilotChatStream,
  copilotHealth,
  copilotReset,
  type ChatStreamEvent,
} from '@/lib/copilotClient'
import { ttsSpeak, ttsStop } from '@/copilot/tts'
import { useDictation } from '@/copilot/useDictation'
import type { ChatMessage, CopilotHealth, CopilotRequestContext } from '@/types/copilot'

let nextId = 1
function newMessage(role: ChatMessage['role'], text: string, delivery: ChatMessage['delivery']): ChatMessage {
  return { id: `m${nextId++}`, role, text, createdAt: new Date().toISOString(), delivery }
}

function message(text: string): ChatMessage {
  return newMessage('operator', text, 'local-only')
}

/**
 * Copilot dock — live chat + voice panel (voice-copilot-plan §2, wired
 * 2026-11-13). Streaming replies via the key-holding backend; dictation via
 * cloud Whisper or the in-browser fallback; spoken replies via Kokoro with a
 * speechSynthesis fallback. Every degraded state is honest: backend down →
 * messages stay local; no reply is ever faked.
 */
export function CopilotDock({
  onClose,
  autoFocusInput = false,
}: {
  onClose?: () => void
  /** Drawer variant focuses the composer on mount; the desktop dock must not
   *  hijack focus on page load. */
  autoFocusInput?: boolean
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [health, setHealth] = useState<CopilotHealth | null>(null)
  const [backendDown, setBackendDown] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [ttsEnabled, setTtsEnabled] = useState(() => localStorage.getItem('copilot-tts') === 'on')
  const [ttsEngine, setTtsEngine] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const ttsEnabledRef = useRef(ttsEnabled)
  useEffect(() => {
    ttsEnabledRef.current = ttsEnabled
  }, [ttsEnabled])

  const { state: mission } = useMission()
  const engine = useEngineData()

  useEffect(() => {
    if (autoFocusInput) inputRef.current?.focus()
  }, [autoFocusInput])

  // Health probe on mount + when the dock re-opens (props change re-mounts).
  useEffect(() => {
    const ctrl = new AbortController()
    void copilotHealth(ctrl.signal).then((h) => {
      setHealth(h)
      setBackendDown(h === null)
    })
    return () => ctrl.abort()
  }, [])

  // Keep the transcript pinned to the newest token while streaming.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  const dictation = useDictation(health, (text) => {
    setDraft((d) => (d ? `${d} ${text}` : text))
    inputRef.current?.focus()
  })

  const llmLive = health !== null && health.provider !== null

  const buildContext = useCallback((): CopilotRequestContext => {
    const available: string[] = []
    if (engine.probed) {
      available.push(engine.constants ? 'constants.json (model constants)' : 'constants: absent')
      available.push(engine.stops ? 'stops.json (route stops)' : 'stops: absent')
      available.push(engine.routeIndex ? 'routes (precomputed, per mode/crew/load)' : 'routes: absent')
      available.push(engine.hazards ? 'hazards.geojson' : 'hazards: absent')
      if (engine.cards.rad) available.push('cards/rad.json (RAD radiation)')
      if (engine.cards.rems) available.push('cards/rems.json (REMS weather)')
      if (engine.targets) available.push('targets.geojson (science targets)')
      if (engine.mock) available.push('NOTE: data files are marked _mock (mock data build)')
    }
    const missionState =
      mission.status === 'setup'
        ? null
        : {
            status: mission.status,
            crewCount: mission.config.crewCount,
            bodyMassKg: mission.config.bodyMassKg,
            loadKg: mission.config.loadKg,
            loadBasis: mission.config.loadBasis,
            totalLoadKg: totalLoadKg(mission.config),
            sampleKgPerStop: mission.config.sampleKgPerStop,
            roverAvailable: mission.config.roverAvailable,
            scienceGoalId: mission.config.scienceGoalId || null,
          }
    return { missionState, availableData: available }
  }, [engine, mission])

  const send = useCallback(async () => {
    const text = draft.trim()
    if (!text || streaming) return
    setDraft('')

    if (!llmLive) {
      // Honest offline path: keep the message locally, explain why.
      setMessages((m) => [...m, message(text)])
      setMessages((m) => [
        ...m,
        newMessage(
          'system',
          backendDown
            ? 'Copilot backend unreachable — message kept on this device only. Start it with: node server/index.mjs'
            : 'No AI provider key on the server — message kept on this device only. Add GROQ_API_KEY or GEMINI_API_KEY to server/.env.',
          'local-only',
        ),
      ])
      inputRef.current?.focus()
      return
    }

    const userMsg = message(text)
    userMsg.delivery = 'delivered'
    const replyId = `m${nextId++}`
    setMessages((m) => [
      ...m,
      userMsg,
      { id: replyId, role: 'copilot', text: '', createdAt: new Date().toISOString(), delivery: 'streaming' },
    ])
    setStreaming(true)
    ttsStop()

    const ctrl = new AbortController()
    abortRef.current = ctrl
    let finalText = ''
    const onEvent = (ev: ChatStreamEvent) => {
      setMessages((m) =>
        m.map((msg) => {
          if (msg.id !== replyId) return msg
          switch (ev.t) {
            case 'token':
              return { ...msg, text: msg.text + ev.v }
            case 'tool':
              return { ...msg, tool: { name: ev.name, resultCount: ev.resultCount } }
            case 'notice':
              return { ...msg, notice: ev.v }
            case 'done':
              return { ...msg, delivery: 'delivered' }
            case 'error':
              return { ...msg, delivery: 'error', text: msg.text || ev.message }
            default:
              return msg
          }
        }),
      )
      if (ev.t === 'token') finalText += ev.v
      if (ev.t === 'done') {
        setStreaming(false)
        abortRef.current = null
        if (ttsEnabledRef.current && finalText) {
          void ttsSpeak(finalText).then((e) => setTtsEngine(e))
        }
      }
      if (ev.t === 'error') {
        setStreaming(false)
        abortRef.current = null
      }
    }

    try {
      await copilotChatStream(text, buildContext(), onEvent, ctrl.signal)
    } catch (e) {
      setStreaming(false)
      abortRef.current = null
      const reason =
        e instanceof DOMException && e.name === 'AbortError'
          ? 'Stopped by operator.'
          : e instanceof Error
            ? e.message
            : 'Transport error.'
      setMessages((m) =>
        m.map((msg) => (msg.id === replyId ? { ...msg, delivery: 'error', text: msg.text || reason } : msg)),
      )
    } finally {
      inputRef.current?.focus()
    }
  }, [draft, streaming, llmLive, backendDown, buildContext])

  const cancelStream = () => {
    abortRef.current?.abort()
    ttsStop()
  }

  const clearAll = async () => {
    cancelStream()
    await copilotReset()
    setMessages([])
  }

  const toggleTts = () => {
    setTtsEnabled((on) => {
      const next = !on
      localStorage.setItem('copilot-tts', next ? 'on' : 'off')
      if (!next) ttsStop()
      return next
    })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  // Push-to-talk: Space toggles dictation when the dock has focus but the
  // composer does not (plan §2 — explicit, private, trivially cancellable).
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const inField = ['INPUT', 'TEXTAREA', 'BUTTON'].includes((e.target as HTMLElement)?.tagName ?? '')
      if (e.code === 'Space' && !inField) {
        e.preventDefault()
        dictation.toggle()
      }
      if (e.key === 'Escape' && dictation.state === 'recording') dictation.cancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dictation])

  const micLabel = {
    idle: 'Dictate (Space)',
    'requesting-permission': 'Requesting microphone…',
    'loading-model': dictation.modelProgress !== null ? `Loading local model ${dictation.modelProgress}%` : 'Loading local model…',
    recording: `Recording — ${dictation.elapsed}s / 30s (Space or click to stop)`,
    transcribing: 'Transcribing…',
    error: 'Voice error — click to retry',
    'permission-denied': 'Mic denied — click to retry',
  }[dictation.state]

  const badge = (() => {
    if (backendDown) return { tone: 'amber' as const, text: 'Backend down' }
    if (!llmLive) return { tone: 'amber' as const, text: 'No key — voice only' }
    return { tone: 'green' as const, text: `Live · ${health.provider === 'groq' ? 'Groq' : 'Gemini'}` }
  })()

  return (
    <div className="flex h-full min-h-0 flex-col border border-seam bg-panel shadow-panel">
      <header className="flex items-center gap-3 border-b border-seam bg-hull/60 px-4 py-2.5">
        <LedDot tone={badge.tone} pulse={badge.tone !== 'green'} />
        <h2 className="label-console flex items-center gap-2 text-ink">
          <Bot size={13} aria-hidden /> Copilot
        </h2>
        <span
          className={cn(
            'label-console border px-1.5 py-0.5 text-[10px]',
            badge.tone === 'green'
              ? 'border-go/40 bg-go/10 text-go'
              : 'border-caution/40 bg-caution/10 text-caution',
          )}
        >
          {badge.text}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={toggleTts}
            aria-pressed={ttsEnabled}
            aria-label={ttsEnabled ? 'Mute spoken replies' : 'Enable spoken replies'}
            title={ttsEnabled ? `Spoken replies on (${ttsEngine ?? 'kokoro → browser fallback'})` : 'Spoken replies off'}
            className={cn(
              'flex size-8 items-center justify-center transition-colors',
              ttsEnabled ? 'text-signal' : 'text-ink-faint hover:text-ink',
            )}
          >
            {ttsEnabled ? <Volume2 size={15} aria-hidden /> : <VolumeX size={15} aria-hidden />}
          </button>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => void clearAll()}
              aria-label="Clear conversation (local + server memory)"
              title="Clear conversation (local + server memory)"
              className="flex size-8 items-center justify-center text-ink-faint hover:text-ink"
            >
              <Trash2 size={14} aria-hidden />
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close copilot"
              className="flex size-8 items-center justify-center text-ink-faint hover:text-ink"
            >
              <X size={15} aria-hidden />
            </button>
          )}
        </div>
      </header>

      {/* Provider status notice — honest in every state */}
      <div className="flex items-start gap-2.5 border-b border-seam bg-inset/40 px-4 py-2.5">
        {backendDown ? (
          <ShieldAlert size={14} aria-hidden className="mt-0.5 flex-none text-caution" />
        ) : (
          <Bot size={14} aria-hidden className="mt-0.5 flex-none text-ink-faint" />
        )}
        <p className="text-[11px] leading-relaxed text-ink-dim">
          {backendDown ? (
            <>Backend unreachable — replies disabled; local dictation still works. Run{' '}
              <span className="data-readout text-ink-faint">node server/index.mjs</span> and retry.</>
          ) : llmLive ? (
            <>
              Streaming replies via the server-side key ({health.model}); it also runs the mission-data
              search tool{health.webSearch ? ' + grounded web search' : ''}. Dictation:{' '}
              {dictation.mode === 'cloud' ? 'cloud Whisper' : 'local Whisper (in-browser)'}.
              {dictation.mode === 'local' && ' First use downloads the model (~40 MB), then cached.'}
            </>
          ) : (
            <>No provider key on the server — local dictation works; replies need{' '}
              <span className="data-readout text-ink-faint">server/.env</span> with a Groq or Gemini key.</>
          )}{' '}
          Keys never ship in this client.
        </p>
      </div>

      {/* Transcript */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
        aria-label="Copilot transcript"
        role="log"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <p className="mt-6 text-center text-xs leading-relaxed text-ink-faint">
            Ask about the mission data (“what’s the O₂ reserve assumption?”), or propose changes in words
            (“set crew to two, fifteen kilos each”). Voice: hold nothing — press the mic or Space, speak,
            fix the transcript, send.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {messages.map((m) => (
              <li key={m.id} className="group flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="label-console text-ink-dim">
                    <span className="data-readout normal-case tracking-normal text-ink-faint">
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>{' '}
                    {m.role === 'operator' ? 'Operator' : m.role === 'copilot' ? 'Copilot' : 'System'}
                  </span>
                  {m.role === 'operator' && (
                    <span className="label-console text-[10px] text-go">{m.delivery === 'local-only' ? 'local only' : 'sent'}</span>
                  )}
                  {m.role === 'copilot' && m.delivery === 'streaming' && (
                    <span className="label-console flex items-center gap-1 text-[10px] text-signal">
                      <Loader2 size={10} className="animate-spin" aria-hidden /> streaming
                    </span>
                  )}
                  {m.role === 'copilot' && m.delivery === 'error' && (
                    <span className="label-console text-[10px] text-caution">error</span>
                  )}
                  {m.tool && (
                    <span className="label-console flex items-center gap-1 border border-seam-lit px-1.5 py-0.5 text-[10px] text-ink-dim">
                      <Search size={9} aria-hidden /> {m.tool.name} · {m.tool.resultCount} records
                    </span>
                  )}
                  {m.role === 'copilot' && m.delivery === 'delivered' && (
                    <button
                      type="button"
                      onClick={() => void ttsSpeak(m.text, (_s, e) => setTtsEngine(e)).then(setTtsEngine)}
                      aria-label="Speak this reply"
                      className="ml-auto flex size-6 items-center justify-center text-ink-faint opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <Volume2 size={11} aria-hidden />
                    </button>
                  )}
                </div>
                <p
                  className={cn(
                    'border px-3 py-2 text-sm leading-relaxed',
                    m.role === 'operator'
                      ? 'border-seam bg-inset/60 text-ink'
                      : m.role === 'system'
                        ? 'border-caution/30 bg-caution/5 text-ink-dim'
                        : 'border-seam-lit bg-hull/40 text-ink',
                  )}
                >
                  {m.text || <span className="text-ink-faint">…</span>}
                </p>
                {m.notice && (
                  <p className="border border-caution/40 bg-caution/10 px-2 py-1 text-[10px] text-caution">
                    {m.notice}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Dictation error line */}
      {dictation.error && (
        <p className="border-t border-caution/30 bg-caution/5 px-4 py-1.5 text-[11px] text-caution">
          {dictation.error}
        </p>
      )}

      {/* Composer */}
      <div className="border-t border-seam bg-hull/50 px-3 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={dictation.toggle}
            disabled={dictation.state === 'transcribing' || dictation.state === 'requesting-permission' || dictation.state === 'loading-model'}
            aria-label={micLabel}
            title={micLabel}
            className={cn(
              'relative flex size-11 flex-none items-center justify-center border transition-colors',
              dictation.state === 'recording'
                ? 'animate-pulse border-caution bg-caution/15 text-caution'
                : dictation.state === 'error' || dictation.state === 'permission-denied'
                  ? 'border-caution/50 text-caution'
                  : 'border-seam-lit text-ink-dim hover:border-signal/60 hover:text-signal disabled:opacity-40',
            )}
          >
            {dictation.state === 'recording' ? (
              <Square size={14} aria-hidden />
            ) : dictation.state === 'transcribing' ||
                dictation.state === 'requesting-permission' ||
                dictation.state === 'loading-model' ? (
              <Loader2 size={15} className="animate-spin" aria-hidden />
            ) : (
              <Mic size={16} aria-hidden />
            )}
            {dictation.state === 'recording' && (
              <span className="data-readout absolute -bottom-1.5 right-0 bg-void px-0.5 text-[9px] text-caution">
                {dictation.elapsed}s
              </span>
            )}
          </button>
          <input
            id="copilot-input"
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              dictation.state === 'recording' ? 'Listening… speak now' : 'Message the copilot…'
            }
            aria-label="Message the copilot"
            className="min-w-0 flex-1 border border-seam-lit bg-inset px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-signal/60 focus:outline-none"
          />
          {streaming ? (
            <Button size="md" onClick={cancelStream} aria-label="Stop generating">
              <Square size={14} aria-hidden />
            </Button>
          ) : (
            <Button size="md" onClick={() => void send()} disabled={!draft.trim()} aria-label="Send message">
              <SendHorizonal size={14} aria-hidden />
            </Button>
          )}
        </div>
        <p className="mt-2 flex items-center gap-2 text-[10px] leading-relaxed text-ink-faint">
          <RotateCcw size={9} aria-hidden className="flex-none" />
          English voice + text · streaming · cancellable. Modeled estimates only — this copilot is a
          prototype aid, not a safety system. TTS: {ttsEngine ?? (ttsEnabled ? 'kokoro → browser fallback' : 'off')}.
        </p>
      </div>
    </div>
  )
}
