type Dependencies = {
  env: (name: string) => string | undefined
  fetch: typeof fetch
}
type Mapping = { columnId: string; label: string; resetLabel?: string }
// GCMC & Media Demand Tracker (board ID recorded in KNOWLEDGEBASE.md).
// Report Assets is separate from Project Status; only this column is written.
const DEFAULT_WORKLOAD_CONFIG: Record<string, Mapping> = {
  '1967557512': { columnId: 'color_mm72eqm4', label: 'Entered', resetLabel: 'TBC' },
}
type SavedTask = { id: string; monday_url: string | null; draft: boolean; updated_at: string }
type MondayItem = { id: string; board: { id: string }; column_values: { id: string; text: string | null; type: string }[] }

class RequestError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

/** No client-supplied boards, columns, labels or API credentials are accepted. */
export function createHandler({ env, fetch: fetcher }: Dependencies) {
  return async (req: Request): Promise<Response> => {
    const origin = env('MONDAY_ALLOW_ORIGIN') ?? '*'
    const headers = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    }
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers })
    if (req.method === 'OPTIONS') return new Response(null, { headers })
    if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)

    try {
      const body = await req.json().catch(() => { throw new RequestError('Invalid request.') })
      if (!body || !['status', 'confirm', 'unconfirm'].includes(body.action) || typeof body.taskId !== 'string'
        || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(body.taskId)) {
        throw new RequestError('Choose a saved Dashboard task.')
      }
      const token = env('MONDAY_TOKEN')
      const rawMapping = env('MONDAY_WORKLOAD_CONFIG') ?? JSON.stringify(DEFAULT_WORKLOAD_CONFIG)
      if (!token) return json({ configured: false })
      let mappings: Record<string, Mapping>
      try {
        mappings = JSON.parse(rawMapping)
        if (!mappings || Array.isArray(mappings) || typeof mappings !== 'object') throw new Error()
        for (const [board, mapping] of Object.entries(mappings)) {
          if (!/^\d+$/.test(board) || !mapping || typeof mapping.columnId !== 'string'
            || !mapping.columnId.trim() || typeof mapping.label !== 'string' || !mapping.label.trim()) throw new Error()
          if (mapping.resetLabel !== undefined && (typeof mapping.resetLabel !== 'string' || !mapping.resetLabel.trim())) throw new Error()
          if ((mapping.resetLabel ?? 'TBC') === mapping.label) throw new Error()
        }
      } catch { throw new RequestError('The monday.com workload column setup needs attention.', 503) }

      const supabaseUrl = env('SUPABASE_URL')
      const anonKey = env('SUPABASE_ANON_KEY')
      const authorization = req.headers.get('Authorization')
      if (!authorization) throw new RequestError('The Dashboard connection is missing. Reload and try again.', 401)
      if (!supabaseUrl || !anonKey) throw new RequestError('The Dashboard connection is not configured.', 503)
      const readTask = async (): Promise<SavedTask> => {
        const url = new URL('/rest/v1/tasks', supabaseUrl)
        url.searchParams.set('id', `eq.${body.taskId}`)
        url.searchParams.set('select', 'id,monday_url,draft,updated_at')
        const response = await fetcher(url, {
          headers: { apikey: anonKey, Authorization: authorization }, signal: AbortSignal.timeout(15000),
        })
        if (!response.ok) throw new RequestError('Couldn’t load the saved task. Reload and try again.', 502)
        const rows = await response.json() as SavedTask[]
        if (rows.length !== 1) throw new RequestError('This task is no longer available.', 404)
        return rows[0]
      }
      const task = await readTask()
      let link: URL
      try { link = new URL(task.monday_url ?? '') } catch { throw new RequestError('Link this task to monday.com first.') }
      if (link.protocol !== 'https:' || !link.hostname.endsWith('.monday.com')) throw new RequestError('The monday.com task link is invalid.')
      const match = link.pathname.match(/^\/(?:boards\/(\d+)\/)?pulses\/(\d+)\/?$/)
      if (!match) throw new RequestError('The monday.com task link is invalid.')
      const [, linkedBoard, itemId] = match

      async function monday<T>(query: string, variables: Record<string, unknown>): Promise<T> {
        const response = await fetcher('https://api.monday.com/v2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: token!, 'API-Version': '2026-07' },
          body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(20000),
        })
        const result = await response.json()
        if (!response.ok || result.errors?.length || !result.data) {
          // Keep upstream diagnostics/credentials out of the public response.
          throw new RequestError('monday.com couldn’t complete the request. Check board access and column setup, then retry.', 502)
        }
        return result.data as T
      }
      const readItem = async () => {
        const data = await monday<{ items: MondayItem[] }>(
          'query WorkloadItem($ids: [ID!]!) { items(ids: $ids) { id board { id } column_values { id text type } } }',
          { ids: [itemId] },
        )
        const item = data.items?.find((item) => String(item.id) === itemId)
        if (!item) throw new RequestError('The linked monday.com item is unavailable.', 404)
        return item
      }
      const item = await readItem()
      const boardId = String(item.board.id)
      if (linkedBoard && linkedBoard !== boardId) throw new RequestError('The linked item has moved boards. Update its Dashboard link first.')
      const mapping = mappings[boardId]
      if (!mapping) return json({ configured: false })
      const resetLabel = mapping.resetLabel ?? 'TBC'
      const column = item.column_values.find((column) => column.id === mapping.columnId)
      if (!column || column.type !== 'status') throw new RequestError('The configured workload column must be a monday.com Status column.', 409)
      const boardData = await monday<{ boards: { columns: { id: string; title: string }[] }[] }>(
        'query WorkloadColumn($boards: [ID!]!, $columns: [String!]!) { boards(ids: $boards) { columns(ids: $columns) { id title } } }',
        { boards: [boardId], columns: [mapping.columnId] },
      )
      const columnTitle = boardData.boards?.[0]?.columns?.find((c) => c.id === mapping.columnId)?.title
      if (!columnTitle) throw new RequestError('The workload column is unavailable.', 409)
      let currentLabel = column.text ?? ''
      if (body.action === 'confirm' || body.action === 'unconfirm') {
        const desiredLabel = body.action === 'unconfirm' ? resetLabel : mapping.label
        const ensureSaved = (saved: SavedTask) => {
          if (saved.draft) throw new RequestError('Complete and save this draft first.', 409)
          if (typeof body.updatedAt !== 'string' || !Number.isFinite(Date.parse(body.updatedAt))
            || Date.parse(saved.updated_at) !== Date.parse(body.updatedAt) || saved.monday_url !== task.monday_url) {
            throw new RequestError('This task has changed. Reopen it and review the saved workload first.', 409)
          }
        }
        ensureSaved(task)
        if (currentLabel !== desiredLabel) {
          // Recheck immediately before the external write; never mark unsaved/deleted/draft tasks.
          ensureSaved(await readTask())
          const result = await monday<{ change_multiple_column_values: { id: string } | null }>(
            `mutation MarkWorkload($board: ID!, $item: ID!, $values: JSON!) {
              change_multiple_column_values(board_id: $board, item_id: $item, column_values: $values,
                create_labels_if_missing: false) { id }
            }`,
            { board: boardId, item: itemId, values: JSON.stringify({ [mapping.columnId]: { label: desiredLabel } }) },
          )
          if (String(result.change_multiple_column_values?.id) !== itemId) {
            throw new RequestError('monday.com didn’t confirm the update. Retry the status check.', 502)
          }
          const verified = await readItem()
          currentLabel = verified.column_values.find((c) => c.id === mapping.columnId)?.text ?? ''
          if (String(verified.board.id) !== boardId || currentLabel !== desiredLabel) {
            throw new RequestError('The monday.com status didn’t change. Check the column and retry.', 502)
          }
        }
      }
      return json({ configured: true, entered: currentLabel === mapping.label, columnTitle, targetLabel: mapping.label, resetLabel, currentLabel })
    } catch (error) {
      return json({ error: error instanceof RequestError ? error.message : 'Couldn’t verify the monday.com update. Retry the status check.' },
        error instanceof RequestError ? error.status : 502)
    }
  }
}
