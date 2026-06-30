// ── Domain types for the RMIT Workload Report ──────────────────────────

/** Fixed list of requesting teams (stakeholders). Does not change. */
export type Squad =
  | 'INTON'
  | 'DOM'
  | 'Student Recruitment'
  | 'BPX'
  | 'RMIT VN'
  | 'Alumni'
  | 'Agent Management'
  | 'Others'

export type Half = 'H1' | 'H2'

/** T-shirt size representing the overall size/effort of a task. */
export type Size = 'XS' | 'S' | 'M' | 'L' | 'XL'

/** Breakdown of the total asset count by deliverable type. */
export interface AssetBreakdown {
  image: number
  video: number
  publication: number
  html5: number
  gif: number
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
  createdAt: string
  updatedAt: string
}

/** Fields supplied when creating/editing a task (no system fields). */
export type TaskInput = Omit<Task, 'id' | 'createdAt' | 'updatedAt'>

/** User-editable lists + app preferences. */
export interface AppSettings {
  campaigns: string[]
  types: string[]
  people: string[]
}

/** Empty breakdown helper shape. */
export const EMPTY_BREAKDOWN: AssetBreakdown = {
  image: 0,
  video: 0,
  publication: 0,
  html5: 0,
  gif: 0,
}
