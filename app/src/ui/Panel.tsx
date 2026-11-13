import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

/**
 * Structural console panel: squared corners with a chamfered nick, seam border,
 * header strip with title + status LED + action slot. The core container of the
 * station interior — never a rounded card.
 */
export function Panel({
  title,
  led,
  actions,
  children,
  className,
  bodyClassName,
  as: Tag = 'section',
}: {
  title: ReactNode
  led?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  as?: 'section' | 'div' | 'aside'
}) {
  return (
    <Tag className={cn('flex min-h-0 flex-col border border-seam bg-panel shadow-panel', className)}>
      <header className="flex items-center gap-3 border-b border-seam bg-hull/60 px-4 py-2.5">
        {led}
        <h2 className="label-console text-ink">{title}</h2>
        <div className="ml-auto flex items-center gap-2">{actions}</div>
      </header>
      <div className={cn('min-h-0 flex-1 p-4', bodyClassName)}>{children}</div>
    </Tag>
  )
}
