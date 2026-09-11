import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

// Compile only the portable handler; do not start Deno or contact live services.
const source = await readFile(new URL('../supabase/functions/monday-workload/handler.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } })
const { createHandler } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`)
const taskId = '11111111-1111-4111-8111-111111111111'
const updatedAt = '2026-09-11T00:00:00.000Z'

function fixture(options = {}) {
  let currentLabel = options.currentLabel ?? 'Not entered'
  const writes = []
  const calls = []
  const saved = { id: taskId, monday_url: 'https://rmit.monday.com/boards/42/pulses/123', draft: false, updated_at: updatedAt, ...options.task }
  let reads = 0
  const vars = {
    SUPABASE_URL: 'https://mock.supabase.co', SUPABASE_ANON_KEY: 'mock-anon', MONDAY_TOKEN: 'server-only',
    MONDAY_WORKLOAD_CONFIG: JSON.stringify({ 42: { columnId: 'workload', label: 'Entered' } }),
    ...options.env,
  }
  const handler = createHandler({
    env: (key) => vars[key],
    fetch: async (url, init) => {
      calls.push(String(url))
      if (String(url).startsWith(vars.SUPABASE_URL)) {
        reads++
        return Response.json(options.deleted ? [] : [{ ...saved, ...(reads > 1 ? options.changedTask : {}) }])
      }
      assert.equal(String(url), 'https://api.monday.com/v2')
      assert.equal(init.headers.Authorization, 'server-only')
      const { query, variables } = JSON.parse(init.body)
      if (query.includes('mutation')) {
        writes.push(variables)
        if (options.apiError) return Response.json({ errors: [{ message: 'Secret upstream details' }] })
        if (!options.noChange) currentLabel = Object.values(JSON.parse(variables.values))[0].label
        return Response.json({ data: { change_multiple_column_values: { id: '123' } } })
      }
      if (query.includes('WorkloadColumn')) return Response.json({ data: { boards: [{ columns: [{ id: options.columnId ?? 'workload', title: 'Dashboard input' }] }] } })
      return Response.json({ data: { items: [{ id: '123', board: { id: options.boardId ?? '42' }, column_values: [
        { id: options.columnId ?? 'workload', type: options.columnType ?? 'status', text: currentLabel },
      ] }] } })
    },
  })
  return {
    writes, calls,
    invoke: async (action = 'confirm', extra = {}, headers = { Authorization: 'Bearer mock-app-key' }) => {
      const response = await handler(new Request('https://mock.supabase.co/functions/v1/monday-workload', {
        method: 'POST', headers, body: JSON.stringify({ action, taskId, updatedAt, ...extra }),
      }))
      return { status: response.status, body: await response.json() }
    },
  }
}

test('missing token never calls the database or monday', async () => {
  const f = fixture({ env: { MONDAY_TOKEN: undefined } })
  assert.deepEqual((await f.invoke()).body, { configured: false })
  assert.equal(f.calls.length, 0)
})

test('read-only status does not mutate', async () => {
  const f = fixture()
  assert.equal((await f.invoke('status')).body.entered, false)
  assert.equal(f.writes.length, 0)
})

test('confirmation writes only the configured field and verifies the result', async () => {
  const f = fixture()
  const result = await f.invoke('confirm', { columnId: 'other', label: 'Complete', boardId: '999', itemId: '999' })
  assert.equal(result.body.entered, true)
  assert.deepEqual(f.writes, [{ board: '42', item: '123', values: '{"workload":{"label":"Entered"}}' }])
})

test('already entered is idempotent', async () => {
  const f = fixture({ currentLabel: 'Entered' })
  assert.equal((await f.invoke()).body.entered, true)
  assert.equal(f.writes.length, 0)
})

for (const [name, options] of [
  ['draft', { task: { draft: true } }],
  ['stale task', { task: { updated_at: '2026-09-12T00:00:00Z' } }],
  ['edit during status lookup', { changedTask: { updated_at: '2026-09-12T00:00:00Z' } }],
  ['deleted task', { deleted: true }],
  ['moved item', { boardId: '99' }],
  ['non-status column', { columnType: 'text' }],
  ['invalid link', { task: { monday_url: 'https://monday.com.evil.example/pulses/123' } }],
]) {
  test(`${name} is rejected without writing`, async () => {
    const f = fixture(options)
    assert.ok((await f.invoke()).status >= 400)
    assert.equal(f.writes.length, 0)
  })
}

test('unmapped board stays unconfigured', async () => {
  const f = fixture({ task: { monday_url: 'https://rmit.monday.com/pulses/123' }, boardId: '99' })
  assert.deepEqual((await f.invoke()).body, { configured: false })
  assert.equal(f.writes.length, 0)
})

test('legacy item-only URL resolves its real board', async () => {
  const f = fixture({ task: { monday_url: 'https://rmit.monday.com/pulses/123' } })
  assert.equal((await f.invoke()).body.entered, true)
})

for (const [name, options] of [['GraphQL error', { apiError: true }], ['silent no-op', { noChange: true }]]) {
  test(`${name} never reports success`, async () => {
    const f = fixture(options)
    const result = await f.invoke()
    assert.equal(result.status, 502)
    assert.equal(result.body.entered, undefined)
    assert.ok(!JSON.stringify(result).includes('Secret upstream'))
  })
}

test('missing gateway credential rejects configured calls', async () => {
  const f = fixture()
  assert.equal((await f.invoke('confirm', {}, {})).status, 401)
  assert.equal(f.calls.length, 0)
})

test('invalid task ID cannot reach upstream services', async () => {
  const f = fixture()
  assert.equal((await f.invoke('confirm', { taskId: '123' })).status, 400)
  assert.equal(f.calls.length, 0)
})

test('confirmed demand tracker mapping changes Report Assets from TBC to Entered', async () => {
  const f = fixture({
    env: { MONDAY_WORKLOAD_CONFIG: undefined }, boardId: '1967557512',
    columnId: 'color_mm72eqm4', currentLabel: 'TBC',
    task: { monday_url: 'https://rmit.monday.com/boards/1967557512/pulses/123' },
  })
  assert.equal((await f.invoke()).body.entered, true)
  assert.deepEqual(f.writes, [{
    board: '1967557512', item: '123', values: '{"color_mm72eqm4":{"label":"Entered"}}',
  }])
})

test('Media NA is preserved by status checks and is not reported as entered', async () => {
  const f = fixture({
    env: { MONDAY_WORKLOAD_CONFIG: undefined }, boardId: '1967557512',
    columnId: 'color_mm72eqm4', currentLabel: 'Media NA',
    task: { monday_url: 'https://rmit.monday.com/boards/1967557512/pulses/123' },
  })
  const result = await f.invoke('status')
  assert.equal(result.body.entered, false)
  assert.equal(result.body.currentLabel, 'Media NA')
  assert.equal(f.writes.length, 0)
})

test('the archived board is not enabled by the default mapping', async () => {
  const f = fixture({
    env: { MONDAY_WORKLOAD_CONFIG: undefined }, boardId: '5026397227',
    task: { monday_url: 'https://rmit.monday.com/boards/5026397227/pulses/123' },
  })
  assert.deepEqual((await f.invoke()).body, { configured: false })
  assert.equal(f.writes.length, 0)
})

test('undo sets only the configured workload column to TBC', async () => {
  const f = fixture({ currentLabel: 'Entered' })
  const result = await f.invoke('unconfirm', { label: 'Media NA', resetLabel: 'Media NA' })
  assert.equal(result.body.entered, false)
  assert.equal(result.body.currentLabel, 'TBC')
  assert.deepEqual(f.writes, [{ board: '42', item: '123', values: '{"workload":{"label":"TBC"}}' }])
})

test('repeated undo is idempotent and can be marked again', async () => {
  const f = fixture({ currentLabel: 'TBC' })
  assert.equal((await f.invoke('unconfirm')).body.currentLabel, 'TBC')
  assert.equal(f.writes.length, 0)
  assert.equal((await f.invoke('confirm')).body.entered, true)
  assert.equal((await f.invoke('unconfirm')).body.currentLabel, 'TBC')
  assert.equal(f.writes.length, 2)
})

test('future boards can configure a different reset label', async () => {
  const f = fixture({ currentLabel: 'Entered', env: {
    MONDAY_WORKLOAD_CONFIG: JSON.stringify({ 42: { columnId: 'workload', label: 'Entered', resetLabel: 'Pending' } }),
  } })
  const result = await f.invoke('unconfirm')
  assert.equal(result.body.currentLabel, 'Pending')
  assert.equal(result.body.resetLabel, 'Pending')
})

for (const [name, options] of [
  ['GraphQL error', { apiError: true }], ['silent no-op', { noChange: true }],
  ['stale task', { task: { updated_at: '2026-09-12T00:00:00Z' } }],
  ['unlinked task', { task: { monday_url: null } }],
]) {
  test(`undo with ${name} never reports success`, async () => {
    const f = fixture({ currentLabel: 'Entered', ...options })
    const result = await f.invoke('unconfirm')
    assert.ok(result.status >= 400)
    assert.equal(result.body.entered, undefined)
    if (options.task) assert.equal(f.writes.length, 0)
  })
}
