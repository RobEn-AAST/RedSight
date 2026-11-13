import { useContext } from 'react'

import { MissionContext } from '@/lib/missionContext'

export function useMission() {
  const ctx = useContext(MissionContext)
  if (!ctx) throw new Error('useMission must be used inside <MissionProvider>')
  return ctx
}
