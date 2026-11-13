import { cn } from '@/lib/cn'

export type LedTone = 'off' | 'amber' | 'green' | 'red' | 'cyan'

const tones: Record<LedTone, string> = {
  off: 'bg-seam-lit',
  amber: 'bg-signal shadow-[0_0_6px_rgba(255,178,36,0.7)]',
  green: 'bg-go shadow-[0_0_6px_rgba(79,208,138,0.6)]',
  red: 'bg-caution shadow-[0_0_6px_rgba(255,109,109,0.6)]',
  cyan: 'bg-observed shadow-[0_0_6px_rgba(86,216,244,0.6)]',
}

/** Status LED. `pulse` is decorative state signaling; disabled under reduced motion. */
export function LedDot({ tone, pulse, className }: { tone: LedTone; pulse?: boolean; className?: string }) {
  return <span aria-hidden="true" className={cn('led', tones[tone], pulse && 'led-pulse', className)} />
}
