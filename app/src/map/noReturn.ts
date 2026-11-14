import type { Feature, FeatureCollection } from 'geojson'

/**
 * The no-return ring for an O₂ budget (engine/tools/export_limits.py). The limits file holds one ring per
 * budget level; this keeps the ring for the largest level at or below `budgetL`, so the line drawn is never
 * further out than the budget allows. `budgetL` null means the full tank (the largest ring).
 * A file without `budget_l` levels (one fixed line) is returned as it is.
 */
export function ringForBudget(
  rings: FeatureCollection | null,
  budgetL: number | null,
): { line: FeatureCollection; budgetL: number | null; clipped: boolean } | null {
  if (!rings || !Array.isArray(rings.features) || rings.features.length === 0) return null
  const levelled = rings.features.filter((f): f is Feature => Number.isFinite(f.properties?.budget_l))
  if (levelled.length === 0) return { line: rings, budgetL: null, clipped: false }
  const fitting = levelled.filter((f) => budgetL == null || (f.properties!.budget_l as number) <= budgetL + 1e-9)
  if (fitting.length === 0) return null
  const ring = fitting.reduce((a, b) => ((b.properties!.budget_l as number) > (a.properties!.budget_l as number) ? b : a))
  return {
    line: { type: 'FeatureCollection', features: [ring] },
    budgetL: ring.properties!.budget_l as number,
    clipped: ring.properties?.clipped_by_model_edge === true,
  }
}
