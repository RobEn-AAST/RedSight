import { useEffect, useState } from 'react'

import { fetchData } from '@/lib/dataUrl'
import type { FactorDefs } from '@/lib/factors'

/** factors.json is fetched once; a missing or malformed file stays null (the UI then hides the factor controls). */
let cached: FactorDefs | null = null
let pending: Promise<FactorDefs | null> | null = null

const isDefs = (v: unknown): v is FactorDefs =>
  typeof v === 'object' && v !== null && Array.isArray((v as FactorDefs).factors) && typeof (v as FactorDefs).constants === 'object'

export function loadFactorDefs(): Promise<FactorDefs | null> {
  if (cached) return Promise.resolve(cached)
  pending ??= fetchData<unknown>('factors.json').then((raw) => {
    cached = isDefs(raw) ? raw : null
    pending = null
    return cached
  })
  return pending
}

export function useFactorDefs(): FactorDefs | null {
  const [defs, setDefs] = useState<FactorDefs | null>(cached)
  useEffect(() => {
    let live = true
    void loadFactorDefs().then((d) => live && setDefs(d))
    return () => {
      live = false
    }
  }, [])
  return defs
}
