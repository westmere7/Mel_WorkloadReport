import type { AppSettings, Task, TaskInput } from '../types'
import type { Repository } from './repository'
import { getSupabase } from '../lib/supabaseClient'
import { DEFAULT_SETTINGS, canonicalAssetName, normalizeSizeDurations } from '../constants'
import { rowToTask, taskInputToRow } from './mappers'

const SETTINGS_ID = 'app'

/** True if a Supabase error is complaining about a missing `note` column (pre-migration). */
function isMissingNoteColumn(err: unknown): boolean {
  const msg = ((err as { message?: string } | null)?.message ?? '').toLowerCase()
  return msg.includes('note') && (msg.includes('column') || msg.includes('schema cache'))
}

/** Drop the `note` key from a row (used to retry when the column isn't there yet). */
function stripNote<T extends { note?: unknown }>(row: T): Omit<T, 'note'> {
  const { note: _drop, ...rest } = row
  return rest
}

/** True if a Supabase error is complaining about a missing `squads` column (pre-migration). */
function isMissingSquadsColumn(err: unknown): boolean {
  const msg = ((err as { message?: string } | null)?.message ?? '').toLowerCase()
  return msg.includes('squads') && (msg.includes('column') || msg.includes('schema cache'))
}

/** True if a Supabase error is complaining about a missing `size_durations` column (pre-migration). */
function isMissingSizeDurationsColumn(err: unknown): boolean {
  const msg = ((err as { message?: string } | null)?.message ?? '').toLowerCase()
  return msg.includes('size_durations') && (msg.includes('column') || msg.includes('schema cache'))
}

/** True if a Supabase error is complaining about a missing `created_by` column (pre-migration). */
function isMissingCreatedByColumn(err: unknown): boolean {
  const msg = ((err as { message?: string } | null)?.message ?? '').toLowerCase()
  return msg.includes('created_by') && (msg.includes('column') || msg.includes('schema cache'))
}

/** Drop the `created_by` key from a row (used to retry when the column isn't there yet). */
function stripCreatedBy<T extends { created_by?: unknown }>(row: T): Omit<T, 'created_by'> {
  const { created_by: _drop, ...rest } = row
  return rest
}

/**
 * Supabase-backed repository. Active automatically when VITE_SUPABASE_URL
 * and VITE_SUPABASE_ANON_KEY are set. Expects the schema in supabase/schema.sql.
 */
export class SupabaseRepository implements Repository {
  readonly backend = 'supabase' as const

  async listTasks(): Promise<Task[]> {
    const { data, error } = await getSupabase()
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(rowToTask)
  }

  async createTask(input: TaskInput, createdBy: string | null = null): Promise<Task> {
    let row: Record<string, unknown> =
      createdBy != null ? { ...taskInputToRow(input), created_by: createdBy } : { ...taskInputToRow(input) }
    let { data, error } = await getSupabase().from('tasks').insert(row).select('*').single()
    // Retry stripping columns the DB hasn't migrated yet, so creation keeps working.
    if (error && isMissingCreatedByColumn(error)) {
      row = stripCreatedBy(row)
      ;({ data, error } = await getSupabase().from('tasks').insert(row).select('*').single())
    }
    if (error && isMissingNoteColumn(error)) {
      row = stripNote(row)
      ;({ data, error } = await getSupabase().from('tasks').insert(row).select('*').single())
    }
    if (error) throw error
    return rowToTask(data)
  }

  async createManyTasks(inputs: TaskInput[], createdBy: string | null = null): Promise<Task[]> {
    let rows: Record<string, unknown>[] = inputs.map((input) =>
      createdBy != null ? { ...taskInputToRow(input), created_by: createdBy } : { ...taskInputToRow(input) },
    )
    let { data, error } = await getSupabase().from('tasks').insert(rows).select('*')
    if (error && isMissingCreatedByColumn(error)) {
      rows = rows.map(stripCreatedBy)
      ;({ data, error } = await getSupabase().from('tasks').insert(rows).select('*'))
    }
    if (error && isMissingNoteColumn(error)) {
      rows = rows.map(stripNote)
      ;({ data, error } = await getSupabase().from('tasks').insert(rows).select('*'))
    }
    if (error) throw error
    return (data ?? []).map(rowToTask)
  }

  async updateTask(id: string, input: TaskInput): Promise<Task> {
    const row = { ...taskInputToRow(input), updated_at: new Date().toISOString() }
    let { data, error } = await getSupabase().from('tasks').update(row).eq('id', id).select('*').single()
    if (error && isMissingNoteColumn(error)) {
      ;({ data, error } = await getSupabase().from('tasks').update(stripNote(row)).eq('id', id).select('*').single())
    }
    if (error) throw error
    return rowToTask(data)
  }

  async deleteTask(id: string): Promise<void> {
    const { error } = await getSupabase().from('tasks').delete().eq('id', id)
    if (error) throw error
  }

  async deleteAllTasks(): Promise<void> {
    // supabase-js requires a filter on delete; match every row.
    const { error } = await getSupabase()
      .from('tasks')
      .delete()
      .gte('created_at', '1970-01-01T00:00:00Z')
    if (error) throw error
  }

  subscribe(onChange: () => void): () => void {
    const channel = getSupabase()
      .channel('public:tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => onChange())
      .subscribe()
    return () => {
      void getSupabase().removeChannel(channel)
    }
  }

  subscribeSettings(onChange: () => void): () => void {
    const channel = getSupabase()
      .channel('public:settings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, () => onChange())
      .subscribe()
    return () => {
      void getSupabase().removeChannel(channel)
    }
  }

  async renameValue(
    field: 'squad' | 'campaign' | 'types' | 'people' | 'assetBreakdown',
    oldValue: string,
    newValue: string,
  ): Promise<void> {
    const sb = getSupabase()

    if (field === 'squad' || field === 'campaign') {
      const { error } = await sb
        .from('tasks')
        .update({ [field]: newValue, updated_at: new Date().toISOString() })
        .eq(field, oldValue)
      if (error) throw error
      return
    }

    if (field === 'assetBreakdown') {
      // JSONB column: fetch every task and rename any key that resolves to
      // oldValue (matches both legacy fixed keys like "html5" and name keys).
      const { data, error } = await sb.from('tasks').select('id, asset_breakdown')
      if (error) throw error
      await Promise.all(
        (data ?? [])
          .map((row) => {
            const raw = (row as { asset_breakdown: Record<string, number> | null }).asset_breakdown
            if (!raw) return null
            const keys = Object.keys(raw).filter((k) => canonicalAssetName(k) === oldValue && k !== newValue)
            if (keys.length === 0) return null
            const b: Record<string, number> = { ...raw }
            for (const k of keys) {
              b[newValue] = (b[newValue] ?? 0) + (b[k] ?? 0)
              delete b[k]
            }
            return sb
              .from('tasks')
              .update({ asset_breakdown: b, updated_at: new Date().toISOString() })
              .eq('id', (row as { id: string }).id)
              .then(({ error: e }) => {
                if (e) throw e
              })
          })
          .filter((p): p is Promise<void> => p !== null),
      )
      return
    }

    // Array columns (types/people): fetch affected rows, rewrite each array.
    const { data, error } = await sb
      .from('tasks')
      .select('id, types, people')
      .contains(field, [oldValue])
    if (error) throw error

    await Promise.all(
      (data ?? []).map((row) => {
        const arr = ((row as Record<string, unknown>)[field] as string[] | null) ?? []
        const nextArr = Array.from(new Set(arr.map((v) => (v === oldValue ? newValue : v))))
        return sb
          .from('tasks')
          .update({ [field]: nextArr, updated_at: new Date().toISOString() })
          .eq('id', (row as { id: string }).id)
          .then(({ error: e }) => {
            if (e) throw e
          })
      }),
    )
  }

  async getSettings(): Promise<AppSettings> {
    const { data, error } = await getSupabase()
      .from('settings')
      .select('*')
      .eq('id', SETTINGS_ID)
      .maybeSingle()
    if (error) throw error
    if (!data) return DEFAULT_SETTINGS
    return {
      squads: data.squads ?? DEFAULT_SETTINGS.squads,
      campaigns: data.campaigns ?? DEFAULT_SETTINGS.campaigns,
      types: data.types ?? DEFAULT_SETTINGS.types,
      people: data.people ?? DEFAULT_SETTINGS.people,
      assetTypes: data.asset_types ?? DEFAULT_SETTINGS.assetTypes,
      sizeDurations: normalizeSizeDurations(data.size_durations),
    }
  }

  async saveSettings(settings: AppSettings): Promise<AppSettings> {
    const base = {
      id: SETTINGS_ID,
      campaigns: settings.campaigns,
      types: settings.types,
      people: settings.people,
      asset_types: settings.assetTypes,
      updated_at: new Date().toISOString(),
    }
    const upsert = (payload: Record<string, unknown>) =>
      getSupabase().from('settings').upsert(payload).select('*').single()

    let payload: Record<string, unknown> = {
      ...base,
      squads: settings.squads,
      size_durations: settings.sizeDurations,
    }
    let { data, error } = await upsert(payload)
    // Retry dropping columns the DB hasn't migrated yet, so the rest still saves.
    if (error && isMissingSizeDurationsColumn(error)) {
      delete payload.size_durations
      ;({ data, error } = await upsert(payload))
    }
    if (error && isMissingSquadsColumn(error)) {
      delete payload.squads
      ;({ data, error } = await upsert(payload))
    }
    if (error) throw error
    return {
      squads: data.squads ?? settings.squads,
      campaigns: data.campaigns,
      types: data.types,
      people: data.people,
      assetTypes: data.asset_types ?? settings.assetTypes,
      sizeDurations: normalizeSizeDurations(data.size_durations ?? settings.sizeDurations),
    }
  }
}
