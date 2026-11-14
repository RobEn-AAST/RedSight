import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  Bot,
  Loader2,
  Mic,
  Phone,
  PhoneOff,
  Search,
  SendHorizonal,
  ShieldAlert,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'

import { Astronaut } from './Astronaut'
import { Button } from '@/ui/Button'
import { LedDot } from '@/ui/LedDot'
import { cn } from '@/lib/cn'
import { useMission } from '@/lib/useMission'
import { useEngineData } from '@/lib/useEngineData'
import { totalLoadKg, perAstronautLoadKg } from '@/types/mission'
import { validateDynamicRoute, validateMissionPatch } from '@/copilot/actions'
import { scienceGoalOptions } from '@/lib/materials'
import { usePlan } from '@/map/usePlan'
import type { EngineRoute } from '@/lib/engineDataContext'
import {
  copilotChatStream,
  copilotActionResult,
  copilotHealth,
  copilotReset,
  type ChatStreamEvent,
} from '@/lib/copilotClient'
import { setTtsHealth, ttsSpeakStream, ttsStop, type StreamingSpeech } from '@/copilot/tts'
import { useDictation } from '@/copilot/useDictation'
import type { ChatMessage, CopilotHealth, CopilotRequestContext } from '@/types/copilot'

let nextId = 1
function newMessage(role: ChatMessage['role'], text: string, delivery: ChatMessage['delivery']): ChatMessage {
  return { id: `m${nextId++}`, role, text, createdAt: new Date().toISOString(), delivery }
}

type CallStatus = 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'gap'

/**
 * Copilot dock — live chat + voice panel (voice-copilot-plan §2, wired
 * 2026-11-13; speech-to-speech call mode added same day at the user's
 * request). Streaming replies via the key-holding backend; dictation via
 * cloud Whisper or the in-browser fallback; spoken replies via Groq cloud TTS
 * with the browser voice as the instant fallback. Every degraded state is
 * honest: backend down → messages stay local; no reply is ever faked.
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
  const [ttsEnabled, setTtsEnabled] = useState(() => localStorage.getItem('copilot-tts') !== 'off')
  const [ttsEngine, setTtsEngine] = useState<string | null>(null)
  const [callMode, setCallMode] = useState(false)
  const [avatarSpeaking, setAvatarSpeaking] = useState(false)
  const [callStatus, setCallStatus] = useState<CallStatus>('gap')

  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const handledActionIdsRef = useRef(new Set<string>())

  // Loop-control refs (stable across the dictation/tts callbacks).
  const callModeRef = useRef(callMode)
  const ttsEnabledRef = useRef(ttsEnabled)
  const streamingRef = useRef(streaming)
  const dictationStateRef = useRef<string>('idle')
  const listenRestart = useRef<(() => void) | null>(null)
  useEffect(() => {
    callModeRef.current = callMode
    ttsEnabledRef.current = ttsEnabled
    streamingRef.current = streaming
  }, [callMode, ttsEnabled, streaming])

  const speechSequence = useRef(0)
  const startSpeech = useCallback(() => {
    const sequence = ++speechSequence.current
    const speech = ttsSpeakStream((state) => {
      if (sequence !== speechSequence.current) return
      setAvatarSpeaking(state === 'speaking')
      if (state === 'speaking' && callModeRef.current) setCallStatus('speaking')
    })
    void speech.finished.then(() => {
      if (sequence === speechSequence.current) setAvatarSpeaking(false)
    })
    return speech
  }, [])
  const speakReply = (text: string) => {
    const speech = startSpeech()
    speech.push(text)
    speech.end()
    void speech.firstAudio.then(setTtsEngine)
  }

  const { state: mission } = useMission()
  const missionActions = useMission()
  const plan = usePlan()
  const actionStateRef = useRef({ mission, plan })
  actionStateRef.current = { mission, plan }
  const engine = useEngineData()

  useEffect(() => {
    if (autoFocusInput) inputRef.current?.focus()
  }, [autoFocusInput])

  // Health probe on mount; keep the tts module's engine ladder informed.
  useEffect(() => {
    const ctrl = new AbortController()
    void copilotHealth(ctrl.signal).then((h) => {
      setHealth(h)
      setBackendDown(h === null)
      setTtsHealth(h)
    })
    return () => ctrl.abort()
  }, [])

  // Keep the transcript pinned to the newest token while streaming.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

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
    }
    const missionState = {
            status: mission.status,
            crewCount: mission.config.crewCount,
            bodyMassKg: mission.config.bodyMassKg,
            loadKg: mission.config.loadKg,
            loadBasis: mission.config.loadBasis,
            totalLoadKg: totalLoadKg(mission.config),
            sampleKgPerStop: mission.config.sampleKgPerStop,
            roverAvailable: mission.config.roverAvailable,
            scienceGoalId: mission.config.scienceGoalId || null,
            selectedDestinationId: plan.selectedTargetId,
            routeMode: plan.mode,
            routePreference: mission.config.routePreference,
            routeSlopeCapDeg: mission.config.routeSlopeCapDeg,
            routeSlopeCapExplicit: mission.config.routeSlopeCapExplicit,
            routeLoadKg: perAstronautLoadKg(mission.config),
            availableDestinations: plan.goalTargets.map(({ id, name, badge }) => ({id,name,badge})),
            availableScienceGoals: scienceGoalOptions.map(({ id, label }) => ({id,label})),
            availableLayers: (engine.layers ?? []).filter((layer) => layer.available).map(({ id, name, badge }) => ({id,name,badge})),
          }
    return { missionState, availableData: available }
  }, [engine, mission, plan])

  /** Core send used by both the composer and the voice-call loop. */
  const sendText = useCallback(
    async (text: string) => {
      const clean = text.trim()
      if (!clean || streamingRef.current) return

      if (!llmLive) {
        setMessages((m) => [
          ...m,
          newMessage('operator', clean, 'local-only'),
          newMessage(
            'system',
            backendDown
              ? 'Copilot backend unreachable — message kept on this device only. Start it with: node server/index.mjs'
              : 'No AI provider key on the server — message kept on this device only. Add GROQ_API_KEY or GEMINI_API_KEY to server/.env.',
            'local-only',
          ),
        ])
        return
      }

      const userMsg = newMessage('operator', clean, 'delivered')
      const replyId = `m${nextId++}`
      setMessages((m) => [
        ...m,
        userMsg,
        { id: replyId, role: 'copilot', text: '', createdAt: new Date().toISOString(), delivery: 'streaming' },
      ])
      setStreaming(true)
      setCallStatus('thinking')
      ttsStop()

      const ctrl = new AbortController()
      abortRef.current = ctrl
      const wantSpeech = callModeRef.current || ttsEnabledRef.current
      // Streaming TTS: sentences synthesize while the LLM is still generating,
      // so first audio starts seconds before the reply completes.
      const speech: StreamingSpeech | null = wantSpeech
        ? startSpeech()
        : null
      speech?.firstAudio.then((engine) => setTtsEngine(engine))
      speech?.finished.then(() => {
        // Speech done → hand the floor back to the operator (call loop).
        if (callModeRef.current) {
          setCallStatus('gap')
          window.setTimeout(() => {
            if (callModeRef.current && !streamingRef.current && dictationStateRef.current === 'idle') {
              listenRestart.current?.()
            }
          }, 300)
        }
      })

      const executeAction = async (ev: Extract<ChatStreamEvent, { t: 'action' }>) => {
        if (ctrl.signal.aborted) return
        let result: Record<string, unknown>
        try {
          const a = ev.args
          const latest = actionStateRef.current
          if (ev.name === 'set_mission_screen') {
            if (a.screen === 'setup') missionActions.reopenMission()
            else if (a.screen === 'routes' && latest.mission.config.scienceGoalId) missionActions.confirmMission()
            else throw new Error('Choose a science goal before opening routes.')
            result = { applied:true, screen:a.screen }
          } else if (ev.name === 'set_oxygen_budget') {
            const budget = latest.plan.activeRoute?.budget_l
            if (typeof a.litres !== 'number' || !Number.isFinite(a.litres) || budget === undefined || a.litres < 0 || a.litres > budget) throw new Error('Oxygen budget must be within the active route usable budget, in litres.')
            latest.plan.setO2BudgetL(a.litres)
            result = { applied:true, usableBudgetL:a.litres, maximumBudgetL:budget }
          } else if (ev.name === 'set_mission') {
            const error = validateMissionPatch(a)
            if (error) throw new Error(error)
            missionActions.patchConfig(a as never)
            result = { applied:true, mission:{...latest.mission.config,...a}, status:latest.mission.status }
          } else if (ev.name === 'select_destination') {
            const target = latest.plan.goalTargets.find((t) => t.id === a.id)
            if (!target) throw new Error('Destination ID is not an available target for this mission.')
            latest.plan.selectTarget(target.id)
            result = { applied:true, selectedDestination:{id:target.id,name:target.name,badge:target.badge} }
          } else if (ev.name === 'set_layer') {
            const layer = (engine.layers ?? []).find((l) => l.id === a.id && l.available)
            if (!layer || typeof a.visible !== 'boolean') throw new Error('Layer ID is unavailable or visibility is not boolean.')
            plan.setLayerVisibility(layer.id, a.visible)
            result = { applied:true, layer:{id:layer.id,name:layer.name,visible:a.visible,badge:layer.badge} }
          } else if (ev.name === 'set_route_preference' || ev.name === 'reset_route_constraints') {
            const preference = ev.name === 'reset_route_constraints' ? 'fastest' : a.mode
            if (!['fastest','safest','balanced'].includes(String(preference))) throw new Error('Unsupported route preference.')
            const route = ev.route as unknown as EngineRoute | undefined
            const config = latest.mission.config
            const targetIds = latest.plan.goalTargets.map((target) => target.id)
            const slopeCapDeg = ev.name === 'reset_route_constraints' ? 15 : (typeof a.slopeCapDeg === 'number' ? a.slopeCapDeg : config.routeSlopeCapDeg)
            if (!validateDynamicRoute(route, preference as 'fastest'|'safest'|'balanced', targetIds, slopeCapDeg)) throw new Error('The routing service returned incomplete, mismatched or unsupported route data; the current route was retained.')
            const destination = latest.plan.goalTargets.find((target) => target.id === route.stop)
            if (!route || !destination) throw new Error('Route destination is not available to this mission; the current route was retained.')
            if (a.destinationId === undefined && route.stop !== latest.plan.selectedTargetId) throw new Error('The selected destination changed while the route was being calculated; the stale route was discarded.')
            if (config.roverAvailable) throw new Error('Rover availability changed while the route was being calculated; the foot-only route was discarded.')
            if (route.crew !== config.crewCount || route.routing?.body_mass_kg !== config.bodyMassKg || route.routing?.load_kg_per_astronaut !== perAstronautLoadKg(config) || route.routing?.sample_kg_per_stop !== config.sampleKgPerStop) throw new Error('Mission values changed while the route was being calculated; the stale route was discarded.')
            if (slopeCapDeg < 0 || slopeCapDeg > 15) throw new Error('Slope cap must be 0–15 degrees; the model hard limit remains 15 degrees.')
            missionActions.patchConfig({ routePreference:preference as 'fastest'|'safest'|'balanced', routeSlopeCapDeg:slopeCapDeg, routeSlopeCapExplicit:ev.name === 'reset_route_constraints' ? false : (typeof a.slopeCapDeg === 'number' || config.routeSlopeCapExplicit) })
            if (route.stop !== latest.plan.selectedTargetId) latest.plan.selectTarget(route.stop)
            latest.plan.applyDynamicRoute(route)
            result = { applied:true, preference, selectedCandidate:route.mode, routeId:route.id, metrics:{total_s:route.total_s,distance_m:route.distance_m,budget_l:route.budget_l,pnr_index:route.pnr_index}, routing:route.routing, goalAccess:route.goal_access, routeSlopeCapExplicit:ev.name === 'reset_route_constraints' ? false : (typeof a.slopeCapDeg === 'number' || mission.config.routeSlopeCapExplicit) }
          } else throw new Error('Unsupported command.')
        } catch (error) { result = { applied:false, error:error instanceof Error ? error.message : 'Command failed.' } }
        try { await copilotActionResult(ev.callId, result) } catch { /* Stale/aborted stream: do not retry an action. */ }
      }
      const onEvent = (ev: ChatStreamEvent) => {
        if (ev.t === 'action' && !handledActionIdsRef.current.has(ev.callId)) {
          handledActionIdsRef.current.add(ev.callId)
          void executeAction(ev)
        }
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
        if (ev.t === 'token') speech?.push(ev.v)
        if (ev.t === 'done') {
          setStreaming(false)
          abortRef.current = null
          speech?.end()
          if (!callModeRef.current) inputRef.current?.focus()
        }
        if (ev.t === 'error') {
          setStreaming(false)
          abortRef.current = null
          speech?.stop()
          if (callModeRef.current) {
            setCallStatus('gap')
            listenRestart.current?.()
          }
        }
      }

      try {
        await copilotChatStream(clean, buildContext(), onEvent, ctrl.signal, callModeRef.current)
      } catch (e) {
        setStreaming(false)
        abortRef.current = null
        speech?.stop()
        const reason =
          e instanceof DOMException && e.name === 'AbortError'
            ? 'Stopped by operator.'
            : e instanceof Error
              ? e.message
              : 'Transport error.'
        setMessages((m) =>
          m.map((msg) => (msg.id === replyId ? { ...msg, delivery: 'error', text: msg.text || reason } : msg)),
        )
        if (callModeRef.current) {
          setCallStatus('gap')
          listenRestart.current?.()
        }
      }
    },
    [llmLive, backendDown, buildContext, missionActions, mission, plan, engine, startSpeech],
  )

  const send = () => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    void sendText(text)
  }

  const cancelStream = () => {
    abortRef.current?.abort()
    ttsStop()
  }

  const clearAll = async () => {
    endCall()
    handledActionIdsRef.current.clear()
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

  /* ------------------------------------------------------ voice call mode -- */

  const dictation = useDictation(
    health,
    (text) => {
      // In a call, transcripts auto-send (hands-free); in chat they land in
      // the editable composer per plan §2 (nothing sends on voice alone).
      if (callModeRef.current) {
        if (text.trim()) void sendText(text)
        else listenRestart.current?.() // silence → keep listening
      } else {
        setDraft((d) => (d ? `${d} ${text}` : text))
        inputRef.current?.focus()
      }
    },
    // Call mode: silence detection ends each utterance automatically — the
    // pipeline starts the moment the operator pauses (no click per turn).
    { autoStopOnSilenceMs: callMode ? 750 : undefined },
  )

  dictationStateRef.current = dictation.state
  useEffect(() => {
    if (callMode && dictation.state === 'recording') setCallStatus('listening')
    if (callMode && dictation.state === 'transcribing') setCallStatus('transcribing')
  }, [callMode, dictation.state])

  const startListening = useCallback(() => {
    if (dictation.state === 'idle' || dictation.state === 'error' || dictation.state === 'permission-denied') {
      dictation.toggle()
    }
  }, [dictation])
  listenRestart.current = startListening

  const startCall = () => {
    setCallMode(true)
    setCallStatus('gap')
    ttsStop()
    window.setTimeout(() => listenRestart.current?.(), 150)
  }

  function endCall() {
    setCallMode(false)
    setCallStatus('gap')
    ttsStop()
    dictation.cancel()
  }

  const micClick = () => {
    if (callMode) {
      // Barge-in: interrupt the spoken reply and take the floor.
      if (callStatus === 'speaking') ttsStop()
      if (dictation.state === 'recording') dictation.toggle()
      else startListening()
    } else {
      dictation.toggle()
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  // Space = push-to-talk outside fields; Escape stops recording / ends a call.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const inField = ['INPUT', 'TEXTAREA', 'BUTTON'].includes((e.target as HTMLElement)?.tagName ?? '')
      if (e.code === 'Space' && !inField) {
        e.preventDefault()
        micClick()
      }
      if (e.key === 'Escape') {
        if (callModeRef.current) endCall()
        else if (dictation.state === 'recording') dictation.cancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dictation, callMode, callStatus])

  const micLabel = callMode
    ? {
        listening: `Listening — pauses automatically when you stop speaking (click to send now, Esc to end)`,
        transcribing: 'Transcribing…',
        thinking: 'Thinking… (click to interrupt the reply)',
        speaking: 'Speaking — click to interrupt',
        gap: 'Starting…',
      }[callStatus]
    : {
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
        <LedDot tone={callMode ? 'cyan' : badge.tone} pulse={callMode || badge.tone !== 'green'} />
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
            disabled={callMode}
            aria-pressed={ttsEnabled}
            aria-label={ttsEnabled ? 'Mute spoken replies' : 'Enable spoken replies'}
            title={ttsEnabled ? `Spoken replies on (${ttsEngine ?? 'cloud → browser voice'})` : 'Spoken replies off'}
            className={cn(
              'flex size-8 items-center justify-center transition-colors disabled:opacity-30',
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

      <Astronaut state={avatarSpeaking ? 'speaking' : dictation.state === 'recording' ? 'listening' : streaming ? 'thinking' : 'idle'} />

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
              Streaming replies via the server-side key ({health.model}); mission-data search
              {health.webSearch ? ' + grounded web search' : ''}. Dictation:{' '}
              {dictation.mode === 'cloud' ? 'cloud Whisper' : 'local Whisper (in-browser)'}. Voice:{' '}
              {ttsEngine === 'groq-cloud' ? 'Groq cloud' : ttsEngine === 'kokoro' ? 'Kokoro local' : 'browser voice'}.
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
            Ask about the mission data (“what’s the O₂ reserve assumption?”), propose changes in words
            (“set crew to two, fifteen kilos each”), or start a voice call — press the phone button and
            just talk; the copilot answers out loud, hands-free.
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
                      onClick={() => speakReply(m.text)}
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
      {dictation.error && !callMode && (
        <p className="border-t border-caution/30 bg-caution/5 px-4 py-1.5 text-[11px] text-caution">
          {dictation.error}
        </p>
      )}

      {/* Voice-call banner */}
      {callMode && (
        <div className="flex items-center gap-3 border-t border-observed/40 bg-observed/10 px-4 py-2.5">
          <LedDot tone="cyan" pulse />
          <span className="label-console text-ink">
            Voice call —{' '}
            {callStatus === 'listening'
              ? `listening (${dictation.elapsed}s)`
              : callStatus === 'transcribing'
                ? 'transcribing…'
                : callStatus === 'thinking'
                  ? 'thinking…'
                  : callStatus === 'speaking'
                    ? 'speaking…'
                    : 'standby'}
          </span>
          <span className="text-[10px] text-ink-faint">click mic to barge in · Esc to end</span>
          <button
            type="button"
            onClick={endCall}
            aria-label="End voice call"
            title="End voice call (Esc)"
            className="label-console ml-auto flex items-center gap-1.5 border border-caution/50 bg-caution/15 px-2.5 py-1.5 text-caution hover:bg-caution hover:text-void"
          >
            <PhoneOff size={13} aria-hidden /> End
          </button>
        </div>
      )}

      {/* Composer */}
      <div className="border-t border-seam bg-hull/50 px-3 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={micClick}
            disabled={dictation.state === 'transcribing' || dictation.state === 'requesting-permission' || dictation.state === 'loading-model'}
            aria-label={micLabel}
            title={micLabel}
            className={cn(
              'relative flex size-11 flex-none items-center justify-center border transition-colors',
              dictation.state === 'recording'
                ? 'animate-pulse border-caution bg-caution/15 text-caution'
                : callMode && callStatus === 'speaking'
                  ? 'border-observed/60 bg-observed/15 text-observed'
                  : callMode
                    ? 'border-observed/50 text-observed'
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
            disabled={callMode}
            placeholder={
              callMode
                ? `Voice call active — ${callStatus}…`
                : dictation.state === 'recording'
                  ? 'Listening… speak now'
                  : 'Message the copilot…'
            }
            aria-label="Message the copilot"
            className="min-w-0 flex-1 border border-seam-lit bg-inset px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-signal/60 focus:outline-none disabled:opacity-50"
          />
          {callMode ? (
            <Button size="md" onClick={endCall} aria-label="End voice call">
              <PhoneOff size={14} aria-hidden />
            </Button>
          ) : streaming ? (
            <Button size="md" onClick={cancelStream} aria-label="Stop generating">
              <Square size={14} aria-hidden />
            </Button>
          ) : (
            <>
              <Button
                size="md"
                onClick={startCall}
                disabled={!llmLive}
                aria-label="Start voice call — speech to speech"
                title={llmLive ? 'Voice call — talk hands-free, replies spoken (Esc to end)' : 'Needs a configured provider'}
                className="flex-none"
              >
                <Phone size={14} aria-hidden />
              </Button>
              <Button size="md" onClick={send} disabled={!draft.trim()} aria-label="Send message">
                <SendHorizonal size={14} aria-hidden />
              </Button>
            </>
          )}
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-ink-faint">
          {callMode
            ? 'Speech-to-speech: speak → it answers out loud → listening resumes automatically. Modeled estimates only — prototype aid, not a safety system.'
            : 'English voice + text · streaming · cancellable · phone button = hands-free voice call. Modeled estimates only — prototype aid, not a safety system.'}
        </p>
      </div>
    </div>
  )
}
