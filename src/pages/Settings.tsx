import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Archive, ArrowRightLeft, ArrowUpDown, Check, ChevronDown, Download, ExternalLink, FlaskConical, Loader2, Lock, Pencil, Plus, RotateCcw, Settings2, Tag, Timer, Trash2, Users, X } from 'lucide-react'
import { Card, CardHeader } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { useStore } from '../data/store'
import { taskYears } from '../lib/span'
import { ADMIN_PASSWORD, formatBytes, snapshotYearsLabel, tasksForSnapshotYears, type SnapshotMeta } from '../lib/snapshot'
import {
  SIZES,
  SIZE_DESCRIPTIONS,
  SIZE_TONE,
  FALLBACK_ITEM,
  FUNCTION_COLOR_KEYS,
  functionColor,
  sortAlpha,
  withFallback,
  parseKeywords,
  formatDurationDays,
  DEFAULT_SIZE_DURATIONS,
  RATE_UNITS,
  rateUnitLabel,
  formatRatePerUnit,
  hoursPerUnit,
  effortHeatColor,
  HOURS_PER_WORKING_DAY,
  WORKING_DAYS_PER_WEEK,
} from '../constants'
import { cx, toMessage } from '../lib/format'
import { isMondayLookupEnabled } from '../lib/monday'
import { APP_VERSION, CHANGELOG, type ChangeKind } from '../lib/changelog'
import {
  COMMON_CAMPAIGNS,
  setDashboardPrefs,
  useDashboardPrefs,
  type DemandDim,
} from '../lib/dashboardPrefs'
import { ChartGroupsModal } from '../components/ChartGroupsModal'
import type { AppSettings, AssetRate, AssetRates, FunctionConfig, RatePer, Size } from '../types'

type ListKey = keyof Pick<AppSettings, 'squads' | 'campaigns' | 'types' | 'people' | 'assetTypes'>

/**
 * Fade the bottom edge of a scrollable list to hint "there's more below". Returns
 * a ref for the scroll container; the `is-scroll-faded` mask (index.css) is toggled
 * on only while more content sits below the fold, so it disappears at the bottom and
 * when the list isn't scrollable. Re-checks on scroll, viewport resize and content
 * changes (items added/removed).
 */
function useScrollFade<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const moreBelow = el.scrollHeight - el.scrollTop - el.clientHeight > 1
      el.classList.toggle('is-scroll-faded', moreBelow)
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    const mo = new MutationObserver(update)
    mo.observe(el, { childList: true, subtree: true })
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
      mo.disconnect()
    }
  }, [])
  return ref
}

export function SettingsPage() {
  const { settings, saveSettings, tasks, renameListItem, removeListItem } = useStore()

  const mutate = async (key: ListKey, next: string[]) => {
    await saveSettings({ ...settings, [key]: next })
  }

  // Set/clear a person's monday.com user id (used to auto-fill "Persons in charge").
  const setPersonMondayId = (name: string, id: string) => {
    const next = { ...settings.peopleMondayIds }
    const v = id.trim()
    if (v) next[name] = v
    else delete next[name]
    void saveSettings({ ...settings, peopleMondayIds: next })
  }

  // Set/clear a squad/campaign's auto-select keywords (empty list = remove the entry).
  const setKeywords = (field: 'squadKeywords' | 'campaignKeywords', name: string, kws: string[]) => {
    const next = { ...settings[field] }
    if (kws.length) next[name] = kws
    else delete next[name]
    void saveSettings({ ...settings, [field]: next })
  }

  const usageCount = (key: ListKey, value: string): number => {
    if (key === 'squads') return tasks.filter((t) => t.squad === value).length
    if (key === 'campaigns') return tasks.filter((t) => t.campaign === value).length
    if (key === 'types') return tasks.filter((t) => t.types.includes(value)).length
    if (key === 'assetTypes') return tasks.filter((t) => (t.assetBreakdown[value] ?? 0) > 0).length
    return tasks.filter((t) => t.people.includes(value)).length
  }

  return (
    <div className="space-y-5">
      {/* Dashboard display preferences (collapsible) — includes chart groups,
          deep-linked from the dashboard panels' gear icons (#chart-groups). */}
      <DashboardPrefsCard />

      {/* Groups — collapsible section holding every editable reference list */}
      <CollapsibleSection
        title="Groups"
        subtitle="Squads, campaigns, work types, asset types, people & size turnarounds used across tasks."
        storageKey="mwr.settings.groupsOpen"
      >
        <PrefRow
          title="Allow removing groups already associated with tasks"
          description="Off: an item used by at least one task can’t be removed. On: removing it reassigns those tasks to “Others”."
        >
          <Switch
            checked={settings.allowRemoveUsed}
            onChange={(v) => saveSettings({ ...settings, allowRemoveUsed: v })}
            label="Allow removing groups already associated with tasks"
          />
        </PrefRow>

        {/* `items-start` keeps each panel at its natural height. Stretching them
            to the tallest sibling (Task sizes, which carries the Output rates
            section) left dead space under the shorter lists — and their scroll
            fade floating in the middle of the card instead of on its bottom edge. */}
        <div className="grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
          <ListEditor
            title="Squads"
            description="Requesting stakeholder teams. DOM & INTON are locked (used by the demand chart) but their keywords stay editable."
            items={settings.squads}
            fallback={FALLBACK_ITEM}
            locked={['DOM', 'INTON']}
            allowRemoveUsed={settings.allowRemoveUsed}
            onAdd={(v) => mutate('squads', [...settings.squads, v])}
            onRemove={(v) => removeListItem('squads', v)}
            onRename={(o, n) => renameListItem('squads', o, n)}
            usage={(v) => usageCount('squads', v)}
            keywords={settings.squadKeywords}
            onKeywords={(item, kws) => setKeywords('squadKeywords', item, kws)}
          />
          <ListEditor
            title="Campaigns"
            dotColor="bg-accent-teal"
            description="Specific campaigns or groups. Used in the task form."
            items={settings.campaigns}
            fallback={FALLBACK_ITEM}
            allowRemoveUsed={settings.allowRemoveUsed}
            onAdd={(v) => mutate('campaigns', [...settings.campaigns, v])}
            onRemove={(v) => removeListItem('campaigns', v)}
            onRename={(o, n) => renameListItem('campaigns', o, n)}
            usage={(v) => usageCount('campaigns', v)}
            keywords={settings.campaignKeywords}
            onKeywords={(item, kws) => setKeywords('campaignKeywords', item, kws)}
          />
          {/* Work + asset types share one 2-tabbed card */}
          <TypesCard />
          {/* GCMC functions — per-function task-form tabs (work/asset types + colour) */}
          <FunctionsCard />
          <ListEditor
            title="People"
            dotColor="bg-accent-plum"
            description="Team members who can be assigned. The monday ID maps each person to their monday.com account so the auto-fill can assign them."
            items={settings.people}
            fallback={FALLBACK_ITEM}
            allowRemoveUsed={settings.allowRemoveUsed}
            onAdd={(v) => mutate('people', [...settings.people, v])}
            onRemove={(v) => removeListItem('people', v)}
            onRename={(o, n) => renameListItem('people', o, n)}
            usage={(v) => usageCount('people', v)}
            mondayIds={settings.peopleMondayIds}
            onMondayId={setPersonMondayId}
          />
          {/* Editable task-size turnaround durations — sits beside People */}
          <SizeDurationsCard />
        </div>
      </CollapsibleSection>

      {/* monday.com boards (lookup builds only) + year snapshots — side by side */}
      {isMondayLookupEnabled() ? (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <MondayBoardsCard />
          <SnapshotsCard />
        </div>
      ) : (
        <SnapshotsCard />
      )}

      {/* Version & changelog */}
      <VersionCard />
    </div>
  )
}

/**
 * Configure which monday.com boards the New Task "auto-fill" searches — it scans
 * them all at once. The mapped columns (timeline/size/…) are shared across boards
 * and set as function secrets, so only board ids are configured here. Hidden when
 * the lookup isn't enabled for this build.
 */
function MondayBoardsCard() {
  const { settings, saveSettings } = useStore()
  const [draft, setDraft] = useState('')
  const [pendingRemove, setPendingRemove] = useState<string | null>(null)
  const listRef = useScrollFade<HTMLUListElement>()
  if (!isMondayLookupEnabled()) return null

  const boards = settings.mondayBoardIds
  const names = settings.mondayBoardNames
  const save = (next: string[]) => void saveSettings({ ...settings, mondayBoardIds: next })

  const add = () => {
    const id = draft.trim()
    // Board ids are numeric; accept a full board URL too and pull the id out.
    const parsed = /(\d{5,})/.exec(id)?.[1] ?? ''
    if (!parsed || boards.includes(parsed)) {
      setDraft('')
      return
    }
    save([...boards, parsed])
    setDraft('')
  }

  // Set/clear a board's friendly name (label only — never touches the id list).
  const setName = (id: string, name: string) => {
    const next = { ...names }
    const v = name.trim()
    if (v) next[id] = v
    else delete next[id]
    void saveSettings({ ...settings, mondayBoardNames: next })
  }

  // Remove a board id and drop any name it carried.
  const removeBoard = (id: string) => {
    const nextNames = { ...names }
    delete nextNames[id]
    void saveSettings({ ...settings, mondayBoardIds: boards.filter((b) => b !== id), mondayBoardNames: nextNames })
  }

  return (
    <Card>
      <CardHeader
        title="monday.com boards"
        subtitle="Boards the New Task auto-fill searches — it looks through all of them at once. Paste a board id or its URL."
      />
      <div className="mb-3 flex gap-2">
        <input
          className="input font-mono"
          placeholder="Board id, e.g. 1967557512"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
        />
        <button className="btn-navy shrink-0 px-3" onClick={add} aria-label="Add board">
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <ul ref={listRef} className="max-h-[27rem] space-y-1.5 overflow-y-auto">
        {boards.map((id) => (
          <li
            key={id}
            className="flex items-center gap-2 rounded-lg border border-line bg-card/40 px-3 py-2 transition-all duration-200 hover:bg-card/80"
          >
            <img src="/monday.svg" alt="" className="h-4 w-4 shrink-0" />
            <BoardNameInput value={names[id] ?? ''} onCommit={(v) => setName(id, v)} />
            <a
              href={`https://rmit.monday.com/boards/${encodeURIComponent(id)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1 font-mono text-xs text-muted hover:text-rmit-red"
              title="Open this board on monday.com"
            >
              {id}
              <ExternalLink className="h-3 w-3" />
            </a>
            <button
              className="shrink-0 rounded-md p-1 text-faint hover:bg-brand-50 hover:text-rmit-red dark:hover:bg-brand-500/15"
              onClick={() => setPendingRemove(id)}
              title="Remove board"
              aria-label={`Remove board ${id}`}
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
        {boards.length === 0 && (
          <li className="rounded-lg border border-dashed border-line px-3 py-3 text-sm text-muted">
            No boards yet — the auto-fill has nothing to search. Add at least one.
          </li>
        )}
      </ul>

      <Modal
        open={pendingRemove !== null}
        onClose={() => setPendingRemove(null)}
        title="Remove board"
        footer={
          <>
            <button className="btn-outline" onClick={() => setPendingRemove(null)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={() => {
                if (pendingRemove) removeBoard(pendingRemove)
                setPendingRemove(null)
              }}
            >
              Remove
            </button>
          </>
        }
      >
        {pendingRemove && (
          <div className="flex gap-3 rounded-xl bg-brand-50 p-3 text-sm text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <p>
              Stop the auto-fill from searching board{' '}
              <strong>{names[pendingRemove] || <span className="font-mono">{pendingRemove}</span>}</strong>? You can
              add it back anytime.
            </p>
          </div>
        )}
      </Modal>
    </Card>
  )
}

/**
 * App version, with the latest release notes tucked behind a collapsed-by-default
 * "What's new" toggle. Data in src/lib/changelog.ts.
 */
function VersionCard() {
  const [open, setOpen] = useState(false)
  const latest = CHANGELOG[0]
  const KIND: Record<ChangeKind, { label: string; cls: string }> = {
    new: { label: 'New', cls: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300' },
    improved: { label: 'Improved', cls: 'bg-navy-100 text-navy-700 dark:bg-navy-500/25 dark:text-navy-100' },
    fixed: { label: 'Fixed', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  }
  const fmtDate = (iso?: string) =>
    iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null

  return (
    <Card>
      <CardHeader title="Version" subtitle="This build of the Workload Report." />
      <div className="flex items-center gap-3">
        <span className="text-2xl font-bold text-ink">v{APP_VERSION}</span>
        <span className="rounded-full bg-subtle px-2 py-0.5 text-[11px] font-semibold text-muted">Current</span>
        {latest && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-muted transition hover:text-ink"
          >
            What’s new
            <ChevronDown className={cx('h-4 w-4 transition-transform', open && 'rotate-180')} />
          </button>
        )}
      </div>

      {open && latest && (
        <div className="mt-4 border-t border-line pt-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-ink">v{latest.version}</span>
            {latest.title && <span className="text-sm text-muted">· {latest.title}</span>}
            {fmtDate(latest.date) && <span className="ml-auto text-xs text-faint">{fmtDate(latest.date)}</span>}
          </div>
          <ul className="mt-2 space-y-1.5">
            {latest.notes.map((n, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted">
                <span
                  className={cx(
                    'mt-[3px] shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                    KIND[n.kind].cls,
                  )}
                >
                  {KIND[n.kind].label}
                </span>
                <span className="leading-relaxed">{n.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

/** Human date+time for a snapshot's timestamp. */
function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

/**
 * Year snapshots: freeze all tasks + settings + demo images into a self-contained
 * JSON, and revert / download / delete saved snapshots. Reverting is destructive,
 * so it's gated by the admin password. Saving/reverting embed or re-upload images,
 * which is slow — hence the progress spinners.
 */
function SnapshotsCard() {
  const { snapshots, createSnapshot, revertSnapshot, deleteSnapshot, downloadSnapshot, tasks } = useStore()

  const years = useMemo(() => {
    const set = new Set<number>(taskYears(tasks))
    set.add(new Date().getFullYear())
    return Array.from(set).sort((a, b) => b - a)
  }, [tasks])

  // Create-snapshot modal. `selYears` empty = "all years" (snapshots always
  // capture everything — the years are just a label).
  const [createOpen, setCreateOpen] = useState(false)
  const [selYears, setSelYears] = useState<number[]>([])
  const [name, setName] = useState('')
  const [comment, setComment] = useState('')
  const toggleYear = (y: number) =>
    setSelYears((prev) => (prev.includes(y) ? prev.filter((x) => x !== y) : [...prev, y]))

  // Revert (password-gated) + delete modals
  const [revertTarget, setRevertTarget] = useState<SnapshotMeta | null>(null)
  const [pw, setPw] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<SnapshotMeta | null>(null)

  // Shared busy/progress + error surface
  const [busy, setBusy] = useState<{ label: string; done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const progress = (label: string) => (done: number, total: number) => setBusy({ label, done, total })

  const openCreate = () => {
    setSelYears(years[0] != null ? [years[0]] : [])
    setName('')
    setComment('')
    setError(null)
    setCreateOpen(true)
  }

  const runCreate = async () => {
    setError(null)
    setBusy({ label: 'Freezing state…', done: 0, total: 0 })
    try {
      await createSnapshot({ years: selYears, name, comment }, progress('Embedding images…'))
      setCreateOpen(false)
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const runRevert = async () => {
    if (!revertTarget) return
    if (pw !== ADMIN_PASSWORD) {
      setError('Incorrect admin password.')
      return
    }
    setError(null)
    setBusy({ label: 'Restoring…', done: 0, total: 0 })
    try {
      await revertSnapshot(revertTarget.id, progress('Restoring images…'))
      setRevertTarget(null)
      setPw('')
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const runDelete = async () => {
    if (!deleteTarget) return
    setError(null)
    setBusy({ label: 'Deleting…', done: 0, total: 0 })
    try {
      await deleteSnapshot(deleteTarget.id)
      setDeleteTarget(null)
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const runDownload = async (id: string) => {
    setError(null)
    setBusy({ label: 'Preparing download…', done: 0, total: 0 })
    try {
      await downloadSnapshot(id)
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const busyText = busy
    ? busy.total > 0
      ? `${busy.label} ${busy.done}/${busy.total}`
      : busy.label
    : null

  return (
    <Card>
      <CardHeader
        title="Year snapshots"
        subtitle="Freeze the full workload state (tasks, settings & demo images) into a self-contained JSON you can revert to, download, or delete."
        action={
          <button className="btn-primary" onClick={openCreate} disabled={Boolean(busy)}>
            <Archive className="h-4 w-4" /> Create snapshot
          </button>
        }
      />

      {error && !createOpen && !revertTarget && (
        <p className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
          {error}
        </p>
      )}
      {busy && !createOpen && !revertTarget && !deleteTarget && (
        <p className="mb-3 inline-flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> {busyText}
        </p>
      )}

      {snapshots.length === 0 ? (
        <p className="rounded-xl bg-subtle p-4 text-sm text-muted">
          No snapshots yet. Create one to freeze the current year's data.
        </p>
      ) : (
        <ul className="space-y-2">
          {snapshots.map((s) => (
            <li
              key={s.id}
              className="flex flex-col gap-3 rounded-xl border border-line p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="navy">{snapshotYearsLabel(s)}</Badge>
                  <span className="truncate font-semibold text-ink">{s.name || 'Untitled snapshot'}</span>
                </div>
                {s.comment && <p className="mt-1 text-sm text-muted">{s.comment}</p>}
                <p className="mt-1 text-[11px] text-faint">
                  {formatWhen(s.createdAt)}
                  {s.createdBy ? ` · ${s.createdBy}` : ''} · {s.taskCount} tasks · {s.imageCount} images ·{' '}
                  {formatBytes(s.bytes)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-muted transition hover:border-navy-300 hover:text-ink disabled:opacity-50"
                  onClick={() => {
                    setError(null)
                    setPw('')
                    setRevertTarget(s)
                  }}
                  disabled={Boolean(busy)}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Revert
                </button>
                <button
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-muted transition hover:border-navy-300 hover:text-ink disabled:opacity-50"
                  onClick={() => void runDownload(s.id)}
                  disabled={Boolean(busy)}
                >
                  <Download className="h-3.5 w-3.5" /> JSON
                </button>
                <button
                  className="rounded-lg p-1.5 text-faint transition hover:bg-brand-50 hover:text-rmit-red disabled:opacity-50 dark:hover:bg-brand-500/15"
                  onClick={() => {
                    setError(null)
                    setDeleteTarget(s)
                  }}
                  disabled={Boolean(busy)}
                  title="Delete snapshot"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Create modal */}
      <Modal
        open={createOpen}
        onClose={() => !busy && setCreateOpen(false)}
        title="Create year snapshot"
        closeOnBackdrop={false}
        footer={
          <>
            <button className="btn-outline" onClick={() => setCreateOpen(false)} disabled={Boolean(busy)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={runCreate} disabled={Boolean(busy)}>
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> {busyText}
                </>
              ) : (
                'Save snapshot'
              )}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Years</label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => setSelYears([])}
                className={cx(
                  'rounded-full border px-2.5 py-1 text-xs transition-colors',
                  selYears.length === 0
                    ? 'border-rmit-navy bg-rmit-navy text-white dark:border-white/60 dark:bg-white/15'
                    : 'border-line text-muted hover:border-ink/40',
                )}
              >
                All years
              </button>
              {years.map((y) => {
                const on = selYears.includes(y)
                return (
                  <button
                    key={y}
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => toggleYear(y)}
                    className={cx(
                      'rounded-full border px-2.5 py-1 text-xs transition-colors',
                      on
                        ? 'border-rmit-navy bg-rmit-navy text-white dark:border-white/60 dark:bg-white/15'
                        : 'border-line text-muted hover:border-ink/40',
                    )}
                  >
                    {y}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label className="label">Name</label>
            <input
              className="input h-11"
              placeholder="e.g. End of 2026"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={Boolean(busy)}
            />
          </div>
          <div>
            <label className="label">Comment</label>
            <textarea
              className="input min-h-[80px] resize-y"
              placeholder="Optional — why you're taking this snapshot."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={Boolean(busy)}
            />
          </div>
          <p className="text-xs text-muted">
            Freezes {tasksForSnapshotYears(tasks, selYears).length} tasks and their demo images into a
            self-contained JSON. Embedding images can take a moment.
          </p>
          {error && <p className="text-sm font-medium text-rmit-red">{error}</p>}
        </div>
      </Modal>

      {/* Revert (password-gated) modal */}
      <Modal
        open={Boolean(revertTarget)}
        onClose={() => !busy && setRevertTarget(null)}
        title="Revert to snapshot"
        closeOnBackdrop={false}
        footer={
          <>
            <button className="btn-outline" onClick={() => setRevertTarget(null)} disabled={Boolean(busy)}>
              Cancel
            </button>
            <button
              className="btn bg-rmit-red text-white hover:bg-brand-600 focus:ring-brand-200"
              onClick={runRevert}
              disabled={Boolean(busy) || !pw}
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> {busyText}
                </>
              ) : (
                'Revert'
              )}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex gap-3 rounded-xl bg-brand-50 p-3 text-sm text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <p>
              This <strong>replaces all current tasks and settings</strong> with{' '}
              <strong>{revertTarget?.name || 'this snapshot'}</strong> — {revertTarget?.taskCount} tasks tagged{' '}
              <strong>{revertTarget && snapshotYearsLabel(revertTarget)}</strong>. Any current data{' '}
              {revertTarget && snapshotYearsLabel(revertTarget) !== 'All years' ? 'from other years ' : ''}is not
              kept — snapshot it first if you need it. This can't be undone.
            </p>
          </div>
          <div>
            <label className="label">Admin password</label>
            <input
              type="password"
              className="input h-11"
              placeholder="Enter admin password to confirm"
              value={pw}
              autoFocus
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && pw && !busy && void runRevert()}
              disabled={Boolean(busy)}
            />
          </div>
          {error && <p className="text-sm font-medium text-rmit-red">{error}</p>}
        </div>
      </Modal>

      {/* Delete confirm modal */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => !busy && setDeleteTarget(null)}
        title="Delete snapshot"
        footer={
          <>
            <button className="btn-outline" onClick={() => setDeleteTarget(null)} disabled={Boolean(busy)}>
              Cancel
            </button>
            <button
              className="btn bg-rmit-red text-white hover:bg-brand-600 focus:ring-brand-200"
              onClick={runDelete}
              disabled={Boolean(busy)}
            >
              {busy ? 'Deleting…' : 'Delete'}
            </button>
          </>
        }
      >
        <p className="text-sm text-muted">
          Delete <strong className="text-ink">{deleteTarget?.name || 'this snapshot'}</strong>{' '}
          ({deleteTarget && snapshotYearsLabel(deleteTarget)})?
          The saved JSON and its embedded images are removed. This cannot be undone.
        </p>
      </Modal>
    </Card>
  )
}

/** Editable per-size turnaround (days) used to auto-fill a task's end date, plus
 *  the experimental per-asset-type output rates (both are "how long work takes"
 *  settings, so they sit in the same card). */
function SizeDurationsCard() {
  const { settings, saveSettings } = useStore()
  // Output-rates pop-up (experimental, recorded only — see AssetRatesModal).
  const [ratesOpen, setRatesOpen] = useState(false)
  const rateCount = settings.assetTypes.filter((t) => (settings.assetRates ?? {})[t] !== undefined).length
  const toDraft = () =>
    Object.fromEntries(SIZES.map((s) => [s, String(settings.sizeDurations[s])])) as Record<Size, string>
  const [draft, setDraft] = useState<Record<Size, string>>(toDraft)

  // Re-sync when the stored durations change (after a save or an external update).
  useEffect(() => {
    setDraft(toDraft())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.sizeDurations])

  const [saving, setSaving] = useState(false)

  const parsed = (s: Size) => Math.max(0, Math.round(Number(draft[s]) || 0))
  const dirty = SIZES.some((s) => parsed(s) !== settings.sizeDurations[s])
  const draftIsDefault = SIZES.every((s) => parsed(s) === DEFAULT_SIZE_DURATIONS[s])

  const save = async () => {
    if (!dirty) return
    setSaving(true)
    try {
      const next = Object.fromEntries(SIZES.map((s) => [s, parsed(s)])) as Record<Size, number>
      await saveSettings({ ...settings, sizeDurations: next })
    } finally {
      setSaving(false)
    }
  }

  // "Default" fills the inputs with the default durations; the user then clicks Save.
  const fillDefaults = () =>
    setDraft(Object.fromEntries(SIZES.map((s) => [s, String(DEFAULT_SIZE_DURATIONS[s])])) as Record<Size, string>)

  return (
    <Card className="bg-subtle">
      <CardHeader
        title="Task sizes"
        subtitle="Days added to the start date when auto-filling the end date"
      />
      <p className="mb-3 text-xs text-muted">
        Only affects new tasks and re-auto-fills — existing end dates are left as-is.
      </p>
      <ul className="space-y-1.5">
        {SIZES.map((s) => (
          <li
            key={s}
            className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Badge tone={SIZE_TONE[s]}>{s}</Badge>
              <span className="truncate text-xs text-muted" title={SIZE_DESCRIPTIONS[s]}>
                {SIZE_DESCRIPTIONS[s]}
              </span>
            </span>
            <span
              className="flex shrink-0 items-center gap-1.5"
              title={`≈ ${formatDurationDays(parsed(s))}`}
            >
              <input
                type="number"
                min={0}
                inputMode="numeric"
                className="input h-8 w-16 px-2 py-1 text-right text-sm"
                value={draft[s]}
                onChange={(e) => setDraft((d) => ({ ...d, [s]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void save()
                  }
                }}
              />
              <span className="text-xs text-muted">days</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={fillDefaults}
          disabled={draftIsDefault}
          className="btn-outline h-9 px-3 text-sm disabled:cursor-default disabled:opacity-40"
          title="Fill the inputs with the default durations"
        >
          Default
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="btn-primary h-9 px-4 text-sm disabled:cursor-default disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Output rates — how many of each asset type we finish in how long.
          EXPERIMENTAL: recorded only, no calculation reads it (see
          AssetRatesModal). Keyed by asset type, but it belongs with the other
          "how long does work take" settings rather than the asset-type LIST. */}
      <div className="mt-4 border-t border-line pt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-ink">
              <Timer className="h-3.5 w-3.5 shrink-0 text-accent-plum" />
              Output rates
              <Badge tone="plum">Experimental</Badge>
            </h4>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Roughly how many of each asset type we finish, and in how long — so a banner isn&rsquo;t counted
              as the same amount of work as a photo edit. Recorded only for now; no number in the app changes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRatesOpen(true)}
            className="btn-outline h-8 shrink-0 px-3 text-xs"
          >
            {rateCount > 0 ? `Edit rates · ${rateCount}/${settings.assetTypes.length}` : 'Set rates'}
          </button>
        </div>
      </div>
      <AssetRatesModal open={ratesOpen} onClose={() => setRatesOpen(false)} />
    </Card>
  )
}

/** Collapsible Dashboard settings: display toggles (per-browser) + synced chart
 *  groups. Deep-linked to #chart-groups by the gear on the dashboard panels. */
function DashboardPrefsCard() {
  const prefs = useDashboardPrefs()
  const { settings } = useStore()
  const [groupsOpen, setGroupsOpen] = useState(false)
  const groupCount = (settings.chartGroups?.asset.length ?? 0) + (settings.chartGroups?.type.length ?? 0)

  return (
    <CollapsibleSection
      title="Dashboard"
      subtitle="How the dashboard charts are displayed"
      storageKey="mwr.settings.dashboardOpen"
    >
      <div className="space-y-2">
        <PrefRow
          title="Demand by stakeholders — dimension"
          description="Split the demand chart by asset type or work type."
        >
          <div className="flex items-center gap-0.5 rounded-lg bg-subtle p-0.5">
            {(
              [
                ['asset', 'Asset type'],
                ['type', 'Work type'],
              ] as [DemandDim, string][]
            ).map(([d, label]) => (
              <button
                key={d}
                onClick={() => setDashboardPrefs({ demandDim: d })}
                className={cx(
                  'rounded-md px-2.5 py-1 text-xs font-semibold transition',
                  prefs.demandDim === d
                    ? 'bg-rmit-navy text-white dark:bg-navy-300'
                    : 'text-muted hover:text-ink',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </PrefRow>
        <PrefRow
          title={`Hide ${COMMON_CAMPAIGNS.join(' / ')} campaigns`}
          description="Leaves the ongoing and catch-all campaigns out of “Tasks by campaign” and “Asset count by campaign”."
        >
          <Switch
            checked={prefs.hideCommonCampaigns}
            onChange={(v) => setDashboardPrefs({ hideCommonCampaigns: v })}
            label={`Hide ${COMMON_CAMPAIGNS.join(' / ')} campaigns`}
          />
        </PrefRow>
        <PrefRow
          title="Show “Tasks by person”"
          description="Adds the per-person chart to the dashboard. Hidden by default; hiding it gives “Workload across the year” more width."
        >
          <Switch
            checked={prefs.showTasksByPerson}
            onChange={(v) => setDashboardPrefs({ showTasksByPerson: v })}
            label="Show Tasks by person"
          />
        </PrefRow>
        <PrefRow
          title="Chart groups"
          description="Bundle asset / work types into named, coloured groups so the mix & demand charts stay readable. Also reachable from the gear on those panels."
        >
          <button type="button" className="btn-outline whitespace-nowrap" onClick={() => setGroupsOpen(true)}>
            <Settings2 className="h-4 w-4" />
            Manage{groupCount > 0 ? ` (${groupCount})` : ''}
          </button>
        </PrefRow>
      </div>

      <ChartGroupsModal open={groupsOpen} onClose={() => setGroupsOpen(false)} />
    </CollapsibleSection>
  )
}

/** A single setting: a tinted row so controls read as distinct from the (bold)
 *  card title above them, not like more headings. */
function PrefRow({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-subtle px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="text-xs text-muted">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

/** A page-level, collapsible grouping of cards with a bold section header.
 *  Open state persists in localStorage under `storageKey`. */
function CollapsibleSection({
  title,
  subtitle,
  storageKey,
  children,
  initialOpenHash,
}: {
  title: string
  subtitle?: string
  storageKey: string
  children: React.ReactNode
  /** When the page loads with this URL hash, force the section open (deep-link). */
  initialOpenHash?: string
}) {
  const [open, setOpen] = useState<boolean>(() => {
    try {
      if (initialOpenHash && window.location.hash === initialOpenHash) return true
      return localStorage.getItem(storageKey) !== '0'
    } catch {
      return true
    }
  })
  const toggle = () =>
    setOpen((o) => {
      const next = !o
      try {
        localStorage.setItem(storageKey, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })

  return (
    <Card>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className={cx('flex w-full items-start justify-between gap-3 text-left', open && 'mb-4')}
      >
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        <ChevronDown
          className={cx('mt-0.5 h-5 w-5 shrink-0 text-muted transition-transform', !open && '-rotate-90')}
        />
      </button>
      {open && <div className="space-y-4">{children}</div>}
    </Card>
  )
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative h-6 w-11 rounded-full transition-colors',
        checked ? 'bg-rmit-navy dark:bg-navy-300' : 'bg-line',
      )}
    >
      <span
        className={cx(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-soft transition-all',
          checked ? 'left-[22px]' : 'left-0.5',
        )}
      />
    </button>
  )
}

/** monday account slug — user profiles live at https://<slug>.monday.com/users/<id>. */
const MONDAY_ACCOUNT = 'rmit'

/**
 * Per-person monday user-id control: edit locally, then **Save** (✓ / Enter),
 * **Discard** (↩ / Esc, revert to saved), or **Clear** (× when a value is saved).
 * The monday.com logo links to the user's profile (previews whatever id is typed).
 */
function MondayIdInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value]) // resync if the stored value changes (e.g. rename)
  const dirty = v.trim() !== value.trim()
  const preview = v.trim()
  const profileUrl = preview ? `https://${MONDAY_ACCOUNT}.monday.com/users/${encodeURIComponent(preview)}` : null

  return (
    <span className="flex w-full items-center gap-1.5">
      {profileUrl ? (
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={`Open monday profile (${preview})`}
          className="shrink-0 rounded p-0.5 transition hover:bg-subtle"
        >
          <img src="/monday.svg" alt="monday" className="h-4 w-4" />
        </a>
      ) : (
        <img src="/monday.svg" alt="" className="h-4 w-4 shrink-0 opacity-30" title="Enter a monday user id" />
      )}
      {/* The trailing controls (clear, or save/discard) sit INSIDE the field, so
          the row stays tidy. Right padding scales to how many icons are showing. */}
      <span className="relative min-w-0 flex-1">
        <input
          className={cx(
            'input h-7 w-full py-0 pl-2 text-xs font-mono',
            dirty ? 'pr-12' : value.trim() ? 'pr-7' : 'pr-2',
          )}
          placeholder="monday ID"
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && dirty) {
              e.preventDefault()
              onCommit(v.trim())
            } else if (e.key === 'Escape') {
              e.preventDefault()
              setV(value)
            }
          }}
          title="monday.com user id — used to auto-fill this person from a board item"
        />
        <span className="absolute inset-y-0 right-1 flex items-center gap-0.5">
          {dirty ? (
            <>
              <button
                type="button"
                onClick={() => onCommit(v.trim())}
                title="Save"
                className="rounded p-0.5 text-accent-green hover:bg-green-50 dark:hover:bg-green-500/15"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setV(value)}
                title="Discard"
                className="rounded p-0.5 text-faint hover:bg-subtle"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </>
          ) : value.trim() ? (
            <button
              type="button"
              onClick={() => onCommit('')}
              title="Clear"
              className="rounded p-0.5 text-faint hover:bg-brand-50 hover:text-rmit-red dark:hover:bg-brand-500/15"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </span>
      </span>
    </span>
  )
}

/** Inline, commit-on-blur name field for a monday board row (label only). */
function BoardNameInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value]) // resync if the stored name changes elsewhere
  const commit = () => {
    if (v.trim() !== value.trim()) onCommit(v.trim())
  }
  return (
    <input
      // Borderless so it reads as part of the row (no box-in-a-box); a subtle
      // hover/focus tint hints it's editable.
      className="h-7 min-w-0 flex-1 rounded-md border-0 bg-transparent px-1.5 text-sm font-medium text-ink outline-none transition placeholder:font-normal placeholder:text-faint hover:bg-subtle/60 focus:bg-subtle"
      placeholder="Name this board (optional)"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
          ;(e.target as HTMLInputElement).blur()
        } else if (e.key === 'Escape') {
          setV(value)
        }
      }}
    />
  )
}

/** One row's in-progress values — kept as strings so a half-typed number survives. */
type RateDraft = { qty: string; every: string; per: RatePer }

/**
 * Number field for the output-rate rows. Mouse-wheel steps the value (±1, ±10
 * with Shift) whenever the pointer is over the field — no focus or click needed.
 * The listener is registered natively with `passive: false`: React routes wheel
 * events through a passive root listener, so an onWheel prop couldn't
 * preventDefault and the surrounding list would scroll instead of the value
 * changing. NB the flip side of hover-stepping is that the wheel can't scroll the
 * list while the pointer sits on a field — move off the inputs to scroll.
 */
function RateNumberInput({
  value,
  onValue,
  onEnter,
  min,
  ariaLabel,
  className,
  placeholder,
}: {
  value: string
  onValue: (next: string) => void
  onEnter: () => void
  min: number
  ariaLabel: string
  className: string
  placeholder?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  // Latest callback in a ref so the listener is registered once, not per render.
  const emit = useRef(onValue)
  emit.current = onValue

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const current = Number(el.value)
      const base = el.value.trim() === '' || !Number.isFinite(current) ? min : current
      const step = e.shiftKey ? 10 : 1
      const next = base + (e.deltaY < 0 ? step : -step)
      emit.current(String(Math.max(min, Math.round(next * 100) / 100)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [min])

  return (
    <input
      ref={ref}
      type="number"
      min={min}
      step="any"
      inputMode="decimal"
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={className}
      value={value}
      onChange={(e) => onValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onEnter()
        }
      }}
    />
  )
}

/**
 * Output rates per asset type — "how many assets in how long" (e.g. 300 images
 * per day, or 1 publication per 3 days).
 *
 * EXPERIMENTAL / RECORDED ONLY. This writes `settings.assetRates` and NOTHING
 * reads it: every dashboard number, chart, total and export still counts each
 * asset as 1. It exists so the real per-unit effort of each asset type is
 * captured now, for an effort-weighted view to be built on later.
 */
function AssetRatesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, saveSettings } = useStore()
  const assetTypes = useMemo(() => sortAlpha(settings.assetTypes), [settings.assetTypes])
  const stored = settings.assetRates ?? {}

  const toDraft = (): Record<string, RateDraft> =>
    Object.fromEntries(
      assetTypes.map((name) => {
        const r = stored[name]
        return [
          name,
          { qty: r ? String(r.qty) : '', every: r ? String(r.every) : '1', per: r?.per ?? 'day' },
        ]
      }),
    )
  const [draft, setDraft] = useState<Record<string, RateDraft>>(toDraft)
  const [saving, setSaving] = useState(false)
  const listRef = useScrollFade<HTMLUListElement>()

  // Re-seed each time the pop-up opens, and whenever the asset-type list or the
  // stored rates change under it (adds, removals and renames from the Asset types
  // panel flow straight through — both read the same settings).
  useEffect(() => {
    if (!open) return
    const seeded = toDraft()
    setDraft(seeded)
    setSortMode('effort') // every visit opens ranked by effort
    setEffortRank(rankByEffort(seeded))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, settings.assetRates, settings.assetTypes])

  const set = (name: string, patch: Partial<RateDraft>) =>
    setDraft((d) => ({ ...d, [name]: { ...(d[name] ?? { qty: '', every: '1', per: 'day' }), ...patch } }))

  /** A row as a storable rate — null when blank or not a positive pair (= "not set"). */
  const parseRow = (row: RateDraft | undefined): AssetRate | null => {
    if (!row) return null
    const qty = Number(row.qty)
    const every = row.every.trim() === '' ? 1 : Number(row.every)
    if (!Number.isFinite(qty) || qty <= 0) return null
    if (!Number.isFinite(every) || every <= 0) return null
    return { qty, every, per: row.per }
  }

  // Only rates for asset types that still exist are kept — saving also prunes
  // any stale keys left behind by types removed before this panel existed.
  const next = useMemo(() => {
    const out: AssetRates = {}
    for (const name of assetTypes) {
      const r = parseRow(draft[name])
      if (r) out[name] = r
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, assetTypes])

  /** Hours one unit takes for a row's CURRENT draft (0 = unrated). */
  const rowHours = (name: string) => hoursPerUnit(parseRow(draft[name]) ?? undefined)

  /**
   * Scale for the inline effort bars — the slowest rated type fills its bar and
   * every other type is drawn in proportion, so the gap between a photo edit and
   * a publication is visible right where the numbers are typed. Needs two rates
   * before there's any relationship worth drawing.
   */
  const scale = useMemo(() => {
    const rated = assetTypes.map(rowHours).filter((h) => h > 0)
    if (rated.length < 2) return null
    return { slowest: Math.max(...rated) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, assetTypes])

  /** Row order — effort (slowest first) is the default; 'name' is plain A–Z. */
  const [sortMode, setSortMode] = useState<'effort' | 'name'>('effort')
  /**
   * The effort ranking, FROZEN. Re-taken only when the pop-up opens or the sort
   * button is pressed — never derived live from the draft, because re-ranking
   * rows while someone types would move the field out from under their cursor.
   */
  const [effortRank, setEffortRank] = useState<string[]>([])

  /** Rank a draft by effort: slowest first, unrated last, ties A–Z. */
  const rankByEffort = (d: Record<string, RateDraft>) =>
    assetTypes
      .map((name) => ({ name, hours: hoursPerUnit(parseRow(d[name]) ?? undefined) }))
      .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name))
      .map((r) => r.name)

  const orderedTypes = useMemo(() => {
    if (sortMode === 'name') return assetTypes // already alphabetical
    const rank = new Map(effortRank.map((n, i) => [n, i]))
    // A type ADDED since the snapshot has no rank — it falls to the end, A–Z —
    // and one removed simply never appears, so the rows track the asset-type list.
    return [...assetTypes].sort(
      (a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity) || a.localeCompare(b),
    )
  }, [assetTypes, sortMode, effortRank])

  const same = (a: AssetRate | undefined, b: AssetRate | undefined) =>
    (!a && !b) || (!!a && !!b && a.qty === b.qty && a.every === b.every && a.per === b.per)
  const dirty = assetTypes.some((n) => !same(next[n], stored[n]))
  const setCount = Object.keys(next).length

  const save = async () => {
    if (!dirty) return
    setSaving(true)
    try {
      await saveSettings({ ...settings, assetRates: next })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      widthClass="max-w-7xl"
      title={
        <span className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-accent-plum" />
          Output rates — asset types
          <Badge tone="plum">Experimental</Badge>
        </span>
      }
      footer={
        <>
          <button className="btn-outline" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary disabled:cursor-default disabled:opacity-40"
            type="button"
            onClick={save}
            disabled={!dirty || saving}
          >
            {saving ? 'Saving…' : 'Save rates'}
          </button>
        </>
      }
    >
      {/* Explanation on the left, the rates themselves on the right — the asset
          type list is long, so it gets the room and its own scroll. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
        <div className="space-y-3">
          {/* What this does RIGHT NOW — stated first so nobody expects the
              dashboard to move after filling this in. */}
          <div className="flex gap-2.5 rounded-xl border border-line bg-subtle px-3 py-2.5">
            <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-accent-plum" />
            <p className="text-xs leading-relaxed text-muted">
              <strong className="text-ink">Nothing uses these yet.</strong> Saving a rate changes no number
              anywhere in the app — the dashboard, every chart and all exports still count each asset as 1.
              We&rsquo;re collecting the data now so an effort-weighted view can be built on it later.
            </p>
          </div>

          <div className="space-y-2.5 text-xs leading-relaxed text-muted">
            <p>
              <strong className="text-ink">Why we need this.</strong> The report counts assets, so 300 photo
              edits and 10 banners read as a 30:1 difference in output — even when the banners took longer to
              make. A rate records how much work one unit of each asset type actually is, so the two can be
              compared fairly.
            </p>
            <p>
              <strong className="text-ink">What to enter.</strong> Roughly how many of that asset type{' '}
              <em>one person</em> finishes in a given stretch of time, for a typical job of that kind. Count
              hands-on working time only — leave out waiting on feedback, approvals, or assets from someone
              else. Use whichever span reads most naturally: &ldquo;300 per 1 day&rdquo; or &ldquo;1 per 3
              days&rdquo;.
            </p>
            <p>
              <strong className="text-ink">Rough is fine.</strong> What matters is the gap between 30 minutes
              and 3 days, not 40 minutes versus 45. Leave anything you&rsquo;re unsure about blank — a blank
              rate is recorded as &ldquo;not specified&rdquo;, which is more useful to us than a guess.
            </p>
          </div>
        </div>

        {assetTypes.length === 0 ? (
          <p className="rounded-xl border border-line px-3.5 py-3 text-sm text-muted">
            No asset types yet — add some in the Asset types list first.
          </p>
        ) : (
          <div className="flex min-w-0 flex-col">
            {/* Sorting is explicit: ranking rows live as the numbers change would
                shift the field under the cursor mid-edit. */}
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-faint">
                {scale
                  ? 'Bars are to scale against the slowest rated type. Hover a field and scroll to nudge it (Shift for ±10).'
                  : 'Rate two or more types to see how they compare.'}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (sortMode === 'effort') {
                    setSortMode('name')
                  } else {
                    setEffortRank(rankByEffort(draft)) // re-rank on demand, from what's typed now
                    setSortMode('effort')
                  }
                }}
                className="btn-outline flex h-7 shrink-0 items-center gap-1.5 px-2.5 text-[11px]"
                title={
                  sortMode === 'effort'
                    ? 'List the rows alphabetically instead'
                    : 'Re-rank the rows by effort, slowest first (a one-off — rows never move while you type)'
                }
              >
                <ArrowUpDown className="h-3 w-3" />
                {sortMode === 'effort' ? 'Sort A–Z' : 'Sort by effort'}
              </button>
            </div>
            <div className="mb-1.5 flex items-center gap-2.5 px-2.5 text-[10px] font-semibold uppercase tracking-wide text-faint">
              <span className="min-w-0 flex-1">Asset type</span>
              <span className="w-[16.75rem] shrink-0">Assets per time</span>
              <span
                className="w-40 shrink-0"
                title={`Bar length is to scale against the slowest rated type; colour is a heat scale from under 15 min (cool) to over 3 days (hot). Assumes a ${HOURS_PER_WORKING_DAY}-hour working day and a ${WORKING_DAYS_PER_WEEK}-day week.`}
              >
                Relative effort
              </span>
              <span className="w-[5.5rem] shrink-0 text-right">Works out as</span>
              <span className="w-6 shrink-0" />
            </div>
            <ul ref={listRef} className="max-h-[30rem] space-y-1 overflow-y-auto">
              {orderedTypes.map((name) => {
                const row = draft[name] ?? { qty: '', every: '1', per: 'day' as RatePer }
                const parsed = parseRow(row)
                const everyNum = Number(row.every) || 1
                const hours = parsed ? hoursPerUnit(parsed) : 0
                return (
                  <li
                    key={name}
                    className="flex items-center gap-2.5 rounded-lg border border-line px-2.5 py-1"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-green" />
                      <span className="truncate text-sm font-medium text-ink" title={name}>
                        {name}
                      </span>
                    </span>
                    <span className="flex w-[16.75rem] shrink-0 items-center gap-1.5">
                      <RateNumberInput
                        min={0}
                        placeholder="—"
                        ariaLabel={`${name} — assets produced`}
                        className="input input-stepper h-8 w-[4.25rem] px-2 py-0 text-right text-sm"
                        value={row.qty}
                        onValue={(qty) => set(name, { qty })}
                        onEnter={() => void save()}
                      />
                      <span className="shrink-0 text-[11px] text-muted">per</span>
                      <RateNumberInput
                        min={1}
                        ariaLabel={`${name} — length of the time span`}
                        className="input input-stepper h-8 w-[4rem] px-2 py-0 text-right text-sm"
                        value={row.every}
                        onValue={(every) => set(name, { every })}
                        onEnter={() => void save()}
                      />
                      <select
                        aria-label={`${name} — time unit`}
                        className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-card px-1.5 text-xs text-ink outline-none focus:border-rmit-red"
                        value={row.per}
                        onChange={(e) => set(name, { per: e.target.value as RatePer })}
                      >
                        {RATE_UNITS.map((u) => (
                          <option key={u} value={u}>
                            {rateUnitLabel(everyNum, u)}
                          </option>
                        ))}
                      </select>
                    </span>
                    {/* Effort bar — this row's time per unit against the slowest
                        rated type, so the relationship between the asset types is
                        visible right where the numbers are entered. */}
                    <span className="h-2.5 w-40 shrink-0 overflow-hidden rounded-full bg-subtle">
                      {scale && hours > 0 && (
                        <span
                          className="block h-full rounded-full"
                          // Floored at 2px so a type that really is 3000× quicker
                          // is still visible instead of vanishing to zero width.
                          style={{
                            width: `${(hours / scale.slowest) * 100}%`,
                            minWidth: '2px',
                            backgroundColor: effortHeatColor(hours),
                          }}
                        />
                      )}
                    </span>
                    {/* Implied time for one unit — a sanity check on the numbers
                        to the left, not a stored value. */}
                    <span
                      className={cx(
                        'w-[5.5rem] shrink-0 truncate text-right text-[11px]',
                        parsed ? 'text-muted' : 'text-faint',
                      )}
                    >
                      {parsed ? formatRatePerUnit(parsed).replace('≈ ', '') : 'Not set'}
                    </span>
                    <button
                      type="button"
                      onClick={() => set(name, { qty: '', every: '1', per: 'day' })}
                      disabled={!row.qty}
                      title="Clear this rate"
                      aria-label={`Clear the rate for ${name}`}
                      className="shrink-0 rounded-md p-1 text-faint transition hover:bg-subtle hover:text-ink disabled:invisible"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                )
              })}
            </ul>
            <p className="mt-2 text-[11px] text-faint">
              {setCount} of {assetTypes.length} asset type{assetTypes.length === 1 ? ' has' : 's have'} a rate.
            </p>
          </div>
        )}
      </div>

    </Modal>
  )
}

/**
 * Work types + Asset types in one card, switched by a 2-tab strip — they share
 * the same editor UI and are both drawn on by the Functions panel, so they live
 * together while their data stays two separate settings lists.
 */
function TypesCard() {
  const { settings, saveSettings, tasks, renameListItem, removeListItem } = useStore()
  const [tab, setTab] = useState<'types' | 'assetTypes'>('types')
  const isTypes = tab === 'types'
  const mutate = (key: 'types' | 'assetTypes', next: string[]) => void saveSettings({ ...settings, [key]: next })
  const usage = (key: 'types' | 'assetTypes', v: string) =>
    key === 'types'
      ? tasks.filter((t) => t.types.includes(v)).length
      : tasks.filter((t) => (t.assetBreakdown[v] ?? 0) > 0).length

  const TabBtn = ({ value, label }: { value: 'types' | 'assetTypes'; label: string }) => (
    <button
      type="button"
      onClick={() => setTab(value)}
      className={cx(
        'rounded-md px-3 py-1 text-sm font-semibold transition',
        tab === value ? 'bg-rmit-navy text-white dark:bg-navy-300' : 'text-muted hover:text-ink',
      )}
    >
      {label}
    </button>
  )

  return (
    <Card className="bg-subtle">
      <div className="mb-3 inline-flex items-center gap-0.5 rounded-lg bg-card p-1 shadow-soft">
        <TabBtn value="types" label="Work types" />
        <TabBtn value="assetTypes" label="Asset types" />
      </div>
      {isTypes ? (
        <ListEditor
          bare
          hideHeading
          title="Work types"
          dotColor="bg-accent-gold"
          description="Categories of design work. Each function picks which to show on its task-form tab."
          items={settings.types}
          fallback={FALLBACK_ITEM}
          allowRemoveUsed={settings.allowRemoveUsed}
          onAdd={(v) => mutate('types', [...settings.types, v])}
          onRemove={(v) => removeListItem('types', v)}
          onRename={(o, n) => renameListItem('types', o, n)}
          usage={(v) => usage('types', v)}
        />
      ) : (
        <ListEditor
          bare
          hideHeading
          title="Asset types"
          dotColor="bg-accent-green"
          description="Deliverable types counted in the asset breakdown. Each function picks which to show."
          items={settings.assetTypes}
          fallback={FALLBACK_ITEM}
          allowRemoveUsed={settings.allowRemoveUsed}
          onAdd={(v) => mutate('assetTypes', [...settings.assetTypes, v])}
          onRemove={(v) => removeListItem('assetTypes', v)}
          onRename={(o, n) => renameListItem('assetTypes', o, n)}
          usage={(v) => usage('assetTypes', v)}
        />
      )}
    </Card>
  )
}

/**
 * GCMC functions panel — each function is a tab in the task form, with its own
 * colour and its own pick of work/asset types. Removal is always blocked while
 * a function still has tasks with recorded workload (there's no fallback that
 * could absorb per-function data), independent of the Groups toggle.
 */
function FunctionsCard() {
  const { settings, saveSettings, renameFunction, removeFunction, functionUsage } = useStore()
  const functions = settings.functions
  const [draft, setDraft] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [blockedRemove, setBlockedRemove] = useState<string | null>(null)
  const [pendingRemove, setPendingRemove] = useState<string | null>(null)
  const [picModalFn, setPicModalFn] = useState<string | null>(null)
  const [picSearch, setPicSearch] = useState('')
  const listRef = useScrollFade<HTMLUListElement>()

  const add = () => {
    const v = draft.trim()
    if (!v || functions.some((f) => f.name.toLowerCase() === v.toLowerCase())) {
      setDraft('')
      return
    }
    // Pick the first preset colour not in use (cycles once all are taken).
    const used = new Set(functions.map((f) => f.color))
    const color = FUNCTION_COLOR_KEYS.find((k) => !used.has(k)) ?? FUNCTION_COLOR_KEYS[functions.length % FUNCTION_COLOR_KEYS.length]
    // A new function starts offering ALL current types; trim per function below.
    void saveSettings({
      ...settings,
      functions: [
        ...functions,
        { name: v, color, workTypes: [...settings.types], assetTypes: [...settings.assetTypes], people: [] },
      ],
    })
    setDraft('')
  }

  const patch = (name: string, p: Partial<FunctionConfig>) =>
    void saveSettings({ ...settings, functions: functions.map((f) => (f.name === name ? { ...f, ...p } : f)) })

  // Checked = offered on the tab. Inclusion list, so a newly added master type
  // is NOT offered until the user opts this function in here.
  const toggleType = (fn: FunctionConfig, kind: 'workTypes' | 'assetTypes', t: string) => {
    const next = fn[kind].includes(t) ? fn[kind].filter((x) => x !== t) : [...fn[kind], t]
    patch(fn.name, { [kind]: next })
  }

  const saveEdit = (name: string) => {
    const v = editValue.trim()
    if (v && v !== name) {
      void renameFunction(name, v)
      if (expanded === name) setExpanded(v)
    }
    setEditing(null)
    setEditValue('')
  }

  const requestRemove = (name: string) => {
    if (functionUsage(name) > 0) setBlockedRemove(name)
    else setPendingRemove(name)
  }

  return (
    <Card className="bg-subtle">
      <CardHeader
        title="Functions"
        subtitle="GCMC functions that record workload — each gets its own tab in the task form. Expand one to pick its colour, type offers, and auto-enable PICs."
      />
      <div className="mb-3 flex gap-2">
        <input
          className="input"
          placeholder="Add function…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
        />
        <button className="btn-navy shrink-0 px-3" onClick={add} aria-label="Add function">
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <ul ref={listRef} className="max-h-[34rem] space-y-1.5 overflow-y-auto">
        {functions.map((f) => {
          const count = functionUsage(f.name)
          const isOpen = expanded === f.name
          const isEditing = editing === f.name
          return (
            <li key={f.name} className="rounded-lg border border-line bg-card/40 transition-all duration-200 hover:bg-card/80">
              <div className="flex items-center gap-2 px-3 py-2">
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
                          saveEdit(f.name)
                        } else if (e.key === 'Escape') {
                          setEditing(null)
                        }
                      }}
                      onBlur={() => saveEdit(f.name)}
                    />
                    <button
                      className="rounded-md p-1 text-accent-green hover:bg-green-50 dark:hover:bg-green-500/15"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => saveEdit(f.name)}
                      title="Save"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
                      onClick={() => setExpanded(isOpen ? null : f.name)}
                      title="Configure this function"
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: functionColor(f.color).hex }}
                      />
                      <span className="truncate text-ink">{f.name}</span>
                      <ChevronDown className={cx('h-3.5 w-3.5 shrink-0 text-faint transition-transform', isOpen && 'rotate-180')} />
                    </button>
                    <span className="flex shrink-0 items-center gap-1">
                      {count > 0 && (
                        <span className="mr-2 text-[11px] text-muted">
                          {count} task{count === 1 ? '' : 's'}
                        </span>
                      )}
                      <button
                        type="button"
                        className={cx(
                          'relative rounded-md p-1 transition-colors hover:bg-navy-50 hover:text-rmit-navy dark:hover:bg-white/10 dark:hover:text-white',
                          (f.people?.length ?? 0) > 0 ? 'text-rmit-navy dark:text-white' : 'text-faint',
                        )}
                        onClick={() => setPicModalFn(f.name)}
                        title={
                          (f.people?.length ?? 0) > 0
                            ? `Auto-enable PICs (${f.people?.length} assigned): ${f.people?.join(', ')}`
                            : 'Assign auto-enable PICs'
                        }
                      >
                        <Users className="h-3.5 w-3.5" />
                        {(f.people?.length ?? 0) > 0 && (
                          <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent-green" />
                        )}
                      </button>
                      <button
                        className="rounded-md p-1 text-faint hover:bg-navy-50 hover:text-rmit-navy dark:hover:bg-white/10 dark:hover:text-white"
                        onClick={() => {
                          setEditing(f.name)
                          setEditValue(f.name)
                        }}
                        title="Rename"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="rounded-md p-1 text-faint hover:bg-brand-50 hover:text-rmit-red dark:hover:bg-brand-500/15"
                        onClick={() => requestRemove(f.name)}
                        title="Remove"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </span>
                  </>
                )}
              </div>
              {isOpen && !isEditing && (
                <div className="space-y-5 border-t border-line px-3.5 py-4">
                  <div>
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-faint">Tab colour</div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {FUNCTION_COLOR_KEYS.filter(
                        // Hide colours already taken by another function, keeping only
                        // free ones + this function's own — so every function stays distinct.
                        (k) => k === f.color || !functions.some((o) => o.name !== f.name && o.color === k),
                      ).map((k) => (
                        <button
                          key={k}
                          type="button"
                          style={{ backgroundColor: functionColor(k).hex }}
                          className={cx(
                            'h-5 w-5 rounded-full transition-transform',
                            f.color === k ? 'ring-2 ring-offset-1 ring-ink/40 scale-110' : 'opacity-60 hover:opacity-100',
                          )}
                          onClick={() => patch(f.name, { color: k })}
                          title={k}
                          aria-label={`Colour ${k}`}
                        />
                      ))}
                    </div>
                  </div>
                  <TypePicker
                    label="Work types on this tab"
                    all={sortAlpha(settings.types)}
                    included={f.workTypes}
                    onToggle={(t) => toggleType(f, 'workTypes', t)}
                    onClear={() => patch(f.name, { workTypes: [] })}
                  />
                  <TypePicker
                    label="Asset types on this tab"
                    all={sortAlpha(settings.assetTypes)}
                    included={f.assetTypes}
                    onToggle={(t) => toggleType(f, 'assetTypes', t)}
                    onClear={() => patch(f.name, { assetTypes: [] })}
                  />
                  <p className="border-t border-line pt-3 text-[11px] leading-relaxed text-faint">
                    Only checked types appear on this tab. Newly added types aren’t offered until you check them
                    here — values a task already has always stay visible.
                  </p>
                </div>
              )}
            </li>
          )
        })}
        {functions.length === 0 && <li className="py-2 text-sm text-muted">No functions yet — add one above.</li>}
      </ul>

      {/* Pop-up modal to pick assigned PICs from the actual live people list */}
      {picModalFn && (() => {
        const targetFn = functions.find((f) => f.name === picModalFn)
        if (!targetFn) return null
        const currentPics = targetFn.people ?? []
        const allPeople = withFallback(settings.people)
        const filteredPeople = allPeople.filter((p: string) => p.toLowerCase().includes(picSearch.toLowerCase().trim()))

        const togglePerson = (person: string) => {
          const next = currentPics.includes(person)
            ? currentPics.filter((p: string) => p !== person)
            : [...currentPics, person]
          patch(targetFn.name, { people: next })
        }

        const selectAll = () => patch(targetFn.name, { people: [...allPeople] })
        const clearAll = () => patch(targetFn.name, { people: [] })

        return (
          <Modal
            open={true}
            onClose={() => {
              setPicModalFn(null)
              setPicSearch('')
            }}
            title={`Auto-enable PICs — ${targetFn.name}`}
            footer={
              <button
                className="btn-navy"
                type="button"
                onClick={() => {
                  setPicModalFn(null)
                  setPicSearch('')
                }}
              >
                Done
              </button>
            }
          >
            <div className="space-y-4">
              <p className="text-xs leading-relaxed text-muted">
                When any of these selected people are chosen in the task form's <strong className="text-ink">Person(s) in charge</strong> field, the <strong className="text-ink">{targetFn.name}</strong> function tab will turn on automatically.
              </p>

              <div className="flex items-center justify-between gap-2">
                <input
                  className="input h-9 flex-1 text-xs"
                  placeholder="Search live PIC list…"
                  value={picSearch}
                  onChange={(e) => setPicSearch(e.target.value)}
                  autoFocus
                />
                <div className="flex shrink-0 items-center gap-1.5 text-xs font-semibold">
                  <button type="button" onClick={selectAll} className="text-rmit-navy hover:underline dark:text-brand-300">
                    Select all
                  </button>
                  <span className="text-faint">|</span>
                  <button type="button" onClick={clearAll} className="text-faint hover:underline hover:text-rmit-red">
                    Clear all
                  </button>
                </div>
              </div>

              <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-line bg-card/50 p-2">
                {filteredPeople.map((person: string) => {
                  const checked = currentPics.includes(person)
                  return (
                    <label
                      key={person}
                      className={cx(
                        'flex cursor-pointer items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                        checked ? 'bg-navy-50 text-rmit-navy dark:bg-white/10 dark:text-white font-semibold' : 'text-ink hover:bg-subtle',
                      )}
                    >
                      <span>{person}</span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePerson(person)}
                        className="h-4 w-4 rounded border-line text-rmit-navy focus:ring-rmit-navy"
                      />
                    </label>
                  )
                })}
                {filteredPeople.length === 0 && (
                  <p className="py-4 text-center text-xs text-faint">No matching people found in the live list.</p>
                )}
              </div>
            </div>
          </Modal>
        )
      })()}

      {/* Removal blocked: per-function workload has no fallback to absorb it. */}
      <Modal
        open={blockedRemove !== null}
        onClose={() => setBlockedRemove(null)}
        title="Can’t remove function"
        footer={
          <button className="btn-primary" onClick={() => setBlockedRemove(null)}>
            OK
          </button>
        }
      >
        {blockedRemove && (
          <div className="flex gap-3 rounded-xl bg-subtle p-3 text-sm text-ink">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
            <p>
              <strong>{blockedRemove}</strong> still has{' '}
              <strong>
                {functionUsage(blockedRemove)} task{functionUsage(blockedRemove) === 1 ? '' : 's'}
              </strong>{' '}
              with recorded workload. A function’s data has no fallback, so removing it would delete that
              workload — reassign or edit those tasks first.
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={pendingRemove !== null}
        onClose={() => setPendingRemove(null)}
        title="Remove function"
        footer={
          <>
            <button className="btn-outline" onClick={() => setPendingRemove(null)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={() => {
                if (pendingRemove) void removeFunction(pendingRemove).catch(() => {})
                setPendingRemove(null)
              }}
            >
              Remove
            </button>
          </>
        }
      >
        {pendingRemove && (
          <p className="text-sm text-ink">
            Remove <strong>{pendingRemove}</strong>? No tasks currently record workload under it, so nothing
            else changes. Its task-form tab disappears.
          </p>
        )}
      </Modal>
    </Card>
  )
}

/** Compact checkbox-chip picker used by the Functions panel (checked = not hidden). */
function TypePicker({
  label,
  all,
  included,
  onToggle,
  onClear,
}: {
  label: string
  all: string[]
  included: string[]
  onToggle: (t: string) => void
  /** Untick every type at once (inclusion list → []). Doesn't touch existing tasks. */
  onClear: () => void
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-faint">{label}</span>
        {included.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-[10px] font-medium text-faint underline underline-offset-2 transition-colors hover:text-rmit-red"
            title="Untick every type on this tab. Tasks that already recorded these keep them."
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-x-2 gap-y-1.5">
        {all.map((t) => {
          const on = included.includes(t)
          return (
            <button
              key={t}
              type="button"
              className={cx(
                'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                on
                  ? 'border-rmit-navy bg-rmit-navy text-white dark:border-white/60 dark:bg-white/15'
                  : 'border-line text-muted hover:border-ink/40',
              )}
              onClick={() => onToggle(t)}
              aria-pressed={on}
            >
              {t}
            </button>
          )
        })}
        {all.length === 0 && <span className="text-[11px] text-faint">Nothing in this list yet.</span>}
      </div>
    </div>
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
  locked,
  allowRemoveUsed,
  dotColor = 'bg-rmit-red',
  mondayIds,
  onMondayId,
  keywords,
  onKeywords,
  className,
  bare,
  hideHeading,
}: {
  title: string
  description: string
  items: string[]
  onAdd: (value: string) => void
  onRemove: (value: string) => void
  onRename: (oldValue: string, newValue: string) => void | Promise<void>
  usage: (value: string) => number
  fallback?: string
  /** Item names that can't be renamed or removed (shown with a lock, like the fallback). */
  locked?: string[]
  /** When false, an item used by ≥1 task is blocked from removal (see the Groups toggle). */
  allowRemoveUsed: boolean
  /** Tailwind bg class for each item's dot — per-panel colour, aesthetics only. */
  dotColor?: string
  /** When set, each row gets a small monday.com user-id input (People panel only). */
  mondayIds?: Record<string, string>
  onMondayId?: (item: string, id: string) => void
  /** When set, each row gets a "keywords" button (auto-select-on-name-match). */
  keywords?: Record<string, string[]>
  onKeywords?: (item: string, keywords: string[]) => void
  /** Extra classes on the card wrapper — e.g. a grid col-span for the wider People panel. */
  className?: string
  /** Render without the Card wrapper (a compact heading instead) — for combined cards. */
  bare?: boolean
  /** In bare mode, drop the title line (the tab already labels it) — description only. */
  hideHeading?: boolean
}) {
  const [draft, setDraft] = useState('')
  // Item pending a delete confirmation (only shown when it has linked tasks).
  const [pendingRemove, setPendingRemove] = useState<string | null>(null)
  // Where the removed item's tasks go — defaults to the fallback, user-selectable.
  const [removeTarget, setRemoveTarget] = useState<string>(fallback ?? FALLBACK_ITEM)
  // Item whose removal is blocked because it's in use and the setting is off.
  const [blockedRemove, setBlockedRemove] = useState<string | null>(null)
  // Item whose manage panel (rename / merge) is open, + its two drafts.
  const [panelItem, setPanelItem] = useState<string | null>(null)
  const [panelRename, setPanelRename] = useState('')
  const [mergeTarget, setMergeTarget] = useState('')
  // Item whose auto-select keywords are being edited (+ its comma-separated draft).
  const [keywordItem, setKeywordItem] = useState<string | null>(null)
  const [keywordDraft, setKeywordDraft] = useState('')
  const listRef = useScrollFade<HTMLUListElement>()

  const openKeywords = (item: string) => {
    setKeywordDraft((keywords?.[item] ?? []).join(', '))
    setKeywordItem(item)
  }
  const saveKeywords = () => {
    if (keywordItem && onKeywords) onKeywords(keywordItem, parseKeywords(keywordDraft))
    setKeywordItem(null)
  }

  // Shown alphabetically (matches the task-form order via withFallback).
  const sortedItems = sortAlpha(items)
  const singular = title.toLowerCase().replace(/s$/, '')

  const requestRemove = (item: string) => {
    const count = usage(item)
    // Always confirm before removing — even an unused item (nothing in the
    // settings panels is removed without a warning).
    if (count > 0 && !allowRemoveUsed) setBlockedRemove(item)
    else {
      setRemoveTarget(fallback ?? FALLBACK_ITEM)
      setPendingRemove(item)
    }
  }

  const fb = fallback ?? FALLBACK_ITEM

  /** Move every task from `source` onto `target` and drop `source` from the list.
   *  Reuses the store's rename-merge (dedupes lists, sums breakdowns, carries
   *  keywords/monday ids); a fallback target routes through the remove path,
   *  which is the same reassignment. */
  const mergeInto = (source: string, target: string) => {
    if (!target || target === source) return
    if (target === fb && !items.includes(fb)) onRemove(source)
    else void onRename(source, target)
  }

  const openPanel = (item: string) => {
    setPanelRename(item)
    setMergeTarget('')
    setPanelItem(item)
  }

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

  const Wrapper = bare ? 'div' : Card
  return (
    <Wrapper className={cx(!bare && 'bg-subtle', className)}>
      {bare ? (
        <div className="mb-2">
          {!hideHeading && <h4 className="text-sm font-semibold text-ink">{title}</h4>}
          <p className="text-xs text-muted">{description}</p>
        </div>
      ) : (
        <CardHeader title={title} subtitle={description} />
      )}
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
      {onMondayId && sortedItems.length > 0 && (
        <div className="mb-1 flex items-center gap-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-faint">
          <span className="flex-1">Name</span>
          <span className="w-40 shrink-0">monday ID</span>
          <span className="flex shrink-0 items-center gap-1">
            <span className="w-14 text-right">Tasks</span>
            <span className="w-12" />
          </span>
        </div>
      )}
      <ul ref={listRef} className="max-h-[27rem] space-y-1.5 overflow-y-auto">
        {sortedItems.map((item) => {
          const count = usage(item)
          const isLocked = !!locked?.includes(item)
          return (
            <li
              key={item}
              onClick={isLocked ? undefined : () => openPanel(item)}
              onKeyDown={
                isLocked
                  ? undefined
                  : (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openPanel(item)
                      }
                    }
              }
              role={isLocked ? undefined : 'button'}
              tabIndex={isLocked ? undefined : 0}
              title={isLocked ? undefined : `Click to rename “${item}” or merge its tasks into another ${singular}`}
              className={cx(
                'flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 bg-card/40 transition-all duration-200',
                !isLocked && 'cursor-pointer hover:border-navy-300 hover:bg-card dark:hover:border-navy-400',
              )}
            >
              {isLocked ? (
                <>
                  <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                    <span className={cx('h-2 w-2 shrink-0 rounded-full', dotColor)} />
                    <span className="truncate text-ink">{item}</span>
                    <Lock className="h-3 w-3 shrink-0 text-faint" />
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {count > 0 && (
                      <span className="text-[11px] text-muted">
                        {count} task{count === 1 ? '' : 's'}
                      </span>
                    )}
                    {/* Locked from rename/remove, but keywords stay editable. */}
                    {onKeywords && (
                      <button
                        className={cx(
                          'relative rounded-md p-1 hover:bg-navy-50 hover:text-rmit-navy dark:hover:bg-white/10 dark:hover:text-white',
                          (keywords?.[item]?.length ?? 0) > 0 ? 'text-rmit-navy dark:text-white' : 'text-faint',
                        )}
                        onClick={() => openKeywords(item)}
                        title={
                          (keywords?.[item]?.length ?? 0) > 0
                            ? `Auto-select keywords: ${keywords?.[item]?.join(', ')}`
                            : 'Add auto-select keywords'
                        }
                      >
                        <Tag className="h-3.5 w-3.5" />
                        {(keywords?.[item]?.length ?? 0) > 0 && (
                          <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent-green" />
                        )}
                      </button>
                    )}
                    <span className="text-[11px] uppercase tracking-wide text-faint">locked</span>
                  </span>
                </>
              ) : (
                <>
                  <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                    <span className={cx('h-2 w-2 shrink-0 rounded-full', dotColor)} />
                    <span className="truncate text-ink">{item}</span>
                  </span>
                  {onMondayId && (
                    <div
                      className="w-40 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <MondayIdInput value={mondayIds?.[item] ?? ''} onCommit={(v) => onMondayId(item, v)} />
                    </div>
                  )}
                  <span
                    className="flex shrink-0 items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    {onMondayId ? (
                      <span className="w-14 text-right text-[11px] text-muted">
                        {count > 0 ? `${count} task${count === 1 ? '' : 's'}` : ''}
                      </span>
                    ) : (
                      count > 0 && (
                        <span className="text-[11px] text-muted">
                          {count} task{count === 1 ? '' : 's'}
                        </span>
                      )
                    )}
                    {onKeywords && (
                      <button
                        className={cx(
                          'relative rounded-md p-1 hover:bg-navy-50 hover:text-rmit-navy dark:hover:bg-white/10 dark:hover:text-white',
                          (keywords?.[item]?.length ?? 0) > 0 ? 'text-rmit-navy dark:text-white' : 'text-faint',
                        )}
                        onClick={() => openKeywords(item)}
                        title={
                          (keywords?.[item]?.length ?? 0) > 0
                            ? `Auto-select keywords: ${keywords?.[item]?.join(', ')}`
                            : 'Add auto-select keywords'
                        }
                      >
                        <Tag className="h-3.5 w-3.5" />
                        {(keywords?.[item]?.length ?? 0) > 0 && (
                          <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent-green" />
                        )}
                      </button>
                    )}
                    <button
                      className="rounded-md p-1 text-faint hover:bg-brand-50 hover:text-rmit-red dark:hover:bg-brand-500/15"
                      onClick={() => requestRemove(item)}
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
          <li className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-line px-3 py-2 bg-card/20 hover:bg-card/40 transition-all duration-200">
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

      <Modal
        open={pendingRemove !== null}
        onClose={() => setPendingRemove(null)}
        title={`Remove ${singular}`}
        footer={
          <>
            <button className="btn-outline" onClick={() => setPendingRemove(null)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={() => {
                if (pendingRemove) {
                  if (usage(pendingRemove) > 0) mergeInto(pendingRemove, removeTarget)
                  else onRemove(pendingRemove)
                }
                setPendingRemove(null)
              }}
            >
              {pendingRemove && usage(pendingRemove) > 0 ? 'Remove & move tasks' : 'Remove'}
            </button>
          </>
        }
      >
        {pendingRemove && (
          <div className="space-y-4">
            <div className="flex gap-3 rounded-xl bg-brand-50 p-3 text-sm text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              {usage(pendingRemove) > 0 ? (
                <p>
                  <strong>{pendingRemove}</strong> is linked to{' '}
                  <strong>
                    {usage(pendingRemove)} task{usage(pendingRemove) === 1 ? '' : 's'}
                  </strong>
                  . {usage(pendingRemove) === 1 ? 'That task' : 'Those tasks'} will move to the {singular} selected
                  below. This can’t be undone.
                </p>
              ) : (
                <p>
                  Remove <strong>{pendingRemove}</strong> from this list? No tasks use it. This can’t be undone.
                </p>
              )}
            </div>
            {usage(pendingRemove) > 0 && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
                  Move {usage(pendingRemove) === 1 ? 'its task' : 'its tasks'} to
                </label>
                <select className="input" value={removeTarget} onChange={(e) => setRemoveTarget(e.target.value)}>
                  <option value={fb}>{fb} (default)</option>
                  {sortedItems
                    .filter((i) => i !== pendingRemove && i !== fb)
                    .map((i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Manage panel — opened by clicking an item: rename it, or merge it (and
          every task using it) into another item of the same group. */}
      <Modal
        open={panelItem !== null}
        onClose={() => setPanelItem(null)}
        title={`Manage ${singular} — ${panelItem ?? ''}`}
        footer={
          <button className="btn-outline" onClick={() => setPanelItem(null)}>
            Close
          </button>
        }
      >
        {panelItem && (
          <div className="space-y-5">
            <p className="text-xs text-muted">
              {usage(panelItem) > 0 ? (
                <>
                  Linked to{' '}
                  <strong className="text-ink">
                    {usage(panelItem)} task{usage(panelItem) === 1 ? '' : 's'}
                  </strong>
                  .
                </>
              ) : (
                'No tasks use this yet.'
              )}
            </p>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">Rename</label>
              <div className="flex gap-2">
                <input
                  className="input"
                  value={panelRename}
                  onChange={(e) => setPanelRename(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && panelRename.trim() && panelRename.trim() !== panelItem) {
                      e.preventDefault()
                      void onRename(panelItem, panelRename)
                      setPanelItem(null)
                    }
                  }}
                />
                <button
                  className="btn-navy shrink-0"
                  disabled={!panelRename.trim() || panelRename.trim() === panelItem}
                  onClick={() => {
                    void onRename(panelItem, panelRename)
                    setPanelItem(null)
                  }}
                >
                  Rename
                </button>
              </div>
              <p className="mt-1.5 text-xs text-faint">
                Every task using “{panelItem}” follows the new name. Renaming to an existing {singular} merges them.
              </p>
            </div>
            <div className="border-t border-line pt-4">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
                Merge into another {singular}
              </label>
              <div className="flex gap-2">
                <select className="input" value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)}>
                  <option value="">(select target)</option>
                  {!items.includes(fb) && <option value={fb}>{fb} (fallback)</option>}
                  {sortedItems
                    .filter((i) => i !== panelItem)
                    .map((i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                </select>
                <button
                  className="btn-primary shrink-0 inline-flex items-center gap-1.5"
                  disabled={!mergeTarget}
                  onClick={() => {
                    mergeInto(panelItem, mergeTarget)
                    setPanelItem(null)
                  }}
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  Merge
                </button>
              </div>
              <p className="mt-1.5 text-xs text-faint">
                Moves {usage(panelItem) > 0 ? `all ${usage(panelItem)} linked task${usage(panelItem) === 1 ? '' : 's'}` : 'any linked tasks'}{' '}
                onto the target and removes “{panelItem}” from this list. This can’t be undone.
              </p>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={blockedRemove !== null}
        onClose={() => setBlockedRemove(null)}
        title={`Can’t remove ${singular}`}
        footer={
          <button className="btn-primary" onClick={() => setBlockedRemove(null)}>
            OK
          </button>
        }
      >
        {blockedRemove && (
          <div className="flex gap-3 rounded-xl bg-subtle p-3 text-sm text-ink">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
            <p>
              <strong>{blockedRemove}</strong> is used by{' '}
              <strong>
                {usage(blockedRemove)} task{usage(blockedRemove) === 1 ? '' : 's'}
              </strong>
              , so it can’t be removed. To allow it, turn on{' '}
              <strong>“Allow removing groups already associated with tasks”</strong> at the top of the
              Groups section.
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={keywordItem !== null}
        onClose={() => setKeywordItem(null)}
        title={`Auto-select keywords${keywordItem ? ` — ${keywordItem}` : ''}`}
        footer={
          <>
            <button className="btn-outline" onClick={() => setKeywordItem(null)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={saveKeywords}>
              Save
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">
            When a new task’s name contains any of these keywords, <strong className="text-ink">{keywordItem}</strong>{' '}
            is selected automatically. Separate keywords with commas; matching ignores case. Leave empty to turn off.
          </p>
          <input
            className="input"
            autoFocus
            placeholder="e.g. open day, openday, campus tour"
            value={keywordDraft}
            onChange={(e) => setKeywordDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                saveKeywords()
              }
            }}
          />
          {parseKeywords(keywordDraft).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {parseKeywords(keywordDraft).map((k) => (
                <span key={k} className="chip bg-subtle text-muted">
                  {k}
                </span>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </Wrapper>
  )
}
