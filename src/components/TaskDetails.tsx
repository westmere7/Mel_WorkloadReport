import { useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { Badge, toneForLabel } from './ui/Badge'
import { ImageLightbox } from './ui/ImageLightbox'
import { useStore } from '../data/store'
import { SIZE_TONE, SIZE_DESCRIPTIONS, functionColor, legacyOwnerName, withFallback } from '../constants'
import { cx, formatDate } from '../lib/format'
import type { FunctionEntry, Task } from '../types'

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
  const [lightbox, setLightbox] = useState<string | null>(null)

  const duration = formatDuration(task.startDate, task.endDate)

  // Per-function workload slices. A task with `functionData` shows one card per
  // recording function (in tab order, orphans last); a LEGACY task (no slices)
  // shows a single card for the legacy owner built from its combined fields.
  const fd = task.functionData
  const slices: { name: string; color: string; entry: FunctionEntry }[] = fd
    ? (() => {
        const known = new Set(settings.functions.map((f) => f.name))
        return [
          ...settings.functions
            .filter((f) => fd[f.name])
            .map((f) => ({ name: f.name, color: f.color, entry: fd[f.name]! })),
          ...Object.keys(fd)
            .filter((n) => !known.has(n))
            .map((n) => ({ name: n, color: 'plum', entry: fd[n]! })),
        ]
      })()
    : [
        {
          name: legacyOwnerName(settings.functions),
          color: settings.functions.find((f) => f.name === legacyOwnerName(settings.functions))?.color ?? 'plum',
          entry: {
            types: task.types,
            assetBreakdown: task.assetBreakdown,
            assetTotal: task.assetTotal,
            timelineOn: false,
            startDate: task.startDate,
            endDate: task.endDate,
          },
        },
      ]

  // Ordered, count>0 asset rows for one breakdown (app order first, extras after).
  const assetRowsFor = (breakdown: Record<string, number>) => {
    const order = withFallback(settings.assetTypes)
    const known = order.map((name) => ({ name, count: breakdown[name] ?? 0 })).filter((r) => r.count > 0)
    const extras = Object.keys(breakdown)
      .filter((k) => !order.includes(k) && (breakdown[k] ?? 0) > 0)
      .map((k) => ({ name: k, count: breakdown[k] }))
    return [...known, ...extras]
  }

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

      {/* Workload by function — one card per recording function */}
      <Section
        label="Workload by function"
        trailing={
          <span className="rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold text-ink">
            {task.assetTotal} total
          </span>
        }
      >
        <div className="space-y-2.5">
          {slices.map((s) => {
            const col = functionColor(s.color)
            const rows = assetRowsFor(s.entry.assetBreakdown)
            return (
              <div key={s.name} className="rounded-xl border-2 bg-card p-3.5" style={{ borderColor: col.hex }}>
                <div className="mb-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: col.hex }} />
                  <h4 className="text-sm font-bold text-ink">{s.name}</h4>
                  <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold text-ink">
                    {s.entry.assetTotal} {s.entry.assetTotal === 1 ? 'asset' : 'assets'}
                  </span>
                  {s.entry.timelineOn && (s.entry.startDate || s.entry.endDate) && (
                    <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted">
                      <CalendarClock className="h-3 w-3" />
                      {formatDate(s.entry.startDate) || '—'} – {formatDate(s.entry.endDate) || '—'}
                    </span>
                  )}
                </div>

                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-faint">Work type(s)</p>
                {s.entry.types.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {s.entry.types.map((t) => (
                      <Badge key={t} tone="gray">
                        {t}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted">—</p>
                )}

                <p className="mb-1 mt-3 text-[10px] font-semibold uppercase tracking-wide text-faint">Assets</p>
                {rows.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {rows.map((r) => (
                      <span key={r.name} className="chip border border-line bg-subtle text-ink">
                        {r.name}
                        <span className="font-bold text-rmit-navy dark:text-navy-100">{r.count}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted">No assets recorded.</p>
                )}
              </div>
            )
          })}
        </div>
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

      {/* Demo images */}
      {task.images?.length ? (
        <Section label={`Demo Images (${task.images.length})`}>
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
            {task.images.map((img) => (
              <button
                key={img.id}
                type="button"
                onClick={() => setLightbox(img.url)}
                title="View larger"
                className="group relative aspect-square overflow-hidden rounded-xl border border-line bg-subtle"
              >
                <img
                  src={img.url}
                  alt=""
                  loading="lazy"
                  className="h-full w-full cursor-zoom-in object-cover transition group-hover:scale-105"
                />
              </button>
            ))}
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
      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
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
