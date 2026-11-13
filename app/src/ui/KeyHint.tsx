/** Keyboard hint chip — surfaced in the status bar to teach console shortcuts. */
export function KeyHint({ combo, action }: { combo: string; action: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 text-[11px] text-ink-faint">
      <kbd className="data-readout border border-seam-lit bg-inset px-1.5 py-0.5 text-[10px] text-ink-dim">
        {combo}
      </kbd>
      {action}
    </span>
  )
}
