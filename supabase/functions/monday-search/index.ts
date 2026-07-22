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
//   NOTE: the mapped column ids are shared across the searched boards.
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
const MAX_SCAN = 500 // items fetched from the board before filtering (paged)

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

  // Tokenize the query. Matching is tiered so a precise query (full name + code)
  // returns the ONE item, while a rough query still surfaces candidates:
  //   1. code match  — if the query has a task code and an item's name/code
  //      contains it, that wins outright (codes are unique).
  //   2. all-tokens  — else items containing EVERY query word.
  //   3. any-token   — else the best partial matches, ranked by overlap.
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  const codeTokens = tokens.filter((t) => /^\d{2}\.\d{2}\d{2}\.[a-z]+$/.test(t) || /^vn\d{2}-\d{4}-[a-z]+$/.test(t))
  const scored: Array<{ matched: number; all: boolean; codeHit: boolean; nameLen: number; item: Record<string, unknown> }> = []
  let scanned = 0

  try {
    // Each board is paged independently (its items_page has its own cursor); we
    // score across ALL boards into one pool, capped globally by MAX_SCAN.
    for (const bid of boards) {
      let cursor: string | null = null
      while (scanned < MAX_SCAN) {
        const res = await fetch(MONDAY_API, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: token,
            'API-Version': '2024-01',
          },
          body: JSON.stringify({
            query: gql,
            variables: { board: [bid], cols: colIds, limit: 100, cursor },
          }),
        })
        const payload = await res.json()
        if (payload.errors?.length) {
          return json({ error: payload.errors[0]?.message ?? 'monday API error.' }, 502)
        }
        const page = payload?.data?.boards?.[0]?.items_page
        const items: any[] = page?.items ?? []
        for (const it of items) {
          scanned++
          const cvById = new Map<string, any>((it.column_values ?? []).map((c: any) => [c.id, c]))
          const code = colCode ? (cvById.get(colCode)?.text ?? '').trim() : ''
          const name = String(it.name ?? '')
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
              id: it.id,
              name,
              code,
              startDate,
              endDate,
              size: (cvById.get(colSize ?? '')?.text ?? '').trim() || null,
              mondayPeopleIds,
            },
          })
        }
        cursor = page?.cursor ?? null
        if (!cursor || items.length === 0) break
      }
      if (scanned >= MAX_SCAN) break
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Lookup failed.' }, 502)
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
//      MONDAY_COL_TIMELINE=... MONDAY_COL_SIZE=... MONDAY_COL_CODE=...
// 2) supabase functions deploy monday-search
//    (Default JWT verification is fine — supabase-js `functions.invoke` sends the
//     anon key, which is a valid JWT, so no --no-verify-jwt needed.)
// 3) In the app build, set VITE_MONDAY_LOOKUP=1 so the button appears.
