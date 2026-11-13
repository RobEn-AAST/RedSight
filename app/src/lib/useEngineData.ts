import { useContext } from 'react'

import { EngineDataContext } from '@/lib/engineDataContext'

export function useEngineData() {
  return useContext(EngineDataContext)
}
