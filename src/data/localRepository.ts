import type { AppSettings, Task, TaskInput } from '../types'
import type { Repository } from './repository'
import { DEFAULT_SETTINGS, canonicalAssetName, normalizeBreakdown } from '../constants'
import { SEED_TASKS } from './seed'

const TASKS_KEY = 'mwr.tasks.v1'
const SETTINGS_KEY = 'mwr.settings.v1'
const SEEDED_KEY = 'mwr.seeded.v1'

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
      assetBreakdown: normalizeBreakdown(t.assetBreakdown),
    }))
  }

  async createTask(input: TaskInput): Promise<Task> {
    const tasks = await this.listTasks()
    const now = new Date().toISOString()
    const task: Task = { ...input, id: uid(), createdAt: now, updatedAt: now }
    write(TASKS_KEY, [task, ...tasks])
    return task
  }

  async createManyTasks(inputs: TaskInput[]): Promise<Task[]> {
    const tasks = await this.listTasks()
    const now = new Date().toISOString()
    const created: Task[] = inputs.map((input) => ({
      ...input,
      id: uid(),
      createdAt: now,
      updatedAt: now,
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

  subscribe(onChange: () => void): () => void {
    // Cross-tab updates: fires when another tab writes the tasks key.
    const handler = (e: StorageEvent) => {
      if (e.key === TASKS_KEY) onChange()
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }

  async renameValue(
    field: 'squad' | 'campaign' | 'types' | 'people' | 'assetBreakdown',
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
      if (field === 'assetBreakdown') {
        const keys = Object.keys(t.assetBreakdown).filter(
          (k) => canonicalAssetName(k) === oldValue && k !== newValue,
        )
        if (keys.length === 0) return t
        const b = { ...t.assetBreakdown }
        for (const k of keys) {
          b[newValue] = (b[newValue] ?? 0) + (b[k] ?? 0)
          delete b[k]
        }
        return { ...t, assetBreakdown: b }
      }
      const arr = t[field]
      if (!arr.includes(oldValue)) return t
      return { ...t, [field]: Array.from(new Set(arr.map((v) => (v === oldValue ? newValue : v)))) }
    })
    write(TASKS_KEY, next)
  }

  async getSettings(): Promise<AppSettings> {
    // Merge over defaults so older stored settings (missing newer keys like `squads`) don't break.
    return { ...DEFAULT_SETTINGS, ...read<Partial<AppSettings>>(SETTINGS_KEY, {}) }
  }

  async saveSettings(settings: AppSettings): Promise<AppSettings> {
    write(SETTINGS_KEY, settings)
    return settings
  }
}
