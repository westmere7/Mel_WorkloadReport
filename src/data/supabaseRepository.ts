import type { AppSettings, Task, TaskImage, TaskInput } from '../types'
import type { Repository } from './repository'
import type { SnapshotMeta, SnapshotPayload } from '../lib/snapshot'
import type { ShowcaseConfig, ShowcaseMeta, ShowcaseRecord } from '../lib/showcase'
import { getSupabase } from '../lib/supabaseClient'
import { DEFAULT_SETTINGS, canonicalAssetName, normalizeSizeDurations } from '../constants'
import { rowToTask, taskInputToRow, taskToRow } from './mappers'

const SETTINGS_ID = 'app'
/** Public Storage bucket for task images (created by supabase/schema.sql). */
const IMAGE_BUCKET = 'task-images'
/** Private Storage bucket for year-snapshot JSON blobs (created by supabase/schema.sql). */
const SNAPSHOT_BUCKET = 'snapshots'

/** True if a Supabase error means a table/relation is missing (pre-migration). */
function isMissingRelation(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null
  return (
    e?.code === '42P01' ||
    e?.code === 'PGRST205' ||
    (e?.message ?? '').toLowerCase().includes('does not exist')
  )
}

const SNAPSHOT_SETUP_MSG =
  "Snapshots aren't set up yet — run supabase/schema.sql to create the snapshots table + bucket."

const SHOWCASE_SETUP_MSG =
  "Showcase links aren't set up yet — run supabase/schema.sql to create the showcases table."

interface ShowcaseRow {
  id: string
  title: string | null
  year: number
  created_by: string | null
  task_count: number | null
  bytes: number | null
  expires_at: string | null
  config?: ShowcaseConfig
  created_at: string
}
function showcaseRowToMeta(row: ShowcaseRow): ShowcaseMeta {
  return {
    id: row.id,
    title: row.title ?? '',
    year: row.year,
    createdAt: row.created_at,
    createdBy: row.created_by ?? null,
    expiresAt: row.expires_at ?? null,
    taskCount: row.task_count ?? 0,
    bytes: row.bytes ?? 0,
  }
}

interface SnapshotRow {
  id: string
  year: number
  name: string | null
  comment: string | null
  created_by: string | null
  task_count: number | null
  image_count: number | null
  bytes: number | null
  app_version: string | null
  storage_path: string
  created_at: string
}
function snapshotRowToMeta(row: SnapshotRow): SnapshotMeta {
  return {
    id: row.id,
    year: row.year,
    name: row.name ?? '',
    comment: row.comment ?? '',
    createdAt: row.created_at,
    createdBy: row.created_by ?? null,
    taskCount: row.task_count ?? 0,
    imageCount: row.image_count ?? 0,
    bytes: row.bytes ?? 0,
    appVersion: row.app_version ?? '',
  }
}
function metaToSnapshotRow(meta: SnapshotMeta, path: string) {
  return {
    id: meta.id,
    year: meta.year,
    name: meta.name,
    comment: meta.comment,
    created_by: meta.createdBy,
    task_count: meta.taskCount,
    image_count: meta.imageCount,
    bytes: meta.bytes,
    app_version: meta.appVersion,
    storage_path: path,
    created_at: meta.createdAt,
  }
}

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

/** True if a Supabase error is complaining about a missing `allow_remove_used` column (pre-migration). */
function isMissingAllowRemoveColumn(err: unknown): boolean {
  const msg = ((err as { message?: string } | null)?.message ?? '').toLowerCase()
  return msg.includes('allow_remove_used') && (msg.includes('column') || msg.includes('schema cache'))
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

/** True if a Supabase error is complaining about a missing `images` column (pre-migration). */
function isMissingImagesColumn(err: unknown): boolean {
  const msg = ((err as { message?: string } | null)?.message ?? '').toLowerCase()
  return msg.includes('images') && (msg.includes('column') || msg.includes('schema cache'))
}

/** Drop the `images` key from a row (used to retry when the column isn't there yet). */
function stripImages<T extends { images?: unknown }>(row: T): Omit<T, 'images'> {
  const { images: _drop, ...rest } = row
  return rest
}

/**
 * Supabase-backed repository. Active automatically when VITE_SUPABASE_URL
 * and VITE_SUPABASE_ANON_KEY are set. Expects the schema in supabase/schema.sql.
 */
export class SupabaseRepository implements Repository {
  readonly backend = 'supabase' as const
  readonly supportsImages = true

  async uploadImage(blob: Blob, width: number, height: number): Promise<TaskImage> {
    const id = crypto.randomUUID()
    const path = `${id}.webp`
    const sb = getSupabase()
    const { error } = await sb.storage
      .from(IMAGE_BUCKET)
      .upload(path, blob, { contentType: 'image/webp', upsert: false })
    if (error) throw error
    const { data } = sb.storage.from(IMAGE_BUCKET).getPublicUrl(path)
    return { id, url: data.publicUrl, w: width, h: height }
  }

  async deleteImage(id: string): Promise<void> {
    const { error } = await getSupabase().storage.from(IMAGE_BUCKET).remove([`${id}.webp`])
    if (error) throw error
  }

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
    if (error && isMissingImagesColumn(error)) {
      row = stripImages(row)
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
    if (error && isMissingImagesColumn(error)) {
      rows = rows.map(stripImages)
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
    if (error && isMissingImagesColumn(error)) {
      ;({ data, error } = await getSupabase().from('tasks').update(stripImages(row)).eq('id', id).select('*').single())
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

  async restoreTasks(tasks: Task[]): Promise<void> {
    const sb = getSupabase()
    const { error: delErr } = await sb.from('tasks').delete().gte('created_at', '1970-01-01T00:00:00Z')
    if (delErr) throw delErr
    if (tasks.length === 0) return
    const { error } = await sb.from('tasks').insert(tasks.map(taskToRow))
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
      allowRemoveUsed: data.allow_remove_used ?? DEFAULT_SETTINGS.allowRemoveUsed,
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
      allow_remove_used: settings.allowRemoveUsed,
    }
    let { data, error } = await upsert(payload)
    // Retry dropping columns the DB hasn't migrated yet, so the rest still saves.
    if (error && isMissingAllowRemoveColumn(error)) {
      delete payload.allow_remove_used
      ;({ data, error } = await upsert(payload))
    }
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
      allowRemoveUsed: data.allow_remove_used ?? settings.allowRemoveUsed,
    }
  }

  // ── Year snapshots ────────────────────────────────────────────
  async listSnapshots(): Promise<SnapshotMeta[]> {
    const { data, error } = await getSupabase()
      .from('snapshots')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      if (isMissingRelation(error)) return [] // not migrated yet — show an empty list
      throw error
    }
    return (data ?? []).map((r) => snapshotRowToMeta(r as SnapshotRow))
  }

  async saveSnapshot(payload: SnapshotPayload): Promise<SnapshotMeta> {
    const sb = getSupabase()
    const { meta } = payload
    const path = `${meta.id}.json`
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
    const { error: upErr } = await sb.storage
      .from(SNAPSHOT_BUCKET)
      .upload(path, blob, { contentType: 'application/json', upsert: true })
    if (upErr) throw new Error(isMissingRelation(upErr) ? SNAPSHOT_SETUP_MSG : upErr.message)
    const { data, error } = await sb
      .from('snapshots')
      .insert(metaToSnapshotRow(meta, path))
      .select('*')
      .single()
    if (error) {
      // Roll back the orphaned blob if the metadata insert fails.
      await sb.storage.from(SNAPSHOT_BUCKET).remove([path])
      throw new Error(isMissingRelation(error) ? SNAPSHOT_SETUP_MSG : error.message)
    }
    return snapshotRowToMeta(data as SnapshotRow)
  }

  async loadSnapshot(id: string): Promise<SnapshotPayload> {
    const sb = getSupabase()
    const { data: row, error: rowErr } = await sb
      .from('snapshots')
      .select('storage_path')
      .eq('id', id)
      .single()
    if (rowErr) throw rowErr
    const path = (row as { storage_path: string }).storage_path
    const { data: blob, error } = await sb.storage.from(SNAPSHOT_BUCKET).download(path)
    if (error) throw error
    return JSON.parse(await blob.text()) as SnapshotPayload
  }

  async deleteSnapshot(id: string): Promise<void> {
    const sb = getSupabase()
    const { data: row } = await sb.from('snapshots').select('storage_path').eq('id', id).maybeSingle()
    const path = (row as { storage_path?: string } | null)?.storage_path ?? `${id}.json`
    await sb.storage.from(SNAPSHOT_BUCKET).remove([path])
    const { error } = await sb.from('snapshots').delete().eq('id', id)
    if (error) throw error
  }

  // ── Showcases ─────────────────────────────────────────────────
  async listShowcases(): Promise<ShowcaseMeta[]> {
    // Exclude `config` so the list stays light.
    const { data, error } = await getSupabase()
      .from('showcases')
      .select('id, title, year, created_by, task_count, bytes, expires_at, created_at')
      .order('created_at', { ascending: false })
    if (error) {
      if (isMissingRelation(error)) return []
      throw error
    }
    return (data ?? []).map((r) => showcaseRowToMeta(r as ShowcaseRow))
  }

  async saveShowcase(record: ShowcaseRecord): Promise<ShowcaseMeta> {
    const { meta, config } = record
    const { data, error } = await getSupabase()
      .from('showcases')
      .insert({
        id: meta.id,
        title: meta.title,
        year: meta.year,
        created_by: meta.createdBy,
        task_count: meta.taskCount,
        bytes: meta.bytes,
        expires_at: meta.expiresAt,
        config,
        created_at: meta.createdAt,
      })
      .select('id, title, year, created_by, task_count, bytes, expires_at, created_at')
      .single()
    if (error) throw new Error(isMissingRelation(error) ? SHOWCASE_SETUP_MSG : error.message)
    return showcaseRowToMeta(data as ShowcaseRow)
  }

  async getShowcase(id: string): Promise<ShowcaseRecord | null> {
    const { data, error } = await getSupabase().from('showcases').select('*').eq('id', id).maybeSingle()
    if (error) {
      if (isMissingRelation(error)) return null
      // A malformed id makes Postgres complain about uuid syntax — treat as not-found.
      if ((error as { code?: string }).code === '22P02') return null
      throw error
    }
    if (!data) return null
    const row = data as ShowcaseRow
    if (!row.config) return null
    return { meta: showcaseRowToMeta(row), config: row.config }
  }

  async deleteShowcase(id: string): Promise<void> {
    const { error } = await getSupabase().from('showcases').delete().eq('id', id)
    if (error) throw error
  }
}
