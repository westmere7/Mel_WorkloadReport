import type { AppSettings, Task, TaskInput } from '../types'
import type { Repository } from './repository'
import type { SnapshotMeta, SnapshotPayload } from '../lib/snapshot'
import type { ShowcaseMeta, ShowcaseRecord } from '../lib/showcase'
import {
  DEFAULT_SETTINGS,
  canonicalAssetName,
  normalizeBreakdown,
  normalizeFunctionData,
  normalizeFunctions,
  normalizeSizeDurations,
} from '../constants'
import {
  renameAssetTypeInFunctionData,
  renameFunctionKey,
  renameWorkTypeInFunctionData,
} from '../lib/functionData'
import { SEED_TASKS } from './seed'

const TASKS_KEY = 'mwr.tasks.v1'
const SETTINGS_KEY = 'mwr.settings.v1'
const SEEDED_KEY = 'mwr.seeded.v1'
const SNAPSHOTS_KEY = 'mwr.snapshots.v1' // metadata list
const snapshotKey = (id: string) => `mwr.snapshot.${id}` // full payload
const SHOWCASES_KEY = 'mwr.showcases.v1' // ShowcaseMeta[]
const showcaseKey = (id: string) => `mwr.showcase.${id}` // full ShowcaseRecord

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value))
}

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/**
 * localStorage-backed repository. Seeds sample data on first run so the
 * app is immediately usable, and works fully offline.
 */
export class LocalRepository implements Repository {
  readonly backend = 'local' as const
  readonly supportsImages = false

  async uploadImage(): Promise<never> {
    throw new Error('Image upload requires Supabase. Connect a project to enable it.')
  }

  async deleteImage(): Promise<void> {
    // No-op: local mode never stores images, so there's nothing to remove.
  }

  constructor() {
    // Seed once.
    if (!localStorage.getItem(SEEDED_KEY)) {
      if (!localStorage.getItem(TASKS_KEY)) {
        write(TASKS_KEY, SEED_TASKS)
      }
      write(SEEDED_KEY, '1')
    }
  }

  async listTasks(): Promise<Task[]> {
    // Default any field added after a task was first saved (e.g. `size`), and
    // migrate legacy fixed breakdown keys to the name-keyed form.
    return read<Task[]>(TASKS_KEY, []).map((t) => ({
      ...t,
      size: t.size ?? 'M',
      createdBy: t.createdBy ?? null,
      images: t.images ?? [],
      assetBreakdown: normalizeBreakdown(t.assetBreakdown),
      functionData: normalizeFunctionData(t.functionData),
    }))
  }

  async createTask(input: TaskInput, createdBy: string | null = null): Promise<Task> {
    const tasks = await this.listTasks()
    const now = new Date().toISOString()
    const task: Task = { ...input, id: uid(), createdAt: now, updatedAt: now, createdBy }
    write(TASKS_KEY, [task, ...tasks])
    return task
  }

  async createManyTasks(inputs: TaskInput[], createdBy: string | null = null): Promise<Task[]> {
    const tasks = await this.listTasks()
    const now = new Date().toISOString()
    const created: Task[] = inputs.map((input) => ({
      ...input,
      id: uid(),
      createdAt: now,
      updatedAt: now,
      createdBy,
    }))
    write(TASKS_KEY, [...created, ...tasks])
    return created
  }

  async updateTask(id: string, input: TaskInput): Promise<Task> {
    const tasks = await this.listTasks()
    const idx = tasks.findIndex((t) => t.id === id)
    if (idx === -1) throw new Error(`Task ${id} not found`)
    const updated: Task = {
      ...tasks[idx],
      ...input,
      id,
      updatedAt: new Date().toISOString(),
    }
    tasks[idx] = updated
    write(TASKS_KEY, tasks)
    return updated
  }

  async deleteTask(id: string): Promise<void> {
    const tasks = await this.listTasks()
    write(
      TASKS_KEY,
      tasks.filter((t) => t.id !== id),
    )
  }

  async deleteAllTasks(): Promise<void> {
    write(TASKS_KEY, [])
  }

  async restoreTasks(tasks: Task[]): Promise<void> {
    write(TASKS_KEY, tasks)
  }

  subscribe(onChange: () => void): () => void {
    // Cross-tab updates: fires when another tab writes the tasks key.
    const handler = (e: StorageEvent) => {
      if (e.key === TASKS_KEY) onChange()
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }

  subscribeSettings(onChange: () => void): () => void {
    // Cross-tab updates: fires when another tab writes the settings key.
    const handler = (e: StorageEvent) => {
      if (e.key === SETTINGS_KEY) onChange()
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }

  async renameValue(
    field: 'squad' | 'campaign' | 'types' | 'people' | 'assetBreakdown' | 'functionData',
    oldValue: string,
    newValue: string,
  ): Promise<void> {
    const tasks = await this.listTasks()
    const next = tasks.map((t) => {
      if (field === 'squad') {
        return t.squad === oldValue ? { ...t, squad: newValue } : t
      }
      if (field === 'campaign') {
        return t.campaign === oldValue ? { ...t, campaign: newValue } : t
      }
      if (field === 'functionData') {
        // Rename a FUNCTION: rewrite the per-function map key.
        const fd = t.functionData ? renameFunctionKey(t.functionData, oldValue, newValue) : null
        return fd ? { ...t, functionData: fd } : t
      }
      if (field === 'assetBreakdown') {
        const keys = Object.keys(t.assetBreakdown).filter(
          (k) => canonicalAssetName(k) === oldValue && k !== newValue,
        )
        // Nested per-function breakdowns must follow the rename too.
        const fd = t.functionData ? renameAssetTypeInFunctionData(t.functionData, oldValue, newValue) : null
        if (keys.length === 0 && !fd) return t
        const b = { ...t.assetBreakdown }
        for (const k of keys) {
          b[newValue] = (b[newValue] ?? 0) + (b[k] ?? 0)
          delete b[k]
        }
        return { ...t, assetBreakdown: b, functionData: fd ?? t.functionData }
      }
      const arr = t[field]
      // Work types also live inside per-function entries.
      const fd =
        field === 'types' && t.functionData
          ? renameWorkTypeInFunctionData(t.functionData, oldValue, newValue)
          : null
      if (!arr.includes(oldValue) && !fd) return t
      return {
        ...t,
        [field]: Array.from(new Set(arr.map((v) => (v === oldValue ? newValue : v)))),
        functionData: fd ?? t.functionData,
      }
    })
    write(TASKS_KEY, next)
  }

  async getSettings(): Promise<AppSettings> {
    // Merge over defaults so older stored settings (missing newer keys like `squads`) don't break.
    const stored = read<Partial<AppSettings>>(SETTINGS_KEY, {})
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      sizeDurations: normalizeSizeDurations(stored.sizeDurations),
      functions: normalizeFunctions(stored.functions),
    }
  }

  async saveSettings(settings: AppSettings): Promise<AppSettings> {
    write(SETTINGS_KEY, settings)
    return settings
  }

  // ── Year snapshots (localStorage) ─────────────────────────────
  async listSnapshots(): Promise<SnapshotMeta[]> {
    return read<SnapshotMeta[]>(SNAPSHOTS_KEY, [])
  }

  async saveSnapshot(payload: SnapshotPayload): Promise<SnapshotMeta> {
    const { meta } = payload
    write(snapshotKey(meta.id), payload)
    const list = read<SnapshotMeta[]>(SNAPSHOTS_KEY, []).filter((s) => s.id !== meta.id)
    write(SNAPSHOTS_KEY, [meta, ...list])
    return meta
  }

  async loadSnapshot(id: string): Promise<SnapshotPayload> {
    const payload = read<SnapshotPayload | null>(snapshotKey(id), null)
    if (!payload) throw new Error('Snapshot not found.')
    return payload
  }

  async deleteSnapshot(id: string): Promise<void> {
    localStorage.removeItem(snapshotKey(id))
    write(
      SNAPSHOTS_KEY,
      read<SnapshotMeta[]>(SNAPSHOTS_KEY, []).filter((s) => s.id !== id),
    )
  }

  // ── Showcases (localStorage — links only open in this browser) ──
  async listShowcases(): Promise<ShowcaseMeta[]> {
    return read<ShowcaseMeta[]>(SHOWCASES_KEY, [])
  }

  async saveShowcase(record: ShowcaseRecord): Promise<ShowcaseMeta> {
    const { meta } = record
    write(showcaseKey(meta.id), record)
    const list = read<ShowcaseMeta[]>(SHOWCASES_KEY, []).filter((s) => s.id !== meta.id)
    write(SHOWCASES_KEY, [meta, ...list])
    return meta
  }

  async getShowcase(id: string): Promise<ShowcaseRecord | null> {
    return read<ShowcaseRecord | null>(showcaseKey(id), null)
  }

  async deleteShowcase(id: string): Promise<void> {
    localStorage.removeItem(showcaseKey(id))
    write(
      SHOWCASES_KEY,
      read<ShowcaseMeta[]>(SHOWCASES_KEY, []).filter((s) => s.id !== id),
    )
  }
}
