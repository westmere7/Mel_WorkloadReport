import { Badge, toneForLabel } from './ui/Badge'
import { useStore } from '../data/store'
import { SIZE_TONE, SIZE_DESCRIPTIONS, withFallback } from '../constants'
import { cx, formatDate } from '../lib/format'
import type { Task } from '../types'

/** Human-readable span between two ISO dates (inclusive), or null if unavailable. */
function formatDuration(startISO: string | null, endISO: string | null): string | null {
  if (!startISO || !endISO) return null
  const start = new Date(`${startISO}T00:00:00`)
  const end = new Date(`${endISO}T00:00:00`)
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  if (!Number.isFinite(days) || days <= 0) return null
  if (days === 1) return '1 day'
  if (days < 14) return `${days} days`
  if (days < 61) return `${Math.round(days / 7)} weeks`
  return `${Math.round(days / 30)} months`
}

/** Read-only task view for signed-out (view-only) users. */
export function TaskDetails({
  task,
  onClose,
  onEdit,
}: {
  task: Task
  onClose?: () => void
  /** When provided, shows an "Edit task details" button (e.g. for signed-in editors). */
  onEdit?: () => void
}) {
  const { settings } = useStore()

  // Asset types with a count > 0, in the app's asset-type order.
  const assetRows = withFallback(settings.assetTypes)
    .map((name) => ({ name, count: task.assetBreakdown[name] ?? 0 }))
    .filter((r) => r.count > 0)

  const duration = formatDuration(task.startDate, task.endDate)

  return (
    <div className="space-y-5">
      {/* Identity + key badges */}
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-xs text-muted">{task.code || 'No code'}</p>
            <h3 className="mt-1 text-lg font-bold leading-snug text-ink">{task.name}</h3>
          </div>
          <Badge tone={SIZE_TONE[task.size]} className="shrink-0">
            {task.size}
          </Badge>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone={toneForLabel(task.squad)}>{task.squad}</Badge>
          <span
            className={cx(
              'chip',
              task.half === 'H1'
                ? 'bg-navy-50 text-navy-600 dark:bg-white/10 dark:text-navy-100'
                : 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300',
            )}
          >
            {task.half}
          </span>
          <span className="text-xs text-muted">{SIZE_DESCRIPTIONS[task.size]}</span>
        </div>
      </div>

      {/* Meta facts in a subtle box */}
      <div
        className={cx(
          'grid grid-cols-2 gap-4 rounded-xl bg-subtle p-4',
          duration ? 'sm:grid-cols-4' : 'sm:grid-cols-3',
        )}
      >
        <Meta label="Campaign">{task.campaign}</Meta>
        <Meta label="Start date">{formatDate(task.startDate) || '—'}</Meta>
        <Meta label="End date">{formatDate(task.endDate) || '—'}</Meta>
        {duration && <Meta label="Duration">{duration}</Meta>}
      </div>

      {/* Work types */}
      <Section label="Work type(s)">
        <ChipList items={task.types} tone="gray" />
      </Section>

      {/* Assets */}
      <Section
        label="Asset breakdown"
        trailing={
          <span className="rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold text-ink">
            {task.assetTotal} total
          </span>
        }
      >
        {assetRows.length ? (
          <div className="flex flex-wrap gap-1.5">
            {assetRows.map((r) => (
              <span key={r.name} className="chip border border-line bg-card text-ink">
                {r.name}
                <span className="font-bold text-rmit-navy dark:text-navy-100">{r.count}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No assets recorded.</p>
        )}
      </Section>

      {/* People */}
      <Section label="Person(s) in charge">
        <ChipList items={task.people} tone="navy" />
      </Section>

      {/* Note */}
      {task.note ? (
        <Section label="Note">
          <div className="whitespace-pre-wrap rounded-xl bg-subtle p-3 text-sm text-ink">
            {task.note}
          </div>
        </Section>
      ) : null}

      {(onClose || onEdit) && (
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          {onEdit && (
            <button className="btn-primary" onClick={onEdit}>
              Edit task details
            </button>
          )}
          {onClose && (
            <button className="btn-outline" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium text-ink" title={typeof children === 'string' ? children : undefined}>
        {children}
      </p>
    </div>
  )
}

function Section({
  label,
  trailing,
  children,
}: {
  label: string
  trailing?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="border-t border-line pt-4">
      <div className="mb-2 flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
        {trailing}
      </div>
      {children}
    </div>
  )
}

function ChipList({ items, tone }: { items: string[]; tone: 'gray' | 'navy' }) {
  if (!items.length) return <span className="text-sm text-muted">—</span>
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <Badge key={i} tone={tone}>
          {i}
        </Badge>
      ))}
    </div>
  )
}
