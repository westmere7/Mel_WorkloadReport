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
  populateSampleData: (count?: number) => Promise<number>
  saveSettings: (settings: AppSettings) => Promise<void>
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
      setError(e instanceof Error ? e.message : String(e))
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
      populateSampleData,
      saveSettings,
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
      populateSampleData,
      saveSettings,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within <StoreProvider>')
  return ctx
}
