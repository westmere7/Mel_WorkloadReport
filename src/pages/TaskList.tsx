import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ArrowDownUp,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  DatabaseBackup,
  FilePen,
  Images,
  Search,
  Star,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Badge, toneForLabel } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { MultiSelect } from '../components/ui/MultiSelect'
import { SpanFilter } from '../components/SpanFilter'
import { FunctionFilter } from '../components/FunctionFilter'
import { ImportBackupModal } from '../components/ImportBackupModal'
import { TaskForm } from '../components/TaskForm'
import { TaskDetails } from '../components/TaskDetails'
import { TaskStar } from '../components/TaskStar'
import { useStore } from '../data/store'
import { useAuth } from '../lib/auth'
import { SIZES, SIZE_ORDER, SIZE_TONE, withFallback } from '../constants'
import { cx, formatDate } from '../lib/format'
import { sliceTasksByFunctions } from '../lib/functionData'
import { filterBySpan, taskYears, type SpanMode } from '../lib/span'
import { addedOrderMap } from '../lib/analytics'
import type { Half, Task, TaskInput } from '../types'

type SortKey = 'no' | 'code' | 'name' | 'squad' | 'campaign' | 'assetTotal' | 'startDate' | 'half' | 'size'

/** Rows per page in the task list. */
const PAGE_SIZE = 50

export function TaskList() {
  const { tasks, settings, updateTask, deleteTask } = useStore()
  const { canEdit } = useAuth()

  // Filters seed from the URL query so dashboard charts can deep-link here
  // (e.g. /tasks?squad=DOM&asset=Image). Keys may repeat for multi-value filters.
  const [searchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  // Span also seeds from the URL so a dashboard deep-link lands on the same
  // time window it counted (?year=2026 → By year; +&half=H2 → that half).
  const seedYear = searchParams.get('year')
  const seedHalf = searchParams.get('half')
  const [spanMode, setSpanMode] = useState<SpanMode>(seedYear ? (seedHalf ? 'half' : 'year') : 'total')
  const [spanYear, setSpanYear] = useState<number | null>(seedYear ? Number(seedYear) : null)
  const [spanHalf, setSpanHalf] = useState<Half>(seedHalf === 'H2' ? 'H2' : 'H1')
  const [squads, setSquads] = useState<string[]>(() => searchParams.getAll('squad'))
  const [campaigns, setCampaigns] = useState<string[]>(() => searchParams.getAll('campaign'))
  const [people, setPeople] = useState<string[]>(() => searchParams.getAll('person'))
  const [sizes, setSizes] = useState<string[]>(() => searchParams.getAll('size'))
  const [types, setTypes] = useState<string[]>(() => searchParams.getAll('type'))
  const [assetTypes, setAssetTypes] = useState<string[]>(() => searchParams.getAll('asset'))
  const [fnFilter, setFnFilter] = useState<string[]>(() => searchParams.getAll('function'))
  const [draftsOnly, setDraftsOnly] = useState(false)
  const [starredOnly, setStarredOnly] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'no', dir: 'desc' })

  const draftCount = useMemo(() => tasks.filter((t) => t.draft).length, [tasks])
  const starredCount = useMemo(() => tasks.filter((t) => t.starred).length, [tasks])

  const [editing, setEditing] = useState<Task | null>(null)
  const [deleting, setDeleting] = useState<Task | null>(null)
  const [ioOpen, setIoOpen] = useState(false)
  const [page, setPage] = useState(1)

  const years = useMemo(() => taskYears(tasks), [tasks])
  const activeYear = spanYear ?? years[0] ?? 0

  // "No." = the add/update order (earliest = 1); editing a task bumps it to the end.
  const addedOrder = useMemo(() => addedOrderMap(tasks), [tasks])
  const taskNo = (t: Task) => addedOrder.get(t.id) ?? 0

  // Project to the selected functions' slices first (same as the dashboard filter):
  // narrows to tasks touching those functions and counts only their share.
  const fnTasks = useMemo(
    () => sliceTasksByFunctions(tasks, fnFilter, settings.functions),
    [tasks, fnFilter, settings.functions],
  )

  const filtered = useMemo(() => {
    // Ignore square brackets so a code pasted as "[26.0202.A] …" still matches —
    // we strip brackets from new tasks, but users paste them from other trackers.
    const strip = (s: string) => s.replace(/[[\]]/g, '')
    // Word-based search: split into terms and require EVERY term to appear
    // somewhere in the code+name — so it's case-insensitive and order-agnostic
    // ("wrap fleet" matches "Fleet Car Wrap").
    const terms = strip(query.trim().toLowerCase()).split(/\s+/).filter(Boolean)
    const rows = filterBySpan(fnTasks, spanMode, activeYear, spanHalf).filter((t) => {
      if (draftsOnly && !t.draft) return false
      if (starredOnly && !t.starred) return false
      if (terms.length) {
        const hay = strip(`${t.code} ${t.name}`.toLowerCase())
        if (!terms.every((term) => hay.includes(term))) return false
      }
      if (squads.length && !squads.includes(t.squad)) return false
      if (campaigns.length && !campaigns.includes(t.campaign)) return false
      if (sizes.length && !sizes.includes(t.size)) return false
      if (people.length && !t.people.some((p) => people.includes(p))) return false
      if (types.length && !t.types.some((ty) => types.includes(ty))) return false
      if (assetTypes.length && !assetTypes.some((a) => (Number(t.assetBreakdown[a]) || 0) > 0)) return false
      return true
    })
    const dir = sort.dir === 'asc' ? 1 : -1
    return rows.sort((a, b) => {
      if (sort.key === 'no') return (taskNo(a) - taskNo(b)) * dir
      if (sort.key === 'assetTotal') return (a.assetTotal - b.assetTotal) * dir
      if (sort.key === 'size') return (SIZE_ORDER[a.size] - SIZE_ORDER[b.size]) * dir
      const av = a[sort.key]
      const bv = b[sort.key]
      return String(av ?? '').localeCompare(String(bv ?? '')) * dir
    })
  }, [fnTasks, query, spanMode, activeYear, spanHalf, squads, campaigns, people, sizes, types, assetTypes, draftsOnly, starredOnly, sort, addedOrder])

  // Pagination — filter/sort first, then slice into pages of PAGE_SIZE.
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  // Clamp so a shrinking result set (e.g. a live update) never strands us on an empty page.
  const currentPage = Math.min(page, pageCount)
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const paged = filtered.slice(pageStart, pageStart + PAGE_SIZE)

  // Jump back to page 1 whenever the filters/search/sort change (but not when the
  // underlying tasks update — that would yank you off your current page).
  useEffect(() => {
    setPage(1)
  }, [query, spanMode, activeYear, spanHalf, squads, campaigns, people, sizes, types, assetTypes, fnFilter, draftsOnly, starredOnly, sort])

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))

  const handleUpdate = async (input: TaskInput) => {
    if (!editing) return
    await updateTask(editing.id, input)
    setEditing(null)
  }

  const confirmDelete = async () => {
    if (!deleting) return
    await deleteTask(deleting.id)
    setDeleting(null)
    setEditing(null)
  }

  const clearFilters = () => {
    setQuery('')
    setSpanMode('total')
    setSpanYear(null)
    setSpanHalf('H1')
    setSquads([])
    setCampaigns([])
    setPeople([])
    setSizes([])
    setTypes([])
    setAssetTypes([])
    setFnFilter([])
    setDraftsOnly(false)
    setStarredOnly(false)
  }

  const hasFilters =
    query ||
    spanMode !== 'total' ||
    draftsOnly ||
    starredOnly ||
    squads.length ||
    campaigns.length ||
    people.length ||
    sizes.length ||
    types.length ||
    assetTypes.length ||
    fnFilter.length

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[260px] flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
            <input
              className="input h-12 pl-12 pr-11 text-base shadow-soft placeholder:text-muted focus:shadow-none"
              placeholder="Search code or task name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                title="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted transition-colors hover:bg-subtle hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Starred quick-filter — sits right after the search field. */}
          <button
            type="button"
            onClick={() => setStarredOnly((v) => !v)}
            aria-pressed={starredOnly}
            title={starredOnly ? 'Showing starred only — click to show all' : 'Show only starred tasks'}
            className={cx(
              'inline-flex h-12 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition',
              starredOnly
                ? 'border-amber-400 bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300'
                : 'border-line text-muted hover:border-faint hover:text-ink',
            )}
          >
            <Star className={cx('h-3.5 w-3.5', starredOnly && 'fill-current')} strokeWidth={1.5} />
            {starredCount > 0 && <span className="text-xs font-bold">{starredCount}</span>}
          </button>

          <SpanFilter
            mode={spanMode}
            year={activeYear}
            half={spanHalf}
            years={years}
            onMode={setSpanMode}
            onYear={setSpanYear}
            onHalf={setSpanHalf}
            hideHalf
          />

          <FunctionFilter functions={settings.functions} selected={fnFilter} onChange={setFnFilter} />

          <button
            type="button"
            onClick={() => setDraftsOnly((v) => !v)}
            aria-pressed={draftsOnly}
            title={draftsOnly ? 'Showing drafts only — click to show all tasks' : 'Show only draft tasks'}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition',
              draftsOnly
                ? 'border-rmit-red bg-brand-50 text-rmit-red dark:bg-brand-500/15 dark:text-brand-300'
                : 'border-line text-muted hover:border-faint hover:text-ink',
            )}
          >
            <FilePen className="h-4 w-4" />
            Drafts
            {draftCount > 0 && (
              <span
                className={cx(
                  'rounded-full px-1.5 text-[10px] font-bold leading-4',
                  draftsOnly ? 'bg-rmit-red text-white' : 'bg-subtle text-muted',
                )}
              >
                {draftCount}
              </span>
            )}
          </button>

          {canEdit && (
            <button className="btn-outline ml-auto" onClick={() => setIoOpen(true)}>
              <DatabaseBackup className="h-4 w-4" /> Import &amp; Backup
            </button>
          )}
        </div>

        <div className="flex items-start gap-2">
          <div className="grid flex-1 gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            <MultiSelect options={withFallback(settings.squads)} value={squads} onChange={setSquads} placeholder="All squads" overflowCollapse />
            <MultiSelect
              options={settings.campaigns}
              value={campaigns}
              onChange={setCampaigns}
              placeholder="All campaigns"
              overflowCollapse
            />
            <MultiSelect
              options={withFallback(settings.types)}
              value={types}
              onChange={setTypes}
              placeholder="All work types"
              overflowCollapse
            />
            <MultiSelect
              options={withFallback(settings.assetTypes)}
              value={assetTypes}
              onChange={setAssetTypes}
              placeholder="All asset types"
              overflowCollapse
            />
            <MultiSelect
              options={settings.people}
              value={people}
              onChange={setPeople}
              placeholder="All people"
              overflowCollapse
            />
            <MultiSelect options={SIZES} value={sizes} onChange={setSizes} placeholder="All sizes" overflowCollapse />
          </div>
          {hasFilters ? (
            <button
              type="button"
              className="btn-ghost h-11 shrink-0 self-start whitespace-nowrap"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </Card>

      {/* Table */}
      <Card className="p-0">
        <div className="flex items-center justify-between px-5 py-3 text-xs text-muted">
          <span>
            {filtered.length === 0 ? (
              <>No tasks</>
            ) : (
              <>
                Showing{' '}
                <strong className="text-ink">
                  {pageStart + 1}–{pageStart + paged.length}
                </strong>{' '}
                of <strong className="text-ink">{filtered.length}</strong>
                {filtered.length !== tasks.length ? ` (filtered from ${tasks.length})` : ''} tasks
              </>
            )}
          </span>
          <span className="hidden sm:inline">
            {canEdit ? 'Click any row to edit' : 'Click any row to view · sign in to edit'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse text-sm">
            <thead>
              <tr className="border-y border-line bg-subtle/60 text-left text-xs uppercase tracking-wide text-muted">
                <Th label="No." k="no" sort={sort} onSort={toggleSort} />
                <Th label="Code" k="code" sort={sort} onSort={toggleSort} />
                <Th label="Task name" k="name" sort={sort} onSort={toggleSort} />
                <Th label="Squad" k="squad" sort={sort} onSort={toggleSort} />
                <Th label="Campaign" k="campaign" sort={sort} onSort={toggleSort} />
                <th className="px-3 py-2.5 font-semibold">Types</th>
                <th className="px-3 py-2.5 font-semibold">People</th>
                <Th label="Assets" k="assetTotal" sort={sort} onSort={toggleSort} align="right" />
                <Th label="Start" k="startDate" sort={sort} onSort={toggleSort} />
                <th className="px-3 py-2.5 font-semibold">End</th>
                <Th label="Half" k="half" sort={sort} onSort={toggleSort} />
                <Th label="Size" k="size" sort={sort} onSort={toggleSort} />
                {canEdit && <th className="px-3 py-2.5 text-right font-semibold">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {paged.map((t) => (
                <tr
                  key={t.id}
                  className={cx(
                    'group cursor-pointer transition-colors hover:bg-subtle',
                    // Drafts sit faded in the list — visible, but clearly not "real" yet.
                    t.draft && 'opacity-45 hover:opacity-90',
                  )}
                  onClick={() => setEditing(t)}
                  title={t.draft ? 'Draft — required fields missing (not counted anywhere). Click to complete.' : canEdit ? 'Click to edit' : 'Click to view'}
                >
                  <td className="whitespace-nowrap px-3 py-3 text-xs tabular-nums text-faint">{taskNo(t)}</td>
                  <CodeCell code={t.code} />
                  <td className="px-3 py-3 font-medium text-ink">
                    <div className="flex max-w-[260px] items-center gap-1.5">
                      {t.starred && (
                        <Star className="h-3 w-3 shrink-0 fill-current text-amber-400" strokeWidth={1.5} aria-label="Starred" />
                      )}
                      <span className="truncate" title={t.name}>
                        {t.name}
                      </span>
                      {t.draft && (
                        <span className="shrink-0 rounded border border-dashed border-faint px-1 text-[9px] font-bold uppercase tracking-wide text-faint">
                          Draft
                        </span>
                      )}
                      {t.note ? (
                        <span title={t.note} className="shrink-0 cursor-help text-faint">
                          <StickyNote className="h-3.5 w-3.5" />
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <Badge tone={toneForLabel(t.squad)}>{t.squad}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-muted">{t.campaign}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-nowrap items-center gap-1">
                      {t.types.slice(0, 2).map((ty) => (
                        <Badge key={ty} tone="gray" className="whitespace-nowrap">{ty}</Badge>
                      ))}
                      {t.types.length > 2 && <Badge tone="gray">+{t.types.length - 2}</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-nowrap items-center gap-1">
                      {t.people.slice(0, 2).map((p) => (
                        <Badge key={p} tone="navy" className="whitespace-nowrap">{p}</Badge>
                      ))}
                      {t.people.length > 2 && <Badge tone="navy">+{t.people.length - 2}</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      {t.images?.length ? (
                        <span
                          title={`${t.images.length} demo image${t.images.length === 1 ? '' : 's'}`}
                          className="inline-flex items-center gap-0.5 text-faint"
                        >
                          <Images className="h-3.5 w-3.5" />
                          <span className="text-[11px] tabular-nums">{t.images.length}</span>
                        </span>
                      ) : null}
                      <span className="font-semibold text-ink">{t.assetTotal}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-muted">{formatDate(t.startDate)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-muted">{formatDate(t.endDate)}</td>
                  <td className="px-3 py-3">
                    <span
                      className={cx(
                        'chip',
                        t.half === 'H1'
                          ? 'bg-navy-50 text-navy-600 dark:bg-white/10 dark:text-navy-100'
                          : 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300',
                      )}
                    >
                      {t.half}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <Badge tone={SIZE_TONE[t.size]}>{t.size}</Badge>
                  </td>
                  {canEdit && (
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-1 opacity-60 transition group-hover:opacity-100">
                      <button
                        className="rounded-lg p-1.5 text-muted hover:bg-brand-50 hover:text-rmit-red dark:hover:bg-brand-500/15 dark:hover:text-brand-300"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleting(t)
                        }}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 13 : 12} className="px-3 py-12 text-center text-sm text-muted">
                    No tasks match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {pageCount > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
            <span className="text-xs text-muted">
              Page <strong className="text-ink">{currentPage}</strong> of {pageCount}
            </span>
            <Pagination page={currentPage} pageCount={pageCount} onPage={setPage} />
          </div>
        )}
      </Card>

      {/* Edit modal — read-only details for signed-out viewers, editable form otherwise */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={
          <span className="flex items-center gap-2">
            {canEdit ? 'Edit task' : 'Task details'}
            {editing && canEdit && <TaskStar id={editing.id} />}
          </span>
        }
        wide
      >
        {editing &&
          (canEdit ? (
            <TaskForm
              initial={editing}
              submitLabel="Save changes"
              onSubmit={handleUpdate}
              onCancel={() => setEditing(null)}
              onDelete={() => setDeleting(editing)}
            />
          ) : (
            <TaskDetails task={editing} onClose={() => setEditing(null)} />
          ))}
      </Modal>

      {/* Delete confirm */}
      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete task"
        footer={
          <>
            <button className="btn-outline" onClick={() => setDeleting(null)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={confirmDelete}>
              Delete
            </button>
          </>
        }
      >
        <p className="text-sm text-muted">
          Delete <strong className="text-ink">{deleting?.name}</strong>
          {deleting?.code ? ` (${deleting.code})` : ''}? This cannot be undone.
        </p>
      </Modal>

      {/* Import & backup */}
      <ImportBackupModal open={ioOpen} onClose={() => setIoOpen(false)} />
    </div>
  )
}

/** Task-code cell: a chip you can click to copy the code (shows "Copied" briefly). */
function CodeCell({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  if (!code) {
    return (
      <td className="whitespace-nowrap px-3 py-3">
        <span className="font-mono text-xs text-faint">—</span>
      </td>
    )
  }

  const copy = (e: React.MouseEvent) => {
    e.stopPropagation() // don't open the row's edit modal
    void navigator.clipboard?.writeText(code).then(() => {
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1200)
    })
  }

  return (
    <td className="whitespace-nowrap px-3 py-3">
      <button
        type="button"
        onClick={copy}
        title={copied ? 'Copied!' : 'Click to copy code'}
        className={cx(
          'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-xs transition-colors',
          copied
            ? 'border-accent-green/50 bg-green-50 text-accent-green dark:bg-green-500/15'
            : 'border-line bg-subtle text-muted hover:border-faint hover:text-ink',
        )}
      >
        {copied ? (
          <>
            <Check className="h-3 w-3" /> Copied
          </>
        ) : (
          code
        )}
      </button>
    </td>
  )
}

function Th({
  label,
  k,
  sort,
  onSort,
  align = 'left',
}: {
  label: string
  k: SortKey
  sort: { key: SortKey; dir: 'asc' | 'desc' }
  onSort: (k: SortKey) => void
  align?: 'left' | 'right'
}) {
  const active = sort.key === k
  return (
    <th className={cx('px-3 py-2.5 font-semibold', align === 'right' && 'text-right')}>
      <button
        className={cx('inline-flex items-center gap-1 hover:text-ink', active && 'text-ink')}
        onClick={() => onSort(k)}
      >
        {label}
        {active ? (
          sort.dir === 'asc' ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )
        ) : (
          <ArrowDownUp className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  )
}

/** Page numbers to show: all when ≤7, else 1 … around-current … N. */
function pageItems(page: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const items: (number | 'gap')[] = [1]
  const start = Math.max(2, page - 1)
  const end = Math.min(total - 1, page + 1)
  if (start > 2) items.push('gap')
  for (let i = start; i <= end; i++) items.push(i)
  if (end < total - 1) items.push('gap')
  items.push(total)
  return items
}

function Pagination({
  page,
  pageCount,
  onPage,
}: {
  page: number
  pageCount: number
  onPage: (p: number) => void
}) {
  const go = (p: number) => onPage(Math.min(pageCount, Math.max(1, p)))
  const arrow =
    'rounded-lg border border-line p-1.5 text-muted transition hover:border-navy-300 hover:text-ink disabled:opacity-40 disabled:hover:border-line disabled:hover:text-muted'
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => go(page - 1)} disabled={page <= 1} className={arrow} aria-label="Previous page">
        <ChevronLeft className="h-4 w-4" />
      </button>
      {pageItems(page, pageCount).map((it, i) =>
        it === 'gap' ? (
          <span key={`gap-${i}`} className="px-1 text-xs text-faint">
            …
          </span>
        ) : (
          <button
            key={it}
            type="button"
            onClick={() => go(it)}
            aria-current={it === page}
            className={cx(
              'min-w-[2rem] rounded-lg px-2 py-1.5 text-xs font-semibold transition',
              it === page
                ? 'bg-rmit-navy text-white dark:bg-navy-300'
                : 'border border-line text-muted hover:border-navy-300 hover:text-ink',
            )}
          >
            {it}
          </button>
        ),
      )}
      <button type="button" onClick={() => go(page + 1)} disabled={page >= pageCount} className={arrow} aria-label="Next page">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}
