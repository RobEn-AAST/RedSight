import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/cn'

/**
 * A collapsed row under "Your plan": a title, a one-line answer, and the detail
 * behind it. Native <details>, so it opens with a tap or the keyboard.
 */
export function Fold({
  icon,
  title,
  answer,
  tone = 'plain',
  children,
}: {
  icon: ReactNode
  title: string
  answer: ReactNode
  tone?: 'plain' | 'caution'
  children: ReactNode
}) {
  return (
    <details className={cn('group border', tone === 'caution' ? 'border-caution/50 bg-caution-soft/30' : 'border-seam')}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2.5 px-3 py-2 [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="flex-none text-ink-dim">
          {icon}
        </span>
        <span className="text-xs font-medium text-ink">{title}</span>
        <span className={cn('ml-auto text-right text-xs', tone === 'caution' ? 'text-caution' : 'text-ink-dim')}>
          {answer}
        </span>
        <ChevronDown size={14} aria-hidden className="flex-none text-ink-dim transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-3 border-t border-seam px-3 py-3">{children}</div>
    </details>
  )
}
