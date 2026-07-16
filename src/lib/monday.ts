import { getSupabase, isSupabaseConfigured } from './supabaseClient'
import { parseTaskCode } from './taskCode'
import { SIZES } from '../constants'
import type { Size } from '../types'

/**
 * monday.com lookup — an on-demand prefill for the New Task form. NOT a sync.
 *
 * The browser never talks to monday directly (the API token would be exposed and
 * monday blocks cross-origin browser calls). Instead we call a Supabase Edge
 * Function (`monday-search`) that holds the token + board config as secrets and
 * returns a normalized, trimmed result set. See supabase/functions/monday-search.
 */

/** One board item, normalized to exactly the fields we prefill. */
export interface MondayHit {
  /** monday item id (stable) — used as the React key; not stored on the task. */
  id: string
  name: string
  /** Booking code if the board has one for this item; else '' (many won't). */
  code: string
  /** ISO yyyy-mm-dd from the Timeline column's start, or null. */
  startDate: string | null
  /** ISO yyyy-mm-dd from the Timeline column's end, or null. */
  endDate: string | null
  /** T-shirt size mapped to the app's enum (XS–XL), or null when unmapped. */
  size: Size | null
}

interface SearchResponse {
  configured?: boolean
  items?: Array<{
    id: string
    name: string
    code?: string | null
    startDate?: string | null
    endDate?: string | null
    size?: string | null
  }>
  error?: string
}

/**
 * Show the lookup button only when it can actually work: Supabase is the backend
 * (Edge Functions live there) AND the integration is switched on for this build
 * via `VITE_MONDAY_LOOKUP=1`. Keeps the button out of the way otherwise.
 */
export function isMondayLookupEnabled(): boolean {
  return isSupabaseConfigured() && import.meta.env.VITE_MONDAY_LOOKUP === '1'
}

/** Coerce a monday size label (e.g. "L", "Medium") to the app's Size enum. */
function normalizeSize(raw: string | null | undefined): Size | null {
  if (!raw) return null
  const s = raw.trim().toUpperCase()
  if ((SIZES as readonly string[]).includes(s)) return s as Size
  // Tolerate long-form labels.
  const map: Record<string, Size> = {
    'EXTRA SMALL': 'XS',
    SMALL: 'S',
    MEDIUM: 'M',
    LARGE: 'L',
    'EXTRA LARGE': 'XL',
  }
  return map[s] ?? null
}

/**
 * monday item names carry the booking code inline — "[26.0716.A] VTAC Social
 * vids…" — so there's no separate code column. Pull the bracketed code out and
 * return the cleaned name; fall back to an explicit code-column value if the
 * board ever has one.
 */
function splitCodeFromName(rawName: string, colCode?: string | null): { code: string; name: string } {
  const m = rawName.match(/^\s*\[([^\]]+)\]\s*(.*)$/)
  // Only lift the bracket into the code field when it's a REAL task code
  // ("[26.0716.A]"); leave tag-style prefixes like "[Dom H2]" in the name.
  if (m && parseTaskCode(m[1].trim()).valid) {
    return { code: m[1].trim(), name: m[2].trim() }
  }
  return { code: (colCode ?? '').trim(), name: rawName.trim() }
}

/** Raised when the function reports monday isn't set up yet — the popover shows it. */
export class MondayNotConfiguredError extends Error {
  constructor() {
    super('monday.com lookup isn’t set up yet — set the MONDAY_* secrets on the monday-search function.')
    this.name = 'MondayNotConfiguredError'
  }
}

/**
 * Search the configured monday board for items matching `query` (name or code
 * substring). Returns up to ~15 normalized hits. Throws a readable Error on
 * transport/config failure so the popover can surface it.
 */
export async function searchMonday(query: string): Promise<MondayHit[]> {
  const q = query.trim()
  if (!q) return []
  if (!isSupabaseConfigured()) throw new MondayNotConfiguredError()

  const { data, error } = await getSupabase().functions.invoke<SearchResponse>('monday-search', {
    body: { query: q },
  })
  if (error) throw new Error(error.message || 'Couldn’t reach the monday lookup service.')
  if (!data || data.configured === false) throw new MondayNotConfiguredError()
  if (data.error) throw new Error(data.error)

  return (data.items ?? []).map((it) => {
    const { code, name } = splitCodeFromName(it.name ?? '', it.code)
    return {
      id: String(it.id),
      name,
      code,
      startDate: it.startDate || null,
      endDate: it.endDate || null,
      size: normalizeSize(it.size),
    }
  })
}
