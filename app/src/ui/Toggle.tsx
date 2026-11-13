import { cn } from '@/lib/cn'

/**
 * Console switch — square-track toggle used for yes/no decisions (rover
 * availability) and layer enablement. Keyboard operable (native button +
 * role=switch, Space/Enter activate).
 */
export function Toggle({
  checked,
  onChange,
  label,
  size = 'md',
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  /** Accessible name for the control */
  label: string
  size?: 'sm' | 'md'
  disabled?: boolean
}) {
  const dims =
    size === 'md'
      ? { track: 'h-6 w-11', knob: 'size-[18px]', travel: 'translate-x-5', pad: 'left-[3px]' }
      : { track: 'h-5 w-9', knob: 'size-[14px]', travel: 'translate-x-4', pad: 'left-[3px]' }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex flex-none items-center border transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-40',
        dims.track,
        dims.pad,
        checked ? 'border-signal/60 bg-signal-soft' : 'border-seam-lit bg-inset',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute top-1/2 -translate-y-1/2 transition-transform duration-150',
          dims.knob,
          checked ? cn('bg-signal', dims.travel) : 'translate-x-0 bg-seam-lit',
        )}
      />
    </button>
  )
}
