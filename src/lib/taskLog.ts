import type { Task, TaskInput, TaskLogEntry } from '../types'

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

  const prevTotal = prev.assetTotal || 0
  const nextTotal = next.assetTotal || 0
  if (prevTotal !== nextTotal) out.push(`Assets: ${prevTotal} → ${nextTotal}`)
  else if (JSON.stringify(prev.assetBreakdown ?? {}) !== JSON.stringify(next.assetBreakdown ?? {}))
    out.push('Asset breakdown updated')

  const types = listDelta('Work types', prev.types ?? [], next.types ?? [])
  if (types) out.push(types)
  const people = listDelta('People', prev.people ?? [], next.people ?? [])
  if (people) out.push(people)

  if ((prev.draft === true) !== (next.draft === true)) out.push(next.draft ? 'Saved as draft' : 'Draft completed')
  if ((prev.starred === true) !== (next.starred === true)) out.push(next.starred ? 'Starred' : 'Unstarred')

  const prevImgs = (prev.images ?? []).length
  const nextImgs = (next.images ?? []).length
  if (prevImgs !== nextImgs) out.push(`Demo images: ${prevImgs} → ${nextImgs}`)

  if (show(prev.mondayUrl) !== show(next.mondayUrl))
    out.push(next.mondayUrl ? 'monday.com link updated' : 'monday.com link removed')

  // Per-function slices: name just the functions whose slice changed.
  const fdPrev = prev.functionData ?? null
  const fdNext = next.functionData ?? null
  if (JSON.stringify(fdPrev) !== JSON.stringify(fdNext)) {
    const names = new Set([...(fdPrev ? Object.keys(fdPrev) : []), ...(fdNext ? Object.keys(fdNext) : [])])
    const changed = [...names].filter((n) => JSON.stringify(fdPrev?.[n]) !== JSON.stringify(fdNext?.[n]))
    out.push(changed.length ? `Function workload: ${changed.join(', ')}` : 'Function workload updated')
  }

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
