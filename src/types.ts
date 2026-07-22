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

/**
 * One GCMC function's slice of a task (Vietnam Design / Melbourne Design /
 * Production / Contents…). Work types, asset counts and an optional timeline are
 * captured per function; the task's top-level fields stay the COMBINED view so
 * every existing chart/export keeps working unchanged.
 */
export interface FunctionEntry {
  /** Work types this function performed on the task. */
  types: string[]
  /** This function's asset counts by asset-type name. */
  assetBreakdown: AssetBreakdown
  /** Sum of this function's breakdown (denormalized for convenience). */
  assetTotal: number
  /** Function-specific timeline — only meaningful when `timelineOn`. */
  timelineOn: boolean
  startDate: string | null
  endDate: string | null
}

/**
 * Per-function slices keyed by function NAME (matches `AppSettings.functions`;
 * renames rewrite these keys, like other name-keyed maps in the app).
 */
export type FunctionData = Record<string, FunctionEntry>

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
  /**
   * Per-function workload slices. `null`/absent = legacy task recorded before
   * functions existed — treated as belonging entirely to the legacy function
   * (Vietnam Design) and upgraded lazily the next time it's edited & saved.
   * The top-level types/assetBreakdown/assetTotal/startDate/endDate are always
   * the combined roll-up across functions.
   */
  functionData?: FunctionData | null
  createdAt: string
  updatedAt: string
  /** Username that created the task; null for tasks created before this was tracked. */
  createdBy?: string | null
}

/** Fields supplied when creating/editing a task (no system fields). */
export type TaskInput = Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>

/**
 * A GCMC function (team) that records workload — e.g. Vietnam Design. Configured
 * in Settings; each task-form tab shows only the work/asset types checked here.
 */
export interface FunctionConfig {
  name: string
  /** Preset color key (see FUNCTION_COLORS in constants) — drives the tab tint. */
  color: string
  /**
   * Work types this function offers on its tab. INCLUSION list: only these
   * appear (intersected with the master list). Newly added master types do NOT
   * auto-appear — users opt each function in from Settings. Renaming a master
   * type rewrites this list; removing one drops it here.
   */
  workTypes: string[]
  /** Asset types this function offers on its tab (same inclusion semantics). */
  assetTypes: string[]
}

/** User-editable lists + app preferences. */
export interface AppSettings {
  squads: string[]
  campaigns: string[]
  types: string[]
  people: string[]
  assetTypes: string[]
  /** GCMC functions that record workload (task-form tabs). Order = tab order. */
  functions: FunctionConfig[]
  /** Days each task size adds to the start date when auto-filling the end date. */
  sizeDurations: Record<Size, number>
  /** When false, a group item (squad/campaign/type/asset-type/person) used by ≥1 task can't be removed. */
  allowRemoveUsed: boolean
  /** Map each person NAME → their monday.com user id (string). Used to auto-fill
   *  the "Persons in charge" from a monday item's Project-team column. */
  peopleMondayIds: Record<string, string>
  /** monday.com board ids the New Task auto-fill searches (all at once). Editable
   *  in Settings; the columns mapped are shared across boards (set via secrets). */
  mondayBoardIds: string[]
}

/** Empty breakdown helper. */
export const EMPTY_BREAKDOWN: AssetBreakdown = {}
