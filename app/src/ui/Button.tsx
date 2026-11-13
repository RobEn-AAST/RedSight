import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/cn'

type Variant = 'primary' | 'ghost' | 'quiet'
type Size = 'md' | 'sm'

const variants: Record<Variant, string> = {
  // Signal amber: the one lit control — reserved for the primary mission action.
  primary:
    'bg-signal text-[#14100a] font-semibold border border-signal hover:bg-[#ffc24d] active:bg-[#e69c12]',
  ghost: 'bg-transparent text-ink border border-seam-lit hover:border-signal/60 hover:text-signal',
  quiet: 'bg-transparent text-ink-dim border border-transparent hover:text-ink hover:border-seam-lit',
}

const sizes: Record<Size, string> = {
  md: 'px-4 py-2 text-sm min-h-11',
  sm: 'px-3 py-1.5 text-xs min-h-9',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children: ReactNode
}

/** Console button: squared, seam-bordered, explicit focus ring, 44px+ targets at md. */
export function Button({ variant = 'ghost', size = 'md', className, children, ...rest }: ButtonProps) {
  return (
    <button
      className={cn(
        'label-console chamfer-sm inline-flex items-center justify-center gap-2 tracking-[0.1em] transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-40',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
