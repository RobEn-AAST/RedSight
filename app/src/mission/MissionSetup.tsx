import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Rocket,
  PackageOpen,
  Users,
  Target,
  ClipboardCheck,
  Play,
} from 'lucide-react'

import { Button } from '@/ui/Button'
import { cn } from '@/lib/cn'
import { useMission } from '@/lib/useMission'
import { validateMission, type FieldIssue } from '@/lib/validation'
import { defaultMissionConfig } from '@/types/mission'
import { CrewStep, LoadStep, RoverStep, GoalStep, ReviewStep } from '@/mission/MissionSteps'

const STEPS = [
  { id: 'crew', label: 'Crew', icon: Users },
  { id: 'load', label: 'Load', icon: PackageOpen },
  { id: 'rover', label: 'Rover', icon: Rocket },
  { id: 'goal', label: 'Goal', icon: Target },
  { id: 'review', label: 'Review', icon: ClipboardCheck },
] as const

function issuesFor(fields: FieldIssue['field'][], issues: FieldIssue[]) {
  return issues.filter((i) => fields.includes(i.field))
}

/** Stepper for one step + next/prev navigation with per-step validation. */
export function MissionSetup() {
  const { state, patchConfig, confirmMission } = useMission()
  const { config } = state

  /** One-click demo: a complete, valid mission (2 crew, default loads, the
   *  boxwork ops box — decision D11), then straight to the routes map. */
  const startDemo = () => {
    patchConfig({ ...defaultMissionConfig, scienceGoalId: 'boxwork' })
    confirmMission()
  }
  const [step, setStep] = useState(0)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const validation = validateMission(config)
  const stepFields: FieldIssue['field'][][] = [
    ['crewCount', 'bodyMassKg'],
    ['loadKg', 'sampleKgPerStop'],
    [],
    ['scienceGoal'],
    [],
  ]
  const stepIssues = issuesFor(stepFields[step], validation.issues)
  const stepBlocked = stepIssues.some((i) => i.level === 'error')

  const go = (next: number) => {
    setStep(next)
    // Move operator focus to the new step heading (keyboard/screen-reader continuity).
    requestAnimationFrame(() => headingRef.current?.focus())
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Demo shortcut: skip setup with a ready-made mission */}
      <div className="border-b border-seam bg-hull/60 px-4 py-4">
        <div className="mx-auto flex w-full max-w-2xl flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-relaxed text-ink-dim">
            <span className="font-display font-semibold tracking-wide text-ink">First time here?</span>{' '}
            Load a sample two-person mission to the boxwork site and go straight to the routes.
          </p>
          <Button
            variant="primary"
            onClick={startDemo}
            data-testid="demo-website"
            className="min-h-14 flex-none px-7 text-base"
          >
            <Play size={18} aria-hidden /> Demo the website
          </Button>
        </div>
      </div>

      {/* Step rail */}
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 border-b border-seam px-4 py-3">
        {STEPS.map((s, i) => {
          const done = i < step
          const active = i === step
          return (
            <li key={s.id} className="flex items-center">
              <button
                type="button"
                onClick={() => go(i)}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'label-console flex items-center gap-2 border px-2.5 py-1.5 transition-colors',
                  active
                    ? 'border-signal/60 bg-signal-soft text-signal'
                    : done
                      ? 'border-seam-lit bg-panel-2 text-ink-dim hover:text-ink'
                      : 'border-seam bg-transparent text-ink-faint hover:text-ink-dim',
                )}
              >
                {done ? <Check size={13} aria-hidden /> : <s.icon size={13} aria-hidden />}
                {s.label}
              </button>
              {i < STEPS.length - 1 && (
                <span aria-hidden className="mx-1 h-px w-4 bg-seam-lit sm:w-6" />
              )}
            </li>
          )
        })}
      </ol>

      {/* Step body */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={STEPS[step].id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 sm:p-6"
          >
            <h3
              ref={headingRef}
              tabIndex={-1}
              className="font-display text-lg font-semibold tracking-wide text-ink outline-none"
            >
              {step === 0 && 'How many astronauts walk?'}
              {step === 1 && 'What are you carrying?'}
              {step === 2 && 'Do you have a rover?'}
              {step === 3 && 'What are you looking for?'}
              {step === 4 && 'Check your plan'}
            </h3>

            {step === 0 && <CrewStep />}
            {step === 1 && <LoadStep />}
            {step === 2 && <RoverStep />}
            {step === 3 && <GoalStep />}
            {step === 4 && <ReviewStep />}

            {stepIssues.length > 0 && (
              <div className="flex flex-col gap-2">
                {stepIssues.map((issue) => (
                  <p
                    key={issue.message}
                    role={issue.level === 'error' ? 'alert' : undefined}
                    className={cn(
                      'border px-3 py-2 text-xs leading-relaxed',
                      issue.level === 'error'
                        ? 'border-caution/40 bg-caution-soft text-caution'
                        : 'border-scenario/40 bg-scenario-soft text-scenario',
                    )}
                  >
                    {issue.message}
                  </p>
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Step navigation */}
      <div className="flex items-center justify-between gap-3 border-t border-seam bg-hull/60 px-4 py-3">
        <Button variant="quiet" onClick={() => go(Math.max(0, step - 1))} disabled={step === 0}>
          <ChevronLeft size={14} aria-hidden /> Back
        </Button>
        <span className="label-console text-ink-faint" aria-live="polite">
          Step {step + 1} / {STEPS.length}
        </span>
        {step < STEPS.length - 1 ? (
          <Button variant="primary" onClick={() => go(step + 1)} disabled={stepBlocked}>
            Next <ChevronRight size={14} aria-hidden />
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={confirmMission}
            disabled={!validation.isValid}
            data-testid="confirm-mission"
          >
            Show routes <ChevronRight size={14} aria-hidden />
          </Button>
        )}
      </div>
    </div>
  )
}
