import type { AppSettings, AssetBreakdown, FunctionData, Task } from '../types'

/*
 * Asset lines — the per-task breakdown behind the monday "Assets" tab.
 *
 * A task's ASSET PACKAGE is its dashboard counts per (function, asset type).
 * Lines split that package into batches with a person in charge and a status.
 * Invariant: for every (function, type), Σ line qty === the dashboard count.
 *
 * - The UNASSIGNED POOL is one `pool` line per (function, type): the part of the
 *   package nobody has taken yet. A fresh task is all pool.
 * - Tab edits are pool-first: carving a line out (or growing one) takes from the
 *   pool, and only what the pool can't cover raises the dashboard count;
 *   shrinking/deleting a line hands its assets back to the pool. Editing or
 *   deleting the pool line itself changes the dashboard count.
 * - Dashboard edits are absorbed by `reconcile`: more → pool grows; fewer → taken
 *   from the pool first, then from not-started lines, done lines last.
 */

export type LineStatus = 'notStarted' | 'working' | 'stuck' | 'done'

export interface AssetLine {
  id: string
  groupId: string | null
  name: string
  type: string
  /** Recording function (null on legacy tasks without per-function data). */
  fn: string | null
  owner: string | null
  qty: number
  status: LineStatus
  due: string | null
  notes: string
  /** The (function, type)'s unassigned pool. */
  pool?: boolean
}

export interface LineGroup {
  id: string
  name: string
  color: string
}

export interface AssetBoard {
  /** Display order: lines show in array order within their section. */
  lines: AssetLine[]
  groups: LineGroup[]
  /** Link to the task's online asset tracker (e.g. an Excel sheet), if it has one. */
  tracker: string | null
  /** Package signature the lines were last balanced against (see `basisOf`). */
  basis: string
  /** Write counter + writer id — lets a client ignore the echo of its own save. */
  rev: number
  by: string
}

/** The `task_asset_lines` table doesn't exist yet — supabase/schema.sql needs re-running. */
export class AssetLinesNotSetUpError extends Error {
  constructor() {
    super('Asset lines aren’t set up yet — run supabase/schema.sql to create the task_asset_lines table.')
    this.name = 'AssetLinesNotSetUpError'
  }
}

export const EMPTY_BOARD: AssetBoard = { lines: [], groups: [], tracker: null, basis: '', rev: 0, by: '' }

export const lineKey = (fn: string | null, type: string) => `${fn ?? ''}::${type}`
const keyOf = (l: AssetLine) => lineKey(l.fn, l.type)

/** Coerce a stored board (jsonb) into shape; anything unreadable → empty. */
export function normalizeBoard(raw: unknown): AssetBoard {
  const b = (raw ?? {}) as Partial<AssetBoard>
  const lines = Array.isArray(b.lines)
    ? b.lines
        .filter((l): l is AssetLine => !!l && typeof l === 'object' && typeof (l as AssetLine).id === 'string')
        .map((l) => ({
          ...l,
          qty: Math.max(0, Math.round(Number(l.qty) || 0)),
          status: (['notStarted', 'working', 'stuck', 'done'] as const).includes(l.status) ? l.status : 'notStarted',
          groupId: l.groupId ?? null,
          fn: l.fn ?? null,
          owner: l.owner ?? null,
          due: l.due ?? null,
          notes: l.notes ?? '',
        }))
    : []
  const groups = Array.isArray(b.groups) ? b.groups.filter((g) => g && typeof g.id === 'string') : []
  return {
    lines,
    groups,
    tracker: typeof b.tracker === 'string' && b.tracker.trim() ? b.tracker.trim() : null,
    basis: typeof b.basis === 'string' ? b.basis : '',
    rev: Number(b.rev) || 0,
    by: typeof b.by === 'string' ? b.by : '',
  }
}

/** The task's functions for lines: its per-function keys, or [null] for a legacy task. */
export function taskFunctions(task: Task): (string | null)[] {
  const fd = task.functionData
  return fd && Object.keys(fd).length ? Object.keys(fd) : [null]
}

export interface PackageEntry {
  key: string
  fn: string | null
  type: string
  count: number
}

/** The task's asset package, in settings order (functions, then asset types). */
export function packageOf(task: Task, settings?: AppSettings): PackageEntry[] {
  const fnOrder = (fn: string | null) => {
    const i = fn && settings ? settings.functions.findIndex((f) => f.name === fn) : -1
    return i < 0 ? Number.MAX_SAFE_INTEGER : i
  }
  const typeOrder = (t: string) => {
    const i = settings ? settings.assetTypes.indexOf(t) : -1
    return i < 0 ? Number.MAX_SAFE_INTEGER : i
  }
  const fd = task.functionData
  const slices: { fn: string | null; breakdown: AssetBreakdown }[] =
    fd && Object.keys(fd).length
      ? Object.entries(fd).map(([fn, e]) => ({ fn, breakdown: e?.assetBreakdown ?? {} }))
      : [{ fn: null, breakdown: task.assetBreakdown }]
  return slices
    .sort((a, b) => fnOrder(a.fn) - fnOrder(b.fn))
    .flatMap((s) =>
      Object.entries(s.breakdown)
        .filter(([, n]) => (n ?? 0) > 0)
        .sort(([a], [b]) => typeOrder(a) - typeOrder(b))
        .map(([type, count]) => ({ key: lineKey(s.fn, type), fn: s.fn, type, count })),
    )
}

function signature(counts: Map<string, number>): string {
  return [...counts.entries()]
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, n]) => `${k}=${n}`)
    .join('|')
}

/** Signature of the dashboard's package — changes whenever a count changes. */
export function basisOf(task: Task): string {
  return signature(new Map(packageOf(task).map((p) => [p.key, p.count])))
}

/** The same signature computed from lines (equal to `basisOf` when balanced). */
export function basisOfLines(lines: AssetLine[]): string {
  const m = new Map<string, number>()
  for (const l of lines) m.set(keyOf(l), (m.get(keyOf(l)) ?? 0) + l.qty)
  return signature(m)
}

function poolLine(fn: string | null, type: string, qty: number, taken: Set<string>): AssetLine {
  const base = `pool:${lineKey(fn, type)}`
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}:${n}`
  taken.add(id)
  return { id, groupId: null, name: type, type, fn, owner: null, qty, status: 'notStarted', due: null, notes: '', pool: true }
}

/** Insert `line` right after the last line with the same key (else at the end). */
function insertNearKey(lines: AssetLine[], line: AssetLine): AssetLine[] {
  let at = -1
  lines.forEach((l, i) => {
    if (keyOf(l) === keyOf(line)) at = i
  })
  const out = [...lines]
  out.splice(at < 0 ? out.length : at + 1, 0, line)
  return out
}

/** Is this line still just "unassigned stock"? (anything set on it makes it a real line) */
export function isPoolShaped(l: AssetLine): boolean {
  return !l.owner && l.status === 'notStarted' && l.name === l.type && !l.notes.trim() && !l.due
}

// Which lines give up assets first when the dashboard count drops.
const SHRINK_ORDER = (l: AssetLine) =>
  l.pool ? 0 : l.status === 'notStarted' ? (l.owner ? 2 : 1) : l.status === 'stuck' ? 3 : l.status === 'working' ? 4 : 5

/**
 * Fit lines to the task's CURRENT package (after a dashboard edit, or first open).
 * Pure + deterministic: the same lines and task always give the same result.
 */
export function reconcile(lines: AssetLine[], task: Task, settings?: AppSettings): AssetLine[] {
  const fns = taskFunctions(task)
  const pkg = packageOf(task, settings)
  const want = new Map(pkg.map((p) => [p.key, p.count]))
  // A task that gained/lost per-function data keeps its lines when unambiguous.
  let out = lines.map((l) => (fns.includes(l.fn) ? l : fns.length === 1 ? { ...l, fn: fns[0] } : l))

  // Too many → shrink (pool first, done lines last; later lines before earlier).
  for (const key of new Set(out.map(keyOf))) {
    let excess = out.filter((l) => keyOf(l) === key).reduce((n, l) => n + l.qty, 0) - (want.get(key) ?? 0)
    if (excess <= 0) continue
    const order = out
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => keyOf(l) === key)
      .sort((a, b) => SHRINK_ORDER(a.l) - SHRINK_ORDER(b.l) || b.i - a.i)
    for (const { l } of order) {
      if (excess <= 0) break
      const take = Math.min(l.qty, excess)
      excess -= take
      out = out.map((x) => (x.id === l.id ? { ...x, qty: x.qty - take } : x))
    }
  }
  out = out.filter((l) => l.qty > 0)

  // Too few → grow the pool (create it next to that type's lines if needed).
  const taken = new Set(out.map((l) => l.id))
  for (const p of pkg) {
    const have = out.filter((l) => keyOf(l) === p.key).reduce((n, l) => n + l.qty, 0)
    if (have >= p.count) continue
    const delta = p.count - have
    const pool = out.find((l) => l.pool && keyOf(l) === p.key)
    out = pool
      ? out.map((l) => (l.id === pool.id ? { ...l, qty: l.qty + delta } : l))
      : insertNearKey(out, poolLine(p.fn, p.type, delta, taken))
  }
  return out
}

/**
 * Apply a tab edit pool-first. `next` is the user's intended lines; for every
 * (function, type) whose ALLOCATED (non-pool) total changed, the pool absorbs the
 * difference — only what it can't cover changes the dashboard count. An edit to
 * the pool line itself (`touchedId`) is taken literally.
 */
export function rebalance(prev: AssetLine[], next: AssetLine[], touchedId: string | null): AssetLine[] {
  let out = [...next]
  const allocated = (ls: AssetLine[], key: string) =>
    ls.filter((l) => !l.pool && keyOf(l) === key).reduce((n, l) => n + l.qty, 0)
  const taken = new Set([...prev, ...next].map((l) => l.id))
  for (const key of new Set([...prev, ...next].map(keyOf))) {
    const poolIdx = out.findIndex((l) => l.pool && keyOf(l) === key)
    if (poolIdx >= 0 && out[poolIdx].id === touchedId) continue // explicit pool edit
    // (Deleting the pool line leaves `allocated` unchanged → d = 0 → the count drops.)
    const d = allocated(out, key) - allocated(prev, key)
    if (d === 0) continue
    const prevPool = prev.find((l) => l.pool && keyOf(l) === key)?.qty ?? 0
    const poolQty = Math.max(0, prevPool - d)
    if (poolIdx >= 0) {
      out = poolQty > 0 ? out.map((l, i) => (i === poolIdx ? { ...l, qty: poolQty } : l)) : out.filter((_, i) => i !== poolIdx)
    } else if (poolQty > 0) {
      const sample = [...next, ...prev].find((l) => keyOf(l) === key)!
      out = insertNearKey(out, poolLine(sample.fn, sample.type, poolQty, taken))
    }
  }
  return out
}

/** How a pending edit of one (function, type) splits between the pool and the dashboard. */
export function poolEffect(prev: AssetLine[], key: string, deltaAllocated: number) {
  const pool = prev.find((l) => l.pool && keyOf(l) === key)?.qty ?? 0
  if (deltaAllocated >= 0) {
    const fromPool = Math.min(pool, deltaAllocated)
    return { fromPool, toDashboard: deltaAllocated - fromPool, pool }
  }
  return { fromPool: deltaAllocated, toDashboard: 0, pool }
}

/** The task fields that carry the counts, rebuilt from lines (keeps the roll-up rule). */
export function countsFromLines(
  lines: AssetLine[],
  task: Task,
): { functionData: FunctionData | null; assetBreakdown: AssetBreakdown; assetTotal: number } {
  const sum = (ls: AssetLine[]) => {
    const bd: AssetBreakdown = {}
    for (const l of ls) if (l.qty > 0) bd[l.type] = (bd[l.type] ?? 0) + l.qty
    return bd
  }
  const total = (bd: AssetBreakdown) => Object.values(bd).reduce((n, v) => n + v, 0)
  const fd = task.functionData
  if (fd && Object.keys(fd).length) {
    const next: FunctionData = {}
    const combined: AssetBreakdown = {}
    for (const [fn, entry] of Object.entries(fd)) {
      const bd = sum(lines.filter((l) => l.fn === fn))
      next[fn] = { ...entry, assetBreakdown: bd, assetTotal: total(bd) }
      for (const [k, v] of Object.entries(bd)) combined[k] = (combined[k] ?? 0) + v
    }
    return { functionData: next, assetBreakdown: combined, assetTotal: total(combined) }
  }
  const bd = sum(lines)
  return { functionData: fd ?? null, assetBreakdown: bd, assetTotal: total(bd) }
}
