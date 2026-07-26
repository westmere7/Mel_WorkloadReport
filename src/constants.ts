import type { Squad, Size, AppSettings, AssetRate, AssetRates, FunctionConfig, FunctionData, FunctionEntry, ChartGroup, ChartGroups, RatePer } from './types'

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

// ── Asset output rates (drive the dashboard's Effort view) ───────────────────

/** Time bases an output rate can be expressed against, in picker order. */
export const RATE_UNITS: RatePer[] = ['hour', 'day', 'week']

/** Singular/plural labels for the rate unit picker. */
export const RATE_UNIT_LABELS: Record<RatePer, { one: string; many: string }> = {
  hour: { one: 'hour', many: 'hours' },
  day: { one: 'day', many: 'days' },
  week: { one: 'week', many: 'weeks' },
}

/** The `per` unit pluralised for a span length, e.g. (2, 'day') → "days". */
export function rateUnitLabel(every: number, per: RatePer): string {
  return every === 1 ? RATE_UNIT_LABELS[per].one : RATE_UNIT_LABELS[per].many
}

/**
 * Working hours assumed in one working day when translating a per-day rate into
 * a per-unit time estimate. DISPLAY ONLY — it feeds the "≈ 40 min each" hint
 * next to a rate so a typo is obvious, and nothing else.
 */
export const HOURS_PER_WORKING_DAY = 8

/** Working days assumed in one week, for the same display-only translation. */
export const WORKING_DAYS_PER_WEEK = 5

/** Hours in one unit of each time base — display-only, see HOURS_PER_WORKING_DAY. */
const RATE_UNIT_HOURS: Record<RatePer, number> = {
  hour: 1,
  day: HOURS_PER_WORKING_DAY,
  week: HOURS_PER_WORKING_DAY * WORKING_DAYS_PER_WEEK,
}

/**
 * Coerce a stored asset-rates value into a clean map: name → { qty, every, per }.
 * Junk-tolerant like the other normalizers. Entries with a non-positive or
 * non-finite qty/every are DROPPED, so "not specified" has exactly one
 * representation (an absent key) and never a stored zero. A missing `every`
 * reads as 1, so rates written before the span was configurable still load.
 */
export function normalizeAssetRates(raw: unknown): AssetRates {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: AssetRates = {}
  for (const [name, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!name.trim() || !v || typeof v !== 'object') continue
    const rec = v as Partial<AssetRate>
    const qty = Number(rec.qty)
    const every = rec.every === undefined ? 1 : Number(rec.every)
    if (!Number.isFinite(qty) || qty <= 0) continue
    if (!Number.isFinite(every) || every <= 0) continue
    const per = RATE_UNITS.includes(rec.per as RatePer) ? (rec.per as RatePer) : 'day'
    out[name] = { qty, every, per }
  }
  return out
}

/**
 * Hours ONE unit takes at this rate — the basis of every Effort figure, and of the
 * "≈ each" hint and relative-effort bars in Settings. Returns 0 for a
 * missing/invalid rate, so unrated types contribute nothing rather than a guess.
 */
export function hoursPerUnit(rate: AssetRate | undefined): number {
  if (!rate || rate.qty <= 0 || rate.every <= 0) return 0
  return (rate.every * RATE_UNIT_HOURS[rate.per]) / rate.qty
}

/**
 * The time ONE unit takes at this rate, as a friendly label ("≈ 40 min each").
 * A sanity check for the person typing the rate — display only, never a total.
 */
export function formatRatePerUnit(rate: AssetRate | undefined): string {
  if (!rate || rate.qty <= 0 || rate.every <= 0) return ''
  const hours = hoursPerUnit(rate)
  if (hours < 1 / 60) return '≈ under a minute each'
  if (hours < 1) return `≈ ${Math.round(hours * 60)} min each`
  if (hours <= HOURS_PER_WORKING_DAY) {
    const rounded = Math.round(hours * 10) / 10
    return `≈ ${rounded} ${rounded === 1 ? 'hour' : 'hours'} each`
  }
  const days = hours / HOURS_PER_WORKING_DAY
  if (days <= WORKING_DAYS_PER_WEEK) {
    const rounded = Math.round(days * 10) / 10
    return `≈ ${rounded} ${rounded === 1 ? 'day' : 'days'} each`
  }
  const weeks = Math.round((days / WORKING_DAYS_PER_WEEK) * 10) / 10
  return `≈ ${weeks} ${weeks === 1 ? 'week' : 'weeks'} each`
}

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
 * Preset function colours — vibrant, saturated hues (roughly the Tailwind-600
 * family). Text placed on a solid fill uses `readableOn`, which picks white or
 * dark per colour, so every fill stays perfectly legible in both themes (all are
 * white-text except the bright `gold`, which takes dark text). Rendered via
 * inline styles (dots, the panel outline, the filled active tab, the on-switch
 * track), a distinct family from the chart accents in tailwind.config.js.
 */
export interface FunctionColorSet {
  hex: string
}

export const FUNCTION_COLORS: Record<string, FunctionColorSet> = {
  // NB: no `red` — that hue is reserved for the app's own UI accents (RMIT red),
  // so functions can't pick it and clash with buttons/required cues.
  orange: { hex: '#EA580C' },
  gold: { hex: '#EAB308' },
  green: { hex: '#16A34A' },
  teal: { hex: '#0D9488' },
  blue: { hex: '#2563EB' },
  indigo: { hex: '#4F46E5' },
  plum: { hex: '#9333EA' },
  pink: { hex: '#DB2777' },
  slate: { hex: '#64748B' },
}

export const FUNCTION_COLOR_KEYS = Object.keys(FUNCTION_COLORS)

/** Look up a function's colour, falling back safely for unknown keys. */
export function functionColor(key: string | undefined): FunctionColorSet {
  return FUNCTION_COLORS[key ?? ''] ?? FUNCTION_COLORS.plum
}

/**
 * A broad, distinct palette for dashboard chart GROUPS — deliberately larger than
 * the function set so many groups can each keep a unique colour. Vibrant fills
 * that read on both themes; spans the hue wheel plus a couple of neutrals.
 */
export const CHART_GROUP_COLORS: string[] = [
  '#DC2626', // red
  '#EA580C', // orange
  '#D97706', // amber
  '#EAB308', // gold
  '#84CC16', // lime
  '#16A34A', // green
  '#059669', // emerald
  '#0D9488', // teal
  '#0891B2', // cyan
  '#0284C7', // sky
  '#2563EB', // blue
  '#4F46E5', // indigo
  '#7C3AED', // violet
  '#9333EA', // purple
  '#C026D3', // fuchsia
  '#DB2777', // pink
  '#E11D48', // rose
  '#78716C', // stone
  '#64748B', // slate
  '#475569', // dark slate
]

/**
 * Default functions. Type lists start seeded with the FULL master lists =
 * every tab offers everything out of the box; Settings trims per function by
 * un-checking. Newly added master types are NOT auto-added — users opt each
 * function in (inclusion model).
 */
export const DEFAULT_FUNCTIONS: FunctionConfig[] = [
  { name: 'Vietnam Design', color: 'blue', workTypes: [...DEFAULT_TYPES], assetTypes: [...DEFAULT_ASSET_TYPES] },
  { name: 'Melbourne Design', color: 'teal', workTypes: [...DEFAULT_TYPES], assetTypes: [...DEFAULT_ASSET_TYPES] },
  { name: 'Production', color: 'gold', workTypes: [...DEFAULT_TYPES], assetTypes: [...DEFAULT_ASSET_TYPES] },
  { name: 'Contents', color: 'green', workTypes: [...DEFAULT_TYPES], assetTypes: [...DEFAULT_ASSET_TYPES] },
]

/**
 * Which function owns tasks with NO functionData (recorded pre-functions).
 * The seed name if it still exists, else the first configured function — so a
 * rename of Vietnam Design keeps legacy tasks following it (order is stable).
 */
export function legacyOwnerName(functions: FunctionConfig[]): string {
  return functions.find((f) => f.name === LEGACY_FUNCTION)?.name ?? functions[0]?.name ?? LEGACY_FUNCTION
}

/**
 * Coerce a stored `functions` value into a valid FunctionConfig[] (defaults on junk).
 *
 * Type lists use the INCLUSION model. The master `types`/`assetTypes` lists are
 * passed in so we can (a) intersect stored include-lists with the current master
 * (dropping stale names) and (b) migrate legacy EXCLUSION data (`hiddenWorkTypes`
 * / `hiddenAssetTypes`) to inclusion — an empty hidden list becomes "all master".
 * A record with neither field seeds to the full master lists.
 */
export function normalizeFunctions(
  raw: unknown,
  masterWorkTypes: string[] = DEFAULT_TYPES,
  masterAssetTypes: string[] = DEFAULT_ASSET_TYPES,
): FunctionConfig[] {
  const cloneDefaults = () =>
    DEFAULT_FUNCTIONS.map((f) => ({ ...f, workTypes: [...f.workTypes], assetTypes: [...f.assetTypes], people: f.people ? [...f.people] : [] }))
  if (!Array.isArray(raw)) return cloneDefaults()
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string') : []
  /** Resolve one type list to an inclusion list against the master. */
  const resolve = (rec: Record<string, unknown>, incKey: string, hidKey: string, master: string[]): string[] => {
    if (Array.isArray(rec[incKey])) {
      const inc = new Set(strings(rec[incKey]))
      return master.filter((t) => inc.has(t)) // intersect with current master, master order
    }
    if (Array.isArray(rec[hidKey])) {
      const hid = new Set(strings(rec[hidKey])) // legacy exclusion → inclusion
      return master.filter((t) => !hid.has(t))
    }
    return [...master] // no info stored → offer everything
  }
  const out: FunctionConfig[] = []
  for (const f of raw) {
    if (!f || typeof f !== 'object') continue
    const rec = f as Record<string, unknown>
    const name = typeof rec.name === 'string' ? rec.name.trim() : ''
    if (!name || out.some((o) => o.name === name)) continue
    out.push({
      name,
      color: typeof rec.color === 'string' ? rec.color : 'plum',
      workTypes: resolve(rec, 'workTypes', 'hiddenWorkTypes', masterWorkTypes),
      assetTypes: resolve(rec, 'assetTypes', 'hiddenAssetTypes', masterAssetTypes),
      people: Array.isArray(rec.people) ? rec.people.filter((p): p is string => typeof p === 'string') : [],
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

/**
 * monday.com boards the New Task auto-fill searches. Editable in Settings; seeded
 * with the RMIT Playground + the 2nd board. The mapped columns (timeline/size/…)
 * are the SAME ids across these boards, so only the board id differs.
 */
export const DEFAULT_MONDAY_BOARDS: string[] = ['1967557512', '5026397227']

/**
 * Coerce a stored keyword map (squad/campaign NAME → keyword[]) into a clean
 * shape: string keys → deduped, trimmed, non-empty string arrays. Junk-tolerant.
 */
export function normalizeKeywordMap(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, string[]> = {}
  for (const [name, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!name.trim() || !Array.isArray(list)) continue
    const kws: string[] = []
    for (const k of list) {
      const s = typeof k === 'string' ? k.trim() : ''
      if (s && !kws.some((x) => x.toLowerCase() === s.toLowerCase())) kws.push(s)
    }
    if (kws.length) out[name] = kws
  }
  return out
}

/** Split a comma-separated keyword string into a clean, deduped list. */
export function parseKeywords(raw: string): string[] {
  const out: string[] = []
  for (const part of raw.split(',')) {
    const s = part.trim()
    if (s && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s)
  }
  return out
}

/**
 * First list item whose keywords appear (case-insensitive substring) in `name`.
 * `order` gives the items to scan, in priority order; returns null on no match.
 */
export function matchByKeywords(
  name: string,
  keywordMap: Record<string, string[]>,
  order: string[],
): string | null {
  const n = name.toLowerCase()
  if (!n.trim()) return null
  for (const item of order) {
    const kws = keywordMap[item]
    if (kws && kws.some((k) => k && n.includes(k.toLowerCase()))) return item
  }
  return null
}

/** Coerce a stored `chart_groups` value into a clean {asset, type} shape, keeping
 *  only well-formed groups (bad/legacy shapes fall away silently). */
export function normalizeChartGroups(raw: unknown): ChartGroups {
  const clean = (v: unknown): ChartGroup[] => {
    if (!Array.isArray(v)) return []
    return v.filter(
      (g): g is ChartGroup =>
        !!g &&
        typeof g === 'object' &&
        typeof (g as ChartGroup).id === 'string' &&
        typeof (g as ChartGroup).name === 'string' &&
        typeof (g as ChartGroup).color === 'string' &&
        Array.isArray((g as ChartGroup).items) &&
        (g as ChartGroup).items.every((i) => typeof i === 'string'),
    )
  }
  const rec = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return { asset: clean(rec.asset), type: clean(rec.type) }
}

/** Coerce a stored `monday_boards` value into a clean, deduped list of id strings. */
export function normalizeMondayBoards(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_MONDAY_BOARDS]
  const out: string[] = []
  for (const v of raw) {
    const id = String(v ?? '').trim()
    if (id && !out.includes(id)) out.push(id)
  }
  return out
}

/**
 * Default voice brief for the Advisor (Settings -> Advisor lets editors change it).
 *
 * Deliberately about WRITING ONLY. Which findings exist, which numbers they carry
 * and how they rank is decided in `src/lib/advisor/findings.ts`; the Edge Function
 * appends non-negotiable accuracy rules after this text, so editing it can change
 * the voice but cannot licence an invented figure.
 */
export const DEFAULT_ADVISOR_PROMPT = `You are a workload analyst writing a short briefing for the manager of RMIT's GCMC creative team.

WHAT TO SAY:
- 3 short paragraphs, 130-200 words total. Flowing prose, no bullet points, no headings.
- You are given MORE findings than you should mention. Pick the 3-4 that together tell one coherent story and ignore the rest. Do not walk through them in order.
- Open on the single most consequential finding, stated plainly in one sentence. No scene-setting abstraction first.
- Connect the findings. The value is in the relationship between them - a concentration and a ramp are the same story about timing.
- Close on what it means for planning, drawn only from what you have already said. Do not introduce a new claim to end on.
- Where a caveat finding is present, work it in honestly rather than as a disclaimer at the end.

HOW TO WRITE IT:
- Plain professional English, British spelling. Short verbs beat abstract nouns.
- Say "Videos took 63% of the team's hours". Do NOT say "Videos represents a 63% share of overall effort".
- Banned as padding: "represents", "presents", "constitutes", "in terms of", "share of overall", "resource" as a noun, "centralized", "utilise", "leverage", "key driver", "capacity challenge", "operational pressure", "remains the primary".
- Don't lean on one framing word. If you have written "share" once, find another way the next time.
- Vary sentence length. Never one sentence per fact; that reads like a form letter.
- No hype, no "significantly", no exclamation marks. Confident and unexcited.
- Effort figures come from hand-set rate estimates, so treat them as comparative, never as measured hours.`

/** Upper bound on a stored advisor prompt -- a runaway paste is a payload problem. */
export const ADVISOR_PROMPT_MAX = 6000

export const DEFAULT_SETTINGS: AppSettings = {
  squads: DEFAULT_SQUADS,
  campaigns: DEFAULT_CAMPAIGNS,
  types: DEFAULT_TYPES,
  people: DEFAULT_PEOPLE,
  assetTypes: DEFAULT_ASSET_TYPES,
  // No rates out of the box — every asset type starts "not specified".
  assetRates: {},
  functions: DEFAULT_FUNCTIONS.map((f) => ({
    ...f,
    workTypes: [...f.workTypes],
    assetTypes: [...f.assetTypes],
  })),
  sizeDurations: { ...DEFAULT_SIZE_DURATIONS },
  allowRemoveUsed: false,
  peopleMondayIds: {},
  mondayBoardIds: [...DEFAULT_MONDAY_BOARDS],
  mondayBoardNames: {},
  squadKeywords: {},
  campaignKeywords: {},
  chartGroups: { asset: [], type: [] },
  // Empty = follow DEFAULT_ADVISOR_PROMPT, so improvements to the default reach
  // teams that never edited it.
  advisorPrompt: '',
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

/** Compact one-word size labels — for tight spots like the task-form size line. */
export const SIZE_SHORT: Record<Size, string> = {
  XS: 'Extra small',
  S: 'Small',
  M: 'Medium',
  L: 'Large',
  XL: 'Extra large',
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

/**
 * Heat colour for a per-unit effort, reusing the size heat scale (cool → hot).
 * Bands are ABSOLUTE durations, not relative to the other rates, so a bar keeps
 * its colour while a different asset type is being edited. Display only.
 */
export function effortHeatColor(hours: number): string {
  if (hours < 0.25) return SIZE_COLORS.XS // under 15 minutes
  if (hours < 1) return SIZE_COLORS.S // under an hour
  if (hours < HOURS_PER_WORKING_DAY) return SIZE_COLORS.M // under a day
  if (hours < HOURS_PER_WORKING_DAY * 3) return SIZE_COLORS.L // under three days
  return SIZE_COLORS.XL
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
