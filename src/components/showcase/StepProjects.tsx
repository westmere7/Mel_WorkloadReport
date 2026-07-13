import { useMemo } from 'react'
import { Check, ChevronDown, ChevronUp, Dices, Images, Shuffle, X } from 'lucide-react'
import type { Size, Task } from '../../types'
import { filterBySpan } from '../../lib/span'
import { SIZES, SIZE_TONE } from '../../constants'
import { Badge } from '../ui/Badge'
import { Switch } from '../ui/Switch'
import { cx } from '../../lib/format'
import { seededShuffle, type ShowcaseDraft } from '../../lib/showcase'
import { StepHint } from './wizardBits'

export function StepProjects({
  draft,
  patch,
  tasks,
}: {
  draft: ShowcaseDraft
  patch: (p: Partial<ShowcaseDraft>) => void
  tasks: Task[]
}) {
  const yearTasks = useMemo(
    () => filterBySpan(tasks, 'year', draft.year, 'H1').sort((a, b) => b.assetTotal - a.assetTotal),
    [tasks, draft.year],
  )
  const byId = useMemo(() => new Map(yearTasks.map((t) => [t.id, t])), [yearTasks])
  const selected = new Set(draft.selectedIds)

  // Picker shows tasks matching the size filter, plus anything already selected
  // (so a selected task never disappears from view when the filter changes).
  const visible = yearTasks.filter((t) => draft.sizeFilter.includes(t.size) || selected.has(t.id))

  const toggleSize = (size: Size) => {
    const on = draft.sizeFilter.includes(size)
    const sizeFilter = on ? draft.sizeFilter.filter((s) => s !== size) : [...draft.sizeFilter, size]
    let selectedIds = draft.selectedIds
    if (on) {
      // Turning a size OFF deselects that size's tasks.
      selectedIds = selectedIds.filter((id) => byId.get(id)?.size !== size)
    } else {
      // Turning a size ON selects its tasks (appended, biggest first).
      const add = yearTasks.filter((t) => t.size === size && !selected.has(t.id)).map((t) => t.id)
      selectedIds = [...selectedIds, ...add]
    }
    patch({ sizeFilter, selectedIds })
  }

  const toggleTask = (id: string) =>
    patch({
      selectedIds: selected.has(id) ? draft.selectedIds.filter((x) => x !== id) : [...draft.selectedIds, id],
    })

  const move = (index: number, dir: -1 | 1) => {
    const next = [...draft.selectedIds]
    const j = index + dir
    if (j < 0 || j >= next.length) return
    ;[next[index], next[j]] = [next[j], next[index]]
    patch({ selectedIds: next })
  }

  // What actually plays: the manual order, or the seeded shuffle preview.
  const playOrder = draft.randomizeOrder ? seededShuffle(draft.selectedIds, draft.seed) : draft.selectedIds

  return (
    <div className="space-y-4">
      {/* Size filter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="label mb-0">Size filter</span>
        {SIZES.map((s) => {
          const active = draft.sizeFilter.includes(s)
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggleSize(s)}
              aria-pressed={active}
              className={cx('transition', !active && 'opacity-40 grayscale hover:opacity-70')}
              title={active ? `Remove ${s} tasks` : `Add ${s} tasks`}
            >
              <Badge tone={SIZE_TONE[s]}>{s}</Badge>
            </button>
          )
        })}
        <span className="text-xs text-muted">— toggling a size selects/deselects its tasks.</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Picker */}
        <div className="rounded-xl border border-line">
          <p className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
            {draft.year} tasks ({visible.length})
          </p>
          <ul className="max-h-[380px] divide-y divide-line overflow-y-auto">
            {visible.map((t) => {
              const isSel = selected.has(t.id)
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => toggleTask(t.id)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-subtle"
                  >
                    <span
                      className={cx(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border text-white',
                        isSel ? 'border-rmit-red bg-rmit-red' : 'border-line',
                      )}
                    >
                      {isSel && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{t.name}</span>
                      <span className="block truncate text-[11px] text-muted">
                        {t.code || '—'} · {t.campaign}
                      </span>
                    </span>
                    {t.images?.length ? (
                      <span className="inline-flex items-center gap-0.5 text-faint" title={`${t.images.length} demo images`}>
                        <Images className="h-3.5 w-3.5" />
                        <span className="text-[11px] tabular-nums">{t.images.length}</span>
                      </span>
                    ) : null}
                    <Badge tone={SIZE_TONE[t.size]}>{t.size}</Badge>
                    <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-ink">
                      {t.assetTotal}
                    </span>
                  </button>
                </li>
              )
            })}
            {visible.length === 0 && (
              <li className="px-3 py-8 text-center text-sm text-muted">No {draft.year} tasks match the filter.</li>
            )}
          </ul>
        </div>

        {/* Play order */}
        <div className="rounded-xl border border-line">
          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Play order · {draft.selectedIds.length} selected
            </p>
            <div className="flex items-center gap-2">
              {draft.randomizeOrder && (
                <button
                  type="button"
                  onClick={() => patch({ seed: Math.floor(Math.random() * 2 ** 31) })}
                  className="inline-flex items-center gap-1 text-xs font-medium text-rmit-red hover:underline"
                  title="Shuffle again with a new seed"
                >
                  <Dices className="h-3.5 w-3.5" /> Re-roll
                </button>
              )}
              <span className="text-xs text-muted">Randomize</span>
              <Switch
                checked={draft.randomizeOrder}
                onChange={(randomizeOrder) => patch({ randomizeOrder })}
                label="Randomize order"
              />
            </div>
          </div>
          <ul className="max-h-[380px] divide-y divide-line overflow-y-auto">
            {playOrder.map((id, i) => {
              const t = byId.get(id)
              if (!t) return null
              const manualIndex = draft.selectedIds.indexOf(id)
              return (
                <li key={id} className="flex items-center gap-2 px-3 py-2">
                  <span className="w-6 shrink-0 text-right text-xs tabular-nums text-faint">{i + 1}</span>
                  {draft.randomizeOrder ? (
                    <Shuffle className="h-3.5 w-3.5 shrink-0 text-faint" />
                  ) : (
                    <span className="flex shrink-0 flex-col">
                      <button
                        type="button"
                        onClick={() => move(manualIndex, -1)}
                        disabled={manualIndex === 0}
                        className="text-faint transition hover:text-ink disabled:opacity-30"
                        title="Move up"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(manualIndex, 1)}
                        disabled={manualIndex === draft.selectedIds.length - 1}
                        className="text-faint transition hover:text-ink disabled:opacity-30"
                        title="Move down"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{t.name}</span>
                  <Badge tone={SIZE_TONE[t.size]}>{t.size}</Badge>
                  <button
                    type="button"
                    onClick={() => toggleTask(id)}
                    className="text-faint transition hover:text-rmit-red"
                    title="Remove from showcase"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              )
            })}
            {draft.selectedIds.length === 0 && (
              <li className="px-3 py-8 text-center text-sm text-muted">Pick at least one project.</li>
            )}
          </ul>
        </div>
      </div>

      {draft.selectedIds.length > 30 && (
        <StepHint>
          ⚠ {draft.selectedIds.length} projects makes a long showcase (~
          {Math.round((draft.selectedIds.length * 6.6) / 60)} min just for projects). Consider trimming.
        </StepHint>
      )}
    </div>
  )
}
