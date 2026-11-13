import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { MissionContext } from '@/lib/missionContext'
import {
  defaultMissionConfig,
  type MissionConfig,
  type MissionState,
  type MissionStatus,
} from '@/types/mission'

const STORAGE_KEY = 'redsight.mission.v1'

function loadInitialState(): MissionState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as MissionState
      if (parsed && typeof parsed === 'object' && 'config' in parsed && 'status' in parsed) {
        // Merge over defaults so older persisted shapes stay loadable.
        return {
          config: { ...defaultMissionConfig, ...parsed.config },
          status: (parsed.status === 'active' ? 'active' : 'setup') as MissionStatus,
        }
      }
    }
  } catch {
    // Corrupt or unavailable storage → fresh setup.
  }
  return { config: { ...defaultMissionConfig }, status: 'setup' }
}

export function MissionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MissionState>(loadInitialState)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Private-mode storage failures are non-fatal: keep working in memory.
    }
  }, [state])

  const patchConfig = useCallback((patch: Partial<MissionConfig>) => {
    setState((s) => ({ ...s, config: { ...s.config, ...patch } }))
  }, [])

  const confirmMission = useCallback(() => {
    setState((s) => ({
      status: 'active',
      config: { ...s.config, confirmedAt: new Date().toISOString() },
    }))
  }, [])

  const reopenMission = useCallback(() => {
    setState((s) => ({ ...s, status: 'setup' }))
  }, [])

  const resetMission = useCallback(() => {
    setState({ config: { ...defaultMissionConfig }, status: 'setup' })
  }, [])

  const value = useMemo(
    () => ({ state, patchConfig, confirmMission, reopenMission, resetMission }),
    [state, patchConfig, confirmMission, reopenMission, resetMission],
  )

  return <MissionContext.Provider value={value}>{children}</MissionContext.Provider>
}
