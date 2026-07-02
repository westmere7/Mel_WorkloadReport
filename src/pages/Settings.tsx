import { useState } from 'react'
import { AlertTriangle, Check, Lock, Pencil, Plus, X } from 'lucide-react'
import { Card, CardHeader } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { useStore } from '../data/store'
import { SQUADS, SQUAD_DESCRIPTIONS, SIZES, SIZE_DESCRIPTIONS, SIZE_TONE, FALLBACK_ITEM, sortAlpha } from '../constants'
import { cx } from '../lib/format'
import {
  COMMON_CAMPAIGNS,
  setDashboardPrefs,
  useDashboardPrefs,
  type DemandDim,
} from '../lib/dashboardPrefs'
import type { AppSettings } from '../types'

type ListKey = keyof Pick<AppSettings, 'campaigns' | 'types' | 'people' | 'assetTypes'>

export function SettingsPage() {
  const { settings, saveSettings, tasks, renameListItem, removeListItem } = useStore()

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
      {/* Dashboard display preferences */}
      <DashboardPrefsCard />

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
    </div>
  )
}

/** Grouped chart-display toggles for the Dashboard (saved in this browser). */
function DashboardPrefsCard() {
  const prefs = useDashboardPrefs()

  return (
    <Card>
      <CardHeader title="Dashboard" subtitle="How the dashboard charts are displayed" />
      <div className="divide-y divide-line">
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
      </div>
    </Card>
  )
}

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
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="text-xs text-muted">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
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
  // Item pending a delete confirmation (only shown when it has linked tasks).
  const [pendingRemove, setPendingRemove] = useState<string | null>(null)

  // Shown alphabetically (matches the task-form order via withFallback).
  const sortedItems = sortAlpha(items)
  const singular = title.toLowerCase().replace(/s$/, '')

  const requestRemove = (item: string) => {
    if (usage(item) > 0) setPendingRemove(item)
    else onRemove(item)
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
        {sortedItems.map((item) => {
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
                if (pendingRemove) onRemove(pendingRemove)
                setPendingRemove(null)
              }}
            >
              Remove &amp; reassign
            </button>
          </>
        }
      >
        {pendingRemove && (
          <div className="flex gap-3 rounded-xl bg-brand-50 p-3 text-sm text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <p>
              <strong>{pendingRemove}</strong> is linked to{' '}
              <strong>
                {usage(pendingRemove)} task{usage(pendingRemove) === 1 ? '' : 's'}
              </strong>
              . Removing it will reassign {usage(pendingRemove) === 1 ? 'that task' : 'those tasks'} to{' '}
              <strong>“{fallback ?? FALLBACK_ITEM}”</strong>. This can’t be undone.
            </p>
          </div>
        )}
      </Modal>
    </Card>
  )
}
