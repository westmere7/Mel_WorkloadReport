# GCMC Workload Report — Knowledge Base

A living reference for AI agents (and humans) working on this codebase. Read this
before making changes; it captures architecture, conventions, domain rules, and the
non-obvious gotchas that have bitten us. (This is the file some tools also look for as
`AGENTS.md` — it was renamed to `KNOWLEDGEBASE.md`; it's the single source of truth.)

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
  people[], startDate|null, endDate|null, half, size, images[], note?, createdAt, updatedAt`.
- **`TaskImage`** — `{ id, url, w, h }`. Up to 10 per task; the `id` is the Storage
  object name (`<id>.webp`), `url` is its public URL. See §15.
- **`TaskInput`** = `Task` without system fields (used for create/update).
- **`AppSettings`** — `{ squads[], campaigns[], types[], people[], assetTypes[] }`. The
  five user-editable reference lists. `Squad` is now just `string` (was a fixed union) —
  squads are editable like the others.
- **`AssetBreakdown`** = `Record<string, number>` — **keyed by asset-type NAME**
  (e.g. `{ "Image": 3, "Video": 1 }`), not fixed keys. See §6.

`src/constants.ts` holds the fixed/default data and helpers:

- **`DEFAULT_SQUADS`** — seeds `settings.squads` (INTON, DOM, Student Recruitment, BPX,
  RMIT VN, Alumni, Agent Management). **Squads are now user-editable** (add/rename/remove
  in Settings like the other lists; "Others" is the virtual fallback). `SQUADS` =
  `DEFAULT_SQUADS + 'Others'` (used by sample data / CSV default). `SQUAD_DESCRIPTIONS`
  is now just a best-effort tooltip lookup for the default squads (custom ones have none).
  ⚠️ `stakeholderGroup()` (demand chart) still keys off the literal names **"DOM"/"INTON"**
  — renaming those squads drops them into "Other Stakeholders".
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
- **Legacy task code**: `VN<YY>-<DDMM>-<seq>`, e.g. `VN25-1802-A` → 2025-02-18
  (⚠️ date is **DD-then-MM**, the reverse of the current MMDD format). `parseTaskCode`
  detects it (`LEGACY_RE`) and returns `{ iso, seq, valid, legacy: true }`. It is
  **read-only** — used ONLY to auto-fill the start date (in the task form + paste-to-fill);
  we never build/rewrite/suggest legacy codes (`formatTaskCode`/`suggestCodeForDate` stay
  MMDD). When a legacy code is entered, TaskForm shows a small **"Legacy format"** badge
  under the code input next to "Booked {date}".
- **Stakeholder groups** (`src/lib/analytics.ts`): every squad maps to one of
  `DOMESTIC` (DOM), `INTON` (INTON), or `Other Stakeholders` (all the rest) via
  `stakeholderGroup()`. Used by the "Demand by stakeholders" chart.
- **Span** (`src/lib/span.ts`): `Total | By year | By half`. `filterBySpan(tasks, mode,
  year, half)` + `taskYears()` + `spanSuffix()`. Rendered by the shared
  `<SpanFilter>` component (used on Dashboard, Task List, and the backup modal).

---

## 5. Feature map (where things live)

- **Dashboard** (`src/pages/Dashboard.tsx`): span selector; a `lg:grid-cols-2
  xl:grid-cols-4` header row (2-up on `lg`, 4-up on `xl`) = 2 big hero StatCards
  (**Asset count** shows the **full** number via `toLocaleString()` with hint
  **"deliverables from {span}"** (`spanDesc`: "all time"/"2026"/"2026 H1"); **Task count**
  hint is a dynamic **"Across N campaigns"** = `summary.totalCampaigns` for the current
  span). Hero number size is responsive to the layout: `clamp(3rem,11vw,7rem)` at 2-up
  (`lg`) so it fills the wide cards, `xl:clamp(3rem,5vw,7rem)` at 4-up so full multi-digit
  numbers still fit the narrow cards. Both hero numbers use **`ui/AnimatedNumber`** — a
  true **odometer**: each digit is a vertical reel (0–9 stacked) that `translateY`s to the
  current digit with a **CSS transition**, so a value change rolls the digits vertically
  (with a top/bottom fade mask); commas render statically; container carries the
  `aria-label` (reels are `aria-hidden`). CSS transitions apply their end state even when
  the tab is hidden, so the value is never stale (but the roll is only visible in a
  visible browser — not in the hidden preview). Honours `prefers-reduced-motion`.
  Same-length changes roll; a digit-count change remounts the reels (keyed by length). Then a **Task sizes** headline card (`bySize` badges + bold counts +
  `Shirt` icon) + a **Tasks by squad** card. (Total campaigns was removed;
  the per-size breakdown moved out of the Task-count card into the Task-sizes card.) Then a
  row (`lg:grid-cols-2 xl:grid-cols-4`):
  Workload-across-the-year area chart + **Asset mix** donut + **Work type mix** donut
  (`countByMulti(filtered,'types')`, same `DonutChart` style as Asset mix) + optional
  **Tasks by person** (HBar); then Tasks-by-campaign + Asset-count-by-campaign stacked
  next to a tall **Demand by stakeholders** stacked bar. **Tasks by person is hidden by
  default** (`showTasksByPerson` pref); when hidden, the Workload card takes
  `lg:col-span-2 xl:col-span-2` so it gets the freed width. The chart display options
  (demand dimension Work/Asset type; hide Always On/BAU/Others in the campaign charts;
  show/hide Tasks by person) are NOT on the dashboard — they live in **Settings →
  Dashboard**, backed by `src/lib/dashboardPrefs.ts` (localStorage `mwr.dashboardPrefs`,
  reactive external store). Defaults: demand **Asset type**, common campaigns **hidden**,
  Tasks-by-person **hidden**.
- **Dashboard comparison mode**: the header "Compare" toggle swaps the span filter for
  **{target select} over {source select}** year pickers (defaults: target = latest data
  year, source = target − 1; source can never equal target) and the count reads
  "{target} vs {source} tasks". Everything is phrased **"{target} over {source}"** (e.g.
  "2026 over 2025") — stat-card labels ("Asset count · 2026 over 2025"), the workload-chart
  badge, and chart subtitles. Effects: hero StatCards get a `delta` (`ui/TrendDelta.tsx` —
  % vs source; "New" when no baseline). Sizes: `sm`/`md` use a single `animate-bounce`
  chevron; **`lg` is the prominent variant** (used on the Total-assets card) — an infinite
  **chevron escalator** (`animate-chevron-rise`/`-fall` keyframes in `index.css`,
  reduced-motion-guarded) that moves up for an increase / down for a decrease, with a
  24px % — while the card's `hint` keeps the full "{cur} vs {src} deliverables in {year}"
  numbers. Labels change to "Assets · {year}" etc.;
  the workload chart overlays the source year as a second line (themed navy, legend
  labels both years — `compare` prop on `AreaTrendChart`); the Asset-mix donut legend
  gets per-type deltas (`compare` prop); Tasks-by-person/squad intentionally unchanged;
  the two campaign VBarCharts and the demand StackedBarChart render **split columns**
  (source faded at 0.45 opacity, left of target) and **hide categories that don't have
  data in both years** (inner join by name). ⚠️ Recharts gotcha: `legendType="none"` on
  the faded bars did NOT keep them out of the Legend — the stacked chart passes an
  explicit `payload` to `<Legend>` in compare mode instead.
- **Task List** (`src/pages/TaskList.tsx`): prominent search, span selector, four
  **multi-select** filters (squad/campaign/people/size), sortable columns, row → edit
  modal, per-row delete, a note **hover icon**, and the **Import & Backup** button.
  **Paginated at `PAGE_SIZE = 50`**: the `filtered` (filter+sort) result is sliced into
  pages and the `<Pagination>` footer shows only when `filtered.length > 50`. `page` resets
  to 1 on any filter/search/sort change (an effect keyed to those, NOT to `tasks`, so a live
  task update doesn't yank your page); `currentPage` is clamped to the page count so a
  shrinking result set never strands an empty page. Header reads "Showing X–Y of N".
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
- **Showcase** (`src/pages/Showcase.tsx` wizard + `src/pages/ShowcaseViewer.tsx` public player +
  `src/showcase/` engine + `src/lib/showcase.ts` contract): animated shareable year-in-review —
  see §17.
- **Settings** (`src/pages/Settings.tsx`), top→bottom: a **Dashboard** card (chart-display
  toggles); a collapsible **"Groups"** `CollapsibleSection` (open state persisted in
  localStorage `mwr.settings.groupsOpen`) — itself a **master `Card`** whose nested editor
  cards use `className="bg-subtle"` so they read as tiles inside the panel (same big-panel /
  smaller-panels-inside look as the Dashboard card); and the **Year snapshots** card (§16). Settings/controls render as tinted `PrefRow`s (`bg-subtle`, `font-medium` title)
  so they read as distinct from the bold `CardHeader`/section titles — don't restyle a setting
  to look like a heading. `PrefRow`/`Switch`/`CollapsibleSection` are the shared building blocks.
- **Groups section**: five `ListEditor`s (**squads**/campaigns/work types/asset types/people)
  with add/rename/remove + a locked **"Others"** fallback row, plus a locked Task-sizes card
  (`SizeDurationsCard`). Squads are editable **except DOM & INTON** (`locked` prop, since
  `stakeholderGroup()` keys off those names). At the top of the section is the governance toggle
  **"Allow removing groups already associated with tasks"** (`settings.allowRemoveUsed`, default
  **off**): when off, `ListEditor.requestRemove` **blocks** removing an item with `usage>0` (shows
  a "can't remove — turn on the setting" modal); when on, removing a used item pops the
  reassign-to-"Others" confirm. 0-task items always delete straight away. Items shown
  **alphabetically** (`sortAlpha`); `withFallback()` sorts (Others last) so the task form/charts
  list A→Z too. The whole page requires sign-in. NOTE: the old **Data backend** card and
  **Developer/danger zone** were removed from the UI (`store.populateSampleData`/`deleteAllTasks`
  still exist, unsurfaced).
- **Charts** (`src/components/charts.tsx`): `AreaTrendChart, DonutChart, VBarChart,
  HBarChart, StackedBarChart`, **`RankedBars`** (axis-free inline list — each row is a
  single line: label · filled track · value; used for "Tasks by squad"), `NotEnough`, and
  the `WrappedTick` helper (wraps long x-axis labels onto multiple lines instead of
  angling them). The hero **StatCard `xl`** number is `text-[clamp(2.75rem,4.5vw,5rem)]`
  (deliberately kept modest so the top stats row stays short).
- **Layout/Sidebar** (`src/components/Layout.tsx`, `Sidebar.tsx`): sidebar holds brand
  + nav + the **New Task** button (sign-in only, under a subtle separator); header holds
  the page title, a current-year box, the theme toggle, and the **sign-in / account
  button** (signed in → opens the Account panel, see §13). Sidebar is **responsive**:
  icon-only 68px rail below `md`, full 240px at
  `md+` (labels/brand text `hidden md:*` — don't drop these classes; losing them once
  broke mobile). ⚠️ **Tailwind arbitrary-width gotcha**: the aside width toggles between
  `w-[68px]` and `md:w-60`; keep exactly ONE `md:w-*` per branch (see the ternary) —
  piling conflicting `md:w-*` into one className lets source-order decide and breaks
  unpredictably. **Collapse is desktop-only**: a small circular chevron
  (`ChevronLeft`/`ChevronRight`) straddles the sidebar edge, hidden below `md`
  (`hidden md:flex`); on mobile the sidebar is a fixed rail that **can't collapse** (the
  `collapsed` state only applies at `md+`). State lifted into Layout, persisted in
  localStorage `mwr.sidebar`. **Collapsed (desktop) = the 68px icon rail** (nav icons
  only, NOT width 0) — `collapsed` forces rail mode at all widths by dropping the `md:`
  "full panel" classes (the `railOnly()` helper + `hideLabel` in Sidebar). When collapsed
  the rail **drops its brand row** (logo + name) and the header shows them instead —
  a `{collapsed && …}` block in Layout renders the logo + "GCMC / Workload Report" before
  the page title (only at `md+`), so the brand never appears twice. The brand row's space
  is **reserved (`md:invisible`)** when collapsed so the nav icons don't shift up.
  **Clicking the sidebar background toggles collapse/expand** (the `<aside>` has
  `onClick={onToggle}` + `cursor-pointer`); nav links and the New Task button
  `stopPropagation` so they navigate/open without toggling. **Logo rule**: dark
  backgrounds → `RMIT_red.svg` (white+red), light backgrounds → `RMIT_full.svg` (red+navy).
  The sidebar sits on the dark `--sidebar` bg in both themes so it always uses
  `RMIT_red.svg`; the collapsed **header** brand swaps by theme
  (`RMIT_full` light / `RMIT_red` dark via `dark:hidden`/`hidden dark:block`).
  (`RMIT_white.svg` is unused.) The header also exposes a **header-slot context**
  (`useHeaderSlots()`): a page can inject `left`/`right` nodes into the header via an
  effect (clearing on unmount). The Dashboard uses it to render the **Live badge**
  (left) and the **span selector + task count** (right) in the header bar instead of a
  body row. The header is a **`flex-wrap` bar**: on wide screens it's one row (title left,
  slots + controls right via `order` + `ml-auto`); when space runs out it wraps the
  `slots.right` cluster (`order-3 w-full sm:order-2 sm:w-auto`) to a second full-width
  row. On mobile the year box and Live badge are hidden (`hidden sm:*`) to keep the top
  row compact. The sidebar's bottom-left footer (**expanded only**) shows **"RMIT GCMC
  Team"** and the app version below it.
- **App version**: `package.json`'s `version` is the single source of truth; `vite.config.ts`
  injects it via `define` as the global **`__APP_VERSION__`** (typed in `vite-env.d.ts`),
  rendered as `v{__APP_VERSION__}` in the sidebar footer. Bump `package.json` to change it
  (Vite config change → dev server auto-restarts).

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
appended virtually by `withFallback()` (which **sorts the real items alphabetically** via
`sortAlpha` and keeps Others last) and rendered as a locked row (no edit/remove) in
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
  live sum (shown in a pill). Each `AssetInput` offers three ways to change a value:
  type a number **or basic math** (e.g. `3+2`, evaluated on blur/Enter via `evalMath`);
  **mouse-wheel on hover** (no focus needed) via a **non-passive** wheel listener (React's
  `onWheel` is passive, so it couldn't `preventDefault` page scroll); and small **▲▼ stepper
  buttons** for ±1 (`tabIndex={-1}` + `onMouseDown` preventDefault so they don't grab focus
  or trigger the wrapping `<label>`; floored at 0). The number field keeps a fixed width so
  the steppers/label never squeeze the digits.
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
- `settings.squads text[]` — for editable squads. **Guarded**: `SupabaseRepository.saveSettings`
  retries the upsert without `squads` if the column is missing (`isMissingSquadsColumn`),
  so editing the *other* lists never breaks pre-migration; squad edits just don't persist
  until `schema.sql` runs (reads fall back to `DEFAULT_SQUADS`).
- `tasks.note text` — for the task note. **Guarded**: `SupabaseRepository`
  create/update retry without `note` if the column is missing (see `isMissingNoteColumn`
  / `stripNote`), so task saves never hard-break pre-migration; the note just doesn't
  persist until the migration runs.
- `app_users` table — accounts for the sign-in gate (see §13). **Guarded**: signing in
  before the migration shows a friendly "run schema.sql" message (codes `42P01` /
  `PGRST205`), everything else keeps working.
- `tasks.images jsonb default '[]'` — task images (see §15). **Guarded**: create/update
  retry without `images` if the column is missing (`isMissingImagesColumn` / `stripImages`).
  Also adds a **Storage bucket + policies** (`task-images`) — re-running `schema.sql`
  creates them; until then uploads fail (surfaced inline in the form) but everything else
  saves.
- `settings.allow_remove_used boolean default false` — the Groups removal-guard toggle (§5).
  **Guarded**: `saveSettings` retries the upsert without it (`isMissingAllowRemoveColumn`), so
  saving other settings never breaks pre-migration; reads fall back to `false`.
- `snapshots` table + **private `snapshots` bucket** + policies + faithful restore — see §16.
  **Guarded**: `listSnapshots` returns `[]` on missing-table (`42P01`/`PGRST205`); creating
  shows a friendly "run schema.sql" message.
- `showcases` table (config inline jsonb + `expires_at`) — see §17. **Guarded**: `listShowcases`
  → `[]` on missing table; generating shows a "run schema.sql" message; the public viewer's
  `getShowcase` returns null (→ "not found" screen).

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
  filter** — it always shows a full 12 months of ONE year, driven by `chartYear` (NOT
  `activeYear`): in **Total** mode `chartYear` = the latest data year (`years[0]`), so a
  year left sticky in `year` state from a prior "By year" pick doesn't leak in; in
  year/half/compare it follows the selected/target year. A header badge shows that year
  (or `{srcYear} vs {activeYear}` in compare mode). Fill is a red opacity-fade gradient.
  The line is RMIT red up to
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

## 15. Task images (Supabase Storage)

Tasks can carry up to **10 images** (`task.images: TaskImage[]`). Groundwork for a future
**Showcase mode** (cycling big campaigns + their assets + yearly headline stats).

- **Storage, not the DB.** Images live in a **public** Supabase Storage bucket
  **`task-images`**; only `{ id, url, w, h }` descriptors are stored in the `tasks.images`
  jsonb column. Free-tier Storage (~1 GB) easily holds thousands of compressed images.
- **Client-side WebP compression** (`src/lib/image.ts` → `compressToWebP`): downscales to
  ≤1600px longest edge and re-encodes to WebP (q0.82), typically ~100–300 KB. Dependency-
  free (canvas). Animated GIFs are flattened to a static first frame.
- **Repository surface** (`Repository`): `readonly supportsImages` (Supabase `true`, Local
  `false`), `uploadImage(blob, w, h) → TaskImage`, `deleteImage(id)`. Supabase impl uses
  `storage.from('task-images')`; filenames are `crypto.randomUUID() + '.webp'`.
  **Supabase-only**: the local backend throws on upload; the form gates the UI on
  `store.supportsImages` and shows a "requires Supabase" hint instead.
- **UI**: to keep the busy form uncluttered, images live behind a **yellow "Demo Images"
  button in the Assets section header** (amber styling + amber count badge). Clicking it swaps the
  form body for a self-contained **Demo panel** (an `imagesOpen` view-swap *inside* the same
  modal, with "← Back to task" + "Done" buttons — NOT a nested modal, which would double-fire
  Escape): an "Add" tile + thumbnail grid with hover ×. Uploads happen immediately (path is
  UUID-based, so it works for unsaved/new tasks); the `images` array rides through the normal
  `TaskInput`/create/update path (mappers handle the column). **Clicking a thumbnail opens it
  in a full-screen `ui/ImageLightbox`** (z-[60] over the modal; Escape captured so it closes
  only the lightbox). `TaskList` shows the image-count icon **in the Assets column** (beside
  the asset total); the read-only `TaskDetails` shows a "Demo Images" gallery that opens the same
  lightbox.
- **Orphan cleanup (best-effort).** Storage deletes are **deferred to save/cancel** so
  cancelling truly discards changes. TaskForm tracks `sessionIds` (uploaded this session)
  + `initialIds`; on **save** it purges `(initial ∪ session) − final`, on **cancel/unmount**
  it purges all `sessionIds`. A `finalized` ref (set true up-front on submit, reset on
  failure) stops the modal-close unmount from deleting just-saved images. `store.deleteTask`
  / `deleteAllTasks` also purge the deleted tasks' images. A hard browser-close mid-edit
  can still orphan a file (rare; a periodic sweep could be added later).
- **CSV** carries only an image **count** column (images aren't in CSV); a **merge** import
  preserves each matched task's existing images (`store.importTasks` sets `images: match.images`).
- **Storage limits & the R2 escape hatch.** Supabase Free ≈ **1 GB storage + ~5 GB egress/mo**
  (DB is separate — we keep images out of it). With WebP compression, storage size won't be
  the first wall; **egress** (image views, e.g. a running Showcase) is. When a limit is hit,
  new uploads just error inline in the Demo panel (task saves are unaffected) and Supabase
  restricts the Free project (no surprise bill; existing files kept). Watch **Reports → Usage**.
  If egress climbs, the escape hatch is **Cloudflare R2** (10 GB free, **$0 egress**,
  S3-compatible): keep Supabase for DB/auth/realtime, move only the images bucket — the
  `Repository.uploadImage/deleteImage` seam localises the change, but R2 needs a small Worker
  to mint presigned upload URLs (browser can't hold R2 secrets) + a custom domain for reads.
  Also note: Supabase Free **pauses a project after ~7 days idle** — a separate long-term
  concern that moving storage doesn't fix.

## 16. Year snapshots

Freeze the entire workload state — all tasks + settings + the tasks' demo images — into a
**self-contained JSON**, managed from a **"Year snapshots" card** at the bottom of Settings
(`SnapshotsCard` in `src/pages/Settings.tsx`). Per-year archive + rollback.

- **`src/lib/snapshot.ts`** — the types + helpers. `SnapshotMeta` (lightweight list row),
  `SnapshotImage { origId, w, h, dataUrl }` (base64), `SnapshotPayload { meta, tasks, settings,
  images }`. Helpers: `fetchAsDataUrl` (fetch→blob→FileReader base64), `dataUrlToBlob`,
  `downloadJson`, `snapshotFilename`, `formatBytes`, and **`buildPayload(tasks, settings, input,
  createdBy, onProgress)`** which embeds every task image (progress-reported; a failed fetch is
  skipped so the snapshot still saves). **`ADMIN_PASSWORD = '777776'`** lives here (client-side
  gate for revert, same posture as §13).
- **Images embedded (base64):** snapshots are self-contained and survive later deletions; the
  downloaded JSON is portable. Cost: each snapshot duplicates image bytes (+~33%) — ties into the
  §15 storage note; delete old ones.
- **Persistence (Repository, both impls):** `listSnapshots`, `saveSnapshot(payload)`,
  `loadSnapshot(id)`, `deleteSnapshot(id)`, plus **`restoreTasks(tasks: Task[])`** — a *faithful*
  replace-all that preserves `id/createdAt/createdBy` (via `mappers.taskToRow`), unlike the
  `TaskInput` create paths. Supabase: JSON blob in a **private `snapshots` bucket** (`<id>.json`,
  read via `.download()`) + a `snapshots` **metadata table** for the list. Local: `mwr.snapshots`
  (meta list) + `mwr.snapshot.<id>` (payload) in localStorage; no images (local has none).
- **Store:** `snapshots` state (loaded best-effort in `refresh`), `createSnapshot(input,
  onProgress)`, `revertSnapshot(id, onProgress)`, `deleteSnapshot(id)`, `downloadSnapshot(id)`.
  **Revert** = load payload → (Supabase) re-upload each embedded image via `uploadImage` → build
  `origId → TaskImage` map → remap `task.images` → `restoreTasks` + `saveSettings` → purge the
  old (replaced) tasks' images from storage.
- **UI:** "Create snapshot" opens a modal (year select from `taskYears()` + current year, name,
  comment) with a `Loader2` progress spinner ("Embedding images… 3/12"). Each saved snapshot row
  has **Revert** (opens an admin-password modal — `777776` — `closeOnBackdrop={false}`),
  **Download JSON**, and **Delete** (confirm). All gated by Settings' sign-in requirement.
- **Migration:** re-run `supabase/schema.sql` — adds the `snapshots` table + the **private**
  `snapshots` bucket + storage policies. **Guarded:** before migration `listSnapshots` swallows
  the missing-table error (`42P01`/`PGRST205`) and returns `[]`; creating shows a friendly
  "run schema.sql" message. So the rest of the app is unaffected until you migrate.

## 17. Showcase mode (animated shareable year-in-review)

The payoff for demo images (§15): a **Showcase** sidebar item (edit-gated) opens a 7-step wizard
that freezes a year's data into a **self-contained `ShowcaseConfig`**, and Generate mints a public
link `/showcase/<id>` playing a deterministic, pure-CSS animated presentation.

- **Routing (first route outside the shell):** `App.tsx` splits at the top — `/showcase/:id` →
  `ShowcaseViewerPage` (chrome-free, NO store/auth/loading gate) vs a layout route `StoreShell`
  (`StoreProvider > NewTaskProvider > Layout > loading gate > Outlet`) hosting `/`, `/tasks`,
  `/showcase` (wizard, `EditGate`), `/settings` (`EditGate`), `*`. **StoreProvider moved from
  main.tsx into StoreShell**; `createRepository()` is exported from store.tsx for store-less
  consumers (the viewer). Sidebar: `EDIT_ONLY = ['/settings','/showcase']` filter (both navs).
- **Contract:** `src/lib/showcase.ts` — `ShowcaseConfig` (versioned via `SHOWCASE_CONFIG_VERSION`;
  viewer rejects newer versions politely). Frozen at generate time: `projects` (ShowcaseProject
  cards incl. image **URLs** — frozen references, not copies; deleting a task image later breaks
  that showcase's image), precomputed `stats` (`STAT_OPTIONS`, 13 ids) + `top3` (`TOP3_OPTIONS`,
  6 ids) computed over ALL tasks of the year, `sectionOrder` (intro locked first), theme/style/
  canvas/pacing, and `seed`. `mulberry32`/`seededShuffle`/`durationDays` live here. Draft
  (`ShowcaseDraft`) autosaves to localStorage `mwr.showcaseDraft.v1`.
- **Persistence:** `showcases` table, config **inline jsonb** (10–40 KB — image URLs, not base64;
  unlike snapshots no bucket needed). `list` excludes `config`. Expiry (`EXPIRY_OPTIONS`
  1w/1m/3m/1y/never, default 3m) is **lazy**: viewer shows "expired"; the wizard's
  `refreshShowcases` purges expired rows. Local mode: `mwr.showcases.v1` + `mwr.showcase.<id>` —
  links only open in the same browser (caveat shown; viewer not-found hints it).
- **Wizard:** `src/pages/Showcase.tsx` + `src/components/showcase/` (WizardProgress + 7 steps +
  `wizardBits` Segmented/SelectableCard). Step 2 defaults to **L+XL selected**, biggest-first;
  size-filter chips select/deselect that size's tasks; reorder arrows disable when the
  **Randomize** switch is on (live `seededShuffle` preview; Re-roll mints a new seed); changing
  year resets the selection. `ui/Switch.tsx` was extracted for reuse (Settings still has its
  local copy). **Desktop-only:** the Showcase route is filtered out of the mobile tab bar
  (`MOBILE_HIDDEN` in `Sidebar.tsx` `MobileNav`), and both the wizard (`Showcase.tsx`) and the
  public viewer render a "not on mobile" screen below 768px / on mobile UA.
- **Engine (2025-storyboard rework):** `src/showcase/` (viewer-only; `showcase.css` imported by
  `ShowcasePlayerView`). `compileScenes(config)` bakes ALL variance from `mulberry32(config.seed)`
  into payloads — no Math.random/Date.now in render. Core anti-uniformity device is a **seeded
  shuffle-bag** (`makeBag`): deals each item once (shuffled) before repeating and never repeats
  across the refill boundary — used for backgrounds, scene enters, stat variants, and per-image-
  count layout archetypes so consecutive scenes differ. `useShowcasePlayer` = single rAF over
  `performance.now()`, scenes overlap by `TRANSITION_MS` (**640ms**; exit z-1 under enter z-2, ≤2
  mounted), `visibilitychange` pauses (JS clock + `[data-paused] * {animation-play-state:paused}`),
  loop = cycle-prefixed keys + clock wrap. **Pacing** `PACE {fast .85, normal 1, relaxed 1.25}` via
  `--pace`; per-element staggers via `--d` (`bits/anim.ts dly()`). Stage authored at true canvas
  px, root `font-size = width/100`, `transform: scale(fit)`.
  - **Per-scene brand panels** — the big change. There is NO fixed stage backdrop / `showcaseTheme`
    rooms / aurora blobs / geometric decor / `StageDecor` anymore (all removed). Every scene owns a
    `bg: SceneBgId` (`red|redGrad|navy|navyGrad|duoGrad|white|split`) painted by a `.sc-bg-*` class
    that sets the panel's `--sc-ink/-muted/-accent/-pixel/-grad-text` vars. `makeBgPicker` walks a
    weighted per-mode pool with a **no-adjacent-family rule** (`bgFamily`); forced panels (intro,
    split) call `.note()` to keep the rule intact. White panels carry `data-ink` (seeded red/navy).
    **Brand lock:** only `#e61e2a`, `#000054`, white + their gradients (no gold).
  - **Style = background MIX profile.** The wizard's 4 cards are now `colorMode`
    `gradient`=Signature / `red` / `navy` / `light`, each a weighted panel pool. `ShowcaseStyle.background`
    is **deprecated/ignored** (kept so old stored configs parse); the shapes selector was removed.
  - **Scenes** (`scenes/*`): `statSolo` (NEW — one bold figure per panel: `counter|ticker|gradient|
    typewriter|split`, replacing the 3-up `StatTrioScene` which was deleted); `top3` is a **cycling
    spotlight list** (focus walks 3→2→1 via seeded `--fa/--fd`, pixel arrow) — the podium is gone;
    `project` picks strongly-distinct archetypes per image-count with seeded `flip`/`sheen`.
  - **No camera movement:** the handheld `sc-bob` wiggle and the 4 Ken-Burns pan variants are gone —
    full-bleed images use ONE slow uniform settle-zoom (`sc-still-zoom`). Settled "still" frames stay
    alive via in-place ambient (gradient-text shimmer `sc-shimmer`, solid-type sheen `sc-sheen`,
    pixel shimmer, typewriter caret blink) — none of which move the frame.
  - **New bits/effects:** `bits/ScPixels.tsx` (RMIT pixel-cluster corner decor from `PixelSpec`),
    `ScMaskText` gains `ticker` (slide-through) + `type` (typewriter) effects; transitions are
    `wipeX|wipeUp|push|zoom` (hard cuts, no circle wipe). **Fonts:** Museo on all display type
    (`.sc-display` + headline classes), Helvetica for body/small text (stage default family).
  - **CSS gotcha (unchanged):** `sc-pop` animates the independent `scale`/`filter` channels so a
    card's static `transform: translate()/rotate()` tilt survives the pop. Reduced motion: a var
    block zeroes the motion vars → crossfades; ambient loops (shimmer/sheen/pixel/caret/still-zoom/
    focus pulse) disabled; bars & focus rows fade in place.
- **Viewer:** `ShowcaseViewerPage` — loading / notFound (+local-mode hint) / expired /
  unsupported-version / ready states; controls are ONLY Play (+ Loop switch) and Play-again
  (End scene; Space/Enter also starts/replays). Progress hairline reads the clock via ref (no
  scene re-renders).
- **Migration:** re-run `supabase/schema.sql` (adds `public.showcases` + open RLS). Anon read is
  required — links are public by design.
