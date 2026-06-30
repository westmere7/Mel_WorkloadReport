import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownUp,
  Download,
  Pencil,
  Search,
  Trash2,
  ChevronUp,
  ChevronDown,
} from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Badge, toneForLabel } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { TaskForm } from '../components/TaskForm'
import { useStore } from '../data/store'
import { SQUADS, SIZES, SIZE_ORDER, SIZE_TONE } from '../constants'
import { cx, formatDate } from '../lib/format'
import { exportTasksCsv } from '../lib/csv'
import type { Task, TaskInput } from '../types'

type SortKey = 'code' | 'name' | 'squad' | 'campaign' | 'assetTotal' | 'startDate' | 'half' | 'size'

export function TaskList() {
  const { tasks, settings, updateTask, deleteTask } = useStore()

  const [query, setQuery] = useState('')
  const [squad, setSquad] = useState('')
  const [campaign, setCampaign] = useState('')
  const [person, setPerson] = useState('')
  const [half, setHalf] = useState('')
  const [size, setSize] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'startDate', dir: 'desc' })

  const [editing, setEditing] = useState<Task | null>(null)
  const [deleting, setDeleting] = useState<Task | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = tasks.filter((t) => {
      if (q && !(`${t.code} ${t.name}`.toLowerCase().includes(q))) return false
      if (squad && t.squad !== squad) return false
      if (campaign && t.campaign !== campaign) return false
      if (half && t.half !== half) return false
      if (size && t.size !== size) return false
      if (person && !t.people.includes(person)) return false
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
  }, [tasks, query, squad, campaign, person, half, size, sort])

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
  }

  const clearFilters = () => {
    setQuery('')
    setSquad('')
    setCampaign('')
    setPerson('')
    setHalf('')
    setSize('')
  }

  const hasFilters = query || squad || campaign || person || half || size

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <input
              className="input pl-9"
              placeholder="Search code or task name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <select className="input w-auto" value={squad} onChange={(e) => setSquad(e.target.value)}>
            <option value="">All squads</option>
            {SQUADS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select className="input w-auto" value={campaign} onChange={(e) => setCampaign(e.target.value)}>
            <option value="">All campaigns</option>
            {settings.campaigns.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select className="input w-auto" value={person} onChange={(e) => setPerson(e.target.value)}>
            <option value="">All people</option>
            {settings.people.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          <select className="input w-auto" value={half} onChange={(e) => setHalf(e.target.value)}>
            <option value="">H1 + H2</option>
            <option value="H1">H1</option>
            <option value="H2">H2</option>
          </select>

          <select className="input w-auto" value={size} onChange={(e) => setSize(e.target.value)}>
            <option value="">All sizes</option>
            {SIZES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {hasFilters && (
            <button className="btn-ghost" onClick={clearFilters}>
              Clear
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            <button
              className="btn-outline"
              onClick={() => exportTasksCsv(filtered)}
              disabled={filtered.length === 0}
            >
              <Download className="h-4 w-4" /> Export CSV
            </button>
            <Link to="/new" className="btn-primary">
              New task
            </Link>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="p-0">
        <div className="flex items-center justify-between px-5 py-3 text-xs text-muted">
          <span>
            Showing <strong className="text-ink">{filtered.length}</strong> of {tasks.length} tasks
          </span>
          <span className="hidden sm:inline">Click any row to edit</span>
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
                <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((t) => (
                <tr
                  key={t.id}
                  className="group cursor-pointer hover:bg-subtle/60"
                  onClick={() => setEditing(t)}
                  title="Click to edit"
                >
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-muted">{t.code || '—'}</td>
                  <td className="px-3 py-3 font-medium text-ink">
                    <div className="max-w-[240px] truncate">{t.name}</div>
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
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-3 py-12 text-center text-sm text-muted">
                    No tasks match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Edit modal */}
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit task" wide>
        {editing && (
          <TaskForm
            initial={editing}
            submitLabel="Save changes"
            onSubmit={handleUpdate}
            onCancel={() => setEditing(null)}
          />
        )}
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
