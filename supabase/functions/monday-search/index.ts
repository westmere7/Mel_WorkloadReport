// Supabase Edge Function: monday-search
// ─────────────────────────────────────────────────────────────────────────────
// On-demand lookup for the New Task form's monday.com button. Holds the monday
// API token + board config as SECRETS (never shipped to the browser), queries a
// single board, and returns a small normalized result set the client prefills.
//
// This is a Deno function — it is NOT part of the app's `tsc --noEmit` (the app
// is Vite/browser). Deploy separately (see setup notes at the bottom).
//
// Secrets / env (set with `supabase secrets set …`):
//   MONDAY_TOKEN         monday API v2 personal token (required)
//   MONDAY_BOARD_ID      FALLBACK board id(s), comma-separated — used only when the
//                        request omits `boardIds` (the app sends them from Settings).
//   MONDAY_COL_TIMELINE  column id of the Timeline column (required for dates)
//   MONDAY_COL_SIZE      column id of the T-shirt size column (required for size)
//   MONDAY_COL_CODE      column id of the booking-code text column (optional)
//   MONDAY_COL_PEOPLE    column id of the Project-team people column (optional)
//   MONDAY_ALLOW_ORIGIN  CORS allow-origin (optional; default '*')
//   MONDAY_CACHE_TTL     ms to keep each board's items warm in memory between
//                        searches (optional; default 60000, 0 disables).
//   NOTE: the mapped column ids are shared across the searched boards.
//
// Speed: each board is fetched in ONE 500-item page (monday's max) and all boards
// run CONCURRENTLY, with a short warm-instance cache — so repeat searches are near
// instant and the first is a single parallel round-trip per board.
//
// Request  (POST JSON):  { "query": "open day", "boardIds": ["1967557512","5026397227"] }
//   `boardIds` are the boards to search at once (from the app's Settings); if
//   omitted, MONDAY_BOARD_ID is used. All are scanned into one ranked result set.
// Response (JSON):       { "configured": true, "items": [{ id, name, code,
//                          startDate, endDate, size, mondayPeopleIds }] }
//                        or { "configured": false } when the token is missing.

// @ts-nocheck  (Deno runtime globals; not typechecked by the app's tsc.)

const MONDAY_API = 'https://api.monday.com/v2'
const MAX_HITS = 15
// monday's items_page caps `limit` at 500 — fetch a full page at once so each
// board is normally ONE request instead of five 100-item pages.
const PAGE_LIMIT = 500
const MAX_ITEMS_PER_BOARD = 1000 // safety cap per board (≤2 pages); avoids deep paging
// Warm-instance cache: a board's item list is reused across searches for a short
// TTL so repeat lookups skip monday entirely. Persists only while the Edge
// instance stays warm; tune/disable with MONDAY_CACHE_TTL (ms, 0 = off).
const boardCache = new Map<string, { at: number; items: Array<Record<string, unknown>> }>()

function cors(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': Deno.env.get('MONDAY_ALLOW_ORIGIN') ?? '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors() },
  })
}

/** Pull start/end (yyyy-mm-dd) out of a Timeline column value. */
function parseTimeline(value: string | null): { startDate: string | null; endDate: string | null } {
  if (!value) return { startDate: null, endDate: null }
  try {
    const v = JSON.parse(value)
    return { startDate: v.from ?? null, endDate: v.to ?? null }
  } catch {
    return { startDate: null, endDate: null }
  }
}

/** Pull the assigned person monday user-ids (as strings) out of a People column value. */
function parsePeople(value: string | null): string[] {
  if (!value) return []
  try {
    const v = JSON.parse(value)
    return (v.personsAndTeams ?? [])
      .filter((p: { kind?: string }) => p.kind === 'person')
      .map((p: { id: number | string }) => String(p.id))
  } catch {
    return []
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors() })
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  const token = Deno.env.get('MONDAY_TOKEN')
  const boardIdSecret = Deno.env.get('MONDAY_BOARD_ID') // fallback list (comma-separated)
  const colTimeline = Deno.env.get('MONDAY_COL_TIMELINE')
  const colSize = Deno.env.get('MONDAY_COL_SIZE')
  const colCode = Deno.env.get('MONDAY_COL_CODE') // optional
  const colPeople = Deno.env.get('MONDAY_COL_PEOPLE') // optional (Project-team column)
  if (!token) return json({ configured: false })

  let query = ''
  let bodyBoards: string[] = []
  try {
    const body = await req.json()
    query = String(body?.query ?? '').trim()
    // The app (Settings) sends the board ids to search; sanitise to strings.
    if (Array.isArray(body?.boardIds)) {
      bodyBoards = body.boardIds.map((b: unknown) => String(b ?? '').trim()).filter(Boolean)
    }
  } catch {
    return json({ error: 'Bad request body.' }, 400)
  }
  if (!query) return json({ configured: true, items: [] })

  // Boards to search: prefer the app's list; else the MONDAY_BOARD_ID secret
  // (which may itself be a comma-separated list). Deduped, order preserved.
  const secretBoards = (boardIdSecret ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const boards = [...new Set(bodyBoards.length ? bodyBoards : secretBoards)]
  if (boards.length === 0) return json({ configured: false })

  // Only ask monday for the columns we map (keeps the payload small).
  const colIds = [colTimeline, colSize, colCode, colPeople].filter(Boolean) as string[]
  // `state: all` so ARCHIVED (read-only) boards are included — `boards()` defaults
  // to state:active, which silently drops an archived board and all its items.
  const gql = `
    query ($board: [ID!], $cols: [String!], $limit: Int!, $cursor: String) {
      boards(ids: $board, state: all) {
        items_page(limit: $limit, cursor: $cursor) {
          cursor
          items {
            id
            name
            column_values(ids: $cols) { id text value }
          }
        }
      }
    }`

  // How long a board's fetched items stay warm in memory (ms). Repeat searches
  // within the window skip monday entirely. Operator-tunable; 0 disables.
  const cacheTtl = Math.max(0, Number(Deno.env.get('MONDAY_CACHE_TTL') ?? '60000') || 0)

  /** Fetch (and cache) all items for one board — one 500-item page in the common case. */
  async function fetchBoardItems(bid: string): Promise<Array<Record<string, unknown>>> {
    const now = Date.now()
    const cached = boardCache.get(bid)
    if (cacheTtl > 0 && cached && now - cached.at < cacheTtl) return cached.items
    const items: Array<Record<string, unknown>> = []
    let cursor: string | null = null
    do {
      const res = await fetch(MONDAY_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token, 'API-Version': '2024-01' },
        body: JSON.stringify({ query: gql, variables: { board: [bid], cols: colIds, limit: PAGE_LIMIT, cursor } }),
      })
      const payload = await res.json()
      if (payload.errors?.length) throw new Error(payload.errors[0]?.message ?? 'monday API error.')
      const page = payload?.data?.boards?.[0]?.items_page
      const pageItems: any[] = (page?.items ?? []).map((item: any) => ({ ...item, boardId: bid }))
      items.push(...pageItems)
      cursor = pageItems.length ? (page?.cursor ?? null) : null
    } while (cursor && items.length < MAX_ITEMS_PER_BOARD)
    if (cacheTtl > 0) boardCache.set(bid, { at: now, items })
    return items
  }

  // Fetch every board CONCURRENTLY (was sequential) — one slow board no longer
  // blocks the others, and a single board's failure doesn't sink the search.
  const settled = await Promise.allSettled(boards.map((bid) => fetchBoardItems(bid)))
  const allItems = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  const failures = settled.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
  // Only surface an error if EVERY board failed (partial results still help).
  if (allItems.length === 0 && failures.length > 0) {
    const reason = failures[0].reason
    return json({ error: reason instanceof Error ? reason.message : 'Lookup failed.' }, 502)
  }

  // Tokenize the query. Matching is tiered so a precise query (full name + code)
  // returns the ONE item, while a rough query still surfaces candidates:
  //   1. code match  — if the query has a task code and an item's name/code
  //      contains it, that wins outright (codes are unique).
  //   2. all-tokens  — else items containing EVERY query word.
  //   3. any-token   — else the best partial matches, ranked by overlap.
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  const codeTokens = tokens.filter((t) => /^\d{2}\.\d{2}\d{2}\.[a-z]+$/.test(t) || /^vn\d{2}-\d{4}-[a-z]+$/.test(t))
  const scored: Array<{ matched: number; all: boolean; codeHit: boolean; nameLen: number; item: Record<string, unknown> }> = []

  for (const it of allItems) {
    const cvById = new Map<string, any>(((it as any).column_values ?? []).map((c: any) => [c.id, c]))
    const code = colCode ? (cvById.get(colCode)?.text ?? '').trim() : ''
    const name = String((it as any).name ?? '')
    const haystack = `${name} ${code}`.toLowerCase()
    const matched = tokens.reduce((n, t) => n + (haystack.includes(t) ? 1 : 0), 0)
    if (matched === 0) continue
    const codeHit = codeTokens.length > 0 && codeTokens.some((t) => haystack.includes(t))
    const { startDate, endDate } = parseTimeline(cvById.get(colTimeline ?? '')?.value ?? null)
    const mondayPeopleIds = parsePeople(cvById.get(colPeople ?? '')?.value ?? null)
    scored.push({
      matched,
      all: matched === tokens.length,
      codeHit,
      nameLen: name.length,
      item: {
        id: (it as any).id,
        boardId: (it as any).boardId ?? null,
        name,
        code,
        startDate,
        endDate,
        size: (cvById.get(colSize ?? '')?.text ?? '').trim() || null,
        mondayPeopleIds,
        url: (it as any).boardId ? `https://rmit.monday.com/boards/${(it as any).boardId}/pulses/${(it as any).id}` : null,
      },
    })
  }

  // Tier 1: a unique code match; Tier 2: items with every word; Tier 3: best partials.
  let pool = scored.filter((s) => s.codeHit)
  if (pool.length === 0) pool = scored.filter((s) => s.all)
  if (pool.length === 0) pool = scored
  pool.sort((a, b) => b.matched - a.matched || a.nameLen - b.nameLen)
  const items = pool.slice(0, MAX_HITS).map((s) => s.item)
  return json({ configured: true, items })
})

// ── Setup / deploy ───────────────────────────────────────────────────────────
// 1) supabase secrets set MONDAY_TOKEN=... MONDAY_BOARD_ID=... \
//      MONDAY_COL_TIMELINE=... MONDAY_COL_SIZE=... MONDAY_COL_CODE=... \
//      [MONDAY_CACHE_TTL=60000]
// 2) supabase functions deploy monday-search   ← REDEPLOY after this speed change
//    (Default JWT verification is fine — supabase-js `functions.invoke` sends the
//     anon key, which is a valid JWT, so no --no-verify-jwt needed.)
// 3) In the app build, set VITE_MONDAY_LOOKUP=1 so the button appears.
