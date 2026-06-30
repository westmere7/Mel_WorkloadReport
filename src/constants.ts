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

export const DEFAULT_SETTINGS: AppSettings = {
  campaigns: DEFAULT_CAMPAIGNS,
  types: DEFAULT_TYPES,
  people: DEFAULT_PEOPLE,
}

/** Asset breakdown fields, in display order. */
export const ASSET_FIELDS: { key: keyof import('./types').AssetBreakdown; label: string }[] = [
  { key: 'image', label: 'Image' },
  { key: 'video', label: 'Video' },
  { key: 'publication', label: 'Publication' },
  { key: 'html5', label: 'HTML5 ad' },
  { key: 'gif', label: 'GIF / Motion' },
]

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

/** Brand-aligned chart palette (red, navy + complementary accents). */
export const CHART_COLORS = [
  '#E61E2A', // rmit red
  '#000054', // rmit navy
  '#F58220', // orange
  '#00A9CE', // teal
  '#FFB81C', // gold
  '#5BBA47', // green
  '#8E5BA6', // plum
  '#4d4d8f', // navy-300
  '#f1757f', // brand-300
]
