import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { AppSettings, Task, TaskInput } from '../types'
import type { Repository } from './repository'
import { LocalRepository } from './localRepository'
import { SupabaseRepository } from './supabaseRepository'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { DEFAULT_SETTINGS } from '../constants'
import { generateSampleTasks } from '../lib/sampleData'
import { toMessage } from '../lib/format'

interface StoreValue {
  backend: 'local' | 'supabase'
  loading: boolean
  error: string | null
  tasks: Task[]
  settings: AppSettings
  refresh: () => Promise<void>
  createTask: (input: TaskInput) => Promise<Task>
  updateTask: (id: string, input: TaskInput) => Promise<Task>
  deleteTask: (id: string) => Promise<void>
  deleteAllTasks: () => Promise<void>
  /** Bulk import from a parsed CSV: 'replace' wipes first, 'merge' adds new & updates matching codes. */
  importTasks: (inputs: TaskInput[], mode: 'replace' | 'merge') => Promise<{ created: number; updated: number }>
  populateSampleData: (count?: number) => Promise<number>
  saveSettings: (settings: AppSettings) => Promise<void>
  /** Rename a campaign/type/person in Settings and propagate to all tasks. */
  renameListItem: (key: 'campaigns' | 'types' | 'people', oldValue: string, newValue: string) => Promise<void>
  /** True while a live (realtime/cross-tab) subscription is active. */
  live: boolean
}

const StoreContext = createContext<StoreValue | null>(null)

function createRepository(): Repository {
  return isSupabaseConfigured() ? new SupabaseRepository() : new LocalRepository()
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const repoRef = useRef<Repository>()
  if (!repoRef.current) repoRef.current = createRepository()
  const repo = repoRef.current

  const [tasks, setTasks] = useState<Task[]>([])
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [live, setLive] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [t, s] = await Promise.all([repo.listTasks(), repo.getSettings()])
      setTasks(t)
      setSettings(s)
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setLoading(false)
    }
  }, [repo])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Live updates: re-fetch tasks when they change elsewhere (Supabase realtime
  // or another browser tab). Debounced so bulk inserts collapse into one reload.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const reload = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        repo
          .listTasks()
          .then(setTasks)
          .catch(() => {})
      }, 250)
    }
    const unsubscribe = repo.subscribe(reload)
    setLive(true)
    return () => {
      if (timer) clearTimeout(timer)
      unsubscribe()
      setLive(false)
    }
  }, [repo])

  const createTask = useCallback(
    async (input: TaskInput) => {
      const task = await repo.createTask(input)
      setTasks((prev) => [task, ...prev])
      return task
    },
    [repo],
  )

  const updateTask = useCallback(
    async (id: string, input: TaskInput) => {
      const task = await repo.updateTask(id, input)
      setTasks((prev) => prev.map((t) => (t.id === id ? task : t)))
      return task
    },
    [repo],
  )

  const deleteTask = useCallback(
    async (id: string) => {
      await repo.deleteTask(id)
      setTasks((prev) => prev.filter((t) => t.id !== id))
    },
    [repo],
  )

  const deleteAllTasks = useCallback(async () => {
    await repo.deleteAllTasks()
    setTasks([])
  }, [repo])

  const importTasks = useCallback(
    async (inputs: TaskInput[], mode: 'replace' | 'merge') => {
      if (mode === 'replace') {
        await repo.deleteAllTasks()
        const created = await repo.createManyTasks(inputs)
        setTasks(created)
        return { created: created.length, updated: 0 }
      }
      // merge: update tasks whose code matches, create the rest.
      const existing = await repo.listTasks()
      const byCode = new Map(existing.filter((t) => t.code.trim()).map((t) => [t.code.trim(), t]))
      const toCreate: TaskInput[] = []
      let updated = 0
      for (const input of inputs) {
        const key = input.code.trim()
        const match = key ? byCode.get(key) : undefined
        if (match) {
          await repo.updateTask(match.id, input)
          updated++
        } else {
          toCreate.push(input)
        }
      }
      if (toCreate.length) await repo.createManyTasks(toCreate)
      setTasks(await repo.listTasks())
      return { created: toCreate.length, updated }
    },
    [repo],
  )

  const populateSampleData = useCallback(
    async (count = 60) => {
      const inputs = generateSampleTasks(count)
      const created = await repo.createManyTasks(inputs)
      setTasks((prev) => [...created, ...prev])
      return created.length
    },
    [repo],
  )

  const saveSettings = useCallback(
    async (next: AppSettings) => {
      const saved = await repo.saveSettings(next)
      setSettings(saved)
    },
    [repo],
  )

  const renameListItem = useCallback(
    async (key: 'campaigns' | 'types' | 'people', oldValue: string, newValue: string) => {
      const trimmed = newValue.trim()
      if (!trimmed || trimmed === oldValue) return
      const field = key === 'campaigns' ? 'campaign' : key

      // 1. Propagate the rename to every task that references the old value.
      await repo.renameValue(field, oldValue, trimmed)

      // 2. Update the Settings list (merge if the new name already exists).
      setSettings((prev) => {
        const list = prev[key]
        const dupe = list.some((v) => v !== oldValue && v.toLowerCase() === trimmed.toLowerCase())
        const nextList = dupe
          ? list.filter((v) => v !== oldValue)
          : list.map((v) => (v === oldValue ? trimmed : v))
        const nextSettings = { ...prev, [key]: nextList }
        void repo.saveSettings(nextSettings)
        return nextSettings
      })

      // 3. Refresh tasks so counts/labels reflect the rename.
      setTasks(await repo.listTasks())
    },
    [repo],
  )

  const value = useMemo<StoreValue>(
    () => ({
      backend: repo.backend,
      loading,
      error,
      tasks,
      settings,
      refresh,
      createTask,
      updateTask,
      deleteTask,
      deleteAllTasks,
      importTasks,
      populateSampleData,
      saveSettings,
      renameListItem,
      live,
    }),
    [
      repo.backend,
      loading,
      error,
      tasks,
      settings,
      live,
      refresh,
      createTask,
      updateTask,
      deleteTask,
      deleteAllTasks,
      importTasks,
      populateSampleData,
      saveSettings,
      renameListItem,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within <StoreProvider>')
  return ctx
}
