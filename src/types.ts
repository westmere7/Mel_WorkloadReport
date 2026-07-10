// ── Domain types for the RMIT Workload Report ──────────────────────────

/**
 * Requesting team (stakeholder). Editable in Settings, so it's a free string;
 * `DEFAULT_SQUADS` seeds the initial list and `stakeholderGroup()` still keys off
 * the "DOM"/"INTON" names for the demand chart.
 */
export type Squad = string

export type Half = 'H1' | 'H2'

/** T-shirt size representing the overall size/effort of a task. */
export type Size = 'XS' | 'S' | 'M' | 'L' | 'XL'

/** Breakdown of the total asset count, keyed by asset-type name (editable in Settings). */
export type AssetBreakdown = Record<string, number>

/** An image attached to a task (stored in Supabase Storage; `id` is the object name). */
export interface TaskImage {
  id: string
  url: string
  /** Pixel dimensions of the stored (compressed) image, for layout/aspect. */
  w: number
  h: number
}

export interface Task {
  id: string
  /** Requesting team — one of the fixed Squad values. */
  squad: Squad
  /** Campaign name (extensible list, managed in Settings). */
  campaign: string
  /** Task booking code, e.g. "26.0629.A" (YY.MMDD.<seq>). */
  code: string
  /** Human-readable task name, e.g. "2026 Open Day". */
  name: string
  /** Work types (multi-select, extensible). */
  types: string[]
  /** Total assets required. */
  assetTotal: number
  /** Per-type breakdown of assets. */
  assetBreakdown: AssetBreakdown
  /** People who worked on the task (multi-select, extensible). */
  people: string[]
  /** ISO date (yyyy-mm-dd) or null. */
  startDate: string | null
  /** ISO date (yyyy-mm-dd) or null — may be left blank. */
  endDate: string | null
  half: Half
  /** T-shirt size / effort of the task. */
  size: Size
  /** Attached images (max 10). Stored in Supabase Storage; empty by default. */
  images: TaskImage[]
  /** Freeform note — shown on hover in the task list. Optional. */
  note?: string
  createdAt: string
  updatedAt: string
  /** Username that created the task; null for tasks created before this was tracked. */
  createdBy?: string | null
}

/** Fields supplied when creating/editing a task (no system fields). */
export type TaskInput = Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>

/** User-editable lists + app preferences. */
export interface AppSettings {
  squads: string[]
  campaigns: string[]
  types: string[]
  people: string[]
  assetTypes: string[]
  /** Days each task size adds to the start date when auto-filling the end date. */
  sizeDurations: Record<Size, number>
}

/** Empty breakdown helper. */
export const EMPTY_BREAKDOWN: AssetBreakdown = {}
