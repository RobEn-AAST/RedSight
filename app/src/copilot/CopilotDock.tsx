import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Bot, Mic, SendHorizonal, Trash2, X, ShieldAlert } from 'lucide-react'

import { Button } from '@/ui/Button'
import { LedDot } from '@/ui/LedDot'
import { cn } from '@/lib/cn'
import type { ChatMessage } from '@/types/copilot'

let nextId = 1

function newMessage(text: string): ChatMessage {
  return {
    id: `m${nextId++}`,
    role: 'operator',
    text,
    createdAt: new Date().toISOString(),
    delivery: 'queued-no-provider',
  }
}

/**
 * Copilot dock — chat panel with honest states only. No provider is configured
 * in this build, so nothing is answered, transcribed, or sent anywhere: the
 * transcript is local browser state and every message is marked undelivered.
 * Provider plan + future tool contracts: docs/ai/voice-copilot-plan.md.
 */
export function CopilotDock({
  onClose,
  autoFocusInput = false,
}: {
  onClose?: () => void
  /** Drawer variant focuses the composer on mount; the desktop dock does not
   *  (it must never hijack focus on page load). */
  autoFocusInput?: boolean
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocusInput) inputRef.current?.focus()
  }, [autoFocusInput])

  const send = () => {
    const text = draft.trim()
    if (!text) return
    setMessages((m) => [...m, newMessage(text)])
    setDraft('')
    inputRef.current?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col border border-seam bg-panel shadow-panel">
      <header className="flex items-center gap-3 border-b border-seam bg-hull/60 px-4 py-2.5">
        <LedDot tone="off" />
        <h2 className="label-console flex items-center gap-2 text-ink">
          <Bot size={13} aria-hidden /> Copilot
        </h2>
        <span className="label-console border border-unavailable/40 bg-unavailable-soft px-1.5 py-0.5 text-[10px] text-unavailable">
          Not configured
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close copilot"
            className="ml-auto flex size-8 items-center justify-center text-ink-faint hover:text-ink"
          >
            <X size={15} aria-hidden />
          </button>
        )}
      </header>

      {/* Provider status notice */}
      <div className="flex items-start gap-2.5 border-b border-seam bg-unavailable-soft/40 px-4 py-3">
        <ShieldAlert size={14} aria-hidden className="mt-0.5 flex-none text-unavailable" />
        <p className="text-[11px] leading-relaxed text-ink-dim">
          No AI provider is configured. STT + LLM integration (Google Gemini or Groq), key handling,
          and latency budgets are planned in{' '}
          <span className="data-readout text-ink-faint">docs/ai/voice-copilot-plan.md</span>. Keys
          stay server-side — nothing ships in this client bundle. Until a backend exists, messages
          stay on this device and receive no synthesized answers.
        </p>
      </div>

      {/* Transcript */}
      <div
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
        aria-label="Copilot transcript"
        role="log"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <p className="mt-6 text-center text-xs leading-relaxed text-ink-faint">
            Transcript is empty and local-only. Messages you send are marked undelivered until a
            provider is connected — this panel will never fake an assistant reply.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {messages.map((m) => (
              <li key={m.id} className="group flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="label-console text-ink-dim">
                    <span className="data-readout normal-case tracking-normal text-ink-faint">
                      {new Date(m.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>{' '}
                    Operator
                  </span>
                  <span className="label-console text-[10px] text-caution">undelivered</span>
                  <button
                    type="button"
                    onClick={() => setMessages((list) => list.filter((x) => x.id !== m.id))}
                    aria-label={`Delete message: ${m.text.slice(0, 40)}`}
                    className="ml-auto flex size-7 items-center justify-center text-ink-faint opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 size={12} aria-hidden />
                  </button>
                </div>
                <p className="border border-seam bg-inset/60 px-3 py-2 text-sm leading-relaxed text-ink">
                  {m.text}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-seam bg-hull/50 px-3 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled
            aria-label="Voice input — pending provider configuration"
            title="Voice input pending provider configuration"
            className="flex size-11 flex-none items-center justify-center border border-seam-lit text-ink-faint opacity-40"
          >
            <Mic size={16} aria-hidden />
          </button>
          <input
            id="copilot-input"
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Message the copilot…"
            aria-label="Message the copilot"
            className="min-w-0 flex-1 border border-seam-lit bg-inset px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-signal/60 focus:outline-none"
          />
          <Button size="md" onClick={send} disabled={!draft.trim()} aria-label="Send message">
            <SendHorizonal size={14} aria-hidden />
          </Button>
        </div>
        <p className={cn('mt-2 text-[10px] leading-relaxed text-ink-faint')}>
          Planned: English voice + text, streaming replies, cancel mid-utterance. TTS not requested —
          deferred.
        </p>
      </div>
    </div>
  )
}
