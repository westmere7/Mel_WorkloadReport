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
import type { AppSettings, Task, TaskImage, TaskInput } from '../types'
import type { Repository } from './repository'
import { LocalRepository } from './localRepository'
import { SupabaseRepository } from './supabaseRepository'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { DEFAULT_SETTINGS, FALLBACK_ITEM, legacyOwnerName } from '../constants'
import { generateSampleTasks } from '../lib/sampleData'
import { diffTask } from '../lib/taskLog'
import { toMessage } from '../lib/format'
import { useAuth } from '../lib/auth'
import {
  buildPayload,
  dataUrlToBlob,
  downloadJson,
  snapshotFilename,
  tasksForSnapshotYears,
  type SnapshotInput,
  type SnapshotMeta,
} from '../lib/snapshot'
import {
  buildShowcaseConfig,
  isExpired,
  type ShowcaseDraft,
  type ShowcaseMeta,
  type ShowcaseRecord,
} from '../lib/showcase'

interface StoreValue {
  backend: 'local' | 'supabase'
  loading: boolean
  error: string | null
  tasks: Task[]
  settings: AppSettings
  refresh: () => Promise<void>
  createTask: (input: TaskInput) => Promise<Task>
  updateTask: (id: string, input: TaskInput) => Promise<Task>
  /** Flip a task's starred flag, persisted immediately (independent of the edit form). */
  toggleStar: (id: string) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  deleteAllTasks: () => Promise<void>
  /** Bulk import from a parsed CSV: 'replace' wipes first, 'merge' adds new & updates matching codes. */
  importTasks: (inputs: TaskInput[], mode: 'replace' | 'merge') => Promise<{ created: number; updated: number }>
  populateSampleData: (count?: number) => Promise<number>
  saveSettings: (settings: AppSettings) => Promise<void>
  /** Rename a squad/campaign/type/person/asset-type in Settings and propagate to all tasks. */
  renameListItem: (
    key: 'squads' | 'campaigns' | 'types' | 'people' | 'assetTypes',
    oldValue: string,
    newValue: string,
  ) => Promise<void>
  /** Remove a list item, reassigning any tasks that use it to the "Others" fallback. */
  removeListItem: (
    key: 'squads' | 'campaigns' | 'types' | 'people' | 'assetTypes',
    value: string,
  ) => Promise<void>
  /** Rename a GCMC function: rewrites tasks' per-function keys + the Settings config. */
  renameFunction: (oldName: string, newName: string) => Promise<void>
  /** Remove a function config. Blocked (throws) while any task still has data under it. */
  removeFunction: (name: string) => Promise<void>
  /** How many tasks carry data under this function (legacy tasks count toward their owner). */
  functionUsage: (name: string) => number
  /** Whether task image uploads are available (Supabase Storage only). */
  supportsImages: boolean
  /** Compress-then-upload happens in the caller; this stores the blob and returns its descriptor. */
  uploadImage: (blob: Blob, width: number, height: number) => Promise<TaskImage>
  deleteImage: (id: string) => Promise<void>
  // ── Year snapshots ────────────────────────────────────────────
  snapshots: SnapshotMeta[]
  /** Freeze current tasks+settings+images into a snapshot (progress = images embedded). */
  createSnapshot: (
    input: SnapshotInput,
    onProgress?: (done: number, total: number) => void,
  ) => Promise<SnapshotMeta>
  /** Destructively restore a snapshot (progress = images re-uploaded). */
  revertSnapshot: (id: string, onProgress?: (done: number, total: number) => void) => Promise<void>
  deleteSnapshot: (id: string) => Promise<void>
  /** Download a snapshot as a self-contained JSON file. */
  downloadSnapshot: (id: string) => Promise<void>
  // ── Showcases ─────────────────────────────────────────────────
  showcases: ShowcaseMeta[]
  /** Lazy list — called by the wizard's Generate step; purges expired links. */
  refreshShowcases: () => Promise<void>
  /** Freeze the draft against current data and persist it; returns the meta (link id). */
  generateShowcase: (draft: ShowcaseDraft) => Promise<ShowcaseMeta>
  deleteShowcase: (id: string) => Promise<void>
  getShowcase: (id: string) => Promise<ShowcaseRecord | null>
  /** True while a live (realtime/cross-tab) subscription is active. */
  live: boolean
}

const StoreContext = createContext<StoreValue | null>(null)

/** Exported for the store AND for store-less consumers (the public showcase viewer). */
export function createRepository(): Repository {
  return isSupabaseConfigured() ? new SupabaseRepository() : new LocalRepository()
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const repoRef = useRef<Repository>()
  if (!repoRef.current) repoRef.current = createRepository()
  const repo = repoRef.current
  // Current signed-in user, stamped as the creator on tasks they add.
  const { user } = useAuth()

  const [tasks, setTasks] = useState<Task[]>([])
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([])
  const [showcases, setShowcases] = useState<ShowcaseMeta[]>([])
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
    // Best-effort: snapshots are non-critical and may not be migrated yet.
    repo.listSnapshots().then(setSnapshots).catch(() => setSnapshots([]))
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
    // Settings edits (lists, size durations) propagate live to the dashboard too.
    const unsubscribeSettings = repo.subscribeSettings(() => {
      repo.getSettings().then(setSettings).catch(() => {})
    })
    setLive(true)
    return () => {
      if (timer) clearTimeout(timer)
      unsubscribe()
      unsubscribeSettings()
      setLive(false)
    }
  }, [repo])

  // Carry the task's edit log through a save, appending an entry when the edit
  // actually changed something (diffTask). Callers build inputs WITHOUT a log
  // (e.g. the task form), so the previous task's log is always re-attached here.
  const withLog = useCallback(
    (prev: Task | undefined, input: TaskInput): TaskInput => {
      if (!prev) return input
      const changes = diffTask(prev, input)
      const base = prev.log ?? []
      if (!changes.length) return { ...input, log: base }
      return {
        ...input,
        log: [...base, { at: new Date().toISOString(), by: user ?? null, action: 'updated', changes }],
      }
    },
    [user],
  )

  const createTask = useCallback(
    async (input: TaskInput) => {
      const task = await repo.createTask(
        { ...input, log: [{ at: new Date().toISOString(), by: user ?? null, action: 'created' }] },
        user,
      )
      setTasks((prev) => [task, ...prev])
      return task
    },
    [repo, user],
  )

  const updateTask = useCallback(
    async (id: string, input: TaskInput) => {
      const task = await repo.updateTask(id, withLog(tasks.find((t) => t.id === id), input))
      setTasks((prev) => prev.map((t) => (t.id === id ? task : t)))
      return task
    },
    [repo, tasks, withLog],
  )

  // Toggle starred from the task's CURRENT stored values (not any open edit form),
  // so it persists immediately without touching in-progress edits.
  const toggleStar = useCallback(
    async (id: string) => {
      const t = tasks.find((x) => x.id === id)
      if (!t) return
      const { id: _id, createdAt: _c, updatedAt: _u, createdBy: _b, ...input } = t
      const saved = await repo.updateTask(id, withLog(t, { ...input, starred: !t.starred }))
      setTasks((prev) => prev.map((x) => (x.id === id ? saved : x)))
    },
    [repo, tasks, withLog],
  )

  const deleteTask = useCallback(
    async (id: string) => {
      const target = tasks.find((t) => t.id === id)
      await repo.deleteTask(id)
      setTasks((prev) => prev.filter((t) => t.id !== id))
      // Best-effort: free the task's images from storage (no-op in local mode).
      target?.images?.forEach((img) => void repo.deleteImage(img.id).catch(() => {}))
    },
    [repo, tasks],
  )

  const deleteAllTasks = useCallback(async () => {
    const orphanImages = tasks.flatMap((t) => t.images ?? [])
    await repo.deleteAllTasks()
    setTasks([])
    orphanImages.forEach((img) => void repo.deleteImage(img.id).catch(() => {}))
  }, [repo, tasks])

  const importTasks = useCallback(
    async (inputs: TaskInput[], mode: 'replace' | 'merge') => {
      const importedEntry = { at: new Date().toISOString(), by: user ?? null, action: 'imported' as const }
      const withImportLog = (list: TaskInput[]) => list.map((i) => ({ ...i, log: [importedEntry] }))
      if (mode === 'replace') {
        await repo.deleteAllTasks()
        const created = await repo.createManyTasks(withImportLog(inputs), user)
        setTasks(created)
        return { created: created.length, updated: 0 }
      }
      // merge: update tasks whose code matches, create the rest.
      const existing = await repo.listTasks()
      const byCode = new Map(existing.filter((t) => t.code.trim()).map((t) => [t.code.trim(), t]))
      const toCreate: TaskInput[] = []
      let updated = 0
      // CSV rows don't carry per-function slices. Keep a matched task's existing
      // functionData when the import didn't change its combined types/assets —
      // otherwise the slices no longer add up, so drop them (the task reverts to
      // legacy = wholly owned by the legacy function).
      const aggSig = (types: string[], breakdown: Record<string, number>) =>
        JSON.stringify([
          [...types].sort(),
          Object.entries(breakdown)
            .filter(([, v]) => Number(v) > 0)
            .map(([k, v]) => `${k}=${Number(v)}`)
            .sort(),
        ])
      for (const input of inputs) {
        const key = input.code.trim()
        const match = key ? byCode.get(key) : undefined
        if (match) {
          // CSV doesn't carry images (they live in Storage) — keep the existing ones.
          const keepSlices =
            input.functionData === undefined &&
            aggSig(match.types, match.assetBreakdown) === aggSig(input.types, input.assetBreakdown)
          await repo.updateTask(
            match.id,
            withLog(match, {
              ...input,
              images: match.images,
              functionData: input.functionData ?? (keepSlices ? match.functionData : null),
            }),
          )
          updated++
        } else {
          toCreate.push(input)
        }
      }
      if (toCreate.length) await repo.createManyTasks(withImportLog(toCreate), user)
      setTasks(await repo.listTasks())
      return { created: toCreate.length, updated }
    },
    [repo, user, withLog],
  )

  const populateSampleData = useCallback(
    async (count = 60) => {
      const inputs = generateSampleTasks(count)
      const created = await repo.createManyTasks(inputs, user)
      setTasks((prev) => [...created, ...prev])
      return created.length
    },
    [repo, user],
  )

  const saveSettings = useCallback(
    async (next: AppSettings) => {
      const saved = await repo.saveSettings(next)
      setSettings(saved)
    },
    [repo],
  )

  const uploadImage = useCallback(
    (blob: Blob, width: number, height: number) => repo.uploadImage(blob, width, height),
    [repo],
  )
  const deleteImage = useCallback((id: string) => repo.deleteImage(id), [repo])

  const createSnapshot = useCallback(
    async (input: SnapshotInput, onProgress?: (done: number, total: number) => void) => {
      // Capture only the selected years' tasks (all when the selection is empty).
      const scoped = tasksForSnapshotYears(tasks, input.years)
      const payload = await buildPayload(scoped, settings, input, user, onProgress)
      const meta = await repo.saveSnapshot(payload)
      setSnapshots((prev) => [meta, ...prev.filter((s) => s.id !== meta.id)])
      return meta
    },
    [repo, tasks, settings, user],
  )

  const revertSnapshot = useCallback(
    async (id: string, onProgress?: (done: number, total: number) => void) => {
      const payload = await repo.loadSnapshot(id)

      // Re-upload the embedded images (Supabase only) → map original id → fresh descriptor.
      const remap = new Map<string, TaskImage>()
      if (repo.supportsImages && payload.images.length) {
        const total = payload.images.length
        onProgress?.(0, total)
        for (let i = 0; i < payload.images.length; i++) {
          const im = payload.images[i]
          try {
            remap.set(im.origId, await repo.uploadImage(dataUrlToBlob(im.dataUrl), im.w, im.h))
          } catch {
            /* skip a failed image; the task keeps its original reference */
          }
          onProgress?.(i + 1, total)
        }
      }

      const restored = payload.tasks.map((t) => ({
        ...t,
        images: repo.supportsImages ? (t.images ?? []).map((im) => remap.get(im.id) ?? im) : [],
      }))

      // Free the images the current (about-to-be-replaced) tasks referenced.
      const orphaned = tasks.flatMap((t) => t.images ?? [])
      await repo.restoreTasks(restored)
      const savedSettings = await repo.saveSettings(payload.settings)
      setTasks(restored)
      setSettings(savedSettings)
      orphaned.forEach((im) => void repo.deleteImage(im.id).catch(() => {}))
    },
    [repo, tasks],
  )

  const deleteSnapshot = useCallback(
    async (id: string) => {
      await repo.deleteSnapshot(id)
      setSnapshots((prev) => prev.filter((s) => s.id !== id))
    },
    [repo],
  )

  const downloadSnapshot = useCallback(
    async (id: string) => {
      const payload = await repo.loadSnapshot(id)
      downloadJson(snapshotFilename(payload.meta), payload)
    },
    [repo],
  )

  const refreshShowcases = useCallback(async () => {
    const all = await repo.listShowcases()
    const live = all.filter((m) => !isExpired(m))
    setShowcases(live)
    // Lazy purge: expired links are deleted best-effort in the background.
    all.filter((m) => isExpired(m)).forEach((m) => void repo.deleteShowcase(m.id).catch(() => {}))
  }, [repo])

  const generateShowcase = useCallback(
    async (draft: ShowcaseDraft) => {
      const record = buildShowcaseConfig(tasks, settings, draft, user)
      const meta = await repo.saveShowcase(record)
      setShowcases((prev) => [meta, ...prev.filter((s) => s.id !== meta.id)])
      return meta
    },
    [repo, tasks, settings, user],
  )

  const deleteShowcase = useCallback(
    async (id: string) => {
      await repo.deleteShowcase(id)
      setShowcases((prev) => prev.filter((s) => s.id !== id))
    },
    [repo],
  )

  const getShowcase = useCallback(
    async (id: string) => {
      return repo.getShowcase(id)
    },
    [repo],
  )

  const renameListItem = useCallback(
    async (key: 'squads' | 'campaigns' | 'types' | 'people' | 'assetTypes', oldValue: string, newValue: string) => {
      const trimmed = newValue.trim()
      if (!trimmed || trimmed === oldValue) return
      const field =
        key === 'squads' ? 'squad' : key === 'campaigns' ? 'campaign' : key === 'assetTypes' ? 'assetBreakdown' : key

      // 1. Propagate the rename to every task that references the old value.
      await repo.renameValue(field, oldValue, trimmed)

      // 2. Update the Settings list (merge if the new name already exists).
      setSettings((prev) => {
        const list = prev[key]
        const dupe = list.some((v) => v !== oldValue && v.toLowerCase() === trimmed.toLowerCase())
        const nextList = dupe
          ? list.filter((v) => v !== oldValue)
          : list.map((v) => (v === oldValue ? trimmed : v))
        let nextSettings = { ...prev, [key]: nextList }
        // Keep the person → monday-id map aligned when a person is renamed.
        if (key === 'people' && prev.peopleMondayIds[oldValue] !== undefined) {
          const ids = { ...prev.peopleMondayIds }
          if (!dupe) ids[trimmed] = ids[oldValue]
          delete ids[oldValue]
          nextSettings = { ...nextSettings, peopleMondayIds: ids }
        }
        // Keep each function's inclusion list aligned when a work/asset type is renamed.
        const fnKey = key === 'types' ? 'workTypes' : key === 'assetTypes' ? 'assetTypes' : null
        if (fnKey) {
          nextSettings = {
            ...nextSettings,
            functions: prev.functions.map((f) =>
              f[fnKey].includes(oldValue)
                ? { ...f, [fnKey]: Array.from(new Set(f[fnKey].map((t) => (t === oldValue ? trimmed : t)))) }
                : f,
            ),
          }
        }
        // Carry a squad/campaign's auto-select keywords across a rename.
        const kwKey = key === 'squads' ? 'squadKeywords' : key === 'campaigns' ? 'campaignKeywords' : null
        if (kwKey && prev[kwKey][oldValue] !== undefined) {
          const kw = { ...prev[kwKey] }
          if (!dupe) kw[trimmed] = kw[oldValue]
          delete kw[oldValue]
          nextSettings = { ...nextSettings, [kwKey]: kw }
        }
        void repo.saveSettings(nextSettings)
        return nextSettings
      })

      // 3. Refresh tasks so counts/labels reflect the rename.
      setTasks(await repo.listTasks())
    },
    [repo],
  )

  const removeListItem = useCallback(
    async (key: 'squads' | 'campaigns' | 'types' | 'people' | 'assetTypes', value: string) => {
      if (value === FALLBACK_ITEM) return // the fallback itself can't be removed
      const field =
        key === 'squads' ? 'squad' : key === 'campaigns' ? 'campaign' : key === 'assetTypes' ? 'assetBreakdown' : key

      // 1. Reassign any tasks still using this value to the "Others" fallback.
      await repo.renameValue(field, value, FALLBACK_ITEM)

      // 2. Drop it from the Settings list.
      setSettings((prev) => {
        let nextSettings = { ...prev, [key]: prev[key].filter((v) => v !== value) }
        // Drop the person's monday-id mapping when the person is removed.
        if (key === 'people' && prev.peopleMondayIds[value] !== undefined) {
          const ids = { ...prev.peopleMondayIds }
          delete ids[value]
          nextSettings = { ...nextSettings, peopleMondayIds: ids }
        }
        // Drop the removed work/asset type from every function's inclusion list.
        const fnKey = key === 'types' ? 'workTypes' : key === 'assetTypes' ? 'assetTypes' : null
        if (fnKey) {
          nextSettings = {
            ...nextSettings,
            functions: prev.functions.map((f) =>
              f[fnKey].includes(value) ? { ...f, [fnKey]: f[fnKey].filter((t) => t !== value) } : f,
            ),
          }
        }
        // Drop a squad/campaign's auto-select keywords when it's removed.
        const kwKey = key === 'squads' ? 'squadKeywords' : key === 'campaigns' ? 'campaignKeywords' : null
        if (kwKey && prev[kwKey][value] !== undefined) {
          const kw = { ...prev[kwKey] }
          delete kw[value]
          nextSettings = { ...nextSettings, [kwKey]: kw }
        }
        void repo.saveSettings(nextSettings)
        return nextSettings
      })

      // 3. Refresh tasks so counts reflect the reassignment.
      setTasks(await repo.listTasks())
    },
    [repo],
  )

  // ── GCMC functions (Settings panel) ─────────────────────────────
  const functionUsage = useCallback(
    (name: string) => {
      const legacy = legacyOwnerName(settings.functions)
      return tasks.filter((t) =>
        t.functionData ? t.functionData[name] !== undefined : name === legacy,
      ).length
    },
    [tasks, settings.functions],
  )

  const renameFunction = useCallback(
    async (oldName: string, newName: string) => {
      const trimmed = newName.trim()
      if (!trimmed || trimmed === oldName) return

      // 1. Rewrite the per-function key on every task that has one.
      await repo.renameValue('functionData', oldName, trimmed)

      // 2. Update the Settings config (merge configs if the new name already exists).
      setSettings((prev) => {
        const dupe = prev.functions.find(
          (f) => f.name !== oldName && f.name.toLowerCase() === trimmed.toLowerCase(),
        )
        const old = prev.functions.find((f) => f.name === oldName)
        const nextFunctions = dupe
          ? prev.functions
              .filter((f) => f.name !== oldName)
              .map((f) =>
                f.name === dupe.name && old
                  ? {
                      // Union of what both tabs offered (inclusion lists).
                      ...f,
                      workTypes: Array.from(new Set([...f.workTypes, ...old.workTypes])),
                      assetTypes: Array.from(new Set([...f.assetTypes, ...old.assetTypes])),
                    }
                  : f,
              )
          : prev.functions.map((f) => (f.name === oldName ? { ...f, name: trimmed } : f))
        const nextSettings = { ...prev, functions: nextFunctions }
        void repo.saveSettings(nextSettings)
        return nextSettings
      })

      // 3. Refresh tasks so usage counts reflect the rewrite.
      setTasks(await repo.listTasks())
    },
    [repo],
  )

  const removeFunction = useCallback(
    async (name: string) => {
      // Removing a function whose tasks still carry data would delete recorded
      // workload — always blocked (there's no "Others" fallback for functions).
      if (functionUsage(name) > 0) {
        throw new Error(`"${name}" still has tasks with recorded workload — reassign them first.`)
      }
      setSettings((prev) => {
        const nextSettings = { ...prev, functions: prev.functions.filter((f) => f.name !== name) }
        void repo.saveSettings(nextSettings)
        return nextSettings
      })
    },
    [repo, functionUsage],
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
      toggleStar,
      deleteTask,
      deleteAllTasks,
      importTasks,
      populateSampleData,
      saveSettings,
      renameListItem,
      removeListItem,
      renameFunction,
      removeFunction,
      functionUsage,
      supportsImages: repo.supportsImages,
      uploadImage,
      deleteImage,
      snapshots,
      createSnapshot,
      revertSnapshot,
      deleteSnapshot,
      downloadSnapshot,
      showcases,
      refreshShowcases,
      generateShowcase,
      deleteShowcase,
      getShowcase,
      live,
    }),
    [
      repo.backend,
      repo.supportsImages,
      loading,
      error,
      tasks,
      settings,
      snapshots,
      live,
      refresh,
      createTask,
      updateTask,
      toggleStar,
      deleteTask,
      deleteAllTasks,
      importTasks,
      populateSampleData,
      saveSettings,
      renameListItem,
      removeListItem,
      renameFunction,
      removeFunction,
      functionUsage,
      uploadImage,
      deleteImage,
      createSnapshot,
      revertSnapshot,
      deleteSnapshot,
      downloadSnapshot,
      showcases,
      refreshShowcases,
      generateShowcase,
      deleteShowcase,
      getShowcase,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within <StoreProvider>')
  return ctx
}
