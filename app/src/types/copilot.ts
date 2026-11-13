/** Copilot types — chat panel state now; tool contracts are UNCONNECTED proposals. */

export type CopilotConnection =
  | 'not-configured'
  | 'requesting-permission'
  | 'permission-denied'
  | 'ready'
  | 'error'

export type MessageDelivery = 'local-only' | 'queued-no-provider'

export interface ChatMessage {
  id: string
  role: 'operator' | 'copilot' | 'system'
  text: string
  createdAt: string
  /**
   * Honesty marker: every message in this build is local browser state only.
   * No assistant replies are synthesized and nothing leaves the device.
   */
  delivery: MessageDelivery
}

/*
 * ---------------------------------------------------------------------------
 * FUTURE TOOL CONTRACTS — UNCONNECTED
 * ---------------------------------------------------------------------------
 * Proposed structured intents the LLM may emit; the app (authoritative engine)
 * validates and executes them. The LLM never computes numbers itself.
 * Full schemas + rationale: docs/ai/voice-copilot-plan.md §Tool contracts.
 * No runtime call site exists yet.
 */

export type RouteMode = 'fastest' | 'safest' | 'balanced'

export type BudgetKind = 'time' | 'oxygen'

export interface BudgetSpec {
  kind: BudgetKind
  /** Hours for time budgets; kg O2 for oxygen budgets. */
  value: number
}

export interface SetMissionParamsArgs {
  crewCount?: number
  loadKg?: number
  loadBasis?: 'perAstronaut' | 'total'
  sampleKgPerStop?: number
  roverAvailable?: boolean
  scienceGoalId?: string
}

export interface SearchMaterialTargetsArgs {
  goalId?: string
  query?: string
}

export interface CompareRoutePresetsArgs {
  modes: RouteMode[]
  budget: BudgetSpec
}

export interface ProposeRouteRecalcArgs {
  mode: RouteMode
  budget: BudgetSpec
}

export type CopilotToolCall =
  | { tool: 'setMissionParams'; args: SetMissionParamsArgs }
  | { tool: 'searchMaterialTargets'; args: SearchMaterialTargetsArgs }
  | { tool: 'compareRoutePresets'; args: CompareRoutePresetsArgs }
  | { tool: 'proposeRouteRecalc'; args: ProposeRouteRecalcArgs }
