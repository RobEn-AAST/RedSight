import { useEffect, useState, type ReactNode } from 'react'

import {
  EngineDataContext,
  type EngineDataState,
  type EngineLayer,
  type EngineMeta,
  type EngineStop,
} from '@/lib/engineDataContext'

/**
 * Loads the §15 contract files (meta/layers/stops.json) from app/public/data/
 * once at startup. Absent files stay null: the UI shows honest "engine data
 * absent" states and never invents numbers to fill in.
 */
async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export function EngineDataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EngineDataState>({
    meta: null,
    layers: null,
    stops: null,
    probed: false,
  })

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      fetchJson<EngineMeta>('/data/meta.json'),
      fetchJson<EngineLayer[]>('/data/layers.json'),
      fetchJson<EngineStop[]>('/data/stops.json'),
    ]).then(([meta, layers, stops]) => {
      if (!cancelled) {
        setState((s) => ({
          ...s,
          meta: meta ?? s.meta,
          layers: layers ?? s.layers,
          stops: stops ?? s.stops,
          probed: true,
        }))
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  return <EngineDataContext.Provider value={state}>{children}</EngineDataContext.Provider>
}
