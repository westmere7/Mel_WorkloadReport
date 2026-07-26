import type { AssetRates, Task } from '../types'
import { FALLBACK_ITEM, hoursPerUnit } from '../constants'

// ── Effort-weighted workload ────────────────────────────────────────────────
//
// Turns the per-asset-type output rates recorded in Settings into hours of work,
// so the workload chart can show EFFORT instead of a raw asset count — 300 photo
// edits and 10 banners stop reading as a 30:1 difference in output.
//
// Everything here is DERIVED at render time. No task field is rewritten, no
// total is persisted, and the rates themselves live in settings — so switching
// the workload chart to effort changes nothing about the underlying data, and
// every other number in the app keeps counting assets exactly as before.

/**
 * Effort in hours for one task: Σ (asset count × hours per unit of that type).
 *
 * Asset types with no rate contribute 0 rather than a guessed default — an
 * invented rate would quietly fabricate workload. Use `unratedTypesWithVolume`
 * to name the types this therefore leaves out.
 *
 * Reads `assetBreakdown`, which the dashboard's function filter has already
 * narrowed to the selected functions' slices, so effort honours that filter for
 * free (see sliceTasksByFunctions).
 */
export function taskEffortHours(task: Task, rates: AssetRates): number {
  let hours = 0
  for (const [name, count] of Object.entries(task.assetBreakdown ?? {})) {
    const n = Number(count) || 0
    if (n > 0) hours += n * hoursPerUnit(rates[name])
  }
  return hours
}

/** True when at least one asset type has a rate — gates the effort toggle. */
export function hasAnyRate(rates: AssetRates | undefined): boolean {
  return !!rates && Object.keys(rates).length > 0
}

/**
 * Asset types that carry volume in `tasks` but have no rate. These are exactly
 * the types an effort total under-counts, so the dashboard names them instead of
 * presenting a quietly incomplete number.
 *
 * The reserved "Others" catch-all is skipped: it's a mixed bag by definition, so
 * any single rate for it would be meaningless — reporting it as missing would be
 * a permanent warning with nothing the user could do about it. It still counts as
 * zero hours, exactly as before.
 */
export function unratedTypesWithVolume(tasks: Task[], rates: AssetRates): string[] {
  const out = new Set<string>()
  for (const t of tasks) {
    for (const [name, count] of Object.entries(t.assetBreakdown ?? {})) {
      if (name === FALLBACK_ITEM) continue
      if ((Number(count) || 0) > 0 && !rates[name]) out.add(name)
    }
  }
  return [...out].sort((a, b) => a.localeCompare(b))
}

/**
 * Hours per ASSET TYPE across `tasks`, biggest first (types with no effort are
 * dropped). Answers "which deliverables consume the team's time" — a question the
 * asset count can't reach, since it's the whole point of recording rates: a type
 * can be a small share of the output and a large share of the work.
 */
export function effortByAssetType(tasks: Task[], rates: AssetRates): { name: string; value: number }[] {
  const rec: Record<string, number> = {}
  for (const t of tasks) {
    for (const [name, count] of Object.entries(t.assetBreakdown ?? {})) {
      const hours = (Number(count) || 0) * hoursPerUnit(rates[name])
      if (hours > 0) rec[name] = (rec[name] ?? 0) + hours
    }
  }
  return Object.entries(rec)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
}

/** Hours as a compact label — "1,240 h", "6.5 h". Display only. */
export function formatHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return '0 h'
  const v = hours >= 100 ? Math.round(hours) : Math.round(hours * 10) / 10
  return `${v.toLocaleString()} h`
}
