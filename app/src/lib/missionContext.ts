import { createContext } from 'react'

import type { MissionState } from '@/types/mission'

export interface MissionStore {
  state: MissionState
  /** Update draft fields while in setup or when editing an active mission. */
  patchConfig: (patch: Partial<MissionState['config']>) => void
  confirmMission: () => void
  /** Return an active mission to editable setup state. */
  reopenMission: () => void
  resetMission: () => void
}

export const MissionContext = createContext<MissionStore | null>(null)
