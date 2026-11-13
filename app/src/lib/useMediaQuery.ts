import { useCallback, useSyncExternalStore } from 'react'

/**
 * Tracks a CSS media query (server snapshot: false). Mirrors Tailwind
 * breakpoints by query string, e.g. '(min-width: 1280px)' === Tailwind xl.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [query],
  )
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
