import type { AppSettings, Task, TaskInput } from '../types'
import type { Repository } from './repository'
import { getSupabase } from '../lib/supabaseClient'
import { DEFAULT_SETTINGS } from '../constants'
import { rowToTask, taskInputToRow } from './mappers'

const SETTINGS_ID = 'app'

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
    const { data, error } = await getSupabase()
      .from('tasks')
      .insert(taskInputToRow(input))
      .select('*')
      .single()
    if (error) throw error
    return rowToTask(data)
  }

  async createManyTasks(inputs: TaskInput[]): Promise<Task[]> {
    const { data, error } = await getSupabase()
      .from('tasks')
      .insert(inputs.map(taskInputToRow))
      .select('*')
    if (error) throw error
    return (data ?? []).map(rowToTask)
  }

  async updateTask(id: string, input: TaskInput): Promise<Task> {
    const { data, error } = await getSupabase()
      .from('tasks')
      .update({ ...taskInputToRow(input), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single()
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
    field: 'campaign' | 'types' | 'people',
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
    }
  }

  async saveSettings(settings: AppSettings): Promise<AppSettings> {
    const { data, error } = await getSupabase()
      .from('settings')
      .upsert({ id: SETTINGS_ID, ...settings, updated_at: new Date().toISOString() })
      .select('*')
      .single()
    if (error) throw error
    return {
      campaigns: data.campaigns,
      types: data.types,
      people: data.people,
    }
  }
}
