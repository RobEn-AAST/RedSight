import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'

import { fetchData } from '@/lib/dataUrl'
import type {
  EngineRoute,
  EngineRouteIndexEntry,
  EngineRouteMode,
  EngineRoutePreference,
  PlanFile,
  PlanIndexEntry,
  PlanMember,
  PlanTarget,
} from '@/lib/engineDataContext'
import { useEngineData } from '@/lib/useEngineData'
import { useMission } from '@/lib/useMission'
import { memberO2Factors } from '@/lib/memberFactor'
import { PlanContext, type CrewMode, type PlanPreset, type PlanStore } from '@/map/planContext'
import { nearestLoadBucket, perAstronautLoadKg } from '@/types/mission'

const MODES: EngineRouteMode[] = ['fastest', 'safest']

/** One plan member in the §15 route shape the turn-back slider and replay read. */
/**
 * One route object per plan member, so `activeRoute` keeps its identity while only unrelated store
 * state changes (layers, the Curiosity path, the O₂ slider). The replay restarts whenever it gets a new
 * route object, so without this it reset on every layer toggle.
 */
const routeForMember = new WeakMap<PlanMember, EngineRoute>()
function cachedMemberRoute(plan: PlanFile, m: PlanMember): EngineRoute {
  let route = routeForMember.get(m)
  if (!route) {
    route = memberAsRoute(plan, m)
    routeForMember.set(m, route)
  }
  return route
}

function memberAsRoute(plan: PlanFile, m: PlanMember): EngineRoute {
  return {
    id: `${plan.id}:${m.member}`,
    stop: m.targets[m.targets.length - 1] ?? plan.target,
    mode: plan.mode,
    crew: plan.crew,
    load_kg: plan.load_kg,
    badge: plan.badge,
    budget_l: plan.budget_l,
    constants_hash: '',
    coords: m.coords,
    ...(m.elev_m ? { elev_m: m.elev_m } : {}),
    seg: m.seg.map(({ distance_m, cost_terms, ...s }) => ({
      ...s,
      cost_terms: { distance_m, ...cost_terms },
    })),
    cum: m.cum,
    back: m.back,
    ...(m.back_fast ? { back_fast: m.back_fast } : {}),
    pnr_index: m.pnr_index,
    ...(m.park_index != null ? { park_index: m.park_index } : {}),
  }
}

interface Want {
  crew: number
  load: number
  rover: boolean
}

/**
 * Picks the plan files for a target. The engine ships plans only for some
 * crew × load × rover presets, so if the mission's own preset has none, the
 * closest preset that does is shown and the UI says so.
 */
function pickPlans(index: PlanIndexEntry[], target: string, want: Want) {
  const forTarget = index.filter((p) => p.target === target)
  if (forTarget.length === 0) return null
  const score = (p: PlanIndexEntry) =>
    (p.crew === want.crew ? 0 : 4) + (p.rover === want.rover ? 0 : 2) + (p.load_kg === want.load ? 0 : 1)
  const best = [...forTarget].sort((a, b) => score(a) - score(b))[0]
  const chosen = forTarget.filter(
    (p) => p.crew === best.crew && p.rover === best.rover && p.load_kg === best.load_kg,
  )
  const files: Partial<Record<EngineRouteMode, string>> = {}
  for (const p of chosen) files[p.mode] = p.file
  const preset: PlanPreset = {
    crew: best.crew,
    load_kg: best.load_kg,
    rover: best.rover,
    matchesMission: score(best) === 0,
  }
  return { preset, files }
}

/** Older contract: one route per stop and mode. Shown as a walk-only, together-only plan. */
function routeToPlan(route: EngineRoute): PlanFile {
  const last = route.coords.length - 1
  const member: PlanMember = {
    member: route.crew === 2 ? 'pair' : 'A',
    label: route.crew === 2 ? 'Both astronauts' : 'Astronaut',
    targets: [route.stop],
    coords: route.coords,
    ...(route.elev_m ? { elev_m: route.elev_m } : {}),
    legs: [
      {
        kind: 'walk',
        from: 0,
        to: last,
        t_s: route.cum.t_s[last],
        o2_l: route.cum.o2_l[last],
        distance_m: route.seg.reduce((s, x) => s + x.cost_terms.distance_m, 0),
      },
    ],
    seg: route.seg.map((s) => ({
      t_s: s.t_s,
      o2_l: s.o2_l,
      slope_deg: s.slope_deg,
      distance_m: s.cost_terms.distance_m,
      cost_terms: s.cost_terms,
    })),
    cum: route.cum,
    back: route.back,
    pnr_index: route.pnr_index,
    park_index: null,
  }
  return {
    id: route.id,
    target: route.stop,
    mode: route.mode,
    crew: route.crew,
    load_kg: route.load_kg,
    rover: false,
    badge: route.badge,
    budget_l: route.budget_l,
    together: [member],
    split: null,
  }
}

function pickRoutes(index: EngineRouteIndexEntry[], target: string, want: Want) {
  const forTarget = index.filter((r) => r.stop === target)
  if (forTarget.length === 0) return null
  const exact = forTarget.filter((r) => r.crew === want.crew && r.load_kg === want.load)
  const chosen = exact.length > 0 ? exact : forTarget.filter(
    (r) => r.crew === forTarget[0].crew && r.load_kg === forTarget[0].load_kg,
  )
  const files: Partial<Record<EngineRouteMode, string>> = {}
  for (const r of chosen) files[r.mode] = r.file
  const preset: PlanPreset = {
    crew: chosen[0].crew,
    load_kg: chosen[0].load_kg,
    rover: false,
    matchesMission: exact.length > 0 && !want.rover,
  }
  return { preset, files }
}

function isPlan(raw: unknown): raw is PlanFile {
  const p = raw as Partial<PlanFile> | null
  return (
    !!p &&
    Array.isArray(p.together) &&
    p.together.length > 0 &&
    p.together.every((m) => Array.isArray(m.coords) && Array.isArray(m.cum?.o2_l) && Array.isArray(m.legs))
  )
}

function isRoute(raw: unknown): raw is EngineRoute {
  const r = raw as Partial<EngineRoute> | null
  return !!r && Array.isArray(r.coords) && Array.isArray(r.seg) && Array.isArray(r.cum?.o2_l)
}

interface Loaded {
  key: string
  plans: Partial<Record<EngineRouteMode, PlanFile>>
  routes: Partial<Record<EngineRouteMode, EngineRoute>>
}

interface LoadedRoutes {
  key: string
  routes: Partial<Record<EngineRouteMode, EngineRoute>>
}

export function PlanProvider({ children }: { children: ReactNode }) {
  const engine = useEngineData()
  const { state } = useMission()
  const [chosenTargetId, selectTarget] = useState<string | null>(null)
  const [mode, setMode] = useState<EngineRoutePreference>('fastest')
  const [dynamicRoute, setDynamicRoute] = useState<EngineRoute | null>(null)
  const [layerVisibility, setLayerVisibilityState] = useState<Record<string, boolean>>({})
  const [crewMode, setCrewMode] = useState<CrewMode>('together')
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [o2BudgetL, setO2BudgetL] = useState<number | null>(null)
  const [showCuriosityPath, setShowCuriosityPath] = useState(true)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [loadedContract, setLoadedContract] = useState<LoadedRoutes | null>(null)
  const [limits, setLimits] = useState<{ key: string; line: FeatureCollection | null } | null>(null)

  const wantCrew = state.config.crewCount
  const wantLoad = nearestLoadBucket(perAstronautLoadKg(state.config))
  const wantRover = state.config.roverAvailable
  const goal = state.config.scienceGoalId

  const chooseMode = useCallback((next: EngineRoutePreference) => {
    setDynamicRoute(null)
    setMode(next)
  }, [])
  const applyDynamicRoute = useCallback((route: EngineRoute) => {
    setDynamicRoute(route)
    setMode(route.mode)
  }, [])
  const clearDynamicRoute = useCallback(() => setDynamicRoute(null), [])
  const setLayerVisibility = useCallback((id: string, visible: boolean) => {
    setLayerVisibilityState((current) => ({ ...current, [id]: visible }))
  }, [])

  const { goalTargets, goalUnmatched } = useMemo(() => {
    const all: PlanTarget[] = engine.targets ?? []
    const matched = all.filter((t) => t.goals.includes(goal))
    return matched.length > 0
      ? { goalTargets: matched, goalUnmatched: false }
      : { goalTargets: all, goalUnmatched: all.length > 0 }
  }, [engine.targets, goal])

  // The chosen target, or the first one the goal offers.
  const selectedTargetId =
    chosenTargetId && goalTargets.some((t) => t.id === chosenTargetId)
      ? chosenTargetId
      : (goalTargets[0]?.id ?? null)

  const legacy = !engine.planIndex
  const routePick = useMemo(() => {
    if (!selectedTargetId || !engine.routeIndex) return null
    return pickRoutes(engine.routeIndex, selectedTargetId, { crew: wantCrew, load: wantLoad, rover: false })
  }, [engine.routeIndex, selectedTargetId, wantCrew, wantLoad])
  const pick = useMemo(() => {
    if (!selectedTargetId) return null
    const want: Want = { crew: wantCrew, load: wantLoad, rover: wantRover }
    if (engine.planIndex) return pickPlans(engine.planIndex, selectedTargetId, want)
    return routePick
  }, [engine.planIndex, routePick, selectedTargetId, wantCrew, wantLoad, wantRover])

  const key = pick ? `${selectedTargetId}|${JSON.stringify(pick.files)}` : null
  const routeKey = routePick ? `${selectedTargetId}|${JSON.stringify(routePick.files)}` : null

  useEffect(() => {
    if (!pick || !key) return
    let cancelled = false
    void Promise.all(
      MODES.map(async (m) => [m, pick.files[m] ? await fetchData<unknown>(pick.files[m]) : null] as const),
    ).then((results) => {
      if (cancelled) return
      const plans: Partial<Record<EngineRouteMode, PlanFile>> = {}
      const routes: Partial<Record<EngineRouteMode, EngineRoute>> = {}
      for (const [m, raw] of results) {
        if (isPlan(raw)) plans[m] = raw
        else if (isRoute(raw)) {
          plans[m] = routeToPlan(raw)
          routes[m] = raw
        }
      }
      setLoaded({ key, plans, routes })
    })
    return () => {
      cancelled = true
    }
  }, [pick, key])

  // Load §15 route files when plan/*.json is active so seg[].cost_terms is available for breakdown.
  useEffect(() => {
    if (legacy || !routePick || !routeKey) return
    let cancelled = false
    void Promise.all(
      MODES.map(async (m) => [m, routePick.files[m] ? await fetchData<unknown>(routePick.files[m]) : null] as const),
    ).then((results) => {
      if (cancelled) return
      const routes: Partial<Record<EngineRouteMode, EngineRoute>> = {}
      for (const [m, raw] of results) {
        if (isRoute(raw)) routes[m] = raw
      }
      setLoadedContract({ key: routeKey, routes })
    })
    return () => {
      cancelled = true
    }
  }, [legacy, routePick, routeKey])

  // The no-return line for the preset actually shown.
  const limitsFile = pick && !legacy
    ? `plan/limits_c${pick.preset.crew}_l${pick.preset.load_kg}_${pick.preset.rover ? 'rover' : 'foot'}.geojson`
    : null
  useEffect(() => {
    if (!limitsFile) return
    let cancelled = false
    void fetchData<FeatureCollection>(limitsFile).then((line) => {
      if (!cancelled) setLimits({ key: limitsFile, line: line && Array.isArray(line.features) ? line : null })
    })
    return () => {
      cancelled = true
    }
  }, [limitsFile])

  const store = useMemo<PlanStore>(() => {
    const current = loaded && loaded.key === key ? loaded.plans : null
    const plans = current ?? {}
    const baseContractRoutes = legacy
      ? (loaded && loaded.key === key ? loaded.routes : {})
      : (loadedContract && loadedContract.key === routeKey ? loadedContract.routes : {})
    const validDynamic = dynamicRoute && dynamicRoute.stop === selectedTargetId &&
      dynamicRoute.crew === state.config.crewCount && !state.config.roverAvailable &&
      dynamicRoute.routing?.body_mass_kg === state.config.bodyMassKg &&
      dynamicRoute.routing?.load_kg_per_astronaut === perAstronautLoadKg(state.config) &&
      dynamicRoute.routing?.sample_kg_per_stop === state.config.sampleKgPerStop &&
      dynamicRoute.routing?.slope_cap_deg === state.config.routeSlopeCapDeg &&
      (dynamicRoute.routing?.sand_weight ?? 0) === state.config.sandWeight &&
      (dynamicRoute.mode !== 'balanced' || (dynamicRoute.routing?.hazard_weight ?? 0.5) === state.config.hazardWeight) ? dynamicRoute : null
    const contractRoutes = (validDynamic ? { ...baseContractRoutes, [validDynamic.mode]: validDynamic } : baseContractRoutes) as Partial<Record<EngineRoutePreference, EngineRoute>>
    const status = validDynamic ? 'ready' : (state.config.routeSlopeCapExplicit || mode === 'balanced') ? 'missing' : !selectedTargetId
      ? 'idle'
      : !pick
        ? 'missing'
        : !current
          ? 'loading'
          : Object.keys(current).length > 0
            ? 'ready'
            : 'missing'
    // If only one mode's file exists, show that one instead of nothing.
    const staticMode: EngineRouteMode = mode === 'safest' ? 'safest' : 'fastest'
    const activePlan = validDynamic ? routeToPlan(validDynamic) : (state.config.routeSlopeCapExplicit || mode === 'balanced') ? null : (plans[staticMode] ?? plans.fastest ?? plans.safest ?? null)
    const canSplit = !!activePlan?.split && activePlan.split.members.length > 1
    const activeMembers =
      crewMode === 'split' && canSplit ? activePlan!.split!.members : (activePlan?.together ?? [])
    const activeRoute = validDynamic ?? (activePlan && activeMembers[0] ? cachedMemberRoute(activePlan, activeMembers[0]) : null)
    // Per-astronaut O₂ factors from body mass (lib/memberFactor.ts), against the mass the route was modeled for.
    const constant = (k: string) => {
      const v = (engine.constants as Record<string, { value?: unknown } | undefined> | null)?.[k]?.value
      return typeof v === 'number' && Number.isFinite(v) ? v : null
    }
    const referenceMassKg = validDynamic?.routing?.body_mass_kg ?? constant('body_mass_kg') ?? 82
    const masses = state.config.crewCount === 2 ? [state.config.bodyMassKg, state.config.bodyMassKgB] : [state.config.bodyMassKg]
    const memberFactors = memberO2Factors(activeRoute, masses, referenceMassKg, activeRoute?.load_kg ?? perAstronautLoadKg(state.config))
    const o2Scale = { factor: Math.max(...memberFactors), returnMargin: constant('return_cost_margin') ?? 1.2 }
    return {
      goalTargets,
      goalUnmatched,
      selectedTargetId,
      selectTarget,
      mode,
      setMode: chooseMode,
      applyDynamicRoute,
      clearDynamicRoute,
      layerVisibility,
      setLayerVisibility,
      crewMode: canSplit ? crewMode : 'together',
      setCrewMode,
      plans,
      contractRoutes,
      status,
      activePlan,
      activeMembers,
      noReturnLine: limits && limits.key === limitsFile ? limits.line : null,
      preset: pick?.preset ?? null,
      legacy,
      activeRoute,
      memberFactors,
      o2Scale,
      routesStatus: status,
      o2BudgetL,
      setO2BudgetL,
      showCuriosityPath,
      setShowCuriosityPath,
      map,
      setMap,
    }
  }, [goalTargets, goalUnmatched, selectedTargetId, mode, crewMode, loaded, key, loadedContract, routeKey, pick, limits, limitsFile, legacy, map, o2BudgetL, showCuriosityPath, dynamicRoute, state.config, engine.constants, chooseMode, applyDynamicRoute, clearDynamicRoute, layerVisibility, setLayerVisibility])

  return <PlanContext.Provider value={store}>{children}</PlanContext.Provider>
}
