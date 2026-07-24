import type { AssetBreakdown, FunctionData, Half, Size, Squad, Task, TaskImage, TaskInput, TaskLogEntry } from '../types'
import { normalizeBreakdown, normalizeFunctionData } from '../constants'
import { normalizeTaskLog } from '../lib/taskLog'

/** Shape of a row in the Supabase `tasks` table (snake_case columns). */
export interface TaskRow {
  id: string
  squad: string
  campaign: string
  code: string
  name: string
  types: string[] | null
  asset_total: number | null
  asset_breakdown: AssetBreakdown | null
  people: string[] | null
  start_date: string | null
  end_date: string | null
  half: string
  size: string | null
  note: string | null
  images: TaskImage[] | null
  /** Per-function workload slices; null for legacy rows (pre-functions). */
  function_data: FunctionData | null
  /** Draft flag — saved with only a name; excluded from the dashboard. */
  draft: boolean | null
  /** User "starred" flag — a personal marker for quick filtering. */
  starred: boolean | null
  /** Linked monday.com item URL. */
  monday_url?: string | null
  /** Per-task edit log (jsonb) — deleted with the row. */
  edit_log?: TaskLogEntry[] | null
  created_at: string
  updated_at: string
  created_by: string | null
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
    assetBreakdown: normalizeBreakdown(row.asset_breakdown),
    people: row.people ?? [],
    startDate: row.start_date,
    endDate: row.end_date,
    half: (row.half as Half) ?? 'H1',
    size: (row.size as Size) ?? 'M',
    images: Array.isArray(row.images) ? row.images : [],
    note: row.note ?? '',
    functionData: normalizeFunctionData(row.function_data),
    draft: row.draft === true,
    starred: row.starred === true,
    mondayUrl: row.monday_url ?? undefined,
    log: normalizeTaskLog(row.edit_log),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by ?? null,
  }
}

/** Convert a full Task into a complete DB row, preserving id/timestamps/creator
 *  (used by snapshot revert for a faithful restore). */
export function taskToRow(task: Task): TaskRow {
  return {
    ...taskInputToRow(task),
    id: task.id,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
    created_by: task.createdBy ?? null,
  }
}

/** Convert a TaskInput into the DB row shape for insert/update. */
export function taskInputToRow(input: TaskInput): Omit<TaskRow, 'id' | 'created_at' | 'updated_at' | 'created_by'> {
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
    images: input.images ?? [],
    note: input.note ?? '',
    function_data: input.functionData ?? null,
    draft: input.draft === true,
    starred: input.starred === true,
    monday_url: input.mondayUrl ?? null,
    edit_log: input.log ?? [],
  }
}
