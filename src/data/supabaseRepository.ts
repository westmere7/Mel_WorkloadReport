import type { AppSettings, Task, TaskInput } from '../types'
import type { Repository } from './repository'
import { getSupabase } from '../lib/supabaseClient'
import { DEFAULT_SETTINGS, canonicalAssetName } from '../constants'
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

  async createTask(input: TaskInput): Promise<Task> {
    const row = taskInputToRow(input)
    let { data, error } = await getSupabase().from('tasks').insert(row).select('*').single()
    if (error && isMissingNoteColumn(error)) {
      ;({ data, error } = await getSupabase().from('tasks').insert(stripNote(row)).select('*').single())
    }
    if (error) throw error
    return rowToTask(data)
  }

  async createManyTasks(inputs: TaskInput[]): Promise<Task[]> {
    const rows = inputs.map(taskInputToRow)
    let { data, error } = await getSupabase().from('tasks').insert(rows).select('*')
    if (error && isMissingNoteColumn(error)) {
      ;({ data, error } = await getSupabase().from('tasks').insert(rows.map(stripNote)).select('*'))
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

  async renameValue(
    field: 'campaign' | 'types' | 'people' | 'assetBreakdown',
    oldValue: string,
    newValue: string,
  ): Promise<void> {
    const sb = getSupabase()

    if (field === 'campaign') {
      const { error } = await sb
        .from('tasks')
        .update({ campaign: newValue, updated_at: new Date().toISOString() })
        .eq('campaign', oldValue)
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
      campaigns: data.campaigns ?? DEFAULT_SETTINGS.campaigns,
      types: data.types ?? DEFAULT_SETTINGS.types,
      people: data.people ?? DEFAULT_SETTINGS.people,
      assetTypes: data.asset_types ?? DEFAULT_SETTINGS.assetTypes,
    }
  }

  async saveSettings(settings: AppSettings): Promise<AppSettings> {
    const { data, error } = await getSupabase()
      .from('settings')
      .upsert({
        id: SETTINGS_ID,
        campaigns: settings.campaigns,
        types: settings.types,
        people: settings.people,
        asset_types: settings.assetTypes,
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single()
    if (error) throw error
    return {
      campaigns: data.campaigns,
      types: data.types,
      people: data.people,
      assetTypes: data.asset_types ?? settings.assetTypes,
    }
  }
}
