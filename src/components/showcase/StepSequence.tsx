import { BarChart3, ChevronDown, ChevronUp, Clapperboard, Lock, Trophy, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cx } from '../../lib/format'
import type { SectionId, ShowcaseDraft } from '../../lib/showcase'
import { StepHint } from './wizardBits'

const SECTION_META: Record<SectionId, { label: string; icon: LucideIcon }> = {
  intro: { label: 'Showcase intro', icon: Sparkles },
  projects: { label: 'Projects', icon: Clapperboard },
  globalStats: { label: 'Global stats', icon: BarChart3 },
  top3: { label: 'Top 3', icon: Trophy },
}

export function StepSequence({
  draft,
  patch,
}: {
  draft: ShowcaseDraft
  patch: (p: Partial<ShowcaseDraft>) => void
}) {
  const summaries: Record<SectionId, string> = {
    intro: `${draft.year} · ${draft.teamName || 'team'} · ${draft.staff.length} staff`,
    projects: `${draft.selectedIds.length} project${draft.selectedIds.length === 1 ? '' : 's'}${draft.randomizeOrder ? ' · randomized' : ''}`,
    globalStats: `${draft.statIds.length} stat block${draft.statIds.length === 1 ? '' : 's'}`,
    top3: `${draft.top3Ids.length} ranking${draft.top3Ids.length === 1 ? '' : 's'}`,
  }
  const isEmpty = (s: SectionId) =>
    (s === 'projects' && draft.selectedIds.length === 0) ||
    (s === 'globalStats' && draft.statIds.length === 0) ||
    (s === 'top3' && draft.top3Ids.length === 0)

  // Intro is locked to index 0 — moves only swap among the rest.
  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir
    if (index === 0 || j <= 0 || j >= draft.sectionOrder.length) return
    const next = [...draft.sectionOrder]
    ;[next[index], next[j]] = [next[j], next[index]]
    patch({ sectionOrder: next })
  }

  return (
    <div className="space-y-4">
      <StepHint>
        Arrange the running order. The intro always opens the showcase; empty sections are skipped
        automatically.
      </StepHint>
      <ul className="space-y-2">
        {draft.sectionOrder.map((s, i) => {
          const { label, icon: Icon } = SECTION_META[s]
          const locked = s === 'intro'
          const empty = isEmpty(s)
          return (
            <li
              key={s}
              className={cx(
                'flex items-center gap-3 rounded-xl bg-subtle px-4 py-3',
                empty && 'opacity-50',
              )}
            >
              <span className="w-5 text-center text-xs font-bold tabular-nums text-faint">{i + 1}</span>
              <Icon className="h-4 w-4 shrink-0 text-rmit-red" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">{label}</span>
                <span className="block text-xs text-muted">
                  {summaries[s]}
                  {empty && ' — empty, will be skipped'}
                </span>
              </span>
              {locked ? (
                <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-faint">
                  <Lock className="h-3.5 w-3.5" /> first
                </span>
              ) : (
                <span className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i <= 1}
                    className="text-faint transition hover:text-ink disabled:opacity-30"
                    title="Move earlier"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === draft.sectionOrder.length - 1}
                    className="text-faint transition hover:text-ink disabled:opacity-30"
                    title="Move later"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
