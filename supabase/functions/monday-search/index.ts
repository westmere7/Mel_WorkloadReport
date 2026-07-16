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
//   MONDAY_BOARD_ID      numeric board id to search (required)
//   MONDAY_COL_TIMELINE  column id of the Timeline column (required for dates)
//   MONDAY_COL_SIZE      column id of the T-shirt size column (required for size)
//   MONDAY_COL_CODE      column id of the booking-code text column (optional)
//   MONDAY_ALLOW_ORIGIN  CORS allow-origin (optional; default '*')
//
// Request  (POST JSON):  { "query": "open day" }
// Response (JSON):       { "configured": true, "items": [{ id, name, code,
//                          startDate, endDate, size }] }
//                        or { "configured": false } when secrets are missing.

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors() })
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  const token = Deno.env.get('MONDAY_TOKEN')
  const boardId = Deno.env.get('MONDAY_BOARD_ID')
  const colTimeline = Deno.env.get('MONDAY_COL_TIMELINE')
  const colSize = Deno.env.get('MONDAY_COL_SIZE')
  const colCode = Deno.env.get('MONDAY_COL_CODE') // optional
  if (!token || !boardId) return json({ configured: false })

  let query = ''
  try {
    query = String((await req.json())?.query ?? '').trim()
  } catch {
    return json({ error: 'Bad request body.' }, 400)
  }
  if (!query) return json({ configured: true, items: [] })

  // Only ask monday for the columns we map (keeps the payload small).
  const colIds = [colTimeline, colSize, colCode].filter(Boolean) as string[]
  const gql = `
    query ($board: [ID!], $cols: [String!], $limit: Int!, $cursor: String) {
      boards(ids: $board) {
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

  const needle = query.toLowerCase()
  const hits: Array<Record<string, unknown>> = []
  let cursor: string | null = null
  let scanned = 0

  try {
    // Page through the board, filtering by name/code substring, until we have
    // enough hits or we've scanned the cap.
    while (scanned < MAX_SCAN && hits.length < MAX_HITS) {
      const res = await fetch(MONDAY_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token,
          'API-Version': '2024-01',
        },
        body: JSON.stringify({
          query: gql,
          variables: { board: [boardId], cols: colIds, limit: 100, cursor },
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
        const nameMatch = String(it.name ?? '').toLowerCase().includes(needle)
        const codeMatch = code.toLowerCase().includes(needle)
        if (!nameMatch && !codeMatch) continue
        const { startDate, endDate } = parseTimeline(cvById.get(colTimeline ?? '')?.value ?? null)
        hits.push({
          id: it.id,
          name: it.name,
          code,
          startDate,
          endDate,
          size: (cvById.get(colSize ?? '')?.text ?? '').trim() || null,
        })
        if (hits.length >= MAX_HITS) break
      }
      cursor = page?.cursor ?? null
      if (!cursor || items.length === 0) break
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Lookup failed.' }, 502)
  }

  return json({ configured: true, items: hits })
})

// ── Setup / deploy ───────────────────────────────────────────────────────────
// 1) supabase secrets set MONDAY_TOKEN=... MONDAY_BOARD_ID=... \
//      MONDAY_COL_TIMELINE=... MONDAY_COL_SIZE=... MONDAY_COL_CODE=...
// 2) supabase functions deploy monday-search
//    (Default JWT verification is fine — supabase-js `functions.invoke` sends the
//     anon key, which is a valid JWT, so no --no-verify-jwt needed.)
// 3) In the app build, set VITE_MONDAY_LOOKUP=1 so the button appears.
