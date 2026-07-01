import type { Squad, Task } from '../types'
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

/** Total deliverables produced per campaign, sorted desc. */
export function assetsByCampaign(tasks: Task[]): NamedCount[] {
  const rec: Record<string, number> = {}
  for (const t of tasks) rec[t.campaign] = (rec[t.campaign] ?? 0) + (t.assetTotal || 0)
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
 * Deliverables per asset type (image/video/…) split across the three
 * stakeholder groups — the asset-type counterpart of demandByStakeholder.
 * Uses each task's per-type asset breakdown. Empty rows are dropped.
 */
export function demandByStakeholderAssetType(tasks: Task[]): StakeholderRow[] {
  const rows: StakeholderRow[] = ASSET_FIELDS.map((f) => ({
    name: f.label,
    DOMESTIC: 0,
    INTON: 0,
    'Other Stakeholders': 0,
  }))
  for (const t of tasks) {
    const group = stakeholderGroup(t.squad)
    ASSET_FIELDS.forEach((f, i) => {
      rows[i][group] += Number(t.assetBreakdown[f.key]) || 0
    })
  }
  return rows.filter((r) => r.DOMESTIC + r.INTON + r['Other Stakeholders'] > 0)
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
