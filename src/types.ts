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

/** Time base a production rate is expressed against. */
export type RatePer = 'hour' | 'day' | 'week'

/**
 * Approximate production rate for ONE asset type — how many units the team
 * finishes per hour, per day, or per week.
 *
 * Drives the dashboard's Effort view, which weighs every deliverable by its
 * type's rate so slow, heavy work isn't read as unproductive next to quick,
 * high-volume work (a team might finish 300 photo edits a day but only 1 banner
 * every 2 days). Effort is DERIVED at render time: no task field, stored total or
 * export is affected, so editing a rate re-reads history rather than rewriting it.
 * Asset types with no rate contribute zero and are reported, never guessed.
 */
export interface AssetRate {
  /** Units finished in the `every` × `per` span. Always > 0 — an unset rate is an ABSENT key. */
  qty: number
  /** Length of the span, in `per` units — "3 assets per 2 days" is qty 3, every 2, per 'day'. Always > 0. */
  every: number
  per: RatePer
}

/**
 * Production rates keyed by asset-type NAME (matches `AppSettings.assetTypes`;
 * renames rewrite these keys and removals drop them, like the other name-keyed
 * maps in the app). An absent key means "not specified".
 */
export type AssetRates = Record<string, AssetRate>

/** One recorded change to the output rates (see `AppSettings.assetRatesLog`). */
export interface RateLogEntry {
  /** ISO timestamp of the save. */
  at: string
  /** Username that made the change; null when unknown. */
  by?: string | null
  /** Human-readable per-asset-type summaries — always at least one. */
  changes: string[]
}

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

/** One entry in a task's edit log — appended on every create/edit, newest last.
 *  Lives ON the task row, so the log disappears with the task when it's deleted. */
export interface TaskLogEntry {
  /** ISO timestamp of the edit. */
  at: string
  /** Username that made the edit; null when unknown. */
  by?: string | null
  action: 'created' | 'updated' | 'imported'
  /** Human-readable field-level change summaries (empty for created/imported). */
  changes?: string[]
}

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
  /**
   * Draft = saved with only a name (required fields still missing). Shows faded
   * in the task list and contributes NOTHING to the dashboard (not even task
   * count). Cleared automatically when the task is completed and re-saved.
   */
  draft?: boolean
  /** User-flagged "starred" task — a personal marker for quick filtering. */
  starred?: boolean
  /** Linked monday.com item URL (e.g. https://rmit.monday.com/pulses/12345). */
  mondayUrl?: string
  /** Per-task edit log (newest last). Deleted with the task. */
  log?: TaskLogEntry[]
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
  /** Associated people (PICs). When selected in task form, auto-enables this function tab. */
  people?: string[]
}

/**
 * A display-only bundle of chart items (asset types OR work types): its members
 * collapse into ONE named, coloured slice/column on the dashboard charts. Purely
 * presentational — tasks and the reference lists are untouched; clicking a
 * grouped slice still filters the task list by the member items.
 */
export interface ChartGroup {
  id: string
  name: string
  /** Hex fill for the group's slice + legend dot. */
  color: string
  /** Member item NAMES (asset-type or work-type names). */
  items: string[]
}

/** Dashboard chart display groups, split by the dimension they apply to. */
export interface ChartGroups {
  /** Groups for ASSET-TYPE charts (Asset mix, demand-by-asset). */
  asset: ChartGroup[]
  /** Groups for WORK-TYPE charts (Work type mix, demand-by-type). */
  type: ChartGroup[]
}

/** User-editable lists + app preferences. */
export interface AppSettings {
  squads: string[]
  campaigns: string[]
  types: string[]
  people: string[]
  assetTypes: string[]
  /**
   * Approximate production rate per asset type (Settings → Asset types → Output
   * rates) — see `AssetRate`. Empty by default; the dashboard's Effort view is
   * only offered once at least one rate exists.
   */
  assetRates: AssetRates
  /**
   * Edit log for `assetRates`, oldest first, capped at the most recent
   * `RATE_LOG_LIMIT`. Rates silently re-scale every hours figure on the dashboard,
   * so each save records who changed which rate and what it was before (see
   * lib/rateLog.ts). Absent on settings saved before this existed.
   */
  assetRatesLog?: RateLogEntry[]
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
  /** Optional friendly NAME per board id (label only — the lookup still keys off ids). */
  mondayBoardNames: Record<string, string>
  /** Squad NAME → keyword list. When a task name contains any of a squad's keywords,
   *  the task form auto-selects that squad (first match wins; ignored if no match). */
  squadKeywords: Record<string, string[]>
  /** Campaign NAME → keyword list (same auto-select-on-name-match behaviour). */
  campaignKeywords: Record<string, string[]>
  /** Dashboard chart display groups (bundle asset / work types into one slice). */
  chartGroups: ChartGroups
  /**
   * Voice brief for the Advisor's narration (Settings -> Advisor). Controls only
   * HOW the analysis is written -- every finding and every number in it is computed
   * in `src/lib/advisor/findings.ts`, and the Edge Function appends accuracy rules
   * this text cannot override. Empty string means "use the built-in default".
   */
  advisorPrompt: string
}

/** Empty breakdown helper. */
export const EMPTY_BREAKDOWN: AssetBreakdown = {}
