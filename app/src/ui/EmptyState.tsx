import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

/**
 * Honest empty state: an unambiguous "not loaded / not implemented" instrument
 * panel. Never dresses absence as data.
 */
export function EmptyState({
  title,
  detail,
  icon,
  footer,
  className,
}: {
  title: string
  detail: ReactNode
  icon?: ReactNode
  footer?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex h-full min-h-40 flex-col items-center justify-center gap-3 border border-dashed border-seam-lit/70 bg-inset/60 p-6 text-center',
        className,
      )}
    >
      {icon && <div className="text-ink-faint">{icon}</div>}
      <p className="label-console text-ink-dim">{title}</p>
      <div className="max-w-[52ch] text-sm leading-relaxed text-ink-faint">{detail}</div>
      {footer}
    </div>
  )
}
