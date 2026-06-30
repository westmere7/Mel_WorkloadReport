import type { AssetBreakdown, Half, Size, Squad, Task, TaskInput } from '../types'
import { EMPTY_BREAKDOWN } from '../types'

/** Shape of a row in the Supabase `tasks` table (snake_case columns). */
export interface TaskRow {
  id: string
  squad: string
  campaign: string
  code: string
  name: string
  types: string[] | null
  asset_total: number | null
  asset_breakdown: Partial<AssetBreakdown> | null
  people: string[] | null
  start_date: string | null
  end_date: string | null
  half: string
  size: string | null
  created_at: string
  updated_at: string
}

/** Convert a DB row into the app's Task model. */
export function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    squad: row.squad as Squad,
    campaign: row.campaign,
    code: row.code,
    name: row.name,
    types: row.types ?? [],
    assetTotal: row.asset_total ?? 0,
    assetBreakdown: { ...EMPTY_BREAKDOWN, ...(row.asset_breakdown ?? {}) },
    people: row.people ?? [],
    startDate: row.start_date,
    endDate: row.end_date,
    half: (row.half as Half) ?? 'H1',
    size: (row.size as Size) ?? 'M',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Convert a TaskInput into the DB row shape for insert/update. */
export function taskInputToRow(input: TaskInput): Omit<TaskRow, 'id' | 'created_at' | 'updated_at'> {
  return {
    squad: input.squad,
    campaign: input.campaign,
    code: input.code,
    name: input.name,
    types: input.types,
    asset_total: input.assetTotal,
    asset_breakdown: input.assetBreakdown,
    people: input.people,
    start_date: input.startDate,
    end_date: input.endDate,
    half: input.half,
    size: input.size,
  }
}
