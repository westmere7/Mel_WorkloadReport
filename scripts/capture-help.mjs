/**
 * Captures the screenshots embedded in the in-app Help page (public/help/*.png).
 *
 * Drives the RUNNING dev server headlessly (default http://localhost:5199 — pass
 * another origin as argv[2]), signs in via the localStorage session, and walks the
 * dashboard (single year, then compare), the output-rates editor in Settings, the
 * New Task form and the task list. Read-only: it opens forms and cancels them, never
 * saves. Re-run after a visual redesign to refresh the docs:
 *
 *   node scripts/capture-help.mjs [origin]
 *
 * Shots are 2x device-scale PNGs of specific cards (not viewport crops), so they
 * stay crisp and tightly framed regardless of window size.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const ORIGIN = process.argv[2] ?? 'http://localhost:5199'
const OUT = resolve(import.meta.dirname, '../public/help')
mkdirSync(OUT, { recursive: true })

/** Let entry animations, digit reels and chart transitions finish before a shot. */
const SETTLE = 2800

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1720, height: 1080 },
  deviceScaleFactor: 2,
  colorScheme: 'dark',
  storageState: {
    cookies: [],
    origins: [
      {
        origin: ORIGIN,
        localStorage: [
          // Signed-in session (client-side gate) so edit-only UI is present.
          { name: 'mwr.session', value: JSON.stringify({ username: 'docs', at: new Date().toISOString() }) },
          { name: 'mwr.theme', value: 'dark' },
        ],
      },
    ],
  },
})
const page = await context.newPage()

const shot = async (name, locator, opts = {}) => {
  await locator.first().scrollIntoViewIfNeeded()
  await page.waitForTimeout(250)
  await locator.first().screenshot({ path: `${OUT}/${name}.png`, ...opts })
  console.log('captured', name)
}
const card = (text) => page.locator('.card').filter({ hasText: text })
/** A dashboard card by its exact header title (avoids matching cards that merely mention it). */
const titled = (title) =>
  page.locator('.card').filter({ has: page.locator('h3, h2').filter({ hasText: new RegExp(`^${title}$`) }) })
/** Screenshot the union of several cards' boxes (cards that share a grid row). */
const shotUnion = async (name, locators, pad = 0) => {
  await locators[0].first().scrollIntoViewIfNeeded()
  await page.waitForTimeout(250)
  const boxes = await Promise.all(locators.map((l) => l.first().boundingBox()))
  const x = Math.min(...boxes.map((b) => b.x)) - pad
  const y = Math.min(...boxes.map((b) => b.y)) - pad
  const right = Math.max(...boxes.map((b) => b.x + b.width)) + pad
  const bottom = Math.max(...boxes.map((b) => b.y + b.height)) + pad
  await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x, y, width: right - x, height: bottom - y } })
  console.log('captured', name)
}

await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' })
await page.waitForSelector('.recharts-surface')
await page.waitForTimeout(SETTLE)

// ── Dashboard (single year) ──────────────────────────────────────────────────
await page.screenshot({ path: `${OUT}/dashboard-overview.png`, fullPage: true })
console.log('captured dashboard-overview')

// Header row: Volume + Effort + the two by-squad rankings.
const statGrid = page.locator('div.grid').filter({ has: titled('Volume') }).first()
await shot('dashboard-stats', statGrid)
await shotUnion('effort-panels', [titled('Volume'), titled('Effort')])
await shot('dashboard-workload', card('Workload & tasks'))
await shot('dashboard-campaign', card('Asset count by campaign'))
// The two mix donuts share a row — capture their parent grid as one image.
await shot('dashboard-mixes', titled('Mix'))
await shot('dashboard-demand', card('Squads demand distribution'))

// ── Scope controls (header crop) ─────────────────────────────────────────────
// Function filter (left slot) through the span filter + Compare (right slot).
await shotUnion('header-scope', [
  page.locator('[data-help="header-scope"]:visible'),
  page.locator('[data-help="header-span"]:visible'),
], 10)

// ── Compare mode ─────────────────────────────────────────────────────────────
await page.locator('button[title="Compare two years"]:visible').first().click()
await page.waitForTimeout(SETTLE)
await shotUnion('compare-panels', [titled('Volume'), titled('Effort')])
await shot('compare-workload', card('Workload & tasks'))
await page.locator('button[title="Exit comparison mode"]:visible').first().click()
await page.waitForTimeout(800)

// ── Output-rates editor (Settings → Timing & effort) ─────────────────────────
await page.goto(ORIGIN + '/settings', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.getByRole('button', { name: /^(Edit rates|Set rates)/ }).first().click()
await page.waitForTimeout(800)
await shot('rates-editor', card('Output rates — asset types'))
await page.getByRole('button', { name: 'Cancel' }).click()
await page.waitForTimeout(400)
await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' })
await page.waitForSelector('.recharts-surface')
await page.waitForTimeout(800)

// ── New Task form ────────────────────────────────────────────────────────────
await page.getByRole('button', { name: 'New Task' }).first().click()
await page.waitForTimeout(800)
const formModal = card('Workload by function').filter({ hasText: 'Task code' })
// Enable a function tab so the panel shows its real content, not the off state.
const turnOn = page.getByRole('button', { name: /Turn on/ }).first()
if (await turnOn.isVisible().catch(() => false)) {
  await turnOn.click()
  await page.waitForTimeout(900)
}
await shot('task-form', formModal)
await shot('task-form-monday', page.locator('[data-help="task-identity"]'))
await shot('task-form-functions', page.locator('[data-help="fn-workload"]'))
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

// ── Task list ────────────────────────────────────────────────────────────────
await page.goto(ORIGIN + '/tasks', { waitUntil: 'networkidle' })
await page.waitForTimeout(SETTLE)
await page.screenshot({ path: `${OUT}/task-list.png` })
console.log('captured task-list')

await browser.close()
console.log('done →', OUT)
