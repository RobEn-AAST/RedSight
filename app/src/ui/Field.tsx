import { useId, type ReactNode } from 'react'

import { cn } from '@/lib/cn'

/**
 * Labeled field wrapper: visible label (never placeholder-only), optional
 * hint, error/warning slots wired with aria-describedby.
 */
export function Field({
  label,
  hint,
  issue,
  children,
  className,
}: {
  label: string
  hint?: ReactNode
  /** error | warning message shown under the control */
  issue?: { level: 'error' | 'warning'; message: string } | null
  children: (ids: { describedBy?: string; invalid: boolean }) => ReactNode
  className?: string
}) {
  const id = useId()
  const hintId = `${id}-hint`
  const issueId = `${id}-issue`
  const describedBy =
    [hint ? hintId : null, issue ? issueId : null].filter(Boolean).join(' ') || undefined

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <span className="label-console text-ink-dim">{label}</span>
      {children({ describedBy, invalid: issue?.level === 'error' })}
      {hint && (
        <p id={hintId} className="text-xs leading-relaxed text-ink-faint">
          {hint}
        </p>
      )}
      {issue && (
        <p
          id={issueId}
          role={issue.level === 'error' ? 'alert' : undefined}
          className={cn(
            'flex items-start gap-1.5 text-xs leading-relaxed',
            issue.level === 'error' ? 'text-caution' : 'text-scenario',
          )}
        >
          {issue.message}
        </p>
      )}
    </div>
  )
}
