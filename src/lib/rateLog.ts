import type { AssetRate, AssetRates, RateLogEntry } from '../types'

/**
 * Edit log for the output rates (`AppSettings.assetRates`).
 *
 * Rates are the multiplier behind the whole Effort view, so a quiet change to one
 * silently redraws every hours figure on the dashboard — this records who changed
 * what, and to what, so a shifted total can always be explained. The log lives on
 * AppSettings (jsonb column, like `assetRates` itself), so it rides both backends
 * and is captured by snapshots.
 *
 * Capped at the most recent `RATE_LOG_LIMIT` entries. The log lives inside the
 * settings row, so an unbounded list would grow the payload every save reads and
 * writes — and the oldest entries are the least useful, describing rates that have
 * since been superseded several times over.
 */

/**
 * How many entries to keep. Rates change rarely, so this is years of history in
 * practice; it exists to stop the settings row growing without limit rather than
 * to prune anything anyone still wants.
 */
export const RATE_LOG_LIMIT = 100

/** "300 per 1 day" / "1 per 2 weeks", or "—" for a rate that isn't set. */
export function formatRate(rate: AssetRate | undefined | null): string {
  if (!rate) return '—'
  const unit = rate.every === 1 ? rate.per : `${rate.per}s`
  return `${rate.qty} per ${rate.every} ${unit}`
}

const same = (a: AssetRate | undefined, b: AssetRate | undefined): boolean =>
  (!a && !b) || (!!a && !!b && a.qty === b.qty && a.every === b.every && a.per === b.per)

/**
 * Human-readable summaries of what a rates save changed, one line per asset type.
 * Empty = nothing effectively changed, and the caller should skip logging.
 *
 * Covers all three transitions, since "unset" is meaningful — an asset type with
 * no rate counts as ZERO hours rather than being excluded, so clearing one is a
 * real change to the numbers, not just a tidy-up.
 */
export function diffRates(prev: AssetRates, next: AssetRates): string[] {
  const names = [...new Set([...Object.keys(prev ?? {}), ...Object.keys(next ?? {})])].sort((a, b) =>
    a.localeCompare(b),
  )
  const out: string[] = []
  for (const name of names) {
    const a = prev?.[name]
    const b = next?.[name]
    if (same(a, b)) continue
    if (!a && b) out.push(`${name}: set to ${formatRate(b)}`)
    else if (a && !b) out.push(`${name}: cleared (was ${formatRate(a)})`)
    else out.push(`${name}: ${formatRate(a)} → ${formatRate(b)}`)
  }
  return out
}

/**
 * ONE line for a rate that moved because its asset type was renamed.
 *
 * Not a `diffRates` result: by key that reads as "cleared here, set there", three
 * lines describing a rate that never actually changed. A rename carries the rate
 * intact; only a merge into an existing type really loses one, so that case says so.
 */
export function renameRateLine(
  oldName: string,
  newName: string,
  moved: AssetRate | undefined,
  target: AssetRate | undefined,
  merged: boolean,
): string {
  // The callers only log when a rate existed, but don't write "(rate — carried
  // over)" if that ever changes.
  if (!merged) {
    const carried = moved ? ` (rate ${formatRate(moved)} carried over)` : ''
    return `Asset type renamed: ${oldName} → ${newName}${carried}`
  }
  const kept = target ? `${newName} keeps ${formatRate(target)}` : `${newName} has no rate`
  return `Asset type merged into ${newName}: ${oldName}’s rate ${formatRate(moved)} dropped, ${kept}`
}

/** ONE line for a rate that disappeared because its asset type was removed. */
export function removeRateLine(name: string, rate: AssetRate | undefined): string {
  return rate ? `Asset type removed: ${name} (rate ${formatRate(rate)} dropped)` : `Asset type removed: ${name}`
}

/**
 * Append an entry, or return the log untouched when nothing actually changed.
 * Trims from the FRONT once past `RATE_LOG_LIMIT`, so the newest survive.
 */
export function appendRateLog(
  log: RateLogEntry[] | undefined,
  changes: string[],
  by: string | null,
): RateLogEntry[] {
  if (!changes.length) return log ?? []
  const next = [...(log ?? []), { at: new Date().toISOString(), by, changes }]
  return next.length > RATE_LOG_LIMIT ? next.slice(next.length - RATE_LOG_LIMIT) : next
}
