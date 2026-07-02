# GCMC Workload Report — Agent Knowledge Base

A living reference for AI agents (and humans) working on this codebase. Read this
before making changes; it captures architecture, conventions, domain rules, and the
non-obvious gotchas that have bitten us.

---

## 1. What this app is

An internal **workload tracker for the RMIT Melbourne GCMC design team**. It records
"tasks" (design jobs), each with a booking code, campaign, requesting squad, work
types, an asset (deliverable) breakdown, assignees, dates, size, and a note. It
surfaces this as a **Dashboard** of charts, a filterable/sortable **Task List**, and a
**Settings** page for the editable reference lists.

Single-tenant. Runs against **Supabase** when configured, otherwise a
**localStorage** fallback so it works fully offline. Browsing is open to anyone
with the URL; a lightweight **username/password sign-in gates editing only**
(see §13).

---

## 2. Tech stack

- **React 18 + TypeScript**, built with **Vite**.
- **Tailwind CSS** (dark mode via the `class` strategy; semantic colors are CSS
  variables — see §9).
- **Recharts** for charts, **lucide-react** for icons.
- **React Router** (`/` dashboard, `/tasks` list, `/settings`).
- **Supabase JS** for the cloud backend (realtime subscriptions included).

Run: `npm run dev`. Typecheck: `npx tsc --noEmit` (do this after every change — it's the
main safety net; there are no unit tests). Preview verification is done via the
`preview_*` tools.

---

## 3. Data layer & architecture

The app **only ever talks to a `Repository` interface** (`src/data/repository.ts`).
Two implementations:

- `LocalRepository` (`src/data/localRepository.ts`) — localStorage, seeds `SEED_TASKS`
  on first run, cross-tab sync via the `storage` event.
- `SupabaseRepository` (`src/data/supabaseRepository.ts`) — Postgres via supabase-js,
  realtime via `postgres_changes`.

`createRepository()` picks Supabase iff `isSupabaseConfigured()` (env vars present),
else Local. **Which backend is live matters for verification** — the preview usually
runs on Supabase, so writes hit the real DB.

`src/data/store.tsx` is a React Context (`useStore()`) that wraps the repo and holds
`tasks` + `settings` in state. All UI reads/writes go through it. It exposes:
`createTask, updateTask, deleteTask, deleteAllTasks, importTasks, populateSampleData,
saveSettings, renameListItem, removeListItem, refresh`, plus `live`/`backend`/`loading`.

`src/data/mappers.ts` converts between the Supabase row shape (snake_case) and the app
`Task` model (camelCase). **The `rowToTask` mapper is where breakdown normalization
happens** (see §6).

---

## 4. Domain model

`src/types.ts`:

- **`Task`** — `id, squad, campaign, code, name, types[], assetTotal, assetBreakdown,
  people[], startDate|null, endDate|null, half, size, note?, createdAt, updatedAt`.
- **`TaskInput`** = `Task` without system fields (used for create/update).
- **`AppSettings`** — `{ campaigns[], types[], people[], assetTypes[] }`. The four
  user-editable reference lists.
- **`AssetBreakdown`** = `Record<string, number>` — **keyed by asset-type NAME**
  (e.g. `{ "Image": 3, "Video": 1 }`), not fixed keys. See §6.

`src/constants.ts` holds the fixed/default data and helpers:

- **`SQUADS`** — 8 fixed stakeholder teams (INTON, DOM, …, **Others**). Not editable.
- **`SIZES`** — `XS S M L XL`; `SIZE_COLORS` (heat scale), `SIZE_ORDER`, `SIZE_TONE`,
  `SIZE_DESCRIPTIONS`.
- **`SIZE_DURATION_DAYS` / `SIZE_DURATION_LABEL`** — turnaround per size from the GCMC
  T-shirt sizing guide (XS=1wk … XL=3–6mo). Drives end-date auto-fill.
- **`DEFAULT_CAMPAIGNS / DEFAULT_TYPES / DEFAULT_PEOPLE / DEFAULT_ASSET_TYPES`** and
  `DEFAULT_SETTINGS`.
- **`CHART_COLORS_LIGHT / CHART_COLORS_DARK`** — brand palette (RMIT red, navy, gold +
  tones). Index 0=red, 1=navy, 2=gold; dark variant lifts the navies so they don't
  vanish on the dark background.
- **`FALLBACK_ITEM = 'Others'`** and **`withFallback(list)`** — see §7.
- **`normalizeBreakdown` / `canonicalAssetName`** — legacy-key migration, see §6.

### Derived domain concepts

- **Task code**: `YY.MMDD.<seq>`, e.g. `26.0608.A`. `src/lib/taskCode.ts` parses it to
  an ISO date + sequence (`parseTaskCode`), builds it (`formatTaskCode`), and derives
  the **half** (`deriveHalf`: Jan–Jun = H1, else H2).
- **Stakeholder groups** (`src/lib/analytics.ts`): every squad maps to one of
  `DOMESTIC` (DOM), `INTON` (INTON), or `Other Stakeholders` (all the rest) via
  `stakeholderGroup()`. Used by the "Demand by stakeholders" chart.
- **Span** (`src/lib/span.ts`): `Total | By year | By half`. `filterBySpan(tasks, mode,
  year, half)` + `taskYears()` + `spanSuffix()`. Rendered by the shared
  `<SpanFilter>` component (used on Dashboard, Task List, and the backup modal).

---

## 5. Feature map (where things live)

- **Dashboard** (`src/pages/Dashboard.tsx`): span selector; 3 big hero StatCards
  (Total assets / tasks / campaigns) + a stacked column (Top request type + a
  "Tasks by size" stat-tile card); then Workload-across-the-year area chart + Asset mix
  donut + Workload by person; then Tasks-by-campaign + Asset-count-by-campaign stacked
  next to a tall **Demand by stakeholders** stacked bar. The chart display options
  (demand dimension Work/Asset type; hide Always On/BAU/Others in the campaign charts)
  are NOT on the dashboard — they live in **Settings → Dashboard**, backed by
  `src/lib/dashboardPrefs.ts` (localStorage `mwr.dashboardPrefs`, reactive external
  store). Defaults: **Asset type**, common campaigns **hidden** (stakeholder demand).
- **Task List** (`src/pages/TaskList.tsx`): prominent search, span selector, four
  **multi-select** filters (squad/campaign/people/size), sortable columns, row → edit
  modal, per-row delete, a note **hover icon**, and the **Import & Backup** button.
  Signed out, rows still open — but as a **read-only `TaskDetails`** view
  (`src/components/TaskDetails.tsx`, modal titled "Task details"), not the editable form;
  the Actions column and Import & Backup are hidden. `TaskDetails` is a clean scannable
  layout (NOT a mirror of the form): identity header with heat-coloured size + squad +
  half badges, a subtle-boxed meta grid (campaign/start/end, plus a computed **Duration**
  cell when an end date is set), then divider-separated sections for work types, asset
  breakdown (chips + total pill), people, and the **note (only when present)**. See §13.
- **Task form** (`src/components/TaskForm.tsx`): shared by New Task (via
  `NewTaskModal`/`useNewTask`) and Edit (from Task List). Big feature surface — see §8.
- **Import & Backup** (`src/components/ImportBackupModal.tsx`): CSV import (clean-load vs
  merge) + span-scoped CSV backup.
- **Settings** (`src/pages/Settings.tsx`): a **Dashboard** card (grouped chart-display
  toggles, see above); four `ListEditor`s (campaigns/work types/asset types/people)
  with add/rename/remove + a locked **"Others"** fallback row; fixed squads & sizes; a
  Developer/danger zone (populate sample data, delete all) that is **gated on
  `import.meta.env.DEV`** — grayed out with a "development mode only" notice in
  production builds, fully usable while running `npm run dev`. The whole page requires
  sign-in (route redirects to `/` otherwise).
- **Charts** (`src/components/charts.tsx`): `AreaTrendChart, DonutChart, VBarChart,
  HBarChart, StackedBarChart`, `NotEnough`, and the `WrappedTick` helper (wraps long
  x-axis labels onto multiple lines instead of angling them).
- **Layout/Sidebar** (`src/components/Layout.tsx`, `Sidebar.tsx`): sidebar holds brand
  + nav + the **New Task** button (sign-in only, under a subtle separator); header holds
  the page title, a current-year box, the theme toggle, and the **sign-in / account
  button** (signed in → opens the Account panel, see §13). Sidebar is **responsive**:
  icon-only 68px rail below `md`, full 240px at
  `md+` (labels/brand text `hidden md:*` — don't drop these classes; losing them once
  broke mobile). **Collapse**: a small circular chevron straddles the sidebar's right
  edge (`ChevronLeft`/`ChevronRight` by state, state lifted into Layout, persisted in
  localStorage `mwr.sidebar`); collapsed = sidebar width 0, and the header then shows
  the **logo + app name before the page title** (the logo is unboxed and swaps by theme —
  `RMIT_full.svg` on the light header, `RMIT_red.svg` on the dark one, via
  `dark:hidden`/`hidden dark:block`). **Logo rule**: dark backgrounds use `RMIT_red.svg`
  (white+red), light backgrounds use `RMIT_full.svg` (red+navy); the sidebar's bg is
  always dark navy (`--sidebar`) so it always uses `RMIT_red.svg`. (`RMIT_white.svg` is
  no longer used.) The header also exposes a **header-slot context**
  (`useHeaderSlots()`): a page can inject `left`/`right` nodes into the header via an
  effect (clearing on unmount). The Dashboard uses it to render the **Live badge**
  (left) and the **span selector + task count** (right) in the header bar instead of a
  body row.

---

## 6. Asset breakdown: name-keyed + legacy migration ⚠️

Asset types are **user-editable** (Settings → Asset types), so a task's
`assetBreakdown` is keyed by the asset-type **display name** (`{ "HTML5 ad": 4 }`), not
fixed keys.

**But older data (and the DB default) used fixed keys** (`image, video, publication,
html5, gif`). We migrate on read, not in place:

- `normalizeBreakdown(raw)` maps legacy keys → names (`html5` → `HTML5 ad`) and is
  applied in **`rowToTask`** (Supabase) and **`LocalRepository.listTasks`**. So the app
  always sees name keys, but **the DB may still hold legacy keys**.
- Because of that, **renaming/removing an asset type must match by canonical name**:
  `renameValue('assetBreakdown', …)` in both repos iterates every task and renames any
  key whose `canonicalAssetName(k)` equals the target (so it catches both `html5` and
  `HTML5 ad`), summing on collision. If you only checked `oldValue in breakdown`, legacy
  data silently fails to migrate and counts drop to 0. This bug bit us once — don't
  reintroduce it.

Analytics that iterate a fixed list (`assetsByType`, `demandByStakeholderAssetType`)
take the asset-type list as a param; the Dashboard passes `withFallback(settings.assetTypes)`.

---

## 7. The "Others" fallback

Every editable list (campaigns/types/people/assetTypes) has a **reserved, uneditable
`"Others"`** item (`FALLBACK_ITEM`). It is **not stored in the settings arrays** — it's
appended virtually by `withFallback()` and rendered as a locked row (no edit/remove) in
Settings' `ListEditor`.

Purpose: **nothing gets orphaned on delete.** `store.removeListItem(key, value)`:
1. `renameValue(field, value, 'Others')` — reassigns every task using `value` to
   "Others" (scalar campaign; merges into arrays for types/people; merges breakdown keys
   for asset types).
2. Removes `value` from the settings list.

`"Others"` is also a selectable option in the task form (campaign select, type/people
multi-selects, and as an asset-breakdown field) and appears in charts when it has data.

---

## 8. Task form behaviors (`TaskForm.tsx`)

- **Paste-to-fill**: pasting `"[26.0608.A] Some name"` into the Task name splits out the
  code, fills it, and auto-fills the start date (and half) from the code.
- **Code notices**: live "wrong format" / "duplicate code" errors; the code is required.
- **End-date auto-fill**: `startDate + SIZE_DURATION_DAYS[size]` fills the end date
  until the user edits it (`endDateTouched`). A green "Auto-set from {size}" note shows;
  a "⚡ Auto-set …" button re-applies it after a manual override.
- **Asset breakdown**: one input per `withFallback(settings.assetTypes)`; total is the
  live sum (shown in a pill). Inputs support **mouse-wheel on hover** (no focus needed)
  via a **non-passive** wheel listener (`AssetInput`) — React's `onWheel` is passive so
  `preventDefault` there wouldn't stop page scroll.
- **Validation guards** (`validate()`): everything required **except the end date**;
  **total assets must be > 0**. The submit button is disabled (greyed) until valid.
- **Delete** ("Remove task", bottom-left, edit mode only) routes through the shared
  delete-confirm modal.

---

## 9. Styling & theming

- **Semantic color tokens are CSS variables** in `src/index.css`, flipped by the `.dark`
  class: `--ink, --muted, --faint, --surface, --card, --subtle, --line, --sidebar`, and
  `--chart-*`. Tailwind maps them (`bg-card`, `text-ink`, `border-line`, …).
- **Brand colors**: `rmit-red #E61E2A`, `rmit-navy #000054`, plus `brand`/`navy` scales
  and `accent` (gold/teal/etc.) in `tailwind.config.js`.
- **Sidebar** uses `--sidebar` (light: `#000054`; dark: `#0b0b32`, a calm dark navy that
  harmonizes with the surface while a right `border-line` keeps it distinct).
- **Charts** are theme-aware via `useChartColors()` (returns the light/dark palette).
  Big hero StatCard numbers are `text-rmit-navy` in light, `text-ink` in dark.
- Reusable UI in `src/components/ui/` (Card/CardHeader, Modal, MultiSelect, StatCard,
  Badge). `Modal` closes on backdrop click and Escape. `MultiSelect` supports
  `overflowCollapse` (chips collapse to "+N" only when they don't fit).
- Helpers in `src/lib/format.ts`: `cx` (classnames), `compactNumber` (1.2k),
  `formatDate`, `addDaysISO`, `todayISO`, `toMessage` (readable errors incl. Supabase).

---

## 10. Supabase schema & migrations ⚠️

`supabase/schema.sql` is the source of truth; it's **idempotent** (`create table if not
exists`, `add column if not exists`). Two columns were added after the initial schema —
**an agent adding a new persisted field must add an idempotent `alter` and tell the user
to run it**, because a write including an unknown column fails:

- `settings.asset_types text[]` — for editable asset types.
- `tasks.note text` — for the task note. **Guarded**: `SupabaseRepository`
  create/update retry without `note` if the column is missing (see `isMissingNoteColumn`
  / `stripNote`), so task saves never hard-break pre-migration; the note just doesn't
  persist until the migration runs.
- `app_users` table — accounts for the sign-in gate (see §13). **Guarded**: signing in
  before the migration shows a friendly "run schema.sql" message (codes `42P01` /
  `PGRST205`), everything else keeps working.

`asset_breakdown` is `jsonb`, so changing the breakdown shape needs no schema change.

---

## 11. CSV import/export (`src/lib/csv.ts`)

- **Export**: core columns + one column per asset type + a `Note` column. Filename is
  span-tagged (`gcmc-workload-2026-H1-<date>.csv`).
- **Import** (`parseTasksCsv`): validates the **core** headers only; **any non-core
  column is treated as an asset type** (so files with different asset sets still
  import), `Note` is optional (older backups without it still import). `assetTotal` is
  recomputed from the asset columns.
- Import modes via `store.importTasks(inputs, mode)`: `'replace'` (wipe then load) or
  `'merge'` (update matching codes, add new).

---

## 12. Gotchas & lessons learned

- **Legacy breakdown keys** — see §6. Match asset-type operations by `canonicalAssetName`.
- **Supabase column migrations** — see §10. New persisted fields need an idempotent
  `alter` + a heads-up to the user; guard writes if a hard-break is unacceptable.
- **Tailwind config changes don't hot-reload reliably** in the dev server. For a new
  color, prefer a **JIT arbitrary value** (`bg-[var(--sidebar)]`) which regenerates on
  source save, or restart the dev server for a new theme token.
- **React state batching in synthetic tests**: firing several `input`/`wheel`/`click`
  events in one `preview_eval` reads stale state (no re-render between them). Fire one
  event per eval, or accept that only the last applies. Real user interactions are fine.
- **`preview_screenshot` has been flaky** this project (timeouts even when the app is
  healthy). Verify via `preview_eval` DOM inspection when screenshots hang; the
  `<Layout>`/`<App>` error entries in `preview_console_logs` are usually **stale HMR
  artifacts** — check the module-hash timestamp, and confirm health by reloading and
  querying the DOM (cards render, no error-boundary fallback text).
- **The "Workload across the year" chart is intentionally decoupled from the span
  filter** — it always shows the full 12 months of the active year (`byMonth` uses the
  year, not the half). Fill is a red opacity-fade gradient. The line is RMIT red up to
  the **"Now"** month then **grey afterward** (future) — done via a horizontal stroke
  gradient (`#workloadStroke`) with a hard stop at `nowMonth/(len-1)`, plus a custom
  `renderDot` colouring future dots grey. Only applies when `nowMonth` is set (i.e. the
  active year is the current calendar year); otherwise the whole line stays solid red.
- **Long chart x-axis labels wrap** (via `WrappedTick`) rather than angling.

---

## 13. Sign-in gate (view-for-all, edit-for-users)

`src/lib/auth.tsx` (`AuthProvider` / `useAuth()` → `{ user, canEdit, signIn, signOut,
updateAccount }`):

- **Not real security** — the anon key still has full DB access; this is a UX gate for
  an internal tool. Passwords are SHA-256-hashed client-side (`crypto.subtle`) and
  matched against the **`app_users`** table (Supabase) or a **local fallback account**
  (localStorage `mwr.localAccount`, defaulting to the built-in one). Default credential
  either way: **admin / gcmc2026**.
- **Session** persists in localStorage `mwr.session` ({ username }) and is restored on
  load without re-verification.
- **Self-service account change** (`updateAccount`, surfaced in the **Account panel** —
  `src/components/AccountModal.tsx`, opened from the header account button, NOT on the
  Settings page): verifies the current password, then updates the username and/or
  password — in `app_users` (Supabase) or `mwr.localAccount` (local). It re-writes the
  session so you stay signed in. ⚠️ The Supabase update uses
  `.update(patch).eq(...).select()` and **throws if 0 rows come back**, because an
  RLS-blocked update returns no error but changes nothing — without the `.select()`
  check it would falsely report success. Requires the **`for update` RLS policy** on
  `app_users` (added to `schema.sql`); until the user re-runs it, the panel shows
  "account changes are blocked — re-run schema.sql".
- **What `canEdit` gates**: Settings nav item + `/settings` route (redirect to `/`),
  the sidebar **New Task** button, the dashboard empty-state CTA, the task-list Actions
  column + **Import & Backup**, and the task modal's mode (editable `TaskForm` vs
  read-only `TaskDetails`). Anonymous visitors can still browse the Dashboard (incl. the
  span selector) and the Task List (search/filters), and **open a task row to view its
  details read-only** — they just can't change anything.
- The header button after the theme toggle is the entry point: signed out → `LogIn`
  icon opens `LoginModal`; signed in → `UserCog` icon + username opens the **Account
  panel** (`AccountModal`), which holds the username/password form **and the Sign out
  button** (there is no separate sign-out button in the header).

## 14. Working conventions

- After edits, run `npx tsc --noEmit`. It catches missing lucide icon exports, prop
  mismatches, etc.
- Match the surrounding code style (Tailwind utility classes, `cx()` for conditional
  classes, small focused components in `components/ui/`).
- When a change is browser-observable, verify with the preview tools (start the `dev`
  server, reload, inspect the DOM / console). Don't rely on screenshots alone.
- Destructive/data-writing verification (create/import/delete) runs against the user's
  live Supabase — clean up test data afterward and don't populate/delete without cause.
