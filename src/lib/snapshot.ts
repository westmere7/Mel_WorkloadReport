import type { AppSettings, Task, TaskImage } from '../types'

/**
 * Year Snapshots — freeze the full workload state (tasks + settings + the tasks'
 * demo images) into a self-contained JSON. Images are embedded as base64 data
 * URLs so a snapshot survives later deletions and the downloaded file is portable.
 */

/** Admin password required to revert a snapshot (client-side UX gate, see KB §13). */
export const ADMIN_PASSWORD = '777776'

/** Lightweight record shown in the Settings list (no heavy payload). */
export interface SnapshotMeta {
  id: string
  year: number
  name: string
  comment: string
  createdAt: string
  createdBy: string | null
  taskCount: number
  imageCount: number
  /** Serialized payload size in bytes. */
  bytes: number
  appVersion: string
}

/** One embedded image, keyed by its original storage id so revert can remap. */
export interface SnapshotImage {
  origId: string
  w: number
  h: number
  dataUrl: string
}

/** The full frozen state (what gets stored as `<id>.json` and downloaded). */
export interface SnapshotPayload {
  meta: SnapshotMeta
  tasks: Task[]
  settings: AppSettings
  images: SnapshotImage[]
}

export interface SnapshotInput {
  year: number
  name: string
  comment: string
}

/** Fetch a (public) image URL and return it as a base64 data URL. */
export async function fetchAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`)
  const blob = await res.blob()
  return await new Promise<string>((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as string)
    fr.onerror = () => reject(new Error('Failed to read image data'))
    fr.readAsDataURL(blob)
  })
}

/** Turn a base64 data URL back into a Blob (for re-upload on revert). */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',')
  const head = dataUrl.slice(0, comma)
  const b64 = dataUrl.slice(comma + 1)
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? 'image/webp'
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/** Trigger a browser download of `data` as a pretty-printed JSON file. */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** A filesystem-friendly download name for a snapshot. */
export function snapshotFilename(meta: SnapshotMeta): string {
  const safe = meta.name.trim().replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'snapshot'
  return `gcmc-snapshot-${meta.year}-${safe}-${meta.createdAt.slice(0, 10)}.json`
}

/**
 * Build a self-contained snapshot from the current state. Fetches + base64-encodes
 * every task image, reporting progress. Images that fail to fetch are skipped so
 * the snapshot still saves (the task keeps its original reference on revert).
 */
export async function buildPayload(
  tasks: Task[],
  settings: AppSettings,
  input: SnapshotInput,
  createdBy: string | null,
  onProgress?: (done: number, total: number) => void,
): Promise<SnapshotPayload> {
  const refs: TaskImage[] = tasks.flatMap((t) => t.images ?? [])
  const total = refs.length
  const images: SnapshotImage[] = []
  onProgress?.(0, total)
  for (let i = 0; i < refs.length; i++) {
    const im = refs[i]
    try {
      const dataUrl = await fetchAsDataUrl(im.url)
      images.push({ origId: im.id, w: im.w, h: im.h, dataUrl })
    } catch {
      /* skip a broken/uncachable image — snapshot still captures everything else */
    }
    onProgress?.(i + 1, total)
  }

  const meta: SnapshotMeta = {
    id: crypto.randomUUID(),
    year: input.year,
    name: input.name.trim(),
    comment: input.comment.trim(),
    createdAt: new Date().toISOString(),
    createdBy,
    taskCount: tasks.length,
    imageCount: images.length,
    bytes: 0,
    appVersion: __APP_VERSION__,
  }
  const payload: SnapshotPayload = { meta, tasks, settings, images }
  meta.bytes = new Blob([JSON.stringify(payload)]).size
  return payload
}

/** Human-readable byte size, e.g. "1.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
