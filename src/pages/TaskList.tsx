import { useMemo, useState } from 'react'
import {
  ArrowDownUp,
  ChevronDown,
  ChevronUp,
  DatabaseBackup,
  Pencil,
  Search,
  StickyNote,
  Trash2,
} from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Badge, toneForLabel } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { MultiSelect } from '../components/ui/MultiSelect'
import { SpanFilter } from '../components/SpanFilter'
import { ImportBackupModal } from '../components/ImportBackupModal'
import { TaskForm } from '../components/TaskForm'
import { TaskDetails } from '../components/TaskDetails'
import { useStore } from '../data/store'
import { useAuth } from '../lib/auth'
import { SIZES, SIZE_ORDER, SIZE_TONE, withFallback } from '../constants'
import { cx, formatDate } from '../lib/format'
import { filterBySpan, taskYears, type SpanMode } from '../lib/span'
import type { Half, Task, TaskInput } from '../types'

type SortKey = 'code' | 'name' | 'squad' | 'campaign' | 'assetTotal' | 'startDate' | 'half' | 'size'

export function TaskList() {
  const { tasks, settings, updateTask, deleteTask } = useStore()
  const { canEdit } = useAuth()

  const [query, setQuery] = useState('')
  const [spanMode, setSpanMode] = useState<SpanMode>('total')
  const [spanYear, setSpanYear] = useState<number | null>(null)
  const [spanHalf, setSpanHalf] = useState<Half>('H1')
  const [squads, setSquads] = useState<string[]>([])
  const [campaigns, setCampaigns] = useState<string[]>([])
  const [people, setPeople] = useState<string[]>([])
  const [sizes, setSizes] = useState<string[]>([])
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'startDate', dir: 'desc' })

  const [editing, setEditing] = useState<Task | null>(null)
  const [deleting, setDeleting] = useState<Task | null>(null)
  const [ioOpen, setIoOpen] = useState(false)

  const years = useMemo(() => taskYears(tasks), [tasks])
  const activeYear = spanYear ?? years[0] ?? 0

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = filterBySpan(tasks, spanMode, activeYear, spanHalf).filter((t) => {
      if (q && !`${t.code} ${t.name}`.toLowerCase().includes(q)) return false
      if (squads.length && !squads.includes(t.squad)) return false
      if (campaigns.length && !campaigns.includes(t.campaign)) return false
      if (sizes.length && !sizes.includes(t.size)) return false
      if (people.length && !t.people.some((p) => people.includes(p))) return false
      return true
    })
    const dir = sort.dir === 'asc' ? 1 : -1
    return rows.sort((a, b) => {
      if (sort.key === 'assetTotal') return (a.assetTotal - b.assetTotal) * dir
      if (sort.key === 'size') return (SIZE_ORDER[a.size] - SIZE_ORDER[b.size]) * dir
      const av = a[sort.key]
      const bv = b[sort.key]
      return String(av ?? '').localeCompare(String(bv ?? '')) * dir
    })
  }, [tasks, query, spanMode, activeYear, spanHalf, squads, campaigns, people, sizes, sort])

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
  }

  const hasFilters =
    query ||
    spanMode !== 'total' ||
    squads.length ||
    campaigns.length ||
    people.length ||
    sizes.length

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[260px] flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
            <input
              className="input h-12 pl-12 text-base shadow-soft placeholder:text-muted focus:shadow-none"
              placeholder="Search code or task name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <SpanFilter
            mode={spanMode}
            year={activeYear}
            half={spanHalf}
            years={years}
            onMode={setSpanMode}
            onYear={setSpanYear}
            onHalf={setSpanHalf}
          />

          {canEdit && (
            <button className="btn-outline ml-auto" onClick={() => setIoOpen(true)}>
              <DatabaseBackup className="h-4 w-4" /> Import &amp; Backup
            </button>
          )}
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <MultiSelect options={withFallback(settings.squads)} value={squads} onChange={setSquads} placeholder="All squads" overflowCollapse />
          <MultiSelect
            options={settings.campaigns}
            value={campaigns}
            onChange={setCampaigns}
            placeholder="All campaigns"
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
          <button className="btn-ghost self-start" onClick={clearFilters}>
            Clear filters
          </button>
        ) : null}
      </Card>

      {/* Table */}
      <Card className="p-0">
        <div className="flex items-center justify-between px-5 py-3 text-xs text-muted">
          <span>
            Showing <strong className="text-ink">{filtered.length}</strong> of {tasks.length} tasks
          </span>
          <span className="hidden sm:inline">
            {canEdit ? 'Click any row to edit' : 'Click any row to view · sign in to edit'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] border-collapse text-sm">
            <thead>
              <tr className="border-y border-line bg-subtle/60 text-left text-xs uppercase tracking-wide text-muted">
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
              {filtered.map((t) => (
                <tr
                  key={t.id}
                  className="group cursor-pointer transition-colors hover:bg-subtle"
                  onClick={() => setEditing(t)}
                  title={canEdit ? 'Click to edit' : 'Click to view'}
                >
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-muted">{t.code || '—'}</td>
                  <td className="px-3 py-3 font-medium text-ink">
                    <div className="flex max-w-[260px] items-center gap-1.5">
                      <span className="truncate" title={t.name}>
                        {t.name}
                      </span>
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
                  <td className="px-3 py-3 text-right font-semibold text-ink">{t.assetTotal}</td>
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
                        className="rounded-lg p-1.5 text-muted hover:bg-navy-50 hover:text-rmit-navy dark:hover:bg-white/10 dark:hover:text-navy-100"
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditing(t)
                        }}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
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
                  <td colSpan={canEdit ? 12 : 11} className="px-3 py-12 text-center text-sm text-muted">
                    No tasks match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Edit modal — read-only details for signed-out viewers, editable form otherwise */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={canEdit ? 'Edit task' : 'Task details'}
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
