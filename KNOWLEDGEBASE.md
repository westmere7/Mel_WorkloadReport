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
  people[], startDate|null, endDate|null, half, size, images[], note?, functionData?,
  createdAt, updatedAt`. ⚠️ Since v0.3.0 the top-level types/assets/dates are the
  COMBINED roll-up across GCMC functions; the per-function slices live in
  `functionData` (null = legacy task, owned by Vietnam Design). See §19.
- **`TaskImage`** — `{ id, url, w, h }`. Up to 10 per task; the `id` is the Storage
  object name (`<id>.webp`), `url` is its public URL. See §15.
- **`TaskInput`** = `Task` without system fields (used for create/update).
- **`AppSettings`** — `{ squads[], campaigns[], types[], people[], assetTypes[],
  functions[], … }`. The user-editable reference lists. `Squad` is now just `string`
  (was a fixed union) — squads are editable like the others. `functions` is the
  GCMC-function config (see §19).
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
  gets per-type deltas (`compare` prop). **Tasks/Assets-by-squad** (the `RankedBars` cards)
  now compare too: each row shows a % `TrendDelta` before the value + a thin source-year
  tick on the bar (subtitle "… (bar)", `squadCompareSuffix`); single-year mode is unchanged.
  Tasks-by-person is still unchanged. The two campaign VBarCharts and the demand
  StackedBarChart render **split columns** (source faded 0.45, left of target) and **hide
  categories not in both years** (inner join). **Match range** (`ytd`, default on) limits
  BOTH years to Jan 1→today for a fair same-period compare (drives `todayMD`); when on, the
  workload chart **zooms its x-axis to Jan→now** (`fillToNow`, hides the "Now" line) so the
  drawn range fills the width. ⚠️ Recharts gotcha: `legendType="none"` did NOT keep faded
  bars out of the Legend — the stacked chart passes an explicit `payload` to `<Legend>`.
- **Task List** (`src/pages/TaskList.tsx`): prominent search, span selector, four
  **multi-select** filters (squad/campaign/people/size), sortable columns, row → edit
  modal, per-row delete, a note **hover icon**, and the **Import & Backup** button.
  **Paginated at `PAGE_SIZE = 50`**: the `filtered` (filter+sort) result is sliced into
  pages and the `<Pagination>` footer shows only when `filtered.length > 50`. `page` resets
  to 1 on any filter/search/sort change (an effect keyed to those, NOT to `tasks`, so a live
  task update doesn't yank your page); `currentPage` is clamped to the page count so a
  shrinking result set never strands an empty page. Header reads "Showing X–Y of N",
  followed by two **filter-set roll-up pills** from a single `summary` memo over `filtered`
  (NOT `paged` — they must not move when you page): total **assets** (bold, tabular-nums)
  and the **date span** `earliest start → latest end` with a `CalendarRange` icon. The
  assets figure sums the same `t.assetTotal` the Assets column prints, so it always
  reconciles with the rows on screen and inherits the function-slice narrowing for free
  (`filtered` descends from `fnTasks`). Dates compare as ISO strings (yyyy-mm-dd = date
  order); null start/end are skipped, and the span pill is dropped entirely when the whole
  set has neither. Both pills sit inside the "no tasks" `else` branch, so an empty result
  shows just "No tasks".
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
- **Settings** (`src/pages/Settings.tsx`), top→bottom — every section a collapsible
  `CollapsibleSection` (open state in localStorage `mwr.settings.*Open`): **Groups** (open by
  default; a master `Card` whose nested editor cards use `className="bg-subtle"` so they
  read as tiles inside the panel), **Dashboard** (chart-display toggles + chart groups),
  **Holidays & closures**, **monday.com boards** (lookup builds only) and **Year snapshots**
  (§16; Create button inside the body) — the last two closed by default; then the
  **Version** card (current `v{__APP_VERSION__}` + a collapsed-by-default "What's new" toggle
  showing the latest release notes only — data in `src/lib/changelog.ts` `APP_VERSION`/`CHANGELOG`;
  to release, bump package.json + prepend an entry). Settings/controls render as tinted `PrefRow`s (`bg-subtle`, `font-medium` title)
  so they read as distinct from the bold `CardHeader`/section titles — don't restyle a setting
  to look like a heading. `PrefRow`/`Switch`/`CollapsibleSection` are the shared building blocks.
- **Groups section**: five `ListEditor`s (**squads**/campaigns/work types/asset types/people)
  with add/rename/remove + a locked **"Others"** fallback row, plus a locked Task-sizes card
  (`SizeDurationsCard`). Squads are rename/remove-locked for **DOM & INTON** (`locked` prop, since
  `stakeholderGroup()` in `lib/analytics.ts` keys the demand chart off those literal names) — BUT
  their auto-select **keywords stay editable**: `ListEditor`'s locked-row branch still renders the
  keyword Tag button (guarded by `onKeywords`), just not rename/remove. At the top of the section is the governance toggle
  **"Allow removing groups already associated with tasks"** (`settings.allowRemoveUsed`, default
  **off**): when off, `ListEditor.requestRemove` **blocks** removing an item with `usage>0` (shows
  a "can't remove — turn on the setting" modal); when on, removing a used item pops the
  reassign-to-"Others" confirm. **Removal ALWAYS confirms now — even a 0-task item** (the
  confirm modal's copy + button switch to a simple "no tasks use it" variant); nothing in the
  Settings lists is deleted without a warning. `MondayBoardsCard` removal likewise confirms. Items shown
  **alphabetically** (`sortAlpha`); `withFallback()` sorts (Others last) so the task form/charts
  list A→Z too. Every capped, scrollable list (`ListEditor`, `FunctionsCard`, `MondayBoardsCard`)
  gets a **bottom scroll-fade hint** via `useScrollFade` (a ref hook, top of Settings.tsx): it
  toggles the `.is-scroll-faded` mask (index.css) on the `<ul>` **only while more content sits below
  the fold** (recomputed on scroll + ResizeObserver + MutationObserver), so the last row is crisp at
  the bottom and unscrollable lists get no fade. The whole page requires sign-in. NOTE: the old **Data backend** card and
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

- **Combined code+name field** (`CodeNameField`, replaces the old two-box row): ONE box holds
  the code as a colour-coded **chip** (green valid / amber legacy / red error; × clears, click
  re-opens for edit) + the name. Typing/pasting `"[26.0608.A] Some name"` lifts the bracket into
  the chip **only when it's a real code** (`parseTaskCode` valid) — misc prefixes like
  `[2026 H2 BPX VE]` stay part of the name — and auto-fills the start date (+ half). The monday
  **auto-fill** button sits inline on the right of this field (see §18).
- **Code notices**: live "wrong format" / "duplicate code" errors; the code is **optional** (if
  present it must be valid & unique). Each field's label carries a red dot, turning **green** when
  auto-filled from monday (`.is-filled`, tracked by `filled: Set` in `TaskForm`; reverts on edit).
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
  When viewing the current (incomplete) year the line is **cut off at "Now"** (nothing drawn
  past the current month). `fillToNow` (`compare ? ytd : true`) then **zooms the x-axis to
  Jan→now** (`xMax = nowFrac`, filtered ticks, task dots remapped via `xScaleMax`) and hides
  the redundant "Now" line, so the elapsed range fills the width. **`useToday()`** (in
  `Dashboard.tsx`, 60s poll) makes every "today"-relative view — match range, the "Now"
  month, the current-year default — refresh at **midnight without a reload** (kiosk-safe).
  `animKey` (compare / `fillToNow` / fitted-scale / data) remounts the areas + dots so their
  L→R entrance replays on any of those changes.
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

## 18. monday.com task lookup (on-demand prefill, NOT sync)

Note: the auto-fill only prefills TASK-level fields (name, code, timeline → master dates,
size, people) — it never touches the per-function tabs (§19), so it's safe alongside the
function rework. `mondayEnabled = isMondayLookupEnabled()` in `TaskForm.tsx`.

An **"auto-fill" button** (monday.com logo, `public/monday.svg`) sits **inline on the right of the
combined code+name field** (`CodeNameField` in `TaskForm.tsx`). Clicking it searches the configured
board for **whatever's in the field (code + name)** and drops the matches **right under the box** —
each row shows name · code · timeline · size, plus loading / "no matches" states. Picking one
prefills **name, code (parsed from the name), timeline → start/end dates, and T-shirt size** (+
derives half). Manual, per-task — **no background sync**; every field stays editable after.

- **Green field dots:** the fields a pick populated get a **green** dot on their label
  (`.task-form .label.is-filled::before`) instead of the default **RMIT-red** dot; editing a field
  reverts its dot to red. Tracked by a `filled: Set<string>` in `TaskForm` (`identity`/`startDate`/
  `endDate`/`size`/`people`), set in `applyMondayHit` and cleared in each field's change handler.
  Optional fields carry a **grey** dot via `.label.is-optional` (Note uses it — it's not required).
- **Result rows** show name · code (only if the item HAS one — no "no code" placeholder) · timeline
  range · resolved people-in-charge (`resolvePeople` prop → `resolvePeopleFromMonday`) · size pill.
- **Submit surfaces missing input:** the Register/Save button is NOT disabled on invalid (only on
  `submitting`/`!dirty`); clicking runs `validate()` and shows the error summary at the top of the
  form ("Please fix the following before saving:"), scrolled into view via `errorsRef`. The old red
  "Use date from code" / "Auto-set from size" apply-buttons under the date inputs were removed (dates
  still auto-fill; the amber "extended" + green "auto-set" notes remain).
- **Never calls monday from the browser** (token exposure + monday blocks browser CORS). The client
  (`src/lib/monday.ts` `searchMonday`) calls a **Supabase Edge Function** `monday-search`
  (`supabase/functions/monday-search/index.ts`, Deno, entry file **`index.ts`**) via
  `getSupabase().functions.invoke`. The function holds the token + board config as **secrets** and
  returns normalized hits `{ id, name, code, startDate, endDate, size }`. Deno → **not** covered by
  the app's `tsc` (`@ts-nocheck`).
- **Matching (function):** tokenizes the query and scores each item by how many tokens appear in
  `name + code`, returning the top ~15 ranked (most tokens matched, then shorter name). ⚠️ Changing
  this file needs a **redeploy** (paste into the Dashboard editor → Deploy).
- **Gating:** the button shows only when `isMondayLookupEnabled()` = Supabase configured **and**
  `VITE_MONDAY_LOOKUP=1` (set it in Vercel env + redeploy for production). Degrades gracefully:
  function unset → `{configured:false}` → `MondayNotConfiguredError`; transport error → readable
  message in the dropdown (never throws). Size labels map to the app enum in `normalizeSize`.
- **Code comes from the item NAME, not a column.** monday item names are prefixed like
  `[26.0716.A] VTAC Social vids…` (the app's own `[code] name` convention). `monday.ts`
  `splitCodeFromName` pulls the bracketed code out and returns the cleaned name, so the board needs
  **no code column** — leave `MONDAY_COL_CODE` unset. (`GCMC & Media Demand Tracker`, board
  `1967557512`: `MONDAY_COL_TIMELINE=timeline__1`, `MONDAY_COL_SIZE=label_mkmfh8ew`, T-shirt labels
  are single letters `M`/etc.)
- **Workload entry confirmation (Report Assets):** `monday-workload` defaults to
  board `1967557512`, column `color_mm72eqm4` (**Report Assets**), target label
  `Entered` (asset input done); `TBC` means not yet entered. `Media NA` is not
  considered entered. This is separate from `status__1` (**Project Status**).
  The archived board is not mapped. The button requires the deployed function
  and frontend `VITE_MONDAY_WORKLOAD=1`; until enabled it shows Setup pending.
  See `supabase/functions/monday-workload/README.md` for deployment and access model.
- **"Persons in charge" auto-fill (person mapping).** The board's Project-team people column
  (`people7__1`, secret `MONDAY_COL_PEOPLE`) returns monday **user ids**; the function parses the
  column `value` (`personsAndTeams`, kind `person`) → `mondayPeopleIds`. Each app person is mapped
  to their monday user id in **Settings → Groups → People** (`MondayIdInput` per person: local edit
  with explicit Save ✓/Enter, Discard ↩/Esc, Clear ×, and a monday.com logo linking to
  `https://rmit.monday.com/users/<id>` for preview), stored in `settings.peopleMondayIds` (name→id,
  new column `people_monday`
  jsonb, guarded write; the store keeps it aligned on rename/remove). `applyMondayHit` reverse-maps
  ids→names via `resolvePeopleFromMonday` (only names still in `settings.people`) and fills the
  People field + green dot. ⚠️ Needs BOTH: re-run `schema.sql` (adds `people_monday`) AND redeploy
  the function with `MONDAY_COL_PEOPLE=people7__1`; before the schema migration the IDs won't persist
  (guarded-dropped on write, read back empty).
- **Setup (all provided by the operator — Claude never handles the token). Either the Supabase
  Dashboard (Edge Functions → create `monday-search` in the editor + add Secrets — no CLI/Docker) or
  the CLI:**
  1. `supabase secrets set MONDAY_TOKEN=… MONDAY_BOARD_ID=… MONDAY_COL_TIMELINE=… MONDAY_COL_SIZE=…`
     (code column omitted — parsed from the name; get column ids from the board via the API playground).
  2. `supabase functions deploy monday-search` (default JWT verify is fine — `functions.invoke` sends
     the anon key, a valid JWT).
  3. Set `VITE_MONDAY_LOOKUP=1` in the app build and restart.
- The function fetches EACH board, filters by name/code substring, returns ≤15 hits ranked across
  all boards; Timeline `value` JSON gives `from`/`to`.
  ⚠️ The query uses `boards(ids: …, state: all)` so **archived (read-only) boards are included** —
  `boards()` defaults to `state: active` and silently drops an archived board + all its items (this
  bit the 2025 archived board: results showed but its tasks were missing). Requires a redeploy.
- **Speed (make it snappy):** three levers, all in `fetchBoardItems`. (1) `PAGE_LIMIT = 500` —
  monday's `items_page` max, so a board is normally ONE request, not five 100-item pages (was the
  main latency). (2) boards fetched **CONCURRENTLY** via `Promise.allSettled` (was a sequential
  `for` loop); a single board's failure no longer sinks the search — it only errors if EVERY board
  fails. (3) a module-level warm-instance **cache** (`boardCache`, TTL `MONDAY_CACHE_TTL` ms, default
  60000, 0 = off) so repeat lookups skip monday entirely while the Edge instance stays warm. Scoring
  is unchanged (tiered code-hit / all-tokens / partial). ⚠️ **Needs a redeploy** to take effect.
- **Multiple boards (added later):** the boards to search are configured in the app —
  `AppSettings.mondayBoardIds` (`monday_boards` jsonb column; seeded `['1967557512','5026397227']`;
  `normalizeMondayBoards` + guarded write; edited in Settings → **monday.com boards** card, shown
  only when `isMondayLookupEnabled()`). `searchMonday(query, boardIds)` sends them in the request
  body; the Edge Function fetches each board (own cursor, in parallel) and merges results. `MONDAY_BOARD_ID` is now
  just a comma-separated FALLBACK when the request omits `boardIds`. ⚠️ **Column ids must be the SAME
  across the searched boards** (they're one shared secret set). Two operator actions to enable
  2-board search: (1) redeploy `monday-search` (else it ignores `boardIds` and uses the secret's
  board); (2) re-run `schema.sql` for `monday_boards` so board-list EDITS persist (until then the
  client still sends the DEFAULT two boards, so search works — only editing the list doesn't stick).

---

## 19. GCMC functions (per-function workload slices) ⚠️ v0.3.0

The big task-input revision: each GCMC function — **Vietnam Design, Melbourne Design,
Production, Contents** — records its OWN work types, asset counts and (optional)
timeline on a task, via colour-coded tabs in the task form.

### The load-bearing design decision

Per-function data rides **alongside** the existing top-level fields, not instead of
them. On save, the form recomputes the top-level `types` (union), `assetBreakdown` /
`assetTotal` (merged sums) and `startDate`/`endDate` (envelope) from the enabled tabs.
Every chart / CSV / showcase / snapshot consumer keeps reading the top-level fields —
**the dashboard shows everything combined and needed ZERO changes.** Per-function
dashboard views (incl. the "VN+Mel = one Design team, with isolate" rule) are a
LATER phase; the data is already captured for it.

### Data model

- `Task.functionData?: FunctionData | null` — `Record<functionName, FunctionEntry>`;
  `FunctionEntry = { types[], assetBreakdown, assetTotal, timelineOn, startDate, endDate }`
  (`src/types.ts`). **`null`/absent = LEGACY task** recorded before functions existed —
  treated as belonging entirely to the legacy owner (see below) and **upgraded lazily**:
  it only gains `functionData` when someone edits AND saves it. No backfill ever runs.
- `AppSettings.functions: FunctionConfig[]` — `{ name, color, workTypes[],
  assetTypes[] }`. ⚠️ The type lists are **INCLUSIONS** ("offered on this tab") — only
  listed types appear (intersected with the live master list). **Newly added master types
  do NOT auto-appear** on any tab; the user opts each function in from Settings. (This
  replaced an earlier EXCLUSION model — users wanted to assign new types themselves.) To
  keep inclusion lists from drifting: `normalizeFunctions(raw, masterWorkTypes,
  masterAssetTypes)` intersects stored lists with the master on every read AND migrates
  legacy `hiddenWorkTypes`/`hiddenAssetTypes` (empty hidden → all master); the store's
  `renameListItem`/`removeListItem` rewrite/drop the renamed-or-removed type inside every
  function's inclusion list; `renameFunction`'s merge-on-collision UNIONS the two lists.
  A new function (Settings) seeds `workTypes`/`assetTypes` from the CURRENT master lists.
- `LEGACY_FUNCTION = 'Vietnam Design'` + `legacyOwnerName(functions)` (constants):
  legacy tasks belong to the function named Vietnam Design, falling back to the first
  configured function if it was renamed. `functionColor()` / `FUNCTION_COLORS` map the
  stored color key (red/teal/gold/green/plum) to dot/tab/ring Tailwind classes.
- Normalizers: `normalizeFunctions` (settings), `normalizeFunctionData` (task column) —
  both junk-tolerant, applied at every read.

### Persistence

- `tasks.function_data jsonb` (null = legacy) + `settings.functions jsonb` — both
  idempotent alters in `schema.sql` (§10 pattern) with guarded-write strip-and-retry
  (`isMissingFunctionDataColumn` / `isMissingFunctionsColumn`) in create / createMany /
  update / restoreTasks / saveSettings, so the app works before the migration runs.
- Renames stay linked EVERYWHERE: `repo.renameValue` gained `'functionData'` (function
  rename → rewrites the map key on every task, merging entries on collision), and the
  existing `'types'` / `'assetBreakdown'` renames ALSO rewrite the nested per-function
  entries (`src/lib/functionData.ts` holds the pure transforms, shared by both repos).
- Store: `renameFunction` / `removeFunction` / `functionUsage(name)` (legacy tasks count
  toward the legacy owner). **Removal is ALWAYS blocked while a function has task data**
  (no fallback exists for per-function data) — independent of the Groups toggle.
- CSV merge-import: rows carry no slices, so a matched task KEEPS its `functionData` when
  the import didn't change its combined types/assets; otherwise the slices are dropped
  (task reverts to legacy). Replace-mode imports are all legacy.

### Task form (`TaskForm.tsx`)

- Fixed sections: identity + squad/campaign/size (size stays whole-task), Assignment,
  master Timeline. **Demo Images moved to the footer, left of "Remove task"** (task-level,
  not per-function).
- "Workload by function" section: **filled-tab tabs over a clean rounded-rectangle panel.**
  The panel is an untouched `rounded-xl border-2 bg-card` rectangle outlined in the active
  function's colour (`functionColor().outline`). The ACTIVE tab is a **solid chip filled with
  the function's colour** (inline `backgroundColor/borderColor: functionColor().hex`, text/knob
  colour via `readableOn(hex)` so gold gets dark text) that rides the panel's top edge
  (`-mb-0.5` 2px overlap, `z-10`, `rounded-t-lg`); because the chip fill and the panel border
  are the SAME colour, the overlap is seamless — there is NO shared-outline junction to glitch
  (this replaced an earlier Chrome-shoulder/fillet attempt that glitched at the corners).
  Inactive tabs are neutral pills (`border-line bg-subtle`), no dots. The per-function on/off
  **switch carries the function's colour** when on for inactive tabs (`functionColor().dot`);
  on the active (already-coloured) chip the switch track/knob use a translucent `readableOn`
  colour so they stay legible. **Disabled tabs can't be selected** — the name button is
  `disabled`, only the switch works — and there is NO disabled/dashed "not recording" panel.
  `FUNCTION_COLORS` (constants) is **hex-only** — one deliberately DARKENED/subdued hex per key
  (red `#C41E2A`, teal `#0E7C99`, gold `#B7791F`, green `#3F8E3A`, plum `#7A4E91`; all luminance
  < 0.6 so `readableOn` → white on every fill), rendered everywhere via INLINE styles (function
  dots in Settings + the dashboard filter, the panel border, the filled chip, the on-switch
  track) — decoupled from the brighter `accent-*` chart palette. Section dividers: the task
  form's `Section` takes `divider={false}` (keeps top spacing, drops the border line) — used on
  Assignment and Timeline so there's no separator after Workload-by-function or before Timeline.
  **When no function is enabled the panel is hidden — only the bare tab pills show.** `activeFn`
  invariant: only ever an ENABLED function or `''`; `disableFn()` reassigns it when the active
  one is switched off; enabling a function selects it. **Single row, no wrap/scroll:** the strip
  is `flex items-end px-3` and every tab is `flex-1 min-w-0`, so tabs share the row evenly and
  shrink to fit — they never overflow the modal or wrap to a 2nd line (earlier tries at wrapping
  + moving the active chip to the bottom row, and at horizontal scrolling, were both scrapped for
  this). Each tab's name sits in a `.tab-marquee` slot (`index.css`): clipped with a soft right
  fade and **auto-scrolls on hover** to reveal the tail — a per-tab `--marquee-shift` CSS var
  (= `min(0, slotWidth − textWidth)`, set by a ResizeObserver effect on the strip via
  `tabStripRef`) drives the scroll distance, so it adapts to the dynamic slot width and only
  scrolls when actually clipped. The on/off switch is a `shrink-0` sibling — always visible.
  `FUNCTION_COLORS` is `hex`-only (raw colour for inline fills).
  Per-tab state lives in `fnDrafts: Record<string, FnDraft>`; disabled drafts KEEP their
  values in form state (re-enable restores) but are stripped at submit. **Toggling OFF a
  tab with values opens a confirm modal.** Per tab: work-type badges + asset counters
  (the function's INCLUSION lists intersected with the live master lists, plus any values
  the task already has), a per-tab total chip, and a timeline switch (off = follows the
  master timeline).
- **Inline "+ Add" type (from the task form)**: each tab's Work-type and Asset rows end with
  an `AddTypeInline` combobox — PICK a master type this tab doesn't offer yet, or type a
  brand-new name to CREATE one. Both call `saveSettings` immediately (independent of the task
  submit): a new name is appended to the master list (`settings.types`/`assetTypes`) AND the
  active function is opted into it (`FunctionConfig.workTypes`/`assetTypes`), so it PROPAGATES
  to Settings without leaving the form. Work types are also selected on the draft; assets just
  gain a 0-count counter. Candidates = master types minus what the tab already shows (fallback
  excluded); a name that already exists shows "Already on this tab" instead of a create option.
  Needs `saveSettings` from the store (added to TaskForm's `useStore`). Existing tasks are
  never touched — this only grows the offered lists.
- **"+ Add" also surfaces what "Hide unused" is hiding** ⚠️ — otherwise a type the tab
  DOES offer is invisible in both places at once (filtered out of the pills, and excluded
  from the candidates because the tab already has it), so a user can't tell "hidden" from
  "doesn't exist" and re-creates a duplicate. `AddTypeInline` takes a second list,
  `hiddenOnTab` = `tabTypes/tabAssets` minus `shownTypes/shownAssets`, rendered FIRST under
  a "Hidden on this tab" header with an `EyeOff` icon, then a hairline, then the ordinary
  master candidates. Enter picks from the hidden group first (`firstHit`). Because the
  hidden list is derived by subtracting the *shown* list, it collapses to `[]` when the
  switch is OFF — the picker is then exactly the old master-minus-tab list, no special
  casing. Picking a hidden entry writes NOTHING to Settings (the tab already offers it);
  both add handlers now compare `nextTypes`/`nextFns` by identity and skip `saveSettings`
  when nothing changed. Un-hiding happens through the existing mechanisms: a work type is
  toggled onto the draft (so it counts as used), an asset gets `pinnedAsset` (shown +
  focused at 0, released on blur). Note the fallback "Others" can itself be hidden, and is
  listed here — otherwise it becomes unreachable while the switch is on.
- **Master-timeline envelope**: the Start/End inputs display
  `effectiveStart/effectiveEnd` = the entered dates extended by any enabled function
  timeline that reaches outside them; extended inputs get an amber ring + "Extended to
  cover X's timeline" note. The ENVELOPE is what's saved. Validation and the dirty
  signature both use the effective dates; `taskSignature` gained a `functions` field
  (via `functionDataSignature`), and a legacy task's initial signature uses
  `legacyFunctionData()` so opening one is NOT dirty.
- Validation additions: ≥1 enabled tab; each enabled tab needs ≥1 work type; a
  switched-on function timeline needs both dates in order.
- **Duplicate code**: was already blocked; now `dupTask` also renders an "Edit the
  existing task instead — …" button (prop `onOpenExisting`). `NewTaskProvider`
  (`NewTaskModal.tsx`) implements the handoff with its own edit modal.
- **monday auto-fill is enabled** and only fills task-level fields (§18) — it never
  touches the function tabs, so it composes with the rework.
- Function-name display: prose/status **messages, tooltips and validation** append
  " Team" to the function name (e.g. "Production Team isn't recording…", "Enable VN
  Design Team", "Extended to cover … Team's timeline"); the compact tab chips and
  "— {function}" field labels stay the short raw name.

### Dashboard function filter (added later the same day)

- The top-bar's static year badge (Layout) and the "Live" badge (Dashboard's left header
  slot) were REMOVED; the left slot now holds **`FunctionFilter`** (bottom of
  `Dashboard.tsx`) — a dropdown of toggleable function items with **"All GCMC"** on top.
  All GCMC = empty selection = the landing default; while active the function items render
  greyed (`opacity-50`, still clickable → switches to that one function). Toggling
  functions multi-selects; deselecting the last one or selecting ALL of them snaps back to
  All GCMC. Button shows selected functions' colour dots + label.
- Filtering is done by **`sliceTasksByFunctions(tasks, selected, functions)`**
  (`src/lib/functionData.ts`): empty selection returns tasks untouched (combined view);
  otherwise each task is projected to the SUM of only the selected functions' slices
  (types union, breakdown/total summed) — so shared tasks count a function's real
  contribution, not the whole task. Legacy tasks follow the legacy owner. A slice's own
  timeline (when on) drives the projected dates. Applied ONCE as `fnTasks` at the top of
  the Dashboard pipeline — `filtered`, `sourceTasks`, `byMonth`, `chartYearTasks`,
  `srcByMonth` all read it, so span/compare/match-range compose with it untouched. `years`
  stays on ALL tasks (stable year selector).
- Empty-data messaging: when a selection is active, every chart's `emptyMessage` becomes
  "No workload recorded for {fn} Team in this view yet." (`fnEmpty` overrides the generic
  "add tasks" nudges) — functions without data yet show that instead of blank charts.

### Settings (`Settings.tsx`)

- **Functions card**: add (picks the first unused colour) / rename (via
  `store.renameFunction`) / remove (blocked-with-modal while in use, else a confirm modal);
  expanding a row reveals the colour picker + `TypePicker` chip grids (**checked = INCLUDED/
  offered on the tab**; `TypePicker` takes `included` + `on = included.includes(t)`). Legacy
  count shows on the legacy owner (e.g. "185 tasks" = the whole pre-function history).
- Work types and Asset types share ONE 2-tabbed **"Types"** card (`TypesCard`, tabs "Work types"
  / "Asset types"), each tab rendering a `ListEditor` with the `bare` + `hideHeading` props
  (renders without its own Card wrapper). All Settings list panels are height-capped +
  scrollable (`max-h-*` + `overflow-y-auto`).

### Squad / Campaign auto-select keywords

- **Data**: `AppSettings.squadKeywords` / `campaignKeywords` = `Record<name, string[]>`
  (`squad_keywords` / `campaign_keywords` jsonb columns; `normalizeKeywordMap` +
  `parseKeywords` in constants; guarded write via `isMissingKeywordsColumn` strips BOTH
  keys and retries). Store `renameListItem`/`removeListItem` carry/drop a squad/campaign's
  keyword entry alongside the rename/remove (mirrors `peopleMondayIds`).
- **Settings UI**: `ListEditor` gained `keywords` + `onKeywords`; each squad/campaign row shows
  a **Tag button** (green dot when set) opening a modal that edits a comma-separated list
  (`parseKeywords` → deduped array; empty = entry removed). Wired only on the Squads & Campaigns
  cards (`setKeywords('squadKeywords'|'campaignKeywords', …)` in `SettingsPage`).
- **Task form**: two effects call `matchByKeywords(name, map, orderList)` (constants — first
  list item whose keyword is a case-insensitive substring of the name; null on no match) and
  `setSquad`/`setCampaign` on a hit. They ONLY set on a match (never clear — "ignore if no
  match"), and stop once the user picks by hand: `squadTouched`/`campaignTouched` start
  `Boolean(initial)` (editing = pre-touched so a saved value is never overridden) and flip
  true in the selects' `onChange`.
- **Persistence**: the `squad_keywords` / `campaign_keywords` jsonb columns are MIGRATED (operator
  ran `schema.sql`) — keywords now persist across reloads (verified: a set keyword survived a full
  reload). The guarded-write strip + `isMissingKeywordsColumn` stays as a safety net for any
  un-migrated environment. Auto-select verified end-to-end: a name containing a keyword selects the
  squad/campaign and sticks (the effect only sets on a match, never clears).

### Testing gotchas (browser evals)

- The tab-strip switches and the in-tab timeline switch are both `role="switch"` —
  exclude the tab body via `closest('div.rounded-xl.border.p-4')` to hit the strip.
- `aria-checked` reads STALE in the same eval tick as the click (React re-render) —
  read it in a separate eval.
- The Browser-pane console buffer persists across reloads AND dev-server restarts —
  old HMR errors linger; verify with a live `window.__errCount` probe instead.

## 20. Asset output rates & Effort mode ⚠️ v0.8.0–0.9.0

### The problem it solves

Counting assets flatters whoever makes the quickest ones: 300 photo edits and 10
banners read as a 30:1 difference in output even when the banners took longer.
Effort re-weights every deliverable by how long its **asset type** takes.

### Data model

- `AssetRate = { qty, every, per: 'hour'|'day'|'week' }` — "qty assets per `every`
  `per`", e.g. `{qty:1, every:2, per:'week'}` = 1 per 2 weeks.
- `AppSettings.assetRates: Record<assetTypeName, AssetRate>` — **name-keyed**, so
  renames rewrite keys and removals drop them (`store.tsx` rename/remove paths,
  mirroring `chartGroups` / `peopleMondayIds`).
- **An unset rate is an ABSENT key, never a stored 0.** `normalizeAssetRates()`
  drops non-positive/non-finite entries, so "not specified" has one representation.
- Column: `settings.asset_rates jsonb default '{}'` + an
  `isMissingAssetRatesColumn` retry guard in `supabaseRepository`, following the
  established pre-migration strip-and-retry pattern.

### Effort is DERIVED, never stored ⚠️

`src/lib/effort.ts` computes at render time — `taskEffortHours`,
`effortByAssetType`, `unratedTypesWithVolume`, `formatHours`. No task field,
stored total, CSV column or snapshot is affected, so editing a rate **re-reads**
history rather than rewriting it. Unrated types contribute **0** and are reported,
never guessed. `FALLBACK_ITEM` ("Others") is deliberately excluded from the
unrated warning — it's a mixed bag by definition, so a rate for it is meaningless.

### The measurement switch

- `dashboardPrefs.workloadUnit: 'assets'|'effort'` — **per browser**, so one
  person's view never changes a colleague's. Only offered when ≥1 rate exists.
- Lives in the header **left slot beside the function filter** (both re-scope the
  whole dashboard). Active `Assets` = navy; active `Effort` = **RMIT red**, so the
  fill doubles as an "off the default measure" signal.
- ⚠️ **The header slot is pushed via `setHeaderSlots` in a `useEffect`** — any state
  the slot renders MUST be in that effect's dep array (`workloadUnit`,
  `ratesConfigured`, `effortOn`, `unratedInScope.length`). Omitting them leaves a
  stale closure: clicks update the pref and the body re-renders, but the buttons
  never do, so the switch looks broken.
- ⚠️ `Layout` renders the left slot **twice** (desktop `hidden sm:flex`, mobile
  `sm:hidden`), so there are always 2× the buttons in the DOM. Filter on
  `offsetParent !== null` when testing.

### What Effort changes

1. **Workload chart** → weighted hours. `AreaTrendChart` gained `taskValue` (the
   scatter dots share the line's y-axis, so they must be valued the same way) and
   `hideYLabels` (hours are modelled, so the shape is the story, not the height).
   `analytics.valueByMonth(tasks, value)` / `valueBySize(tasks, value)` are the
   parameterized versions; `assetsByMonth` / `countBySize` are thin wrappers, so
   Assets mode is provably the same code path as before.
2. **Hero cards** → `VolumeCompactCard` + `EffortSummaryCard` (`EffortStats.tsx`).
   Volume keeps the counts (demoted, side by side, with an assets-by-task-size
   bar); Effort leads with total hours, hours per asset, and a **Top 3 time
   consumers** list. Grid becomes `2xl:grid-cols-[1.4fr_1.05fr_1fr_1fr]`.
3. Everything else — by-squad, mixes, demand, campaign, exports — still counts
   each asset as 1.

### Layout gotchas learned here ⚠️

- **`container-type: size` implies `contain: size`** — the card then ignores its
  own content when sizing, so a short grid row **clips** the content instead of
  growing. Use `inline-size` and width-based `cqw` only.
- `clamp()`'s **maximum** silently caps container-query sizing — figures looked
  small because of a 6rem cap, not the `cqw` factor.
- cq units resolve against the **content box**, and a side-by-side figure only
  gets half of it → ~17cqw is the ceiling for a 5-glyph number.
- Aligning figures across two cards needs a **fixed** header box, not `min-h`: the
  narrower card's subtitle wraps to 2 lines and pushes everything below it down.
  `HEADER_BOX = 'h-[3.75rem] [&>div>p]:line-clamp-2'`.
- ⚠️ That clamp was originally `[&_p]` — a **descendant** selector, which also
  clamped the paragraphs of the `PanelInfo` modal, because `PanelInfo` renders its
  dialog **inside** the card header (as part of `action`). Scope to `[&>div>p]`.
- `flex-1` on a list without a `max-h` lets it grow to full content height. Panels
  align via grid stretch + `flex-1` **and** `max-h-[34rem]` together.

## 21. Per-panel help & the Help guide ⚠️ v0.8.0–0.9.0

- **`components/PanelInfo.tsx`** — a `?` in a card header opening a dialog with
  **What this shows / What it means for the team / For example / Keep in mind**.
  All copy lives in one `PANEL_INFO` registry so the 9 panels stay consistent;
  a panel needs one line: `action={<PanelInfo panel="assetMix" />}`.
  Section bodies accept a string, or labelled `{lead, text}` bullets for the long
  ones (workload, effort) so they scan instead of walling up.
- **`components/EffortInfoModal.tsx`** — a *separate*, richer dialog for the
  **switch** (Assets vs Effort side by side, the to-scale rate comparison, and an
  "Edit output rates" button). The Effort **panel** uses the standard `PanelInfo`;
  the header **switch** uses this one. Don't conflate them.
- **`pages/Help.tsx`** (`/help`, public, sidebar above Showcase, `BookOpen` icon) —
  the full manual, laid out as docs: 3 part **tabs**, a sticky **scroll-spy** TOC
  (`[data-toc]` + `IntersectionObserver`), anchored subsections, and inline
  **cross-links** that switch tabs then scroll (`ANCHOR_PART` maps anchor → part).
  `#hash` deep links open the right tab on mount.
- **Screenshots**: `public/help/*.png`, generated by **`scripts/capture-help.mjs`**
  (Playwright, headless, drives the *running* dev server, signs in via a seeded
  `mwr.session` localStorage entry). Element crops at 2× DPR, not viewport grabs.
  Re-run after a visual redesign: `node scripts/capture-help.mjs`.
  `data-help="…"` attributes in `TaskForm`/`Dashboard` are **stable capture
  anchors** — don't remove them.

## 22. Removed: "Tasks by person" ⚠️ v0.9.0

The dashboard panel, its `showTasksByPerson` pref, the Settings toggle and the
now-orphaned `HBarChart` (+ its `AXIS_STRONG` const) are **gone**. Per-person data
is still tracked: `people` on tasks, the task-list person filter and `?person=`
deep links, the CSV `People` column, and `analytics.assetsByPerson()` which still
feeds the Showcase's **"Busiest people"** stat. A stale
`showTasksByPerson: true` in localStorage is inert.

## 23. Advisor — REMOVED

The Advisor (generated plain-English briefing: `pages/Advisor.tsx`, `lib/advisor/*`,
`components/advisor/*`, the `advisor` Edge Function, Settings → Advisor brief, the
dashboard's `window.__advisor` hook, `advisorPrompt` setting, advisor cache repo methods,
WIP-bar CSS) was removed entirely. `schema.sql` no longer creates `advisor_cache` or
`settings.advisor_prompt`; existing DB objects are left in place (harmless, unused) — drop
them by hand if wanted. The deployed `advisor` Edge Function + its secrets can be deleted
in the Supabase dashboard. `/advisor` falls through to the dashboard. Old changelog
entries still mention it (history).

## 24. Per-card full screen ⚠️

`src/components/CardPresenter.tsx` + `PanelExpand.tsx`, geometry in `src/lib/present.ts`.

- **What it is**: hovering a dashboard card reveals a small full-screen control beside
  the "?"; clicking it lifts that card out of the grid onto the whole content column
  under its own title (no sub-caption). Escape, the Close button or the backdrop puts
  it back. The card stays LIVE — same React tree, charts still hoverable — because
  `presentCards()` moves and scales the existing DOM node with inline styles and a
  `transform`, not a re-render.
- **⚠️ It fills first, then magnifies.** The card is laid out at
  `min(column, APP_MAX_LW)` (1120 ≈ a full-width card on a 1440 screen) so it is 1:1
  there and scaled up on anything wider — ~1.5x at 2000px. Uncapped, a 1680px layout
  left 12px legend text at 12px and the container-query stat figures resolved to
  ~400px tall, pushing the card past its area. `isFitCard()` (by panel title: Volume,
  Asset count, Effort, Task count, Tasks/Assets by squad) marks the content-sized cards
  that shrink-wrap and centre instead of stretching into a tall, empty box.
- **⚠️ A `fit` card's height must be re-measured, not taken once.** Its content is
  still moving when it arrives: its `cqw` figures re-resolve at the new width, and a
  presented panel may show more rows than it did in the grid. Freezing the first measurement left content spilling out of the card — up
  to 1483px on a 2000px screen. `presentCards` keeps a ResizeObserver and re-applies
  scale and top from `offsetHeight`, which ignores transforms, so it can't feed back.
  `allowShrink` lets such a card go below 1:1 rather than overflow.
- **Panels show MORE when presented, not just bigger**: `useIsPresented(ref)` (true
  when the ref sits inside the presented card) drives it — the Effort card lists 12
  time consumers instead of 3, and `DonutChart` grows its ring from the fixed 180px up
  to `RING_MAX` 460 with the centre label tracking it. ⚠️ The ring's column must get
  `self-stretch` when presented: its parent row is `items-center`, so it otherwise
  hugs its content and the measured height IS the ring's — it could never grow.
- **⚠️ `Modal` is portalled to `<body>`** (`ui/Modal.tsx`). `PanelInfo` renders its
  dialog inside the card, and `position: fixed` resolves against the nearest
  TRANSFORMED ancestor — so a card that is scaled (on hover, or presented) would trap
  its own dialog inside itself. React events still bubble through
  the React tree, so callers are unaffected.
- **Hover affordances**: every header control — the "?", the full-screen button, the
  Group switch, the demand chart's type tabs — carries `.panel-action` and is hidden
  until the card is hovered or something inside it is focused (always visible where
  there is no hover, i.e. touch). Cards lift by `scale(1.008)` on hover, scoped to
  `main[data-page='/']`: it means "this opens full screen", so the task list's filter
  panel and table — cards too — must not move.
- **⚠️ Scaled cards and pointer maths.** Anything that converts client pixels into a
  chart's own coordinate space must divide by the measured scale, or it is wrong by the
  scale factor and increasingly so away from the element's top-left corner.
  `TaskDotsLayer` (`charts.tsx`) hit-tests the workload dots this way; on a presented
  card it was picking the wrong task by up to ~200px at the right-hand edge. `toUser()`
  derives the ratio from the hit rect itself — `sx = box.width / width`, where `box` is
  the client rect (visual px) and `width` is the rect's user-space width — which is
  exactly 1 on the unscaled dashboard (a mathematical no-op there) and equals the card
  scale when presented. Prefer that ratio over reading the ancestor's `transform`: it
  also absorbs page zoom and any future wrapper. `ResponsiveContainer` and
  `useContainerWidth` are NOT affected — they measure the layout box via
  ResizeObserver/`getBoundingClientRect`, and recharts lays the SVG out in logical px.
- **Removed (Sep 2026): Demo mode.** A click-through presentation of the live dashboard
  (`lib/demo.tsx`, `components/demo/*`, the `html[data-demo]` CSS, the sidebar's Demo
  button and its Space/→/Esc shortcuts, `previewTheme()`/`storedTheme()` in theme.ts,
  `isAnyModalOpen()` in Modal.tsx, and the grow-from-zero intro hooks in charts,
  EffortStats and AnimatedNumber) was built for a one-off presentation and taken out
  once it was over. The per-card full screen above is what survives of it: the
  `presentCards()` geometry, `.present-card`, `toUser()` and the Modal portal were all
  lessons from the demo. Advisor and Showcase went back into the sidebar nav (their slot
  had been the Demo button); Help §08 says "bottom of the sidebar" again.


## 25. Calendar page & holidays ⚠️

`src/pages/Calendar.tsx` (route `/calendar`, nav item between Task List and Settings),
`src/lib/calendar.ts` (per-day load), `src/lib/holidays.ts` (public holidays), and the
**Holidays & closures** card in Settings (`HolidaysCard`).

- **What it shows**: a year as 12 month grids, one cell per day, coloured by the work
  active that day — Tasks (count), Assets or Effort (only when rates exist). A task's
  assets/effort are spread EVENLY across its span, so the calendar shows where the work
  sat, not when it was booked. Drafts are excluded, like the dashboard. Hover a day →
  the side panel lists its holidays and tasks (heaviest first); hover a task → every day
  of its span rings in navy; hovering a day alone rings the union of its tasks' spans
  faintly; click a day to pin it; click a task → the Task details modal.
- **Colour**: an orange→red ramp (`HEAT` in calendar.ts), pale orange tint → RMIT
  orange `#F58220` → RMIT red `#E61E2A`, dark ink on the orange steps and white once it
  turns red. ⚠️ Hue AND lightness change between steps on purpose — a red-only ramp was
  tried first and neighbouring shades could not be told apart on a 20px cell; a brown
  top step separated but read as off-brand. Six steps, not more: with the Tasks unit
  the values are small integers, so more bands than distinct values just sit empty.
  ⚠️ **Dark mode has its own ramp** (`HEAT_DARK`), not the light one dimmed: deep maroon
  a step above the navy card → bright coral `#ff5a5a`, so quiet days sink into the
  background and busy ones glow. The light ramp's pale tints go washed-out pink on
  navy, and a dark low end would read backwards on white — so `heatColor(level, dark)`
  / `heatInk(level, dark)` take the theme from `useTheme()`. ⚠️ Toggling the `dark`
  class on `<html>` directly (e.g. in a test) does NOT switch the ramp — the theme
  store only notifies through `apply()`; use the header toggle.
  ⚠️ Levels are RANK-based (quantile bands), not proportional: tasks run for weeks, so
  most days sit near the maximum and a proportional scale came out one solid colour; a
  square-root scale made it WORSE (it lifts low values). Integer ties can still merge a
  band, so 5 of 6 shades in use is expected. Days after today are faded to 18% — a plan,
  not a record — and return to full strength when highlighted, hovered or pinned. The
  date number is deliberately small (0.34 of the cell): the colour is the data. Holiday
  markers avoid the ramp and are **clipped corners** of the cell (`HolidayCorner`, a
  `clip-path` triangle 0.4 of the cell, min 5 px; the cell is `overflow-hidden` so it
  follows the rounded edge): top-LEFT gold = Vietnam, top-RIGHT navy = Melbourne — the
  side alone tells them apart, and both can show on one day. Dashed navy outline = RMIT
  closure. (Replaced the earlier pair of 5 px dots, which were hard to see and merged
  when both regions fell on one day.)
- **Weeks start Monday** (`WEEKDAYS` Mon→Sun; `monthCells` places the 1st by
  `(getUTCDay() + 6) % 7`). A **Fade weekends** toggle in the header (remembered in
  `mwr.calendar.fadeWeekends`) drops Saturday and Sunday cells — and their column
  labels — to 35% opacity, gentler than the 18% future fade so they stay readable but
  secondary. ⚠️ Fade, not hide: a first cut removed the two columns, which also
  removed the weekend-only holidays (Saturday before Easter, the folded-in Tết weekend
  days) and reshaped every month; fading keeps the grid's shape and all 365 days. A
  faded cell returns to full strength when highlighted, hovered or pinned, same as a
  future day.
- **Fits the viewport instead of scrolling** (`useFitCells`): at `xl` and up the page is
  one viewport tall, the card fills it, and the day-cell size is computed from BOTH the
  grid's width and height, subtracting gaps and month headers, so all twelve months fit.
  ⚠️ It tries 4, 3 and 2 month columns and keeps whichever gives the LARGEST cell — a
  width breakpoint alone chose 3 columns (4 rows) at 1440×900, where height was the
  binding constraint, and drove the cells to the 16px floor; 4 columns fits at 21px.
  When cells would fall below 21px it drops the weekday label row to buy them height
  (`fit.weekdays`). Measured: 21px at 1440×900, 32px at 1920×1080, 16px at 1280×800 —
  all without scrolling. Below `xl` the calendar stacks above the panel and only width
  constrains, so it scrolls; cells never drop below 16px because scrolling beats an
  illegible calendar. The side panel is 300px at `xl`, 340px at `2xl`. ⚠️ The spacing
  constants at the top of Calendar.tsx must match the JSX gaps or the fit is off by a
  few pixels and the last row scrolls.
- **⚠️ The hovered day must survive the pointer leaving the grid.** The first cut reset
  it on the grid's `mouseleave`, which fired the moment you moved toward the side
  panel — so a task row could never be hovered without pinning first. The day now stays
  until another is hovered; only the hovered TASK clears on leaving the list.
- **Holidays**: Victoria is computed by RULE (nth weekday, Easter algorithm, weekend
  substitutes for New Year / Australia Day, additional days for Christmas/Boxing Day —
  cross-checked against RMIT's page: Boxing Day additional = Mon 28 Dec 2026). The one
  gazetted-by-year VIC holiday, Grand Final Friday, is a TABLE (2023–26) with a
  last-Friday-of-September fallback flagged provisional. Vietnam's lunar holidays can't
  be computed, so `VIETNAM` is a table of the official announced PERIODS (whole break
  incl. folded weekends) for 2024–26, with 2027 = the Ministry's proposal, flagged
  provisional; off-table years get fixed-date holidays only. RMIT closure = 25 Dec–1 Jan
  (published for 2025 & 2026; assumed thereafter, flagged). Sources are in the file
  header. ⚠️ Add a row to `VIETNAM` and `GRAND_FINAL_FRIDAY` each autumn when the next
  year is gazetted — `vietnamConfirmed()` drives the "(provisional)" legend note.
- **Team holidays** (`AppSettings.customHolidays`, column `settings.custom_holidays`
  jsonb): any day or run of days, scoped Whole team / Melbourne / Vietnam, added and
  removed in Settings → Holidays & closures. `normalizeCustomHolidays()` (holidays.ts)
  is the single validator used by BOTH repositories — it drops malformed rows and
  repairs `end < start` rather than letting one bad entry take the calendar down.
  Follows the usual migration pattern: `isMissingCustomHolidaysColumn` retries the
  upsert without it, and `saveSettings` falls back to the in-memory value so a holiday
  added before the column exists stays on screen (it won't persist until
  `schema.sql` is re-run — the ALTER is in there).

---

## 26. monday.com Item View (`/embed/item`) — "Assets" tab ⚠️ DEMO ON REAL DATA

The "Assets" tab of a monday item: the task's asset LINES, live and shared. Still a demo
until IT approves the private monday app (Item View feature) — meanwhile it runs on the
REAL database via plain monday Embed widgets. `src/pages/MondayItemView.tsx` +
`mondayItemView.css`, logic in `src/lib/assetLines.ts`; routed in `App.tsx` OUTSIDE the
app shell, inside `StoreProvider` only (live tasks, no Layout).

- **Two links.** GENERIC `/embed/item` → "Show a task's assets": a task LOOKUP — monday
  item ID or link, exact task code, or part of the code/name (live suggestions, codes
  first, max 8); Enter opens the exact/only match; "Recent" (`mwr.itemAssets.recent`, by
  task id; older entries by item id). ANY task opens — 231 of 400 tasks had no monday
  link, and boards are keyed by task id anyway. TASK-SPECIFIC links via `assetsTabUrl(
  mondayUrl, taskId)`: `?itemId=<monday id>` when linked, else `?task=<task id>` (task
  form footer `ListChecks` icon — any saved task; ⋯ → Copy link). ⋯ → Change task returns
  to the lookup (not when monday's app context supplies the item). `&theme=dark|black`.
- **monday link from the tab:** unlinked tasks show "Not linked to monday.com · Link it";
  ⋯ → Link / Change monday.com link (+ Open in monday.com when linked). `MondayLinkSheet`
  takes a pasted item link (kept as-is) or a bare ID (→ `https://rmit.monday.com/pulses/<id>`),
  refuses an item already linked to another task, and saves `mondayUrl` on the dashboard
  task via `store.updateTask` (edit log: "monday.com link updated/removed"); Unlink clears it.
  `MondayMark` (monday logo, colour = linked, greyed = not) sits in the task bar and on every
  lookup/Recent row.
- **Plain Embed widget ≠ app:** an embed never gets monday's SDK context (no item id /
  theme) — hence the ID box. The installed app will supply `itemId` + `theme` itself.
- **Storage:** table `task_asset_lines` (task_id PK → tasks ON DELETE CASCADE, `board`
  jsonb, realtime publication). Board = `{ lines, groups, tracker, basis, fromBasis, rev, by }`.
  Repository: `getTask`, `getAssetBoard`, `saveAssetBoardIf` (compare-and-swap on
  `board->>rev`; insert for the first save, 23505 = lost the race), `subscribeAssetBoard`
  (Local: `mwr.assetBoards` + storage events — NOT atomic across tabs, so concurrency
  can only be tested on Supabase). Missing table → `AssetLinesNotSetUpError` → READ-ONLY
  banner. Editing is off until the board has loaded. Not in year snapshots.
- **Invariant: Σ line qty per (function, type) === the task's dashboard count.**
  - **Tab edits are LITERAL** — adding a 4-asset line adds 4 to the dashboard; editing /
    deleting changes it too. After the board save, `store.updateTask` writes
    `countsFromLines` (function slices + combined roll-up, TaskForm's rule) → edit log.
  - **Function per line** (picker lists every configured function): a line in a function
    the task doesn't have adds that slice (`emptyFunctionEntry`); `withFunctions` gives
    unset lines a concrete function once the task has/gets function data (legacy task →
    legacy owner, keeping its work types). A legacy task stays legacy otherwise.
  - **Unassigned pool** = `pool` lines (no one in charge yet). A task nobody has touched
    shows its package as pool lines (deterministic `pool:` ids, no row until an edit).
    Assigning / renaming / ticking a pool line makes it a real line.
  - **Dashboard edits** are absorbed by `reconcile` (more → pool grows; fewer → pool
    first, then not-started, in progress, done last) — DISPLAY ONLY; never auto-saved
    (auto-saving raced other viewers). `linesFor(board, task)` = saved lines when
    `basis` or `fromBasis` equals the task's signature, else reconciled.
  - `fromBasis` = the task's signature when the board was saved: a board AHEAD of the
    task (its saver's count update not landed yet) is NOT stale — re-balancing it deleted
    the other person's new line before this fix.
- **Concurrent editing (several viewers):** every edit is a `BoardOp` (pure function of
  `{lines, groups, tracker}` by line id). `apply(op)` shows it at once, then loops: fresh
  `getTask` + `getAssetBoard` → op on `linesFor(server board, server task)` →
  `saveAssetBoardIf(rev)`; retry ≤ 6 on conflict. Sheet saves send only CHANGED FIELDS
  (`patchLine`), so two people editing different fields of one line both win. Verified on
  Supabase: different lines, same line/different fields, simultaneous adds (36+4+2 → 42).
  Realtime echo of own saves dropped via `rev`/`by` (per-page `CLIENT_ID`).
- **Lines:** name · asset type · function · people in charge (`owners: string[]`, legacy
  `owner` read as `[owner]`) · asset count · status (Not started / In progress / Done —
  "Stuck" retired, reads as In progress) · due · notes. FLAT list in stored order; `#` =
  position. User groups are blind (free names/colours); drag (grip, pointer events,
  touch, insertion line, auto-scroll) to reorder or move between groups.
- **Editor sheet** (kept calm — no explanatory text): Asset name; Asset type + Function;
  Person in charge = small toggle chips, multi-select (task people + "+N more"); Asset
  count stepper (no native spinners) + Status dropdown filled with the status colour
  (DARK text `#323338` on status fills, pills too — white was ~1.6–2.2:1, now ≥5.7:1);
  Due date; Notes hidden behind a sticky-note-with-plus icon in the footer (open when a
  note exists). Footer: Delete · note icon · Cancel · Save. (Split was built and removed.)
- **Task bar = one row:** task name (always, 17px Poppins) over monday mark · code · short dates
  ("15 Sep – 2 Nov"); a prominent **Asset tracker** button (opens `board.tracker`, an
  https link to e.g. the online Excel tracker; dashed "+ Asset tracker" when unset); ⋯
  menu: Copy link, Edit asset tracker link, Change task.
- **Theme switch:** a small Light/Dark (sun/moon) switch in the page footer; the pick is
  per viewer (`mwr.itemAssets.theme`) and wins over monday's context / `?theme=`.
- **Embedded inset:** inside an iframe (monday widget) the root gets `is-embedded` → `.mv-body`
  padding 20px 24px (monday's widget panel gives no inset of its own).
- **Look:** monday light/dark/night variable sets (`mv-theme-*`), Figtree + Poppins,
  compact summary + Details (package per type, who's doing what — a shared line counts for
  each owner); rows show stacked avatars (2, then +N), status pill, type, function when
  several are in play, due/overdue; round check-off.
- ⚠️ **No sign-in gate here** — anyone with the link can edit lines and, through them, the
  task's asset counts. Same permissive RLS as the rest of the app.
- Don't use `crypto.randomUUID` (undefined in non-secure frames); a plain `.mv button`
  reset overrides component colours — use `:where(.mv button)`.
