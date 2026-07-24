import type { ChartGroup } from '../types'

/**
 * Apply display groups (see ChartGroup) to chart rows keyed by `name`.
 *
 * Rows whose name belongs to a group collapse into ONE row named after the
 * group, taking the position of the group's first-seen member; every NUMERIC
 * field is summed (so it works for donut rows `{name, value}` and stacked rows
 * `{name, DOMESTIC, INTON, …}` alike). The group's `color` rides along for
 * charts that colour per-row. Ungrouped rows pass through untouched.
 */
export function applyChartGroups<T extends { name: string }>(
  rows: T[],
  groups: ChartGroup[],
): (T & { color?: string })[] {
  if (!groups.length) return rows
  const owner = new Map<string, ChartGroup>()
  for (const g of groups) for (const item of g.items) if (!owner.has(item)) owner.set(item, g)
  if (!owner.size) return rows

  const out: (T & { color?: string })[] = []
  const mergedByGroup = new Map<string, T & { color?: string }>()
  for (const row of rows) {
    const g = owner.get(row.name)
    if (!g) {
      out.push(row)
      continue
    }
    const existing = mergedByGroup.get(g.id)
    if (!existing) {
      const merged = { ...row, name: g.name, color: g.color }
      mergedByGroup.set(g.id, merged)
      out.push(merged) // holds the first member's position
    } else {
      const acc = existing as unknown as Record<string, unknown>
      for (const [k, v] of Object.entries(row)) {
        if (typeof v === 'number') acc[k] = ((acc[k] as number | undefined) ?? 0) + v
      }
    }
  }
  return out
}

/**
 * Expand a clicked chart label into task-list filter values: a group name maps
 * to its member items; anything else is just itself. (If a group happens to
 * share its name with a real item, the group wins — its members already cover
 * the chart row that was clicked.)
 */
export function expandChartSelection(groups: ChartGroup[], name: string): string[] {
  const g = groups.find((x) => x.name === name)
  return g && g.items.length ? g.items : [name]
}
