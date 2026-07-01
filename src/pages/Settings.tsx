import { useState } from 'react'
import { AlertTriangle, Check, Database, HardDrive, Lock, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { Card, CardHeader } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { useStore } from '../data/store'
import { SQUADS, SQUAD_DESCRIPTIONS, SIZES, SIZE_DESCRIPTIONS, SIZE_TONE, FALLBACK_ITEM } from '../constants'
import { cx, toMessage } from '../lib/format'
import type { AppSettings } from '../types'

type ListKey = keyof Pick<AppSettings, 'campaigns' | 'types' | 'people' | 'assetTypes'>

export function SettingsPage() {
  const { settings, saveSettings, backend, tasks, renameListItem, removeListItem } = useStore()

  const mutate = async (key: ListKey, next: string[]) => {
    await saveSettings({ ...settings, [key]: next })
  }

  const usageCount = (key: ListKey, value: string): number => {
    if (key === 'campaigns') return tasks.filter((t) => t.campaign === value).length
    if (key === 'types') return tasks.filter((t) => t.types.includes(value)).length
    if (key === 'assetTypes') return tasks.filter((t) => (t.assetBreakdown[value] ?? 0) > 0).length
    return tasks.filter((t) => t.people.includes(value)).length
  }

  return (
    <div className="space-y-5">
      {/* Backend status */}
      <Card>
        <CardHeader title="Data backend" subtitle="Where your tasks are stored" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-subtle">
              {backend === 'supabase' ? (
                <Database className="h-5 w-5 text-accent-teal" />
              ) : (
                <HardDrive className="h-5 w-5 text-accent-green" />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">
                {backend === 'supabase' ? 'Supabase (cloud)' : 'Local (this browser)'}
              </p>
              <p className="text-xs text-muted">
                {backend === 'supabase'
                  ? 'Shared across devices and teammates.'
                  : 'Data is saved in this browser only — great for trying things out.'}
              </p>
            </div>
          </div>
          <Badge tone={backend === 'supabase' ? 'teal' : 'green'}>{backend}</Badge>
        </div>
        {backend === 'local' && (
          <div className="mt-4 rounded-xl bg-subtle p-4 text-xs leading-relaxed text-muted">
            <p className="mb-1 font-semibold text-ink">Switch to Supabase</p>
            <ol className="list-decimal space-y-0.5 pl-4">
              <li>Create a project at supabase.com and run <code className="rounded bg-card px-1 py-0.5 font-mono">supabase/schema.sql</code>.</li>
              <li>Copy <code className="rounded bg-card px-1 py-0.5 font-mono">.env.example</code> to <code className="rounded bg-card px-1 py-0.5 font-mono">.env</code> and paste your URL + anon key.</li>
              <li>Restart the dev server — the app switches automatically.</li>
            </ol>
          </div>
        )}
      </Card>

      {/* Editable lists */}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <ListEditor
          title="Campaigns"
          description="Specific campaigns or groups. Used in the task form."
          items={settings.campaigns}
          fallback={FALLBACK_ITEM}
          onAdd={(v) => mutate('campaigns', [...settings.campaigns, v])}
          onRemove={(v) => removeListItem('campaigns', v)}
          onRename={(o, n) => renameListItem('campaigns', o, n)}
          usage={(v) => usageCount('campaigns', v)}
        />
        <ListEditor
          title="Work types"
          description="Categories of design work."
          items={settings.types}
          fallback={FALLBACK_ITEM}
          onAdd={(v) => mutate('types', [...settings.types, v])}
          onRemove={(v) => removeListItem('types', v)}
          onRename={(o, n) => renameListItem('types', o, n)}
          usage={(v) => usageCount('types', v)}
        />
        <ListEditor
          title="Asset types"
          description="Deliverable types counted in the asset breakdown."
          items={settings.assetTypes}
          fallback={FALLBACK_ITEM}
          onAdd={(v) => mutate('assetTypes', [...settings.assetTypes, v])}
          onRemove={(v) => removeListItem('assetTypes', v)}
          onRename={(o, n) => renameListItem('assetTypes', o, n)}
          usage={(v) => usageCount('assetTypes', v)}
        />
        <ListEditor
          title="People"
          description="Team members who can be assigned."
          items={settings.people}
          fallback={FALLBACK_ITEM}
          onAdd={(v) => mutate('people', [...settings.people, v])}
          onRemove={(v) => removeListItem('people', v)}
          onRename={(o, n) => renameListItem('people', o, n)}
          usage={(v) => usageCount('people', v)}
        />
      </div>

      {/* Fixed squads */}
      <Card>
        <CardHeader
          title="Squads (stakeholders)"
          subtitle="Fixed list — these don’t change"
          action={
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <Lock className="h-3.5 w-3.5" /> Locked
            </span>
          }
        />
        <div className="flex flex-wrap gap-2">
          {SQUADS.map((s) => (
            <span key={s} className="chip bg-subtle text-ink" title={SQUAD_DESCRIPTIONS[s]}>
              <span className="font-semibold">{s}</span>
              <span className="text-muted">· {SQUAD_DESCRIPTIONS[s]}</span>
            </span>
          ))}
        </div>
      </Card>

      {/* Fixed task sizes */}
      <Card>
        <CardHeader
          title="Task sizes"
          subtitle="Fixed T-shirt scale — used on the task form and dashboard"
          action={
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <Lock className="h-3.5 w-3.5" /> Locked
            </span>
          }
        />
        <div className="flex flex-wrap gap-2">
          {SIZES.map((s) => (
            <span key={s} className="inline-flex items-center gap-2" title={SIZE_DESCRIPTIONS[s]}>
              <Badge tone={SIZE_TONE[s]}>{s}</Badge>
              <span className="text-xs text-muted">{SIZE_DESCRIPTIONS[s]}</span>
            </span>
          ))}
        </div>
      </Card>

      {/* Developer / danger zone */}
      <DangerZone />
    </div>
  )
}

const CONFIRM_PHRASE = 'abc'

const SAMPLE_COUNT = 60

function DangerZone() {
  const { tasks, backend, deleteAllTasks, populateSampleData } = useStore()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [populating, setPopulating] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const populate = async () => {
    setPopulating(true)
    setError(null)
    setNotice(null)
    try {
      const n = await populateSampleData(SAMPLE_COUNT)
      setNotice(`Added ${n} sample tasks to the ${backend} database.`)
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setPopulating(false)
    }
  }

  const close = () => {
    if (busy) return
    setOpen(false)
    setText('')
    setError(null)
  }

  const run = async () => {
    if (text.trim() !== CONFIRM_PHRASE) return
    setBusy(true)
    setError(null)
    try {
      await deleteAllTasks()
      close()
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const armed = text.trim() === CONFIRM_PHRASE

  return (
    <Card className="border border-brand-100 dark:border-brand-500/25">
      <CardHeader
        title="Developer"
        subtitle="Maintenance actions for testing — use with care"
        action={
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-rmit-red">
            <AlertTriangle className="h-3.5 w-3.5" /> Danger zone
          </span>
        }
      />
      <div className="space-y-3">
        {/* Populate sample data */}
        <div className="flex flex-col gap-4 rounded-xl border border-line bg-subtle p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-ink">Populate with sample data</p>
            <p className="text-xs text-muted">
              Adds <strong className="text-ink">{SAMPLE_COUNT}</strong> randomly-generated tasks
              spread across the year to the {backend} database — handy for testing.
            </p>
          </div>
          <button className="btn-navy shrink-0" onClick={populate} disabled={populating}>
            <Sparkles className="h-4 w-4" /> {populating ? 'Adding…' : 'Populate with sample data'}
          </button>
        </div>

        {/* Delete all tasks */}
        <div className="flex flex-col gap-4 rounded-xl border border-brand-100 bg-brand-50/40 p-4 dark:border-brand-500/25 dark:bg-brand-500/5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-ink">Delete all tasks</p>
            <p className="text-xs text-muted">
              Permanently removes all <strong className="text-ink">{tasks.length}</strong> task
              {tasks.length === 1 ? '' : 's'} from the {backend} database. Campaigns, work types and
              people are kept.
            </p>
          </div>
          <button
            className="btn shrink-0 bg-rmit-red text-white hover:bg-brand-600 focus:ring-brand-200"
            onClick={() => setOpen(true)}
            disabled={tasks.length === 0}
          >
            <Trash2 className="h-4 w-4" /> Delete all tasks
          </button>
        </div>

        {notice && (
          <p className="rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700 dark:bg-green-500/15 dark:text-green-300">{notice}</p>
        )}
        {error && (
          <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{error}</p>
        )}
      </div>

      <Modal
        open={open}
        onClose={close}
        title="Delete all tasks"
        footer={
          <>
            <button className="btn-outline" onClick={close} disabled={busy}>
              Cancel
            </button>
            <button
              className={cx(
                'btn text-white',
                armed ? 'bg-rmit-red hover:bg-brand-600 focus:ring-brand-200' : 'bg-brand-300',
              )}
              onClick={run}
              disabled={!armed || busy}
            >
              {busy ? 'Deleting…' : `Delete ${tasks.length} tasks`}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex gap-3 rounded-xl bg-brand-50 p-3 text-sm text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <p>
              This permanently deletes <strong>all {tasks.length} tasks</strong> from the{' '}
              <strong>{backend}</strong> database. This cannot be undone.
            </p>
          </div>
          <div>
            <label className="label">
              Type <span className="font-mono text-rmit-red">{CONFIRM_PHRASE}</span> to confirm
            </label>
            <input
              className="input font-mono"
              value={text}
              autoFocus
              placeholder={CONFIRM_PHRASE}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && armed && run()}
            />
          </div>
          {error && <p className="text-sm text-brand-700">{error}</p>}
        </div>
      </Modal>
    </Card>
  )
}

function ListEditor({
  title,
  description,
  items,
  onAdd,
  onRemove,
  onRename,
  usage,
  fallback,
}: {
  title: string
  description: string
  items: string[]
  onAdd: (value: string) => void
  onRemove: (value: string) => void
  onRename: (oldValue: string, newValue: string) => void | Promise<void>
  usage: (value: string) => number
  fallback?: string
}) {
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const add = () => {
    const v = draft.trim()
    if (!v) return
    if (fallback && v.toLowerCase() === fallback.toLowerCase()) {
      setDraft('')
      return
    }
    if (items.some((i) => i.toLowerCase() === v.toLowerCase())) {
      setDraft('')
      return
    }
    onAdd(v)
    setDraft('')
  }

  const startEdit = (item: string) => {
    setEditing(item)
    setEditValue(item)
  }
  const cancelEdit = () => {
    setEditing(null)
    setEditValue('')
  }
  const saveEdit = (item: string) => {
    const v = editValue.trim()
    if (v && v !== item) void onRename(item, v)
    cancelEdit()
  }

  return (
    <Card>
      <CardHeader title={title} subtitle={description} />
      <div className="mb-3 flex gap-2">
        <input
          className="input"
          placeholder={`Add ${title.toLowerCase().replace(/s$/, '')}…`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
        />
        <button className="btn-navy shrink-0 px-3" onClick={add} aria-label={`Add to ${title}`}>
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <ul className="space-y-1.5">
        {items.map((item) => {
          const count = usage(item)
          const isEditing = editing === item
          return (
            <li
              key={item}
              className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2"
            >
              {isEditing ? (
                <>
                  <input
                    className="input h-8 flex-1 px-2 py-1 text-sm"
                    value={editValue}
                    autoFocus
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        saveEdit(item)
                      } else if (e.key === 'Escape') {
                        cancelEdit()
                      }
                    }}
                    onBlur={() => saveEdit(item)}
                  />
                  <span className="flex items-center gap-1">
                    <button
                      className="rounded-md p-1 text-accent-green hover:bg-green-50 dark:hover:bg-green-500/15"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => saveEdit(item)}
                      title="Save"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      className="rounded-md p-1 text-faint hover:bg-subtle"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={cancelEdit}
                      title="Cancel"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </span>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
                    onClick={() => startEdit(item)}
                    title="Click to rename"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-rmit-red" />
                    <span className="truncate text-ink">{item}</span>
                  </button>
                  <span className="flex shrink-0 items-center gap-1">
                    {count > 0 && (
                      <span className="text-[11px] text-muted">
                        {count} task{count === 1 ? '' : 's'}
                      </span>
                    )}
                    <button
                      className="rounded-md p-1 text-faint hover:bg-navy-50 hover:text-rmit-navy dark:hover:bg-white/10 dark:hover:text-white"
                      onClick={() => startEdit(item)}
                      title="Rename"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="rounded-md p-1 text-faint hover:bg-brand-50 hover:text-rmit-red dark:hover:bg-brand-500/15"
                      onClick={() => onRemove(item)}
                      title="Remove"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </span>
                </>
              )}
            </li>
          )
        })}
        {fallback && (
          <li className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-line px-3 py-2">
            <span className="flex min-w-0 items-center gap-2 text-sm">
              <span className="h-2 w-2 shrink-0 rounded-full bg-faint" />
              <span className="truncate text-ink">{fallback}</span>
              <Lock className="h-3 w-3 shrink-0 text-faint" />
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {usage(fallback) > 0 && (
                <span className="text-[11px] text-muted">
                  {usage(fallback)} task{usage(fallback) === 1 ? '' : 's'}
                </span>
              )}
              <span className="text-[11px] uppercase tracking-wide text-faint">fallback</span>
            </span>
          </li>
        )}
        {items.length === 0 && !fallback && <li className="py-2 text-sm text-muted">Nothing here yet.</li>}
      </ul>
    </Card>
  )
}
