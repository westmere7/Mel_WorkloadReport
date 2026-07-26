/**
 * Captures the screenshots embedded in the in-app Help page (public/help/*.png).
 *
 * Drives the RUNNING dev server headlessly (default http://localhost:5199 — pass
 * another origin as argv[2]), signs in via the localStorage session, and walks the
 * dashboard through its modes: assets, effort, compare, plus the effort explainer,
 * the output-rates editor, the New Task form and the task list. Re-run after a visual redesign to refresh the docs:
 *
 *   node scripts/capture-help.mjs
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
/** A visible header button by its exact label. */
const headerBtn = (label) => page.locator(`button:visible`).filter({ hasText: new RegExp(`^${label}$`) })

await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' })
await page.waitForSelector('.recharts-surface')
await page.waitForTimeout(SETTLE)

// ── Assets mode ───────────────────────────────────────────────────────────────
await page.screenshot({ path: `${OUT}/dashboard-overview.png`, fullPage: true })
console.log('captured dashboard-overview')

const statGrid = page.locator('div.grid').filter({ has: card('Asset count').first() }).first()
await shot('dashboard-stats', statGrid)
await shot('dashboard-workload', card('Workload & tasks'))
await shot('dashboard-campaign', card('Asset count by campaign'))
// The two mix donuts share a row — capture their parent grid as one image.
await shot('dashboard-mixes', page.locator('div.grid').filter({ has: card('Asset mix').first() }).first())
await shot('dashboard-demand', card('Squads demand distribution'))

// ── Effort mode ───────────────────────────────────────────────────────────────
await headerBtn('Effort').first().click()
await page.waitForTimeout(SETTLE)
await shot('effort-panels', page.locator('div.grid').filter({ has: card('Volume').first() }).first())
await shot('effort-workload', card('Workload & tasks'))

// The explainer behind the "?" next to the unit switch.
await page.locator('button[aria-label="What does Effort mean?"]:visible').first().click()
await page.waitForTimeout(600)
await shot('effort-explainer', card('Measuring workload by effort'))

// The output-rates editor, opened from inside the explainer.
await page.getByRole('button', { name: 'Edit output rates' }).click()
await page.waitForTimeout(600)
await shot('rates-editor', card('Output rates — asset types'))
await page.getByRole('button', { name: 'Cancel' }).click()
await page.getByRole('button', { name: 'Done' }).click()
await page.waitForTimeout(400)

// ── Compare mode (still in effort) ───────────────────────────────────────────
await page.locator('button[title="Compare two years"]:visible').first().click()
await page.waitForTimeout(SETTLE)
await shot('compare-panels', page.locator('div.grid').filter({ has: card('Volume').first() }).first())
await shot('compare-workload', card('Workload & tasks'))

// Back out of compare for the remaining captures.
await page.locator('button[title="Exit comparison mode"]:visible').first().click()
await headerBtn('Assets').first().click()
await page.waitForTimeout(800)

// ── Scope controls (header crop) ─────────────────────────────────────────────
await shot('header-scope', page.locator('[data-help="header-scope"]:visible'))

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
