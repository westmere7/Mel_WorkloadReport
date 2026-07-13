import { useMemo } from 'react'
import type { Task } from '../../types'
import { filterBySpan } from '../../lib/span'
import { TOP3_OPTIONS, type ShowcaseDraft, type Top3Block, type Top3Id } from '../../lib/showcase'
import { SelectableCard, StepHint } from './wizardBits'

const MEDALS = ['🥇', '🥈', '🥉']

function Top3Preview({ block }: { block: Top3Block }) {
  return (
    <ul className="space-y-1">
      {block.entries.map((e, i) => (
        <li key={`${e.name}-${i}`} className="flex items-center gap-2 text-sm">
          <span className="shrink-0">{MEDALS[i]}</span>
          <span className="min-w-0 flex-1 truncate text-ink">{e.name}</span>
          <span className="shrink-0 text-xs font-semibold tabular-nums text-muted">
            {e.value.toLocaleString()} {block.unit}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function StepTop3({
  draft,
  patch,
  tasks,
}: {
  draft: ShowcaseDraft
  patch: (p: Partial<ShowcaseDraft>) => void
  tasks: Task[]
}) {
  const yearTasks = useMemo(() => filterBySpan(tasks, 'year', draft.year, 'H1'), [tasks, draft.year])
  const previews = useMemo(() => new Map(TOP3_OPTIONS.map((o) => [o.id, o.compute(yearTasks)])), [yearTasks])

  const toggle = (id: Top3Id) =>
    patch({
      top3Ids: draft.top3Ids.includes(id) ? draft.top3Ids.filter((x) => x !== id) : [...draft.top3Ids, id],
    })

  const ineligibleHint = (id: Top3Id): string => {
    if (id === 'longestProjects') return 'Needs tasks with both start and end dates.'
    if (id === 'mostImages') return 'Needs tasks with demo images.'
    return `No data for ${draft.year}.`
  }

  return (
    <div className="space-y-4">
      <StepHint>
        Podium moments — each selected ranking becomes its own animated top-3 reveal. This step is
        optional.
      </StepHint>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {TOP3_OPTIONS.map((o) => {
          const block = previews.get(o.id) ?? null
          const idx = draft.top3Ids.indexOf(o.id)
          return (
            <SelectableCard
              key={o.id}
              title={o.label}
              description={o.description}
              selected={idx !== -1}
              ordinal={idx !== -1 ? idx + 1 : undefined}
              disabled={!block}
              onToggle={() => toggle(o.id)}
            >
              {block ? <Top3Preview block={block} /> : <p className="text-xs text-faint">{ineligibleHint(o.id)}</p>}
            </SelectableCard>
          )
        })}
      </div>
    </div>
  )
}
