import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium } from 'playwright'

// Isolated component fixture: fake connection, mocked HTTP, no live app data.
const root = fileURLToPath(new URL('../', import.meta.url))
process.env.VITE_SUPABASE_URL = 'https://workload-ui.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY = 'mock-key'
process.env.VITE_MONDAY_WORKLOAD = '1'
const fixture = await mkdtemp(path.join(root, '.monday-ui-check-'))
let server
let browser
try {
  await writeFile(path.join(fixture, 'index.html'), '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="./main.tsx"></script></body></html>')
  await writeFile(path.join(fixture, 'main.tsx'), `
    import React from 'react'
    import { createRoot } from 'react-dom/client'
    import { AuthProvider } from '/src/lib/auth'
    import { MondayWorkloadButton } from '/src/components/MondayWorkloadButton'
    import '/src/index.css'
    const mode = new URLSearchParams(location.search).get('mode')
    const task = { id: '11111111-1111-4111-8111-111111111111', updatedAt: '2026-09-11T00:00:00Z',
      mondayUrl: mode === 'unlinked' ? undefined : mode === 'blank-link' ? '   '
        : 'https://rmit.monday.com/boards/42/pulses/123', draft: mode === 'draft' }
    createRoot(document.getElementById('root')!).render(<AuthProvider>
      <main className="mx-auto max-w-3xl p-4"><h1 className="mb-4 text-xl font-bold">Task workload confirmation</h1>
      <MondayWorkloadButton task={mode === 'new' ? undefined : task}
        blockedReason={mode === 'dirty' ? 'Save your changes, then reopen this task to confirm workload entry.' : undefined} />
      </main></AuthProvider>)
  `)
  server = await createServer({ root, server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' })
  await server.listen()
  const address = server.httpServer.address()
  const url = `http://127.0.0.1:${address.port}/${path.basename(fixture)}/index.html`
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 900, height: 400 } })
  await page.addInitScript(() => localStorage.setItem('mwr.session', JSON.stringify({ username: 'test-editor' })))
  let configured = false
  let entered = false
  let fail = false
  let confirms = 0
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('https://workload-ui.supabase.co/**', async (route) => {
    const { action } = route.request().postDataJSON()
    if (action === 'confirm') {
      confirms++
      if (fail) return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'Test update failed.' }) })
      entered = true
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(configured
      ? { configured: true, entered, columnTitle: 'Dashboard input', targetLabel: 'Entered', currentLabel: entered ? 'Entered' : '' }
      : { configured: false }) })
  })
  const go = async (mode = '') => {
    await page.goto(`${url}?mode=${mode}`)
    await page.getByRole('button', { name: 'Checking monday.com…' }).waitFor({ state: 'hidden' })
  }
  await go()
  await page.getByText(/Setup pending/).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Mark workload entered', exact: true }).isDisabled(), true)
  configured = true
  for (const mode of ['new', 'unlinked', 'blank-link']) {
    await go(mode)
    await page.getByRole('heading', { name: 'Task workload confirmation' }).waitFor()
    assert.equal(await page.getByRole('button').count(), 0, `${mode}: no confirmation button`)
    assert.equal(await page.getByText('Workload entry', { exact: true }).count(), 0, `${mode}: no workload entry panel`)
  }
  for (const mode of ['draft', 'dirty']) {
    await go(mode)
    await page.getByRole('button', { name: 'Mark workload entered', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Mark workload entered', exact: true }).isDisabled(), true)
  }
  await go()
  const mark = page.getByRole('button', { name: 'Mark workload entered', exact: true })
  await mark.waitFor()
  fail = true
  await mark.click()
  await page.getByRole('alert').filter({ hasText: 'Test update failed.' }).waitFor()
  await page.getByRole('button', { name: 'Retry status check' }).click()
  await mark.waitFor()
  assert.equal(confirms, 1, 'Retry checks status without repeating a write')
  fail = false
  await mark.click()
  await page.getByRole('button', { name: 'Workload entered', exact: true }).waitFor()
  assert.equal(confirms, 2)
  assert.equal(await page.getByRole('button', { name: 'Workload entered', exact: true }).isDisabled(), true)
  await go()
  await page.getByRole('button', { name: 'Workload entered', exact: true }).waitFor()
  assert.equal(confirms, 2, 'Reload restores remote status without a write')
  await page.setViewportSize({ width: 375, height: 500 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  const enteredButton = page.getByRole('button', { name: 'Workload entered', exact: true })
  const appearance = () => enteredButton.evaluate((button) => ({
    background: getComputedStyle(button).backgroundColor,
    opacity: getComputedStyle(button).opacity,
  }))
  // Wait for the existing button color/opacity transition to finish.
  await page.waitForFunction(() => {
    const button = document.querySelector('.btn-workload-entered')
    return button && getComputedStyle(button).backgroundColor === 'rgb(176, 220, 81)'
      && getComputedStyle(button).opacity === '1'
  })
  assert.deepEqual(await appearance(), { background: 'rgb(176, 220, 81)', opacity: '1' })
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  assert.deepEqual(await appearance(), { background: 'rgb(176, 220, 81)', opacity: '1' })
  const screenshot = path.join(tmpdir(), 'monday-workload-green-dark.png')
  await page.screenshot({ path: screenshot })
  const viewer = await browser.newPage()
  await viewer.goto(url)
  assert.equal(await viewer.getByRole('button').count(), 0, 'Viewers cannot confirm')
  assert.deepEqual(errors, [])
  console.log(`UI checks passed: setup, draft, unsaved/new task, failure/retry, success, reload, viewer access, mobile layout. Screenshot: ${screenshot}`)
} finally {
  await browser?.close()
  await server?.close()
  const resolved = path.resolve(fixture)
  if (path.dirname(resolved) === path.resolve(root) && path.basename(resolved).startsWith('.monday-ui-check-')) {
    await rm(resolved, { recursive: true, force: true })
  }
}
