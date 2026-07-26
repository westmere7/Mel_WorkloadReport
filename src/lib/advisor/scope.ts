import type { AppSettings, Task } from '../../types'
import { hasAnyRate } from '../effort'
import { buildFindings, type AdvisorInput, type Finding } from './findings'

// ─────────────────────────────────────────────────────────────────────────────
// Advisor · what the advisor looks at
//
// The advisor reads the WHOLE record, always. It deliberately ignores the
// dashboard's year, function filter and Assets/Effort toggle: an analysis that
// changed because someone flipped a switch would be a view, not a finding, and
// two people looking at the same data would be told different things.
//
// One consequence worth knowing: month totals are bucketed by month-of-year
// across every year (see `valueByMonth`), so "the busiest month" is a statement
// about the annual cycle rather than about one particular month. The rules word
// their claims accordingly — see `coverage` in AdvisorInput.
// ─────────────────────────────────────────────────────────────────────────────

/** Calendar year of a task, from its start date. Null when undated. */
function yearOf(task: Task): number | null {
  if (!task.startDate) return null
  const y = Number(task.startDate.slice(0, 4))
  return Number.isFinite(y) && y > 1970 ? y : null
}

/**
 * The two most recent years that actually hold tasks.
 *
 * Not "latest and latest − 1": a gap year would otherwise produce a comparison
 * against nothing and silence every change rule. Returns null when there's only
 * one year on record, which correctly leaves those rules quiet.
 */
function yearPair(tasks: Task[], today: string): AdvisorInput['yoy'] {
  const byYear = new Map<number, Task[]>()
  for (const t of tasks) {
    const y = yearOf(t)
    if (y === null) continue
    const bucket = byYear.get(y)
    if (bucket) bucket.push(t)
    else byYear.set(y, [t])
  }
  const years = [...byYear.keys()].sort((a, b) => b - a)
  if (years.length < 2) return undefined
  const [recent, previous] = years

  // A year still in progress must not be measured against a finished one — seven
  // months of 2026 against all of 2025 reads as a collapse in output that never
  // happened. Clip BOTH sides to today's day-of-year, exactly as the dashboard's
  // comparison mode does, and let the rules disclose that they did.
  const partial = recent === Number(today.slice(0, 4))
  const cutoff = today.slice(5)
  const clip = (list: Task[]) =>
    partial ? list.filter((t) => t.startDate && t.startDate.slice(5) <= cutoff) : list

  return {
    recent: clip(byYear.get(recent) ?? []),
    previous: clip(byYear.get(previous) ?? []),
    recentYear: String(recent),
    previousYear: String(previous),
    partial,
  }
}

/** Years present in the record, for seasonal wording and the scope label. */
function coverageOf(tasks: Task[]): AdvisorInput['coverage'] {
  const years = [...new Set(tasks.map(yearOf).filter((y): y is number => y !== null))].sort(
    (a, b) => a - b,
  )
  if (!years.length) return undefined
  return {
    years: years.length,
    firstYear: String(years[0]),
    lastYear: String(years[years.length - 1]),
  }
}

/**
 * Build the advisor's input from everything on record.
 *
 * `tasks` may be the raw store list — drafts are dropped here so no caller has to
 * remember. `useEffort` follows whether any output rate exists, NOT the dashboard
 * toggle: if the team has told us how long things take, that's the better measure
 * regardless of which chart is on screen.
 */
export function buildAdvisorInput(
  tasks: Task[],
  settings: AppSettings,
  /** Injectable for tests; defaults to today. Only used to align the year pair. */
  today: string = new Date().toISOString().slice(0, 10),
): AdvisorInput {
  const all = tasks.filter((t) => !t.draft)
  const coverage = coverageOf(all)
  const useEffort = hasAnyRate(settings.assetRates)
  const span =
    !coverage || coverage.years === 1
      ? (coverage?.lastYear ?? 'no dated work')
      : `${coverage.firstYear}–${coverage.lastYear}`

  return {
    tasks: all,
    yoy: yearPair(all, today),
    rates: settings.assetRates,
    assetTypes: settings.assetTypes,
    sizeDurations: settings.sizeDurations,
    scopeLabel: [span, 'all GCMC functions', useEffort ? 'effort-weighted' : 'asset counts'].join(' · '),
    useEffort,
    coverage,
  }
}

/** Findings over the whole record, strongest first. */
export function advisorFindings(tasks: Task[], settings: AppSettings, today?: string): Finding[] {
  return buildFindings(buildAdvisorInput(tasks, settings, today))
}
