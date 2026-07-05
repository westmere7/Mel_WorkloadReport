import type { Squad, Task } from '../types'
import { SIZES } from '../constants'

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

/** Total deliverables produced per campaign, sorted desc. */
export function assetsByCampaign(tasks: Task[]): NamedCount[] {
  const rec: Record<string, number> = {}
  for (const t of tasks) rec[t.campaign] = (rec[t.campaign] ?? 0) + (t.assetTotal || 0)
  return sortDesc(rec)
}

/** Total deliverables produced per squad (stakeholder team), sorted desc. */
export function assetsBySquad(tasks: Task[]): NamedCount[] {
  const rec: Record<string, number> = {}
  for (const t of tasks) rec[t.squad] = (rec[t.squad] ?? 0) + (t.assetTotal || 0)
  return sortDesc(rec)
}

/** The three stakeholder groups used in the demand chart, in stack order. */
export const STAKEHOLDER_GROUPS = ['DOMESTIC', 'INTON', 'Other Stakeholders'] as const
export type StakeholderGroup = (typeof STAKEHOLDER_GROUPS)[number]

/** Map a requesting squad to its stakeholder group. */
export function stakeholderGroup(squad: Squad): StakeholderGroup {
  if (squad === 'DOM') return 'DOMESTIC'
  if (squad === 'INTON') return 'INTON'
  return 'Other Stakeholders'
}

export type StakeholderRow = { name: string } & Record<StakeholderGroup, number>

/**
 * Deliverables per work type, split across the three stakeholder groups —
 * feeds a 100%-stacked bar. A task's full asset total is counted for each of
 * its work types (mirrors assetsByPerson: not divided, to avoid understating).
 * `types` sets the axis order; empty rows (no assets) are dropped.
 */
export function demandByStakeholder(tasks: Task[], types: string[]): StakeholderRow[] {
  const rows: StakeholderRow[] = types.map((name) => ({
    name,
    DOMESTIC: 0,
    INTON: 0,
    'Other Stakeholders': 0,
  }))
  const byName = new Map(rows.map((r) => [r.name, r]))
  for (const t of tasks) {
    const assets = t.assetTotal || 0
    if (!assets) continue
    const group = stakeholderGroup(t.squad)
    for (const type of t.types) {
      const row = byName.get(type)
      if (row) row[group] += assets
    }
  }
  return rows.filter((r) => r.DOMESTIC + r.INTON + r['Other Stakeholders'] > 0)
}

/**
 * Deliverables per asset type split across the three stakeholder groups — the
 * asset-type counterpart of demandByStakeholder. `assetTypes` sets the axis
 * order; empty rows are dropped.
 */
export function demandByStakeholderAssetType(tasks: Task[], assetTypes: string[]): StakeholderRow[] {
  const rows: StakeholderRow[] = assetTypes.map((name) => ({
    name,
    DOMESTIC: 0,
    INTON: 0,
    'Other Stakeholders': 0,
  }))
  const byName = new Map(rows.map((r) => [r.name, r]))
  for (const t of tasks) {
    const group = stakeholderGroup(t.squad)
    for (const name of assetTypes) {
      byName.get(name)![group] += Number(t.assetBreakdown[name]) || 0
    }
  }
  return rows.filter((r) => r.DOMESTIC + r.INTON + r['Other Stakeholders'] > 0)
}

/** Total assets split by asset type. `assetTypes` sets the order; empty types are dropped. */
export function assetsByType(tasks: Task[], assetTypes: string[]): NamedCount[] {
  return assetTypes
    .map((name) => ({
      name,
      value: tasks.reduce((acc, t) => acc + (Number(t.assetBreakdown[name]) || 0), 0),
    }))
    .filter((d) => d.value > 0)
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

/**
 * Map each task id to its "No." — the add/update order (earliest = 1). The
 * number tracks activity, not identity: editing a task bumps its updatedAt so
 * it moves to the end of the order (highest No.). Ordered by updatedAt when
 * present, falling back to start date, with the code as a final deterministic
 * tiebreak. Used by the task list and CSV export so both show the same numbering.
 */
export function addedOrderMap(tasks: Task[]): Map<string, number> {
  const sorted = [...tasks].sort((a, b) => {
    const ca = a.updatedAt || ''
    const cb = b.updatedAt || ''
    if (ca !== cb) return ca < cb ? -1 : 1
    const sa = a.startDate || ''
    const sb = b.startDate || ''
    if (sa !== sb) return sa < sb ? -1 : 1
    return String(a.code).localeCompare(String(b.code))
  })
  const map = new Map<string, number>()
  sorted.forEach((t, i) => map.set(t.id, i + 1))
  return map
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

/** The single most-requested work type across all tasks (null if none tagged). */
export function topRequestType(tasks: Task[]): { name: string; count: number } | null {
  const ranked = countByMulti(tasks, 'types')
  return ranked.length ? { name: ranked[0].name, count: ranked[0].value } : null
}

export interface DashboardSummary {
  totalTasks: number
  totalAssets: number
  totalCampaigns: number
  topRequestType: { name: string; count: number } | null
}

export function summarize(tasks: Task[]): DashboardSummary {
  return {
    totalTasks: tasks.length,
    totalAssets: totalAssets(tasks),
    totalCampaigns: new Set(tasks.map((t) => t.campaign)).size,
    topRequestType: topRequestType(tasks),
  }
}
