import type { Half, Task } from '../types'

/** Time-span granularity used by the dashboard, task list, and backups. */
export type SpanMode = 'total' | 'year' | 'half'

/** Distinct years present in the tasks (by start date), most recent first. */
export function taskYears(tasks: Task[]): number[] {
  const set = new Set<number>()
  for (const t of tasks) if (t.startDate) set.add(Number(t.startDate.slice(0, 4)))
  return [...set].sort((a, b) => b - a)
}

/**
 * Filter tasks to a time span. `total` returns everything; `year`/`half` keep
 * only tasks in the given year (and half). Tasks without a start date fall out
 * of year/half views since they can't be placed on the calendar.
 */
export function filterBySpan(tasks: Task[], mode: SpanMode, year: number, half: Half): Task[] {
  if (mode === 'total') return tasks
  return tasks.filter((t) => {
    if (!t.startDate || Number(t.startDate.slice(0, 4)) !== year) return false
    return mode === 'half' ? t.half === half : true
  })
}

/** Short slug for filenames, e.g. "all", "2026", "2026-H1". */
export function spanSuffix(mode: SpanMode, year: number, half: Half): string {
  if (mode === 'total') return 'all'
  if (mode === 'year') return String(year)
  return `${year}-${half}`
}

/** Human label, e.g. "all tasks", "2026", "2026 · H1". */
export function spanLabel(mode: SpanMode, year: number, half: Half): string {
  if (mode === 'total') return 'all tasks'
  if (mode === 'year') return String(year)
  return `${year} · ${half}`
}
