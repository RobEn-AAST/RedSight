/** Choose the route data source without allowing a mock plan index to shadow real routes. */
export type PlanSource = 'plans' | 'routes' | 'none'

export function selectPlanSource({
  planIndex,
  planIndexMock,
  routeIndex,
  routeIndexMock,
}: {
  planIndex: unknown[] | null
  planIndexMock: boolean
  routeIndex: unknown[] | null
  routeIndexMock: boolean
}): PlanSource {
  if (planIndex?.length && !planIndexMock) return 'plans'
  if (routeIndex?.length && !routeIndexMock) return 'routes'
  if (planIndex?.length) return 'plans'
  if (routeIndex?.length) return 'routes'
  return 'none'
}
