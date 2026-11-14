import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

import { cn } from '@/lib/cn'

export type SheetSnap = 'peek' | 'half' | 'full'

export interface SheetTab {
  id: string
  label: string
  icon: ReactNode
}

/** Height of the peek state: grab handle + tab bar. Map overlays sit above it on phones. */
export const SHEET_PEEK_PX = 92
/** Room kept above a full sheet, so the map's legend stays visible. */
const FULL_GAP_PX = 64
/** A flick faster than this (px per ms) snaps in its direction, however short. */
const FLICK_VELOCITY = 0.45

const SNAPS: SheetSnap[] = ['peek', 'half', 'full']

/**
 * A bottom sheet over the map: grab handle, tab bar, one scrolling panel per tab.
 * Drag the handle (or flick it) to resize; tap it, or press Enter on it, to step
 * through peek → half → full. All panels stay mounted (hidden when inactive), so
 * anything they own on the map, like the replay, keeps running.
 */
export function BottomSheet({
  tabs,
  active,
  onTab,
  label,
  children,
}: {
  tabs: SheetTab[]
  active: string
  onTab: (id: string) => void
  label: string
  /** One element per tab, in the same order as `tabs`. */
  children: ReactNode[]
}) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const [hostH, setHostH] = useState(0)
  // Laptop: the sheet docks down the left edge, so it can start tall without hiding the route.
  const [snap, setSnap] = useState<SheetSnap>(() => (window.matchMedia('(min-width: 1024px)').matches ? 'full' : 'half'))
  const [dragH, setDragH] = useState<number | null>(null)
  const drag = useRef<{ y: number; h: number; t: number; moved: boolean } | null>(null)
  /** A drag ends with a click; this swallows that one click so it doesn't also step the size. */
  const justDragged = useRef(false)

  // The sheet sizes itself against the map area it sits in.
  useLayoutEffect(() => {
    const host = sheetRef.current?.parentElement
    if (!host) return
    const ro = new ResizeObserver(() => setHostH(host.clientHeight))
    ro.observe(host)
    setHostH(host.clientHeight)
    return () => ro.disconnect()
  }, [])

  const heights: Record<SheetSnap, number> = {
    peek: SHEET_PEEK_PX,
    half: Math.max(SHEET_PEEK_PX, Math.round(hostH * 0.5)),
    full: Math.max(SHEET_PEEK_PX, hostH - FULL_GAP_PX),
  }
  const height = dragH ?? heights[snap]

  const nearest = (h: number) =>
    SNAPS.reduce((best, s) => (Math.abs(heights[s] - h) < Math.abs(heights[best] - h) ? s : best), 'peek' as SheetSnap)

  const onPointerDown = (e: React.PointerEvent) => {
    // Ignore a second finger once a drag has started.
    if (drag.current) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { y: e.clientY, h: height, t: performance.now(), moved: false }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dy = d.y - e.clientY
    if (Math.abs(dy) > 4) d.moved = true
    if (!d.moved) return
    // Past the ends, the sheet follows with friction instead of stopping dead.
    const raw = d.h + dy
    const min = heights.peek
    const max = heights.full
    const h = raw < min ? min - (min - raw) * 0.25 : raw > max ? max + (raw - max) * 0.25 : raw
    setDragH(h)
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d || !d.moved) return
    justDragged.current = true
    const dy = d.y - e.clientY
    const v = dy / Math.max(1, performance.now() - d.t)
    const i = SNAPS.indexOf(nearest(d.h))
    let next = nearest(d.h + dy)
    if (Math.abs(v) > FLICK_VELOCITY) next = SNAPS[Math.min(2, Math.max(0, i + (v > 0 ? 1 : -1)))]
    setSnap(next)
    setDragH(null)
  }
  const onHandleClick = () => {
    if (justDragged.current) {
      justDragged.current = false
      return
    }
    setSnap((s) => (s === 'full' ? 'peek' : s === 'peek' ? 'half' : 'full'))
  }

  // Escape lowers the sheet one step.
  useEffect(() => {
    const el = sheetRef.current
    if (!el) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSnap((s) => (s === 'full' ? 'half' : 'peek'))
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [])

  const activeIndex = Math.max(0, tabs.findIndex((t) => t.id === active))

  return (
    <div
      ref={sheetRef}
      role="region"
      aria-label={label}
      style={{ height }}
      className={cn(
        'absolute inset-x-0 bottom-0 z-20 flex flex-col border-t border-seam-lit bg-panel/97 shadow-panel backdrop-blur-sm',
        'lg:inset-x-auto lg:bottom-3 lg:left-3 lg:w-[26rem] lg:border',
        dragH === null && 'transition-[height] duration-[380ms] ease-[cubic-bezier(0.32,0.72,0,1)]',
      )}
    >
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onHandleClick}
        aria-label={`Resize panel (now ${snap === 'peek' ? 'small' : snap === 'half' ? 'half' : 'full'})`}
        className="flex h-6 flex-none touch-none cursor-grab items-center justify-center active:cursor-grabbing"
      >
        <span aria-hidden className="h-1 w-10 rounded-full bg-seam-lit" />
      </button>

      <div role="tablist" aria-label={label} className="relative grid flex-none border-b border-seam" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((t) => {
          const on = t.id === active
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`sheet-tab-${t.id}`}
              aria-selected={on}
              aria-controls={`sheet-panel-${t.id}`}
              onClick={() => {
                onTab(t.id)
                if (snap === 'peek') setSnap('half')
              }}
              className={cn(
                'flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[11px] transition-[color,transform] duration-150 active:scale-[0.97] motion-reduce:active:scale-100',
                on ? 'text-signal' : 'text-ink-dim hover:text-ink',
              )}
            >
              <span aria-hidden>{t.icon}</span>
              <span className="label-console leading-none">{t.label}</span>
            </button>
          )
        })}
        {/* Active-tab marker slides between tabs. */}
        <span
          aria-hidden
          className="absolute bottom-0 left-0 h-0.5 bg-signal transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]"
          style={{ width: `${100 / tabs.length}%`, transform: `translateX(${activeIndex * 100}%)` }}
        />
      </div>

      {tabs.map((t, i) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`sheet-panel-${t.id}`}
          aria-labelledby={`sheet-tab-${t.id}`}
          hidden={t.id !== active}
          className="sheet-panel min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          {children[i]}
        </div>
      ))}
    </div>
  )
}
