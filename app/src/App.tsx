import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, MotionConfig } from 'motion/react'
import { ClipboardList, Map as MapIcon, FileSearch, Menu } from 'lucide-react'

import { MissionProvider } from '@/lib/missionStore'
import { useMission } from '@/lib/useMission'
import { EngineDataProvider } from '@/lib/engineData'
import { MissionWorkspace } from '@/mission/MissionWorkspace'
import { MapWorkspace } from '@/map/MapWorkspace'
import { ProvenancePanel } from '@/provenance/ProvenancePanel'
import { PlanProvider } from '@/map/planStore'
import { LedDot } from '@/ui/LedDot'
import { KeyHint } from '@/ui/KeyHint'
import { EvidenceBadge } from '@/ui/Badge'
import { cn } from '@/lib/cn'

// Tier 1 workspaces only. The routes text page is replaced by the route cards
// on the map; HUD (Tier 2) and the copilot (out of this hackathon, D12) stay
// in the repo but are not mounted until Tier 1 has shipped.
const WORKSPACES = [
  { id: 'mission', label: 'Mission', icon: ClipboardList },
  { id: 'map', label: 'Map', icon: MapIcon },
  { id: 'provenance', label: 'Provenance', icon: FileSearch },
] as const

type WorkspaceId = (typeof WORKSPACES)[number]['id']

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(t)
  }, [])
  return now
}

function BrandMark({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden className="flex-none">
        <rect width="64" height="64" rx="10" fill="#0b0e13" />
        <rect x="4" y="4" width="56" height="56" rx="8" fill="none" stroke="#232b36" strokeWidth="2" />
        <circle cx="32" cy="32" r="17" fill="none" stroke="#e5484d" strokeWidth="2.5" opacity="0.9" />
        <circle cx="32" cy="32" r="9" fill="none" stroke="#e5484d" strokeWidth="1.5" opacity="0.45" />
        <circle cx="32" cy="32" r="3.2" fill="#ffb224" />
        <path d="M32 32 L46 18" stroke="#ffb224" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
      </svg>
      <div className="flex flex-col">
        <span className="font-display text-base font-bold tracking-[0.18em] text-ink">REDSIGHT</span>
        {!compact && (
          <span className="label-console text-[9px] text-ink-faint">
            Marswalk mission console
          </span>
        )}
      </div>
    </div>
  )
}

function MissionStatusBlock() {
  const { state } = useMission()
  const active = state.status === 'active'
  return (
    <div className="border border-seam bg-inset/50 px-3 py-3">
      <div className="flex items-center gap-2">
        <LedDot tone={active ? 'green' : 'amber'} pulse />
        <span className="label-console text-ink">{active ? 'Mission active' : 'Mission setup'}</span>
      </div>
      <dl className="data-readout mt-2.5 flex flex-col gap-1 text-[11px] text-ink-dim">
        <div className="flex justify-between gap-2">
          <dt className="text-ink-faint">Crew</dt>
          <dd>{state.config.crewCount}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-ink-faint">Rover</dt>
          <dd>{state.config.roverAvailable ? 'yes' : 'no'}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-ink-faint">Site</dt>
          <dd className="truncate">Gale · Mt Sharp</dd>
        </div>
      </dl>
    </div>
  )
}

function ClockBlock() {
  const now = useClock()
  const { state } = useMission()
  const confirmed = state.config.confirmedAt
  const elapsed = confirmed ? Math.max(0, now.getTime() - new Date(confirmed).getTime()) : null
  const hh = elapsed ? String(Math.floor(elapsed / 3_600_000)).padStart(2, '0') : null
  const mm = elapsed ? String(Math.floor((elapsed % 3_600_000) / 60_000)).padStart(2, '0') : null
  const ss = elapsed ? String(Math.floor((elapsed % 60_000) / 1000)).padStart(2, '0') : null

  return (
    <div className="border-t border-seam px-5 py-4">
      <p className="label-console text-ink-faint">UTC · Earth</p>
      <p className="data-readout mt-1 text-lg text-ink" aria-label="Current UTC time">
        {now.toISOString().slice(11, 19)}
      </p>
      <p className="data-readout mt-1 text-[11px] text-ink-faint">
        {hh ? `M+ ${hh}:${mm}:${ss} since confirm` : 'M+ — mission not confirmed'}
      </p>
    </div>
  )
}

function Console() {
  const { state } = useMission()
  const [ws, setWs] = useState<WorkspaceId>('mission')
  const prevStatus = useRef(state.status)

  // Power-on moment: confirming the mission carries the operator to the map.
  useEffect(() => {
    if (prevStatus.current === 'setup' && state.status === 'active' && ws === 'mission') {
      setWs('map')
    }
    prevStatus.current = state.status
  }, [state.status, ws])

  // Console keyboard shortcuts: number keys switch workspaces.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        (target &&
          (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable))
      ) {
        return
      }
      const idx = Number.parseInt(e.key, 10)
      if (idx >= 1 && idx <= WORKSPACES.length) {
        setWs(WORKSPACES[idx - 1].id)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const active = WORKSPACES.find((w) => w.id === ws)

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-void">
      <a
        href="#workspace"
        className="label-console sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:border focus:border-signal focus:bg-hull focus:px-3 focus:py-2 focus:text-signal"
      >
        Skip to workspace
      </a>

      <div className="flex min-h-0 flex-1">
        {/* Station rail (desktop) */}
        <aside className="hidden w-64 flex-none flex-col border-r border-seam bg-hull lg:flex">
          <div className="border-b border-seam px-5 py-5">
            <BrandMark />
          </div>
          <div className="px-5 py-4">
            <MissionStatusBlock />
          </div>
          <nav aria-label="Workspaces" className="flex flex-col gap-1 px-3 py-2">
            {WORKSPACES.map((w, i) => (
              <button
                key={w.id}
                type="button"
                onClick={() => setWs(w.id)}
                aria-current={ws === w.id ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 border px-3 py-2.5 text-left transition-colors',
                  ws === w.id
                    ? 'border-signal/50 bg-signal-soft/50 text-signal'
                    : 'border-transparent text-ink-dim hover:border-seam-lit hover:text-ink',
                )}
              >
                <w.icon size={15} aria-hidden className={ws === w.id ? 'text-signal' : 'text-ink-faint'} />
                <span className="label-console flex-1">{w.label}</span>
                <span className="data-readout text-[10px] text-ink-faint">{i + 1}</span>
              </button>
            ))}
          </nav>
          <div className="mt-auto">
            <ClockBlock />
          </div>
        </aside>

        {/* Main column */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Mobile top bar */}
          <div className="flex items-center justify-between gap-3 border-b border-seam bg-hull px-4 py-3 lg:hidden">
            <BrandMark compact />
            <div className="flex items-center gap-2">
              <LedDot tone={state.status === 'active' ? 'green' : 'amber'} pulse />
              <span className="label-console text-ink-dim">
                {state.status === 'active' ? 'active' : 'setup'}
              </span>
            </div>
          </div>

          {/* Mobile workspace tabs */}
          <nav
            aria-label="Workspaces"
            className="flex gap-1 overflow-x-auto border-b border-seam bg-hull/60 px-2 py-2 lg:hidden"
          >
            {WORKSPACES.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => setWs(w.id)}
                aria-current={ws === w.id ? 'page' : undefined}
                className={cn(
                  'label-console flex flex-none items-center gap-2 border px-3 py-2 transition-colors',
                  ws === w.id
                    ? 'border-signal/50 bg-signal-soft/50 text-signal'
                    : 'border-seam text-ink-dim',
                )}
              >
                <w.icon size={13} aria-hidden /> {w.label}
              </button>
            ))}
          </nav>

          {/* Workspace header strip */}
          <div className="hidden items-center gap-3 border-b border-seam bg-hull/40 px-5 py-2 md:flex">
            <Menu size={13} aria-hidden className="text-ink-faint" />
            <h1 className="label-console text-ink">{active?.label}</h1>
            <div className="ml-auto flex items-center gap-1.5">
              <span className="label-console mr-1 text-[9px] text-ink-faint">evidence</span>
              <EvidenceBadge evidence="observed" />
              <EvidenceBadge evidence="derived" />
              <EvidenceBadge evidence="scenario" />
              <EvidenceBadge evidence="unavailable" />
            </div>
          </div>

          {/* Workspace surface */}
          <main id="workspace" className="relative min-h-0 flex-1 overflow-hidden bg-void/40">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={ws}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
                className="absolute inset-0 min-h-0 overflow-y-auto p-4 lg:p-5"
              >
                {ws === 'mission' && <MissionWorkspace />}
                {ws === 'map' && <MapWorkspace />}
                {ws === 'provenance' && <ProvenancePanel />}
              </motion.div>
            </AnimatePresence>
          </main>

          {/* Status bar */}
          <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-seam bg-hull px-4 py-2.5">
            <p className="text-[11px] leading-snug text-ink-faint">
              Decision-support prototype using real NASA data — <span className="text-ink-dim">not a
              certified safety system</span>.
            </p>
            <div className="ml-auto hidden items-center gap-4 md:flex">
              <KeyHint combo={`1–${WORKSPACES.length}`} action="workspaces" />
            </div>
          </footer>
        </div>

      </div>
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
