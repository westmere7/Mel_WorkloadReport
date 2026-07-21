import type { Squad, Size, AppSettings, FunctionConfig, FunctionData, FunctionEntry } from './types'

/**
 * Default squads (stakeholders). Editable in Settings like the other lists — this
 * just seeds the initial list. "Others" is the virtual fallback (see withFallback),
 * so it is NOT stored here.
 */
export const DEFAULT_SQUADS: string[] = [
  'INTON',
  'DOM',
  'Student Recruitment',
  'BPX',
  'RMIT VN',
  'Alumni',
  'Agent Management',
]

/** All squads including the "Others" fallback — handy for sample data / CSV defaults. */
export const SQUADS: Squad[] = [...DEFAULT_SQUADS, 'Others']

/** Friendly descriptions shown as tooltips / helper text. */
export const SQUAD_DESCRIPTIONS: Record<Squad, string> = {
  INTON: 'International On Shore',
  DOM: 'Domestic',
  'Student Recruitment': 'Student Recruitment',
  BPX: 'Business Partner',
  'RMIT VN': 'RMIT Vietnam',
  Alumni: 'Alumni',
  'Agent Management': 'Agent Management',
  Others: 'Other / ad-hoc requests',
}

/** Default campaigns — users can add/remove these in Settings. */
export const DEFAULT_CAMPAIGNS: string[] = [
  'BAU',
  'SEM1',
  'SEM2',
  'SEM3',
  'China Roadshow',
  'ISC Roadshow',
  'SEA Roadshow',
  'Open Day',
  'VTAC',
  'Change of Preference',
  'Always On',
]

/** Default work types — editable in Settings. */
export const DEFAULT_TYPES: string[] = [
  'Concept development',
  'Video editing',
  'Graphic design (static)',
  'Digital display',
  'Publication',
  'Motion graphic',
  'Tiktok',
]

/** Default people in the team — editable in Settings. */
export const DEFAULT_PEOPLE: string[] = [
  'Truc',
  'Tuyet',
  'Danh',
  'Eden',
  'Duc',
  'Trinh',
  'Tran',
]

/** Default asset (deliverable) types — editable in Settings. */
export const DEFAULT_ASSET_TYPES: string[] = ['Image', 'Video', 'Publication', 'HTML5 ad', 'GIF / Motion']

// ── GCMC functions (per-function workload slices) ────────────────────────────

/**
 * Function that owns every task recorded before functions existed. A task with
 * no `functionData` opens in the form with only this tab enabled, seeded from
 * its top-level fields; it's upgraded when saved. Renaming the function in
 * Settings rewrites task keys but legacy (null) tasks keep following the new
 * name via `AppSettings.functions` order — so this constant tracks the SEED
 * name only and must match DEFAULT_FUNCTIONS.
 */
export const LEGACY_FUNCTION = 'Vietnam Design'

/**
 * Preset colour classes for functions — key stored in settings, applied in the
 * task form + Settings. `dot` for legend dots, `tab`/`ring` for tints,
 * `outline` for the solid thick border that joins a function's tab to its
 * canvas (Chrome-tab style), and `hex` for inline styles that CSS classes
 * can't express (the tab fillet-corner gradients). Kept to the app's existing
 * accent families — hexes mirror tailwind.config.js.
 */
export interface FunctionColorSet {
  dot: string
  tab: string
  ring: string
  outline: string
  hex: string
}

export const FUNCTION_COLORS: Record<string, FunctionColorSet> = {
  red: { dot: 'bg-rmit-red', tab: 'border-rmit-red/40 bg-rmit-red/5', ring: 'ring-rmit-red/40', outline: 'border-rmit-red', hex: '#E61E2A' },
  teal: { dot: 'bg-accent-teal', tab: 'border-accent-teal/40 bg-accent-teal/5', ring: 'ring-accent-teal/40', outline: 'border-accent-teal', hex: '#00A9CE' },
  gold: { dot: 'bg-accent-gold', tab: 'border-accent-gold/40 bg-accent-gold/5', ring: 'ring-accent-gold/40', outline: 'border-accent-gold', hex: '#FFB81C' },
  green: { dot: 'bg-accent-green', tab: 'border-accent-green/40 bg-accent-green/5', ring: 'ring-accent-green/40', outline: 'border-accent-green', hex: '#5BBA47' },
  plum: { dot: 'bg-accent-plum', tab: 'border-accent-plum/40 bg-accent-plum/5', ring: 'ring-accent-plum/40', outline: 'border-accent-plum', hex: '#8E5BA6' },
}

export const FUNCTION_COLOR_KEYS = Object.keys(FUNCTION_COLORS)

/** Look up a function's colour classes, falling back safely for unknown keys. */
export function functionColor(key: string | undefined): FunctionColorSet {
  return FUNCTION_COLORS[key ?? ''] ?? FUNCTION_COLORS.plum
}

/**
 * Default functions. Hidden-type lists start EMPTY = every tab offers the full
 * master lists; Settings trims per function by adding exclusions.
 */
export const DEFAULT_FUNCTIONS: FunctionConfig[] = [
  { name: 'Vietnam Design', color: 'red', hiddenWorkTypes: [], hiddenAssetTypes: [] },
  { name: 'Melbourne Design', color: 'teal', hiddenWorkTypes: [], hiddenAssetTypes: [] },
  { name: 'Production', color: 'gold', hiddenWorkTypes: [], hiddenAssetTypes: [] },
  { name: 'Contents', color: 'green', hiddenWorkTypes: [], hiddenAssetTypes: [] },
]

/**
 * Which function owns tasks with NO functionData (recorded pre-functions).
 * The seed name if it still exists, else the first configured function — so a
 * rename of Vietnam Design keeps legacy tasks following it (order is stable).
 */
export function legacyOwnerName(functions: FunctionConfig[]): string {
  return functions.find((f) => f.name === LEGACY_FUNCTION)?.name ?? functions[0]?.name ?? LEGACY_FUNCTION
}

/** Coerce a stored `functions` value into a valid FunctionConfig[] (defaults on junk). */
export function normalizeFunctions(raw: unknown): FunctionConfig[] {
  const cloneDefaults = () =>
    DEFAULT_FUNCTIONS.map((f) => ({ ...f, hiddenWorkTypes: [...f.hiddenWorkTypes], hiddenAssetTypes: [...f.hiddenAssetTypes] }))
  if (!Array.isArray(raw)) return cloneDefaults()
  const out: FunctionConfig[] = []
  for (const f of raw) {
    if (!f || typeof f !== 'object') continue
    const name = typeof (f as FunctionConfig).name === 'string' ? (f as FunctionConfig).name.trim() : ''
    if (!name || out.some((o) => o.name === name)) continue
    const strings = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string') : []
    out.push({
      name,
      color: typeof (f as FunctionConfig).color === 'string' ? (f as FunctionConfig).color : 'plum',
      hiddenWorkTypes: strings((f as FunctionConfig).hiddenWorkTypes),
      hiddenAssetTypes: strings((f as FunctionConfig).hiddenAssetTypes),
    })
  }
  return out.length ? out : cloneDefaults()
}

/** Empty per-function slice. */
export function emptyFunctionEntry(): FunctionEntry {
  return { types: [], assetBreakdown: {}, assetTotal: 0, timelineOn: false, startDate: null, endDate: null }
}

/** Coerce a stored `function_data` value into a clean FunctionData (or null for legacy). */
export function normalizeFunctionData(raw: unknown): FunctionData | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const out: FunctionData = {}
  for (const [name, e] of Object.entries(raw as Record<string, unknown>)) {
    if (!name.trim() || !e || typeof e !== 'object') continue
    const entry = e as Partial<FunctionEntry>
    const breakdown = normalizeBreakdown(entry.assetBreakdown as Record<string, number> | undefined)
    out[name] = {
      types: Array.isArray(entry.types) ? entry.types.filter((t): t is string => typeof t === 'string') : [],
      assetBreakdown: breakdown,
      assetTotal: Object.values(breakdown).reduce((a, b) => a + b, 0),
      timelineOn: entry.timelineOn === true,
      startDate: typeof entry.startDate === 'string' ? entry.startDate : null,
      endDate: typeof entry.endDate === 'string' ? entry.endDate : null,
    }
  }
  return Object.keys(out).length ? out : null
}

/**
 * Reserved catch-all present in every editable list (campaigns/types/people/asset
 * types). It can't be edited or removed; deleting a list item that tasks still use
 * reassigns those tasks to this value so nothing is orphaned.
 */
export const FALLBACK_ITEM = 'Others'

/** Sort a list alphabetically (case-insensitive), leaving the original untouched. */
export function sortAlpha(items: string[]): string[] {
  return [...items].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

/**
 * Append the reserved "Others" fallback to an editable list (deduped, always last).
 * The real items are sorted alphabetically so the task form + charts list them A→Z.
 */
export function withFallback(items: string[]): string[] {
  return [...sortAlpha(items.filter((v) => v !== FALLBACK_ITEM)), FALLBACK_ITEM]
}

/** Default turnaround per size (days) — how far the end date auto-fills past the
 *  start date. Seeds the editable Settings value; existing tasks are never changed. */
export const DEFAULT_SIZE_DURATIONS: Record<Size, number> = {
  XS: 7,
  S: 28,
  M: 42,
  L: 56,
  XL: 182,
}

export const DEFAULT_SETTINGS: AppSettings = {
  squads: DEFAULT_SQUADS,
  campaigns: DEFAULT_CAMPAIGNS,
  types: DEFAULT_TYPES,
  people: DEFAULT_PEOPLE,
  assetTypes: DEFAULT_ASSET_TYPES,
  functions: DEFAULT_FUNCTIONS.map((f) => ({
    ...f,
    hiddenWorkTypes: [...f.hiddenWorkTypes],
    hiddenAssetTypes: [...f.hiddenAssetTypes],
  })),
  sizeDurations: { ...DEFAULT_SIZE_DURATIONS },
  allowRemoveUsed: false,
  peopleMondayIds: {},
}

/** Legacy fixed breakdown keys → their default display names, for migrating old data. */
const LEGACY_ASSET_KEYS: Record<string, string> = {
  image: 'Image',
  video: 'Video',
  publication: 'Publication',
  html5: 'HTML5 ad',
  gif: 'GIF / Motion',
}

/** Canonical display name for a stored breakdown key (maps legacy fixed keys to names). */
export function canonicalAssetName(key: string): string {
  return LEGACY_ASSET_KEYS[key] ?? key
}

/** Normalise a stored asset breakdown to name-keyed form (migrates legacy fixed keys). */
export function normalizeBreakdown(raw: Record<string, number> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(raw ?? {})) {
    const key = LEGACY_ASSET_KEYS[k] ?? k
    out[key] = (out[key] ?? 0) + (Number(v) || 0)
  }
  return out
}

/** Fixed T-shirt sizes (effort/size scale), smallest → largest. */
export const SIZES: Size[] = ['XS', 'S', 'M', 'L', 'XL']

/** Sort order index for sizes. */
export const SIZE_ORDER: Record<Size, number> = { XS: 0, S: 1, M: 2, L: 3, XL: 4 }

export const SIZE_DESCRIPTIONS: Record<Size, string> = {
  XS: 'Very small / quick turnaround',
  S: 'Small',
  M: 'Medium',
  L: 'Large',
  XL: 'Very large / major effort',
}

/** Format a day count into a friendly turnaround label (e.g. 42 → "6 weeks"). */
export function formatDurationDays(days: number): string {
  const d = Math.max(0, Math.round(days))
  if (d === 0) return 'same day'
  if (d % 7 === 0) {
    const w = d / 7
    return `${w} week${w === 1 ? '' : 's'}`
  }
  return `${d} day${d === 1 ? '' : 's'}`
}

/** Coerce a stored size-durations value into a complete numeric map (defaults fill gaps). */
export function normalizeSizeDurations(raw: unknown): Record<Size, number> {
  const out: Record<Size, number> = { ...DEFAULT_SIZE_DURATIONS }
  if (raw && typeof raw === 'object') {
    for (const s of SIZES) {
      const v = (raw as Record<string, unknown>)[s]
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[s] = Math.round(v)
    }
  }
  return out
}

/** Heat-scale colours for sizes (cool → hot), used in charts. */
export const SIZE_COLORS: Record<Size, string> = {
  XS: '#94a3b8',
  S: '#00A9CE',
  M: '#FFB81C',
  L: '#F58220',
  XL: '#E61E2A',
}

/** Badge tone per size (matches Badge `Tone` values). */
export const SIZE_TONE: Record<Size, 'gray' | 'teal' | 'gold' | 'orange' | 'red'> = {
  XS: 'gray',
  S: 'teal',
  M: 'gold',
  L: 'orange',
  XL: 'red',
}

/**
 * Brand chart palette — RMIT red + navy with yellow as the third colour, then
 * tones of the same three families. Ordered so the first three are the brand
 * trio (red, navy, yellow) and adjacent entries alternate warm/cool. Light mode.
 */
export const CHART_COLORS_LIGHT = [
  '#E61E2A', // rmit red
  '#000054', // rmit navy
  '#FFB81C', // gold / yellow
  '#F1757F', // soft red (brand-300)
  '#4D4D8F', // mid navy (navy-300)
  '#94121B', // deep red (brand-700)
  '#26266F', // deep navy (navy-400)
  '#FFD37A', // light gold
  '#8080AF', // light navy (navy-200)
]

/**
 * Dark-mode palette: same red/navy/yellow families, but the near-black navies
 * are lightened so bars/slices don't blend into the dark navy background.
 */
export const CHART_COLORS_DARK = [
  '#FF4D58', // brighter red
  '#6C7BF0', // lifted navy → indigo
  '#FFC72C', // brighter gold
  '#F58AA0', // pink-red
  '#9AA0E0', // light indigo
  '#E61E2A', // rmit red
  '#7B7BC0', // mid indigo
  '#FFDE95', // light gold
  '#B3B3CF', // pale navy
]

/** Default palette (kept for any direct importers; light variant). */
export const CHART_COLORS = CHART_COLORS_LIGHT
