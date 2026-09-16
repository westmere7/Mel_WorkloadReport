import type { AssetRates, Task } from '../types'
import { taskEffortHours } from './effort'
import { eachDay } from './holidays'

// ─────────────────────────────────────────────────────────────────────────────
// Calendar heatmap data — one value per day of the year, derived from the tasks
// active that day. Purely derived, like every other dashboard figure.
// ─────────────────────────────────────────────────────────────────────────────

/** What a day's colour measures. */
export type CalendarUnit = 'tasks' | 'assets' | 'effort'

export const UNIT_LABEL: Record<CalendarUnit, string> = {
  tasks: 'Tasks',
  assets: 'Assets',
  effort: 'Effort',
}

/** A task's span as ISO dates. A task with no end date occupies its start day. */
export function taskDays(task: Task): string[] {
  if (!task.startDate) return []
  const end = task.endDate && task.endDate >= task.startDate ? task.endDate : task.startDate
  return eachDay(task.startDate, end)
}

export interface DayLoad {
  /** Heat value in the chosen unit. */
  value: number
  /** Tasks active on the day, heaviest first. */
  tasks: Task[]
}

export interface YearLoad {
  days: Map<string, DayLoad>
  /** Largest day value. */
  max: number
  /**
   * Quantile cut-points, one per colour step above the first: a day's level is
   * the number of thresholds its value reaches. See heatLevel for why.
   */
  thresholds: number[]
  /** Tasks whose span touches the year (the ones the calendar can show). */
  tasks: Task[]
}

/**
 * Per-day load for a year. A task's assets or effort are spread EVENLY across the
 * days of its span, so a 300-asset job booked over 30 days adds 10 a day rather
 * than 300 on its start date — the calendar shows where the work sat, not when it
 * was booked. In the `tasks` unit every active task adds 1.
 */
export function buildYearLoad(tasks: Task[], year: number, unit: CalendarUnit, rates: AssetRates): YearLoad {
  const y0 = `${year}-01-01`
  const y1 = `${year}-12-31`
  const days = new Map<string, DayLoad>()
  const inYear: Task[] = []

  for (const t of tasks) {
    if (t.draft || !t.startDate) continue
    const span = taskDays(t)
    if (!span.length || span[span.length - 1] < y0 || span[0] > y1) continue
    inYear.push(t)
    const perDay =
      unit === 'tasks' ? 1 : unit === 'assets' ? t.assetTotal / span.length : taskEffortHours(t, rates) / span.length
    for (const d of span) {
      if (d < y0 || d > y1) continue
      const cur = days.get(d) ?? { value: 0, tasks: [] }
      cur.value += perDay
      cur.tasks.push(t)
      days.set(d, cur)
    }
  }

  let max = 0
  const values: number[] = []
  for (const load of days.values()) {
    load.tasks.sort((a, b) => b.assetTotal - a.assetTotal || a.name.localeCompare(b.name))
    if (load.value > max) max = load.value
    values.push(load.value)
  }
  values.sort((a, b) => a - b)
  // Cut the non-zero days into HEAT.length equal-count bands.
  const thresholds: number[] = []
  for (let i = 1; i < HEAT.length; i++) {
    thresholds.push(values.length ? values[Math.min(values.length - 1, Math.floor((values.length * i) / HEAT.length))] : Infinity)
  }
  return { days, max, thresholds, tasks: inYear }
}

/**
 * Heat ramp: a pale orange tint for the quietest day, through RMIT orange, to RMIT
 * red for the busiest. Returns null for a day with nothing on it, so the cell keeps
 * the surface colour.
 *
 * ⚠️ Hue AND lightness change between steps on purpose. A red-only ramp was tried
 * first and the neighbouring shades (#e61e2a next to #c01722, #ec4854 next to
 * #e61e2a) could not be told apart on a 20px cell; orange→red gives each step a
 * visibly different colour while both ends stay brand colours (#F58220, #E61E2A).
 * Six steps, not more: with the Tasks unit the values are small integers, and more
 * bands than distinct values just produce empty bands.
 */
const HEAT: string[] = ['#fde8d5', '#fbc59a', '#f9a25e', '#F58220', '#ee4d25', '#E61E2A']

/**
 * The dark-theme ramp is a DIFFERENT idea, not the light one dimmed: it starts at a
 * deep maroon only a step above the navy card and climbs to a bright coral, so the
 * quiet days sink into the background and the busy ones glow — the way a heatmap
 * reads on a dark UI. Pale tints (the light ramp's low end) go washed-out pink on
 * navy, and a dark low end would read backwards on white, so each theme keeps its own.
 */
const HEAT_DARK: string[] = ['#4a1d33', '#6e1f31', '#932733', '#b83039', '#dc3c42', '#ff5a5a']

/**
 * Colour step for a day, 0 = nothing on. ⚠️ RANK-based, not proportional: tasks
 * here run for weeks, so on a proportional scale most days of the year sit near
 * the maximum and the whole calendar comes out one solid red — a square-root scale
 * (the first attempt) made that WORSE, since it lifts low values. Quantile bands
 * spend the seven shades evenly over the days that have work, so the map always
 * shows where the year was busier and quieter relative to itself. With the Tasks
 * unit the values are small integers, so ties can make two cut-points equal and a
 * shade goes unused — expected, not a fault.
 */
export function heatLevel(value: number, thresholds: number[]): number {
  if (value <= 0) return 0
  let level = 1
  for (const t of thresholds) if (value >= t && t > 0) level++
  return Math.min(level, HEAT.length)
}

export function heatColor(level: number, dark = false): string | null {
  const ramp = dark ? HEAT_DARK : HEAT
  return level > 0 ? ramp[Math.min(level, ramp.length) - 1] : null
}

/** Text colour that reads on the cell: dark ink on the light orange tints, white
 *  once the light ramp turns red, and white throughout on the dark ramp. */
export function heatInk(level: number, dark = false): string {
  if (dark) return level >= 5 ? '#ffffff' : '#f3d6d9'
  return level >= 5 ? '#ffffff' : '#1c1c28'
}

export const HEAT_STEPS = HEAT.length

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
/** Weeks start on Monday. */
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Monday = 0 … Sunday = 6 for a UTC date. */
const mondayIndex = (dt: Date) => (dt.getUTCDay() + 6) % 7

/** True for a Saturday or Sunday ISO date. */
export function isWeekendISO(iso: string): boolean {
  return mondayIndex(new Date(`${iso}T00:00:00Z`)) >= 5
}

/**
 * The cells of a month grid: leading blanks (null) so the 1st lands in its weekday
 * column (Monday first), then every date. Weekends are always present — the
 * Calendar page FADES them on request rather than removing them, so the grid keeps
 * its shape and weekend-only holidays stay visible.
 */
export function monthCells(year: number, month: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month, 1))
  const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const cells: (string | null)[] = Array.from({ length: mondayIndex(first) }, () => null)
  for (let d = 1; d <= count; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  return cells
}
