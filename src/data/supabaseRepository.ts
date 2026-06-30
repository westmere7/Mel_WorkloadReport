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
