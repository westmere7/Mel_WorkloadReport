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
  boardId?: string | null
  name: string
  /** Booking code if the board has one for this item; else '' (many won't). */
  code: string
  /** ISO yyyy-mm-dd from the Timeline column's start, or null. */
  startDate: string | null
  /** ISO yyyy-mm-dd from the Timeline column's end, or null. */
  endDate: string | null
  /** T-shirt size mapped to the app's enum (XS–XL), or null when unmapped. */
  size: Size | null
  /** monday user-ids assigned on the Project-team column (mapped to people via settings). */
  mondayPeopleIds: string[]
  /** Direct URL to the item on monday.com */
  url?: string
}

interface SearchResponse {
  configured?: boolean
  items?: Array<{
    id: string
    boardId?: string | null
    name: string
    code?: string | null
    startDate?: string | null
    endDate?: string | null
    size?: string | null
    mondayPeopleIds?: string[] | null
    url?: string | null
  }>
  error?: string
}

/** monday item id from an item link (…/boards/<board>/pulses/<item>), or null. */
export function mondayItemIdFromUrl(url: string | null | undefined): string | null {
  const m = url?.trim().match(/\/pulses\/(\d+)\/?(?:[?#].*)?$/)
  return m ? m[1] : null
}

/** A task's "Assets" tab page: by its monday item when linked, else by task id. */
export function assetsTabUrl(mondayUrl: string | null | undefined, taskId?: string | null): string | null {
  const id = mondayItemIdFromUrl(mondayUrl)
  if (id) return `/embed/item?itemId=${id}`
  return taskId ? `/embed/item?task=${encodeURIComponent(taskId)}` : null
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
 * Search the configured monday board(s) for items matching `query` (name or code
 * substring). `boardIds` (from Settings) tells the function which boards to scan
 * at once; omit to let the function fall back to its `MONDAY_BOARD_ID` secret.
 * Returns up to ~15 normalized hits. Throws a readable Error on transport/config
 * failure so the popover can surface it.
 */
export async function searchMonday(query: string, boardIds?: string[]): Promise<MondayHit[]> {
  const q = query.trim()
  if (!q) return []
  if (!isSupabaseConfigured()) throw new MondayNotConfiguredError()

  const { data, error } = await getSupabase().functions.invoke<SearchResponse>('monday-search', {
    body: { query: q, boardIds: boardIds?.filter(Boolean) },
  })
  if (error) throw new Error(error.message || 'Couldn’t reach the monday lookup service.')
  if (!data || data.configured === false) throw new MondayNotConfiguredError()
  if (data.error) throw new Error(data.error)

  const activeBoardIds = boardIds?.filter(Boolean) ?? []

  const parsedHits = (data.items ?? []).map((it) => {
    const { code, name } = splitCodeFromName(it.name ?? '', it.code)
    const idStr = String(it.id)
    const bid = it.boardId || (activeBoardIds.length > 0 ? activeBoardIds[0] : null)
    const url = it.url || (bid ? `https://rmit.monday.com/boards/${bid}/pulses/${idStr}` : `https://rmit.monday.com/pulses/${idStr}`)
    return {
      id: idStr,
      boardId: bid,
      name,
      code,
      startDate: it.startDate || null,
      endDate: it.endDate || null,
      size: normalizeSize(it.size),
      mondayPeopleIds: (it.mondayPeopleIds ?? []).map(String),
      url,
    }
  })

  // Strict relevance filter: discard hits that do not contain any of the query words/code
  const queryLower = q.toLowerCase()
  const queryWords = queryLower
    .replace(/[^\w\s.-]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !['the', 'be', 'in', 'is', 'a', 'an', 'and', 'or', 'to', 'for', 'of', 'on', 'it', 'not'].includes(w))

  if (queryWords.length === 0) {
    return parsedHits.filter((hit) => {
      const fullText = `${hit.code} ${hit.name}`.toLowerCase()
      return fullText.includes(queryLower)
    })
  }

  return parsedHits.filter((hit) => {
    const fullText = `${hit.code} ${hit.name}`.toLowerCase()
    return queryWords.some((word) => fullText.includes(word))
  })
}

/**
 * Resolve monday user-ids to the app's people names via the settings map
 * (name → monday id). Only returns names still present in `people`.
 */
export function resolvePeopleFromMonday(
  mondayIds: string[],
  peopleMondayIds: Record<string, string>,
  people: string[],
): string[] {
  const idToName = new Map<string, string>()
  for (const [name, id] of Object.entries(peopleMondayIds)) {
    if (id) idToName.set(String(id), name)
  }
  const known = new Set(people)
  const out: string[] = []
  for (const id of mondayIds) {
    const name = idToName.get(String(id))
    if (name && known.has(name) && !out.includes(name)) out.push(name)
  }
  return out
}

// ── monday user profiles (Assets tab avatars) ─────────────────────────────────

export interface MondayProfile {
  name: string
  /** monday's small thumbnail URL, or null when the user has no photo. */
  photo: string | null
}

const PROFILE_CACHE_KEY = 'mwr.mondayProfiles'
const PROFILE_TTL_MS = 24 * 60 * 60 * 1000
/** When the deployed function predates profiles mode, don't ask again for an hour. */
const PROFILE_UNSUPPORTED_KEY = 'mwr.mondayProfiles.unsupportedAt'
const PROFILE_RETRY_MS = 60 * 60 * 1000

/**
 * Names + photos for monday user ids, via the `monday-search` Edge Function's
 * profiles mode (the token stays server-side). Cached in this browser for a day.
 * Resolves to null when unavailable — lookup not enabled, the function predates
 * profiles mode, or any error — so callers simply keep their initials fallback.
 */
export async function fetchMondayProfiles(ids: string[]): Promise<Record<string, MondayProfile> | null> {
  const wanted = [...new Set(ids.filter((id) => /^\d+$/.test(id)))].sort()
  if (!wanted.length || !isMondayLookupEnabled()) return null
  try {
    const at = Number(localStorage.getItem(PROFILE_UNSUPPORTED_KEY) ?? 0)
    if (at && Date.now() - at < PROFILE_RETRY_MS) return null
  } catch {
    /* ignore */
  }
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY)
    const cached = raw ? (JSON.parse(raw) as { at: number; profiles: Record<string, MondayProfile> }) : null
    if (cached && Date.now() - cached.at < PROFILE_TTL_MS && wanted.every((id) => id in cached.profiles)) {
      return cached.profiles
    }
  } catch {
    /* unreadable cache — fetch fresh */
  }
  try {
    const { data, error } = await getSupabase().functions.invoke<{
      configured?: boolean
      users?: { id: string; name: string; photo: string | null }[]
    }>('monday-search', { body: { users: wanted } })
    if (error || !data) return null
    if (!Array.isArray(data.users)) {
      // Function not redeployed with profiles mode yet — back off for a while.
      try {
        localStorage.setItem(PROFILE_UNSUPPORTED_KEY, String(Date.now()))
      } catch {
        /* ignore */
      }
      return null
    }
    const profiles: Record<string, MondayProfile> = {}
    for (const u of data.users) profiles[String(u.id)] = { name: u.name, photo: u.photo ?? null }
    // Remember asked-for ids monday doesn't know too, so they don't trigger refetches.
    for (const id of wanted) profiles[id] ??= { name: '', photo: null }
    try {
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ at: Date.now(), profiles }))
    } catch {
      /* storage blocked — fine, we just fetch again next time */
    }
    return profiles
  } catch {
    return null
  }
}
