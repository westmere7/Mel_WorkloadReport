import type { AppSettings, Task, TaskImage, TaskInput } from '../types'
import type { SnapshotMeta, SnapshotPayload } from '../lib/snapshot'
import type { ShowcaseMeta, ShowcaseRecord } from '../lib/showcase'

/**
 * Storage-agnostic contract for the app's data.
 * Implemented by LocalRepository (localStorage) and SupabaseRepository.
 * The rest of the app only ever talks to this interface.
 */
export interface Repository {
  /** A short label for the active backend, shown in Settings. */
  readonly backend: 'local' | 'supabase'

  /** Whether task image uploads are available (Supabase Storage only). */
  readonly supportsImages: boolean

  /**
   * Upload a compressed image blob to storage and return its descriptor.
   * `width`/`height` are the blob's pixel dimensions (computed at compress time).
   * Throws on backends that don't support images.
   */
  uploadImage(blob: Blob, width: number, height: number): Promise<TaskImage>

  /** Delete a previously-uploaded image by its id (the storage object name). */
  deleteImage(id: string): Promise<void>

  listTasks(): Promise<Task[]>
  createTask(input: TaskInput, createdBy?: string | null): Promise<Task>
  /** Bulk insert (used by import + sample-data population). `createdBy` stamps the creator. */
  createManyTasks(inputs: TaskInput[], createdBy?: string | null): Promise<Task[]>
  updateTask(id: string, input: TaskInput): Promise<Task>
  deleteTask(id: string): Promise<void>
  /** Dev/maintenance: remove every task. */
  deleteAllTasks(): Promise<void>
  /**
   * Replace ALL tasks with these exact rows, preserving id/createdAt/createdBy
   * (used by snapshot revert — the create paths take TaskInput and would reset them).
   */
  restoreTasks(tasks: Task[]): Promise<void>

  getSettings(): Promise<AppSettings>
  saveSettings(settings: AppSettings): Promise<AppSettings>

  // ── Year snapshots ────────────────────────────────────────────
  /** List saved snapshot metadata (newest first). */
  listSnapshots(): Promise<SnapshotMeta[]>
  /** Persist a snapshot (JSON blob) + its metadata; returns the stored meta. */
  saveSnapshot(payload: SnapshotPayload): Promise<SnapshotMeta>
  /** Load a full snapshot payload by id. */
  loadSnapshot(id: string): Promise<SnapshotPayload>
  /** Delete a snapshot (blob + metadata). */
  deleteSnapshot(id: string): Promise<void>

  // ── Showcases (shareable animated year-in-review links) ────────
  /** List saved showcase metadata (newest first). Missing table → []. */
  listShowcases(): Promise<ShowcaseMeta[]>
  /** Persist a generated showcase (config inline); returns the stored meta. */
  saveShowcase(record: ShowcaseRecord): Promise<ShowcaseMeta>
  /** Load a full showcase by id. Null when it doesn't exist (expiry NOT enforced here). */
  getShowcase(id: string): Promise<ShowcaseRecord | null>
  deleteShowcase(id: string): Promise<void>

  /**
   * Rename a value across all tasks (used when a campaign/type/person is
   * renamed in Settings) so tasks stay linked. `field` is the task field:
   * 'campaign' (scalar), 'types' / 'people' (arrays), 'assetBreakdown' /
   * 'functionData' (JSON maps — the KEY is renamed; also inside functionData's
   * nested types/assetBreakdown when renaming a work/asset type).
   */
  renameValue(
    field: 'squad' | 'campaign' | 'types' | 'people' | 'assetBreakdown' | 'functionData',
    oldValue: string,
    newValue: string,
  ): Promise<void>

  /**
   * Subscribe to task changes from other clients/tabs. Calls `onChange`
   * whenever tasks change externally. Returns an unsubscribe function.
   */
  subscribe(onChange: () => void): () => void

  /**
   * Subscribe to settings changes from other clients/tabs so the dashboard and
   * task form stay in sync live. Returns an unsubscribe function.
   */
  subscribeSettings(onChange: () => void): () => void
}
