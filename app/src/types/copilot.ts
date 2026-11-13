/** Copilot types — live chat wiring (voice-copilot-plan §2, wired 2026-11-13). */

export type CopilotConnection =
  | 'checking'
  | 'not-configured'
  | 'requesting-permission'
  | 'permission-denied'
  | 'ready'
  | 'error'

/** Server health (/api/copilot/health) — reports capability, never keys. */
export interface CopilotHealth {
  ok: boolean
  provider: 'groq' | 'gemini' | null
  sttConfigured: boolean
  model: string | null
  webSearch: boolean
  tool: string
}

export type MessageDelivery =
  | 'local-only' // no backend — kept on this device, no reply
  | 'queued-no-provider' // legacy marker from the pre-backend build
  | 'streaming' // reply tokens arriving
  | 'delivered' // full round-trip done
  | 'error'

/** A tool the server executed for a reply (search only, for now). */
export interface CopilotToolTrace {
  name: string
  resultCount?: number
}

export interface ChatMessage {
  id: string
  role: 'operator' | 'copilot' | 'system'
  text: string
  createdAt: string
  delivery: MessageDelivery
  /** Set on copilot messages when the server ran a tool mid-reply. */
  tool?: CopilotToolTrace
  /** Honesty-filter notice from the server (banned-phrase detector). */
  notice?: string
}

/** Client-side mission context sent with each chat request (data, not instructions). */
export interface CopilotRequestContext {
  missionState: Record<string, unknown> | null
  availableData: string[]
}

export type DictationMode = 'cloud' | 'local' | 'none'

export type DictationState =
  | 'idle'
  | 'requesting-permission'
  | 'permission-denied'
  | 'loading-model'
  | 'recording'
  | 'transcribing'
  | 'error'

/*
 * ---------------------------------------------------------------------------
 * FUTURE TOOL CONTRACTS — UNCONNECTED
 * ---------------------------------------------------------------------------
 * Structured intents the LLM may emit once the team wires app-side execution
 * (voice-copilot-plan §7). The app (authoritative engine) validates and
 * executes them; the LLM never computes numbers itself. Until then the
 * copilot proposes changes in words only (see server/prompt.mjs).
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
