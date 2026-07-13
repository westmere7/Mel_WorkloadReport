import { useMemo } from 'react'
import type { Task } from '../../types'
import { useStore } from '../../data/store'
import { filterBySpan } from '../../lib/span'
import { STAT_OPTIONS, type GlobalStatId, type ShowcaseDraft, type ShowcaseStat } from '../../lib/showcase'
import { SelectableCard, StepHint } from './wizardBits'

/** Compact live preview for a stat card. */
function StatPreview({ stat }: { stat: ShowcaseStat }) {
  if (stat.kind === 'number') {
    return <p className="font-display text-2xl font-bold text-rmit-navy dark:text-navy-100">{(stat.value ?? 0).toLocaleString()}</p>
  }
  if (stat.kind === 'text') {
    return (
      <p className="truncate text-lg font-bold text-ink">
        {stat.text}
        {stat.detail && <span className="ml-2 text-xs font-medium text-muted">{stat.detail}</span>}
      </p>
    )
  }
  const series = stat.series ?? []
  const max = Math.max(1, ...series.map((r) => r.value))
  return (
    <div className="flex h-10 items-end gap-1">
      {series.slice(0, 12).map((r) => (
        <span
          key={r.name}
          title={`${r.name}: ${r.value.toLocaleString()}`}
          className="w-3 rounded-sm bg-rmit-navy/70 dark:bg-navy-300/80"
          style={{ height: `${Math.max(8, (r.value / max) * 100)}%` }}
        />
      ))}
    </div>
  )
}

export function StepStats({
  draft,
  patch,
  tasks,
}: {
  draft: ShowcaseDraft
  patch: (p: Partial<ShowcaseDraft>) => void
  tasks: Task[]
}) {
  const { settings } = useStore()
  const yearTasks = useMemo(() => filterBySpan(tasks, 'year', draft.year, 'H1'), [tasks, draft.year])

  const previews = useMemo(
    () => new Map(STAT_OPTIONS.map((o) => [o.id, o.compute(yearTasks, settings)])),
    [yearTasks, settings],
  )

  const toggle = (id: GlobalStatId) =>
    patch({
      statIds: draft.statIds.includes(id) ? draft.statIds.filter((x) => x !== id) : [...draft.statIds, id],
    })

  return (
    <div className="space-y-4">
      <StepHint>
        Pick the {draft.year} stats to feature — selection order is display order. Values are computed
        over all {yearTasks.length} tasks of the year, frozen at generate time.
      </StepHint>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {STAT_OPTIONS.map((o) => {
          const preview = previews.get(o.id) ?? null
          const idx = draft.statIds.indexOf(o.id)
          return (
            <SelectableCard
              key={o.id}
              title={o.label}
              description={o.description}
              selected={idx !== -1}
              ordinal={idx !== -1 ? idx + 1 : undefined}
              disabled={!preview}
              onToggle={() => toggle(o.id)}
            >
              {preview ? <StatPreview stat={preview} /> : <p className="text-xs text-faint">No data for {draft.year}.</p>}
            </SelectableCard>
          )
        })}
      </div>
    </div>
  )
}
