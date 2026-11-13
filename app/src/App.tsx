import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, MotionConfig } from 'motion/react'
import { FileSearch, X } from 'lucide-react'

import { MissionProvider } from '@/lib/missionStore'
import { useMission } from '@/lib/useMission'
import { EngineDataProvider } from '@/lib/engineData'
import { useEngineData } from '@/lib/useEngineData'
import { MissionSetup } from '@/mission/MissionSetup'
import { MapWorkspace } from '@/map/MapWorkspace'
import { PlanProvider } from '@/map/planStore'
import { ProvenancePanel } from '@/provenance/ProvenancePanel'
import { cn } from '@/lib/cn'

/*
 * Two screens, in the order a crew uses them: answer the setup questions,
 * then see the routes. Data sources open over either screen.
 */

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden className="flex-none">
        <rect width="64" height="64" rx="10" fill="#0b0e13" />
        <circle cx="32" cy="32" r="17" fill="none" stroke="#e5484d" strokeWidth="2.5" opacity="0.9" />
        <circle cx="32" cy="32" r="9" fill="none" stroke="#e5484d" strokeWidth="1.5" opacity="0.45" />
        <circle cx="32" cy="32" r="3.2" fill="#ffb224" />
        <path d="M32 32 L46 18" stroke="#ffb224" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
      </svg>
      <span className="hidden font-display text-sm font-bold tracking-[0.18em] text-ink sm:inline">REDSIGHT</span>
    </div>
  )
}

function StepTabs({ onRoutes }: { onRoutes: () => void }) {
  const { state, reopenMission } = useMission()
  const active = state.status === 'active'
  const steps = [
    { label: 'Set up', current: !active, onClick: reopenMission, enabled: true },
    { label: 'Routes', current: active, onClick: onRoutes, enabled: active },
  ]
  return (
    <ol className="flex items-center gap-1" aria-label="Steps">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-center gap-1">
          <button
            type="button"
            onClick={s.onClick}
            disabled={!s.enabled}
            aria-current={s.current ? 'step' : undefined}
            className={cn(
              'label-console flex items-center gap-2 px-2.5 py-1.5 transition-colors disabled:cursor-default',
              s.current ? 'text-signal' : 'text-ink-dim hover:text-ink disabled:text-ink-faint disabled:hover:text-ink-faint',
            )}
          >
            <span
              className={cn(
                'data-readout flex size-5 items-center justify-center border text-[11px]',
                s.current ? 'border-signal bg-signal text-void' : 'border-seam-lit',
              )}
            >
              {i + 1}
            </span>
            <span className={cn('whitespace-nowrap', !s.current && 'hidden sm:inline')}>{s.label}</span>
          </button>
          {i < steps.length - 1 && <span aria-hidden className="h-px w-4 bg-seam-lit sm:w-8" />}
        </li>
      ))}
    </ol>
  )
}

function SourcesDialog({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-40 bg-void/75"
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Data sources"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
        className="fixed inset-x-3 bottom-3 top-14 z-50 mx-auto flex max-w-2xl flex-col sm:inset-x-6"
      >
        <div className="relative flex min-h-0 flex-1 flex-col">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close data sources"
            className="absolute right-2 top-1.5 z-10 flex size-9 items-center justify-center text-ink-dim hover:text-ink"
          >
            <X size={16} aria-hidden />
          </button>
          <ProvenancePanel />
        </div>
      </motion.div>
    </>
  )
}

function Console() {
  const { state, confirmMission } = useMission()
  const engine = useEngineData()
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const active = state.status === 'active'

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-void">
      <header className="flex flex-none items-center gap-3 border-b border-seam bg-hull px-3 py-2 sm:px-4">
        <BrandMark />
        <span className="hidden text-xs text-ink-dim md:inline">Gale crater · Mount Sharp</span>
        <div className="mx-auto">
          <StepTabs onRoutes={confirmMission} />
        </div>
        {engine.mock && (
          <span className="label-console hidden border border-scenario/50 px-1.5 py-0.5 text-[10px] text-scenario sm:inline">
            Mock data
          </span>
        )}
        <button
          type="button"
          onClick={() => setSourcesOpen(true)}
          className="label-console flex min-h-9 items-center gap-1.5 px-2 text-ink-dim hover:text-ink"
        >
          <FileSearch size={14} aria-hidden /> <span className="hidden sm:inline">Sources</span>
        </button>
      </header>

      <main className="relative min-h-0 flex-1 overflow-y-auto lg:overflow-hidden">
        {active ? <MapWorkspace onOpenSources={() => setSourcesOpen(true)} /> : <MissionSetup />}
      </main>

      <AnimatePresence>{sourcesOpen && <SourcesDialog onClose={() => setSourcesOpen(false)} />}</AnimatePresence>
    </div>
  )
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <EngineDataProvider>
        <MissionProvider>
          <PlanProvider>
            <Console />
          </PlanProvider>
        </MissionProvider>
      </EngineDataProvider>
    </MotionConfig>
  )
}
