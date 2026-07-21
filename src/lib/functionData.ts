import type { AssetBreakdown, FunctionConfig, FunctionData, FunctionEntry, Task } from '../types'
import { canonicalAssetName, legacyOwnerName } from '../constants'

/**
 * Pure rename transforms for tasks' per-function slices, shared by both
 * repositories so Settings renames keep nested function data linked (the same
 * guarantee the top-level types/assetBreakdown rewrites already provide).
 * Each returns the rewritten map, or null when nothing changed (skip the write).
 */

/** Sum a breakdown into a total (keeps `assetTotal` denormalization honest). */
function sumBreakdown(b: Record<string, number>): number {
  return Object.values(b).reduce((a, v) => a + (Number(v) || 0), 0)
}

/** Merge two entries (used when a function rename collides with an existing key). */
function mergeEntries(a: FunctionEntry, b: FunctionEntry): FunctionEntry {
  const breakdown: Record<string, number> = { ...a.assetBreakdown }
  for (const [k, v] of Object.entries(b.assetBreakdown)) breakdown[k] = (breakdown[k] ?? 0) + v
  const starts = [a.startDate, b.startDate].filter((d): d is string => !!d)
  const ends = [a.endDate, b.endDate].filter((d): d is string => !!d)
  return {
    types: Array.from(new Set([...a.types, ...b.types])),
    assetBreakdown: breakdown,
    assetTotal: sumBreakdown(breakdown),
    timelineOn: a.timelineOn || b.timelineOn,
    startDate: starts.length ? starts.sort()[0] : null,
    endDate: ends.length ? ends.sort()[ends.length - 1] : null,
  }
}

/** Rename a function KEY (Settings rename). Merges into an existing key on collision. */
export function renameFunctionKey(fd: FunctionData, oldName: string, newName: string): FunctionData | null {
  if (!(oldName in fd) || oldName === newName) return null
  const out: FunctionData = {}
  for (const [name, entry] of Object.entries(fd)) {
    if (name === oldName) continue
    out[name] = entry
  }
  out[newName] = out[newName] ? mergeEntries(out[newName], fd[oldName]) : fd[oldName]
  return out
}

/** Rewrite a renamed WORK type inside every function entry's `types`. */
export function renameWorkTypeInFunctionData(
  fd: FunctionData,
  oldValue: string,
  newValue: string,
): FunctionData | null {
  let changed = false
  const out: FunctionData = {}
  for (const [name, entry] of Object.entries(fd)) {
    if (entry.types.includes(oldValue)) {
      changed = true
      out[name] = { ...entry, types: Array.from(new Set(entry.types.map((v) => (v === oldValue ? newValue : v)))) }
    } else {
      out[name] = entry
    }
  }
  return changed ? out : null
}

/**
 * Project tasks down to the selected functions' slices — the dashboard's
 * function filter. Empty selection = "All GCMC" (tasks returned untouched, the
 * combined roll-up). Otherwise each task becomes a copy whose types/assets are
 * the SUM of only the selected functions' entries, so a shared task counts a
 * function's real contribution instead of the whole task:
 * - Legacy tasks (no functionData) belong wholly to the legacy owner — included
 *   as-is when it's selected, dropped otherwise.
 * - Tasks with none of the selected functions are dropped.
 * - Dates use a selected entry's own timeline when it has one (else the master),
 *   so time charts reflect when that function actually worked.
 */
export function sliceTasksByFunctions(
  tasks: Task[],
  selected: string[],
  functions: FunctionConfig[],
): Task[] {
  if (selected.length === 0) return tasks
  const legacy = legacyOwnerName(functions)
  const sel = new Set(selected)
  const out: Task[] = []
  for (const t of tasks) {
    if (!t.functionData) {
      if (sel.has(legacy)) out.push(t)
      continue
    }
    const entries = Object.entries(t.functionData).filter(([n]) => sel.has(n))
    if (entries.length === 0) continue
    const types: string[] = []
    const breakdown: AssetBreakdown = {}
    let start: string | null = null
    let end: string | null = null
    for (const [, e] of entries) {
      for (const ty of e.types) if (!types.includes(ty)) types.push(ty)
      for (const [k, v] of Object.entries(e.assetBreakdown)) {
        const num = Number(v) || 0
        if (num > 0) breakdown[k] = (breakdown[k] ?? 0) + num
      }
      const s = e.timelineOn && e.startDate ? e.startDate : t.startDate
      const en = e.timelineOn && e.endDate ? e.endDate : t.endDate
      if (s && (!start || s < start)) start = s
      if (en && (!end || en > end)) end = en
    }
    out.push({
      ...t,
      types,
      assetBreakdown: breakdown,
      assetTotal: sumBreakdown(breakdown),
      startDate: start ?? t.startDate,
      endDate: end ?? t.endDate,
    })
  }
  return out
}

/** Rewrite a renamed ASSET type inside every function entry's `assetBreakdown`. */
export function renameAssetTypeInFunctionData(
  fd: FunctionData,
  oldValue: string,
  newValue: string,
): FunctionData | null {
  let changed = false
  const out: FunctionData = {}
  for (const [name, entry] of Object.entries(fd)) {
    const keys = Object.keys(entry.assetBreakdown).filter(
      (k) => canonicalAssetName(k) === oldValue && k !== newValue,
    )
    if (keys.length === 0) {
      out[name] = entry
      continue
    }
    changed = true
    const b = { ...entry.assetBreakdown }
    for (const k of keys) {
      b[newValue] = (b[newValue] ?? 0) + (b[k] ?? 0)
      delete b[k]
    }
    out[name] = { ...entry, assetBreakdown: b, assetTotal: sumBreakdown(b) }
  }
  return changed ? out : null
}
