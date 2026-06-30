import type { Task } from '../types'
import { ASSET_FIELDS, SIZES } from '../constants'

export interface NamedCount {
  name: string
  value: number
}

function sortDesc(rec: Record<string, number>): NamedCount[] {
  return Object.entries(rec)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
}

/** Tasks grouped by a single string field. */
export function countByField(tasks: Task[], field: 'squad' | 'campaign' | 'half'): NamedCount[] {
  const rec: Record<string, number> = {}
  for (const t of tasks) {
    const key = String(t[field])
    rec[key] = (rec[key] ?? 0) + 1
  }
  return sortDesc(rec)
}

/** Tasks grouped by a multi-value field (types or people) — counts each membership. */
export function countByMulti(tasks: Task[], field: 'types' | 'people'): NamedCount[] {
  const rec: Record<string, number> = {}
  for (const t of tasks) {
    for (const v of t[field]) rec[v] = (rec[v] ?? 0) + 1
  }
  return sortDesc(rec)
}

/** Total assets split by asset type (image/video/…). */
export function assetsByType(tasks: Task[]): NamedCount[] {
  return ASSET_FIELDS.map((f) => ({
    name: f.label,
    value: tasks.reduce((acc, t) => acc + (Number(t.assetBreakdown[f.key]) || 0), 0),
  })).filter((d) => d.value > 0)
}

/** Total assets per person (splits a task's total evenly is misleading — we sum full total per assignee). */
export function assetsByPerson(tasks: Task[]): NamedCount[] {
  const rec: Record<string, number> = {}
  for (const t of tasks) {
    for (const p of t.people) rec[p] = (rec[p] ?? 0) + t.assetTotal
  }
  return sortDesc(rec)
}

export function totalAssets(tasks: Task[]): number {
  return tasks.reduce((acc, t) => acc + (t.assetTotal || 0), 0)
}

/** Task counts per T-shirt size, in fixed XS→XL order (zeros included). */
export function countBySize(tasks: Task[]): NamedCount[] {
  const rec: Record<string, number> = {}
  for (const t of tasks) rec[t.size] = (rec[t.size] ?? 0) + 1
  return SIZES.map((s) => ({ name: s, value: rec[s] ?? 0 }))
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Total assets booked in each month of the year (by task start date).
 * Shows how workload fluctuates across the year. Tasks without a start
 * date are excluded. Always returns 12 entries (Jan–Dec).
 */
export function assetsByMonth(tasks: Task[]): NamedCount[] {
  const totals = new Array(12).fill(0)
  for (const t of tasks) {
    if (!t.startDate) continue
    const m = Number(t.startDate.split('-')[1])
    if (m >= 1 && m <= 12) totals[m - 1] += t.assetTotal || 0
  }
  return MONTHS.map((name, i) => ({ name, value: totals[i] }))
}

export interface DashboardSummary {
  totalTasks: number
  totalAssets: number
  activeCampaigns: number
  peopleEngaged: number
}

export function summarize(tasks: Task[]): DashboardSummary {
  return {
    totalTasks: tasks.length,
    totalAssets: totalAssets(tasks),
    activeCampaigns: new Set(tasks.map((t) => t.campaign)).size,
    peopleEngaged: new Set(tasks.flatMap((t) => t.people)).size,
  }
}
