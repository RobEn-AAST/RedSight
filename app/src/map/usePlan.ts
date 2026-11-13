import { useContext } from 'react'

import { PlanContext, type PlanStore } from '@/map/planContext'

export function usePlan(): PlanStore {
  const plan = useContext(PlanContext)
  if (!plan) throw new Error('usePlan must be used inside <PlanProvider>')
  return plan
}
