import { useState } from 'react'
import { BarChart3, Clapperboard, GripVertical, Lock, Trophy, Sparkles } from 'lucide-react'
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
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

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

  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragEnter = (index: number) => {
    // Lock intro to index 0 - cannot drag enter into intro
    if (draggedIndex !== null && index > 0) {
      setDragOverIndex(index)
    }
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const handleDrop = (index: number) => {
    if (draggedIndex === null) return
    if (draggedIndex !== index && index > 0 && draggedIndex > 0) {
      const next = [...draft.sectionOrder]
      const [moved] = next.splice(draggedIndex, 1)
      next.splice(index, 0, moved)
      patch({ sectionOrder: next })
    }
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  return (
    <div className="space-y-4">
      <StepHint>
        Arrange the running order. Drag handles to reorder sections. The intro always opens the showcase; empty sections are skipped automatically.
      </StepHint>
      <ul className="space-y-2">
        {draft.sectionOrder.map((s, i) => {
          const { label, icon: Icon } = SECTION_META[s]
          const locked = s === 'intro'
          const empty = isEmpty(s)

          let transform = 'none'
          if (draggedIndex !== null && dragOverIndex !== null && i !== draggedIndex && !locked && draggedIndex > 0) {
            if (draggedIndex < dragOverIndex) {
              if (i > draggedIndex && i <= dragOverIndex) {
                transform = 'translateY(-4.5rem)'
              }
            } else if (draggedIndex > dragOverIndex) {
              if (i < draggedIndex && i >= dragOverIndex) {
                transform = 'translateY(4.5rem)'
              }
            }
          }

          return (
            <li
              key={s}
              draggable={!locked}
              onDragStart={() => !locked && handleDragStart(i)}
              onDragEnter={() => !locked && handleDragEnter(i)}
              onDragOver={(e) => e.preventDefault()}
              onDragEnd={handleDragEnd}
              onDrop={() => !locked && handleDrop(i)}
              style={{
                transform,
                transition: draggedIndex !== null ? 'transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none',
              }}
              className={cx(
                'flex items-center gap-3 rounded-xl bg-subtle px-4 py-3 transition-colors',
                empty && 'opacity-50',
                draggedIndex === i && 'bg-subtle/50 border border-dashed border-rmit-red opacity-40',
              )}
            >
              <span className="w-5 text-center text-xs font-bold tabular-nums text-faint">{i + 1}</span>
              
              {locked ? (
                <span className="text-faint shrink-0 p-1" title="Locked position">
                  <Lock className="h-3.5 w-3.5" />
                </span>
              ) : (
                <span className="cursor-grab active:cursor-grabbing text-faint hover:text-ink shrink-0 p-1" title="Drag handle to reorder">
                  <GripVertical className="h-4 w-4" />
                </span>
              )}

              <Icon className="h-4 w-4 shrink-0 text-rmit-red" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">{label}</span>
                <span className="block text-xs text-muted">
                  {summaries[s]}
                  {empty && ' — empty, will be skipped'}
                </span>
              </span>
              {locked && (
                <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-faint mr-1">
                  first
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
