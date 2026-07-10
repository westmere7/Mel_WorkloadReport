import type { AppSettings, Task, TaskImage, TaskInput } from '../types'

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

  getSettings(): Promise<AppSettings>
  saveSettings(settings: AppSettings): Promise<AppSettings>

  /**
   * Rename a value across all tasks (used when a campaign/type/person is
   * renamed in Settings) so tasks stay linked. `field` is the task field:
   * 'campaign' (scalar) or 'types' / 'people' (arrays).
   */
  renameValue(
    field: 'squad' | 'campaign' | 'types' | 'people' | 'assetBreakdown',
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
