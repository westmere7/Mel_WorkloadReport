import type { Squad, Size, AppSettings } from './types'

/** Fixed list of squads (stakeholders). This list does NOT change. */
export const SQUADS: Squad[] = [
  'INTON',
  'DOM',
  'Student Recruitment',
  'BPX',
  'RMIT VN',
  'Alumni',
  'Agent Management',
  'Others',
]

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

/**
 * Reserved catch-all present in every editable list (campaigns/types/people/asset
 * types). It can't be edited or removed; deleting a list item that tasks still use
 * reassigns those tasks to this value so nothing is orphaned.
 */
export const FALLBACK_ITEM = 'Others'

/** Append the reserved "Others" fallback to an editable list (deduped, always last). */
export function withFallback(items: string[]): string[] {
  return [...items.filter((v) => v !== FALLBACK_ITEM), FALLBACK_ITEM]
}

export const DEFAULT_SETTINGS: AppSettings = {
  campaigns: DEFAULT_CAMPAIGNS,
  types: DEFAULT_TYPES,
  people: DEFAULT_PEOPLE,
  assetTypes: DEFAULT_ASSET_TYPES,
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

/** Turnaround per size, from the GCMC T-shirt sizing guide (upper bound), in days. */
export const SIZE_DURATION_DAYS: Record<Size, number> = {
  XS: 7, // 1 week
  S: 28, // 2–4 weeks
  M: 42, // 6 weeks
  L: 56, // 8 weeks
  XL: 182, // 3–6 months
}

/** Human-readable turnaround per size (matches the sizing guide). */
export const SIZE_DURATION_LABEL: Record<Size, string> = {
  XS: '1 week',
  S: '2–4 weeks',
  M: '6 weeks',
  L: '8 weeks',
  XL: '3–6 months',
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
