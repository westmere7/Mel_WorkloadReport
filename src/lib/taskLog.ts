import type { AssetBreakdown, FunctionEntry, Task, TaskInput, TaskLogEntry } from '../types'

/**
 * Per-task edit log helpers. The log is a `TaskLogEntry[]` stored ON the task
 * (jsonb column / embedded object), so it rides through both backends, is kept
 * by snapshots, and disappears with the task on delete. The store appends an
 * entry on create and on every update that actually changed something (see
 * diffTask); the TaskLogModal renders it.
 */

const show = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : String(v).trim()
  return s === '' ? '—' : s
}

/**
 * One line per asset type whose count moved: "Slides: 3 → 6". A 0 on either side
 * is shown as a number rather than "added"/"removed", so a column of these reads
 * consistently and the direction is obvious at a glance.
 */
function breakdownDelta(prefix: string, prev?: AssetBreakdown, next?: AssetBreakdown): string[] {
  const names = [...new Set([...Object.keys(prev ?? {}), ...Object.keys(next ?? {})])].sort((a, b) =>
    a.localeCompare(b),
  )
  const out: string[] = []
  for (const name of names) {
    const a = Number(prev?.[name]) || 0
    const b = Number(next?.[name]) || 0
    if (a !== b) out.push(`${prefix}${name}: ${a} → ${b}`)
  }
  return out
}

/**
 * What changed inside ONE function's slice — its asset counts type by type, its
 * work types, and its own timeline. Named per line so a multi-function task's log
 * says which team's numbers moved, not merely that some did.
 */
function functionDelta(
  name: string,
  prev: FunctionEntry | undefined,
  next: FunctionEntry | undefined,
  /** The task-level asset change, so this slice doesn't restate it. */
  taskTotals: { from: number; to: number },
): string[] {
  const out: string[] = []
  const p = `${name} · `
  if (!prev && next) out.push(`${name}: switched on`)
  else if (prev && !next) out.push(`${name}: switched off`)

  const prevTotal = prev?.assetTotal || 0
  const nextTotal = next?.assetTotal || 0
  const perType = breakdownDelta(p, prev?.assetBreakdown, next?.assetBreakdown)
  // The subtotal earns its line only when it says something the lines around it
  // don't: it's noise when it merely repeats the task total (single-function
  // task), or when one asset type moved and so IS the subtotal.
  const restatesTask = prevTotal === taskTotals.from && nextTotal === taskTotals.to
  if (prevTotal !== nextTotal && perType.length > 1 && !restatesTask)
    out.push(`${p}assets: ${prevTotal} → ${nextTotal}`)
  out.push(...perType)

  const types = listDelta(`${p}work types`, prev?.types ?? [], next?.types ?? [])
  if (types) out.push(types)

  if ((prev?.timelineOn ?? false) !== (next?.timelineOn ?? false))
    out.push(`${p}own timeline: ${next?.timelineOn ? 'on' : 'off'}`)
  if (show(prev?.startDate) !== show(next?.startDate))
    out.push(`${p}start date: ${show(prev?.startDate)} → ${show(next?.startDate)}`)
  if (show(prev?.endDate) !== show(next?.endDate))
    out.push(`${p}end date: ${show(prev?.endDate)} → ${show(next?.endDate)}`)
  return out
}

/** "+ added · − removed" delta for a multi-value field, or null when unchanged. */
function listDelta(label: string, prev: string[], next: string[]): string | null {
  const added = next.filter((x) => !prev.includes(x))
  const removed = prev.filter((x) => !next.includes(x))
  if (!added.length && !removed.length) return null
  const parts: string[] = []
  if (added.length) parts.push(`+ ${added.join(', ')}`)
  if (removed.length) parts.push(`− ${removed.join(', ')}`)
  return `${label}: ${parts.join(' · ')}`
}

/**
 * Human-readable summaries of what an edit changed, field by field. Empty =
 * nothing effectively changed (the store then skips logging the save).
 */
export function diffTask(prev: Task, next: TaskInput): string[] {
  const out: string[] = []
  const scalar = (label: string, a: unknown, b: unknown) => {
    if (show(a) !== show(b)) out.push(`${label}: ${show(a)} → ${show(b)}`)
  }
  scalar('Name', prev.name, next.name)
  scalar('Code', prev.code, next.code)
  scalar('Squad', prev.squad, next.squad)
  scalar('Campaign', prev.campaign, next.campaign)
  scalar('Size', prev.size, next.size)
  scalar('Half', prev.half, next.half)
  scalar('Start date', prev.startDate, next.startDate)
  scalar('End date', prev.endDate, next.endDate)
  scalar('Note', prev.note, next.note)

  // Per-function slices carry the same asset counts as the combined breakdown, so
  // detail them in ONE place: per function when the task records them that way,
  // otherwise against the combined breakdown (legacy tasks predate functions).
  const prevTotal = prev.assetTotal || 0
  const nextTotal = next.assetTotal || 0

  const fnPrev = prev.functionData ?? null
  const fnNext = next.functionData ?? null
  const fnLines: string[] = []
  if (JSON.stringify(fnPrev) !== JSON.stringify(fnNext)) {
    const names = [...new Set([...Object.keys(fnPrev ?? {}), ...Object.keys(fnNext ?? {})])].sort((a, b) =>
      a.localeCompare(b),
    )
    for (const name of names) {
      if (JSON.stringify(fnPrev?.[name]) === JSON.stringify(fnNext?.[name])) continue
      fnLines.push(
        ...functionDelta(name, fnPrev?.[name], fnNext?.[name], { from: prevTotal, to: nextTotal }),
      )
    }
  }

  if (prevTotal !== nextTotal) out.push(`Assets: ${prevTotal} → ${nextTotal}`)
  if (fnLines.length) out.push(...fnLines)
  else out.push(...breakdownDelta('Assets · ', prev.assetBreakdown, next.assetBreakdown))

  const types = listDelta('Work types', prev.types ?? [], next.types ?? [])
  if (types) out.push(types)
  const people = listDelta('People', prev.people ?? [], next.people ?? [])
  if (people) out.push(people)

  if ((prev.draft === true) !== (next.draft === true)) out.push(next.draft ? 'Saved as draft' : 'Draft completed')
  if ((prev.starred === true) !== (next.starred === true)) out.push(next.starred ? 'Starred' : 'Unstarred')

  // Compare image IDENTITY, not just the count — so a same-count swap still
  // registers as a change (callers treat "no diff" as "nothing to save").
  const prevImgs = prev.images ?? []
  const nextImgs = next.images ?? []
  if (prevImgs.length !== nextImgs.length) out.push(`Demo images: ${prevImgs.length} → ${nextImgs.length}`)
  else if (prevImgs.map((i) => i.id).join('|') !== nextImgs.map((i) => i.id).join('|'))
    out.push('Demo images updated')

  if (show(prev.mondayUrl) !== show(next.mondayUrl))
    out.push(next.mondayUrl ? 'monday.com link updated' : 'monday.com link removed')

  // (Per-function slices are detailed alongside the asset totals above.)
  return out
}

/** Coerce a stored log value into a clean TaskLogEntry[] (bad shapes fall away). */
export function normalizeTaskLog(raw: unknown): TaskLogEntry[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (e): e is TaskLogEntry =>
      !!e &&
      typeof e === 'object' &&
      typeof (e as TaskLogEntry).at === 'string' &&
      typeof (e as TaskLogEntry).action === 'string',
  )
}
