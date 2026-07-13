import type { AppSettings, Size, Task } from '../types'
import {
  assetsByCampaign,
  assetsByMonth,
  assetsByPerson,
  assetsBySquad,
  assetsByType,
  countByField,
  countByMulti,
  countBySize,
  stakeholderGroup,
  totalAssets,
  type NamedCount,
} from './analytics'
import { filterBySpan, taskYears } from './span'
import { sortAlpha } from '../constants'

/**
 * Showcase mode — the shared contract between the wizard (builder), the
 * persistence layer, and the animation engine (src/showcase/).
 *
 * A ShowcaseConfig is fully SELF-CONTAINED and DETERMINISTIC: the viewer needs
 * no access to tasks/settings/analytics, and the same config always plays the
 * same way (all variance derives from `seed`; the project play order is baked
 * in at generate time).
 */

export const SHOWCASE_CONFIG_VERSION = 1

export type CanvasPreset = '1920x1080' | '1080x1080'
export type PacingPreset = 'relaxed' | 'normal' | 'fast'
export type ShowcaseThemeId = 'red' | 'navy' | 'white'
export type BackgroundStyle = 'solid' | 'gradient' | 'geometric'
export type SectionId = 'intro' | 'projects' | 'globalStats' | 'top3'

export type GlobalStatId =
  | 'totalAssets'
  | 'totalTasks'
  | 'peopleCount'
  | 'campaignCount'
  | 'biggestStakeholder'
  | 'topCampaign'
  | 'topWorkType'
  | 'busiestMonth'
  | 'assetTypeMix'
  | 'workTypeMix'
  | 'stakeholderSplit'
  | 'tasksBySize'
  | 'assetsByMonth'

export type Top3Id =
  | 'biggestProjects'
  | 'longestProjects'
  | 'mostImages'
  | 'topStakeholders'
  | 'busiestPeople'
  | 'topCampaigns'

/** A task frozen at generate time — everything a project slide renders. */
export interface ShowcaseProject {
  id: string
  code: string
  name: string
  campaign: string
  squad: string
  people: string[]
  size: Size
  assetTotal: number
  assetBreakdown: Record<string, number>
  startDate: string | null
  endDate: string | null
  /** Inclusive day span, precomputed (null when either date is missing). */
  durationDays: number | null
  /** Public task-images URLs (frozen references, not copies). */
  images: { url: string; w: number; h: number }[]
  note?: string
}

/** One precomputed stat block. Labels are frozen so later renames don't shift them. */
export interface ShowcaseStat {
  id: GlobalStatId
  label: string
  kind: 'number' | 'text' | 'series'
  value?: number
  text?: string
  detail?: string
  series?: NamedCount[]
  /** True for the 12-entry Jan–Dec series (engine renders vertical month bars). */
  monthly?: boolean
}

export interface Top3Entry {
  name: string
  value: number
  detail?: string
}

export interface Top3Block {
  id: Top3Id
  label: string
  /** Unit word shown after values, e.g. "assets", "days", "images". */
  unit: string
  entries: Top3Entry[] // 1–3, rank order
}

export interface ShowcaseStyle {
  background: BackgroundStyle
  grain: boolean
  showCodes: boolean
  showImages: boolean
}

export interface ShowcaseConfig {
  configVersion: number
  id: string
  createdAt: string
  createdBy: string | null
  appVersion: string
  // Step 1 — intro
  year: number
  title: string
  teamName: string
  staff: string[]
  canvas: CanvasPreset
  pacing: PacingPreset
  // Step 2 — projects (already in FINAL play order)
  projects: ShowcaseProject[]
  randomizeOrder: boolean
  seed: number
  // Steps 3–4
  stats: ShowcaseStat[]
  top3: Top3Block[]
  // Step 5
  sectionOrder: SectionId[]
  // Step 6
  theme: ShowcaseThemeId
  style: ShowcaseStyle
}

/** Lightweight list row (the Generate step's "previous showcases"). */
export interface ShowcaseMeta {
  id: string
  title: string
  year: number
  createdAt: string
  createdBy: string | null
  /** ISO timestamp; null = keep forever. */
  expiresAt: string | null
  taskCount: number
  bytes: number
}

export interface ShowcaseRecord {
  meta: ShowcaseMeta
  config: ShowcaseConfig
}

// ── Link expiry ─────────────────────────────────────────────────

export type ExpiryPreset = '7d' | '30d' | '90d' | '1y' | 'never'

export const EXPIRY_OPTIONS: { id: ExpiryPreset; label: string; days: number | null }[] = [
  { id: '7d', label: '1 week', days: 7 },
  { id: '30d', label: '1 month', days: 30 },
  { id: '90d', label: '3 months', days: 90 },
  { id: '1y', label: '1 year', days: 365 },
  { id: 'never', label: 'Keep forever', days: null },
]

/** Resolve an expiry preset to an ISO timestamp (or null for "never"). */
export function expiryToDate(preset: ExpiryPreset, from = new Date()): string | null {
  const days = EXPIRY_OPTIONS.find((o) => o.id === preset)?.days ?? null
  if (days == null) return null
  return new Date(from.getTime() + days * 86_400_000).toISOString()
}

export function isExpired(meta: Pick<ShowcaseMeta, 'expiresAt'>, now = new Date()): boolean {
  return Boolean(meta.expiresAt) && new Date(meta.expiresAt as string) < now
}

/** Absolute shareable URL for a showcase id. */
export function showcaseUrl(id: string): string {
  return `${window.location.origin}/showcase/${id}`
}

// ── Deterministic randomness ────────────────────────────────────

/** Standard mulberry32 PRNG — same seed, same sequence. */
export function mulberry32(seed: number): () => number {
  let a = seed | 0
  return function () {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher–Yates shuffle driven by mulberry32 — identical output for a given seed. */
export function seededShuffle<T>(arr: T[], seed: number): T[] {
  const rng = mulberry32(seed)
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// ── Small shared computations ───────────────────────────────────

/** Inclusive day span between two ISO dates (same rule as TaskDetails). */
export function durationDays(startISO: string | null, endISO: string | null): number | null {
  if (!startISO || !endISO) return null
  const start = new Date(`${startISO}T00:00:00`)
  const end = new Date(`${endISO}T00:00:00`)
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  return Number.isFinite(days) && days > 0 ? days : null
}

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** "12 Mar – 20 Jun" style range for top-3 details. */
function shortRange(start: string | null, end: string | null): string | undefined {
  const fmt = (iso: string) => {
    const [, m, d] = iso.split('-').map(Number)
    return `${d} ${MONTHS_LONG[m - 1]?.slice(0, 3) ?? ''}`
  }
  if (start && end) return `${fmt(start)} – ${fmt(end)}`
  return undefined
}

// ── Stat & Top-3 catalogs ───────────────────────────────────────

export interface StatOption {
  id: GlobalStatId
  label: string
  description: string
  compute: (tasks: Task[], settings: AppSettings) => ShowcaseStat | null
}

const stat = (partial: Omit<ShowcaseStat, 'kind'> & { kind: ShowcaseStat['kind'] }): ShowcaseStat => partial

export const STAT_OPTIONS: StatOption[] = [
  {
    id: 'totalAssets',
    label: 'Total assets',
    description: 'Every deliverable produced in the year.',
    compute: (tasks) => stat({ id: 'totalAssets', label: 'Assets delivered', kind: 'number', value: totalAssets(tasks) }),
  },
  {
    id: 'totalTasks',
    label: 'Total tasks',
    description: 'Number of tasks completed.',
    compute: (tasks) => stat({ id: 'totalTasks', label: 'Tasks completed', kind: 'number', value: tasks.length }),
  },
  {
    id: 'peopleCount',
    label: 'Team members involved',
    description: 'Distinct people credited on tasks.',
    compute: (tasks) =>
      stat({ id: 'peopleCount', label: 'Creatives involved', kind: 'number', value: countByMulti(tasks, 'people').length }),
  },
  {
    id: 'campaignCount',
    label: 'Campaigns served',
    description: 'Distinct campaigns with at least one task.',
    compute: (tasks) =>
      stat({ id: 'campaignCount', label: 'Campaigns served', kind: 'number', value: countByField(tasks, 'campaign').length }),
  },
  {
    id: 'biggestStakeholder',
    label: 'Biggest stakeholder',
    description: 'Squad with the most assets delivered.',
    compute: (tasks) => {
      const top = assetsBySquad(tasks)[0]
      if (!top) return null
      return stat({
        id: 'biggestStakeholder',
        label: 'Biggest stakeholder',
        kind: 'text',
        text: top.name,
        detail: `${top.value.toLocaleString()} assets`,
      })
    },
  },
  {
    id: 'topCampaign',
    label: 'Top campaign',
    description: 'Campaign with the most assets.',
    compute: (tasks) => {
      const top = assetsByCampaign(tasks)[0]
      if (!top) return null
      return stat({
        id: 'topCampaign',
        label: 'Top campaign',
        kind: 'text',
        text: top.name,
        detail: `${top.value.toLocaleString()} assets`,
      })
    },
  },
  {
    id: 'topWorkType',
    label: 'Most requested work type',
    description: 'The work type appearing on the most tasks.',
    compute: (tasks) => {
      const top = countByMulti(tasks, 'types')[0]
      if (!top) return null
      return stat({
        id: 'topWorkType',
        label: 'Most requested work',
        kind: 'text',
        text: top.name,
        detail: `${top.value.toLocaleString()} tasks`,
      })
    },
  },
  {
    id: 'busiestMonth',
    label: 'Busiest month',
    description: 'Month with the most assets booked.',
    compute: (tasks) => {
      const months = assetsByMonth(tasks)
      const peak = months.reduce((a, b) => (b.value > a.value ? b : a), months[0])
      if (!peak || peak.value === 0) return null
      const idx = months.indexOf(peak)
      return stat({
        id: 'busiestMonth',
        label: 'Busiest month',
        kind: 'text',
        text: MONTHS_LONG[idx] ?? peak.name,
        detail: `${peak.value.toLocaleString()} assets`,
      })
    },
  },
  {
    id: 'assetTypeMix',
    label: 'Asset type mix',
    description: 'How deliverables split by asset type.',
    compute: (tasks, settings) => {
      const series = assetsByType(tasks, settings.assetTypes).filter((r) => r.value > 0)
      if (!series.length) return null
      return stat({ id: 'assetTypeMix', label: 'Asset type mix', kind: 'series', series })
    },
  },
  {
    id: 'workTypeMix',
    label: 'Work type mix',
    description: 'How tasks split by work type.',
    compute: (tasks) => {
      const series = countByMulti(tasks, 'types')
      if (!series.length) return null
      return stat({ id: 'workTypeMix', label: 'Work type mix', kind: 'series', series })
    },
  },
  {
    id: 'stakeholderSplit',
    label: 'Stakeholder split',
    description: 'Assets by stakeholder group (Domestic / INTON / Others).',
    compute: (tasks) => {
      const rec: Record<string, number> = {}
      for (const t of tasks) {
        const g = stakeholderGroup(t.squad)
        rec[g] = (rec[g] ?? 0) + (t.assetTotal || 0)
      }
      const series = Object.entries(rec)
        .map(([name, value]) => ({ name, value }))
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value)
      if (!series.length) return null
      return stat({ id: 'stakeholderSplit', label: 'Stakeholder split', kind: 'series', series })
    },
  },
  {
    id: 'tasksBySize',
    label: 'Tasks by size',
    description: 'Effort distribution across T-shirt sizes.',
    compute: (tasks) => {
      const series = countBySize(tasks)
      if (!series.some((r) => r.value > 0)) return null
      return stat({ id: 'tasksBySize', label: 'Tasks by size', kind: 'series', series })
    },
  },
  {
    id: 'assetsByMonth',
    label: 'Assets across the year',
    description: 'Monthly asset volume, January to December.',
    compute: (tasks) => {
      const series = assetsByMonth(tasks)
      if (!series.some((r) => r.value > 0)) return null
      return stat({ id: 'assetsByMonth', label: 'Assets across the year', kind: 'series', series, monthly: true })
    },
  },
]

export interface Top3Option {
  id: Top3Id
  label: string
  description: string
  compute: (tasks: Task[]) => Top3Block | null
}

const fromNamed = (id: Top3Id, label: string, unit: string, rows: NamedCount[]): Top3Block | null => {
  const entries = rows.filter((r) => r.value > 0).slice(0, 3)
  if (!entries.length) return null
  return { id, label, unit, entries: entries.map((r) => ({ name: r.name, value: r.value })) }
}

export const TOP3_OPTIONS: Top3Option[] = [
  {
    id: 'biggestProjects',
    label: 'Biggest projects',
    description: 'Tasks with the most assets.',
    compute: (tasks) => {
      const entries = [...tasks]
        .filter((t) => t.assetTotal > 0)
        .sort((a, b) => b.assetTotal - a.assetTotal)
        .slice(0, 3)
        .map((t) => ({ name: t.name, value: t.assetTotal, detail: t.campaign }))
      return entries.length ? { id: 'biggestProjects', label: 'Biggest projects', unit: 'assets', entries } : null
    },
  },
  {
    id: 'longestProjects',
    label: 'Longest projects',
    description: 'Tasks with the longest start-to-end span.',
    compute: (tasks) => {
      const entries = tasks
        .map((t) => ({ t, d: durationDays(t.startDate, t.endDate) }))
        .filter((x): x is { t: Task; d: number } => x.d != null)
        .sort((a, b) => b.d - a.d)
        .slice(0, 3)
        .map(({ t, d }) => ({ name: t.name, value: d, detail: shortRange(t.startDate, t.endDate) }))
      return entries.length ? { id: 'longestProjects', label: 'Longest projects', unit: 'days', entries } : null
    },
  },
  {
    id: 'mostImages',
    label: 'Most demo images',
    description: 'Tasks with the most attached demo images.',
    compute: (tasks) => {
      const entries = [...tasks]
        .filter((t) => (t.images?.length ?? 0) > 0)
        .sort((a, b) => (b.images?.length ?? 0) - (a.images?.length ?? 0))
        .slice(0, 3)
        .map((t) => ({ name: t.name, value: t.images.length, detail: t.campaign }))
      return entries.length ? { id: 'mostImages', label: 'Most demo images', unit: 'images', entries } : null
    },
  },
  {
    id: 'topStakeholders',
    label: 'Top stakeholders',
    description: 'Squads with the most assets delivered.',
    compute: (tasks) => fromNamed('topStakeholders', 'Top stakeholders', 'assets', assetsBySquad(tasks)),
  },
  {
    id: 'busiestPeople',
    label: 'Busiest people',
    description: 'Team members credited with the most assets.',
    compute: (tasks) => fromNamed('busiestPeople', 'Busiest people', 'assets', assetsByPerson(tasks)),
  },
  {
    id: 'topCampaigns',
    label: 'Top campaigns',
    description: 'Campaigns with the most assets.',
    compute: (tasks) => fromNamed('topCampaigns', 'Top campaigns', 'assets', assetsByCampaign(tasks)),
  },
]

// ── Wizard draft ────────────────────────────────────────────────

export interface ShowcaseDraft {
  draftVersion: 1
  step: number // 0-6
  // Step 1
  year: number
  title: string
  teamName: string
  staff: string[]
  canvas: CanvasPreset
  pacing: PacingPreset
  // Step 2
  sizeFilter: Size[]
  selectedIds: string[] // ordered play order (pre-randomize)
  randomizeOrder: boolean
  seed: number
  // Steps 3–6
  statIds: GlobalStatId[]
  top3Ids: Top3Id[]
  sectionOrder: SectionId[]
  theme: ShowcaseThemeId
  style: ShowcaseStyle
  // Step 7
  expiry: ExpiryPreset
}

const DRAFT_KEY = 'mwr.showcaseDraft.v1'

/** Year tasks matching the size filter, biggest first — the default selection. */
export function deriveSelection(tasks: Task[], year: number, sizeFilter: Size[]): string[] {
  return filterBySpan(tasks, 'year', year, 'H1')
    .filter((t) => sizeFilter.includes(t.size))
    .sort((a, b) => b.assetTotal - a.assetTotal)
    .map((t) => t.id)
}

export function defaultDraft(tasks: Task[], settings: AppSettings): ShowcaseDraft {
  const year = taskYears(tasks)[0] ?? new Date().getFullYear()
  const sizeFilter: Size[] = ['L', 'XL']
  return {
    draftVersion: 1,
    step: 0,
    year,
    title: `GCMC ${year} Showcase`,
    teamName: 'GCMC',
    staff: sortAlpha(settings.people),
    canvas: '1920x1080',
    pacing: 'normal',
    sizeFilter,
    selectedIds: deriveSelection(tasks, year, sizeFilter),
    randomizeOrder: false,
    seed: Math.floor(Math.random() * 2 ** 31),
    statIds: ['totalAssets', 'totalTasks', 'biggestStakeholder', 'busiestMonth', 'assetTypeMix', 'tasksBySize'],
    top3Ids: ['biggestProjects', 'longestProjects', 'topStakeholders'],
    sectionOrder: ['intro', 'projects', 'globalStats', 'top3'],
    theme: 'red',
    style: { background: 'gradient', grain: true, showCodes: true, showImages: true },
    expiry: '90d',
  }
}

export function loadDraft(): ShowcaseDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ShowcaseDraft>
    if (parsed.draftVersion !== 1) return null
    return parsed as ShowcaseDraft
  } catch {
    return null
  }
}

export function saveDraft(draft: ShowcaseDraft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    /* best effort */
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    /* ignore */
  }
}

// ── Config builder (generate time) ──────────────────────────────

function taskToProject(t: Task): ShowcaseProject {
  return {
    id: t.id,
    code: t.code,
    name: t.name,
    campaign: t.campaign,
    squad: t.squad,
    people: t.people,
    size: t.size,
    assetTotal: t.assetTotal,
    assetBreakdown: t.assetBreakdown,
    startDate: t.startDate,
    endDate: t.endDate,
    durationDays: durationDays(t.startDate, t.endDate),
    images: (t.images ?? []).map((im) => ({ url: im.url, w: im.w, h: im.h })),
    note: t.note || undefined,
  }
}

/**
 * Freeze the draft against current data into a self-contained config + meta.
 * Stats and top-3 are computed over ALL tasks of the year (rankings should
 * reflect the real year); only the projects section uses the selection.
 */
export function buildShowcaseConfig(
  tasks: Task[],
  settings: AppSettings,
  draft: ShowcaseDraft,
  createdBy: string | null,
): ShowcaseRecord {
  const yearTasks = filterBySpan(tasks, 'year', draft.year, 'H1')
  const byId = new Map(tasks.map((t) => [t.id, t]))

  let projects = draft.selectedIds
    .map((id) => byId.get(id))
    .filter((t): t is Task => Boolean(t))
    .map(taskToProject)
  if (draft.randomizeOrder) projects = seededShuffle(projects, draft.seed)

  const stats = draft.statIds
    .map((id) => STAT_OPTIONS.find((o) => o.id === id)?.compute(yearTasks, settings) ?? null)
    .filter((s): s is ShowcaseStat => s !== null)

  const top3 = draft.top3Ids
    .map((id) => TOP3_OPTIONS.find((o) => o.id === id)?.compute(yearTasks) ?? null)
    .filter((b): b is Top3Block => b !== null)

  // Drop sections that ended up empty; intro is always present and first.
  const sectionOrder = draft.sectionOrder.filter((s) => {
    if (s === 'intro') return true
    if (s === 'projects') return projects.length > 0
    if (s === 'globalStats') return stats.length > 0
    return top3.length > 0
  })

  const config: ShowcaseConfig = {
    configVersion: SHOWCASE_CONFIG_VERSION,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    createdBy,
    appVersion: __APP_VERSION__,
    year: draft.year,
    title: draft.title.trim(),
    teamName: draft.teamName.trim(),
    staff: draft.staff,
    canvas: draft.canvas,
    pacing: draft.pacing,
    projects,
    randomizeOrder: draft.randomizeOrder,
    seed: draft.seed,
    stats,
    top3,
    sectionOrder,
    theme: draft.theme,
    style: draft.style,
  }

  const meta: ShowcaseMeta = {
    id: config.id,
    title: config.title,
    year: config.year,
    createdAt: config.createdAt,
    createdBy,
    expiresAt: expiryToDate(draft.expiry),
    taskCount: projects.length,
    bytes: 0,
  }
  meta.bytes = new Blob([JSON.stringify({ meta, config })]).size
  return { meta, config }
}

/** Rough total runtime for the recap (the engine computes exact durations). */
export function estimateRuntimeMs(draft: ShowcaseDraft, statCount: number, top3Count: number): number {
  const pace = draft.pacing === 'fast' ? 0.85 : draft.pacing === 'relaxed' ? 1.25 : 1
  const projects = draft.selectedIds.length
  const scalarStats = Math.ceil(statCount / 3)
  const base =
    6000 + // intro
    (projects ? 2800 + projects * 6600 : 0) +
    (statCount ? 2800 + scalarStats * 5000 : 0) +
    top3Count * 6200 +
    3000 // end card
  return Math.round(base * pace)
}
