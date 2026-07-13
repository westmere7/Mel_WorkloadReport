import { useState } from 'react'
import { Plus, RotateCcw, X } from 'lucide-react'
import type { Task } from '../../types'
import { taskYears } from '../../lib/span'
import { sortAlpha } from '../../constants'
import { useStore } from '../../data/store'
import { deriveSelection, type ShowcaseDraft } from '../../lib/showcase'
import { Segmented, StepHint } from './wizardBits'
import { cx } from '../../lib/format'

export function StepIntro({
  draft,
  patch,
  tasks,
}: {
  draft: ShowcaseDraft
  patch: (p: Partial<ShowcaseDraft>) => void
  tasks: Task[]
}) {
  const { settings } = useStore()
  const [newStaff, setNewStaff] = useState('')

  const yearAssets = tasks
    .filter((t) => t.startDate?.startsWith(String(draft.year)))
    .reduce((sum, t) => sum + (t.assetTotal || 0), 0)

  const isBlocked = yearAssets < 100

  const years = (() => {
    const set = new Set<number>(taskYears(tasks))
    set.add(draft.year)
    return Array.from(set).sort((a, b) => b - a)
  })()

  const changeYear = (year: number) => {
    // Year defines the dataset — reset the project selection to the fresh default.
    let title = draft.title
    const yearRegex = /\b\d{4}\b/g
    if (yearRegex.test(title)) {
      title = title.replace(yearRegex, String(year))
    }
    patch({ year, title, selectedIds: deriveSelection(tasks, year, draft.sizeFilter) })
  }

  const addStaff = () => {
    const v = newStaff.trim()
    if (!v || draft.staff.some((s) => s.toLowerCase() === v.toLowerCase())) {
      setNewStaff('')
      return
    }
    patch({ staff: [...draft.staff, v] })
    setNewStaff('')
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[140px_1fr_1fr]">
        <div>
          <label className="label">Year</label>
          <select className="input h-11" value={draft.year} onChange={(e) => changeYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Showcase name</label>
          <input
            className="input h-11 disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder={`GCMC ${draft.year} Showcase`}
            value={draft.title}
            onChange={(e) => patch({ title: e.target.value })}
            disabled={isBlocked}
          />
        </div>
        <div>
          <label className="label">Team name</label>
          <input
            className="input h-11 disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="GCMC"
            value={draft.teamName}
            onChange={(e) => patch({ teamName: e.target.value })}
            disabled={isBlocked}
          />
        </div>
      </div>

      {isBlocked && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300">
          ⚠ <strong>Minimum assets requirement not met:</strong> Generating a showcase requires at least <strong>100 assets</strong> total across the selected year's tasks. The year {draft.year} currently has only <strong>{yearAssets}</strong> assets in total.
        </div>
      )}

      {/* Gray out all other configurations when blocked */}
      <div className={cx(isBlocked && 'opacity-40 pointer-events-none select-none transition-opacity')}>
        {/* Staff — a showcase-local copy of the people list */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="label mb-0">Staff ({draft.staff.length})</label>
            <button
              type="button"
              disabled={isBlocked}
              className="inline-flex items-center gap-1 text-xs font-medium text-rmit-red hover:underline disabled:opacity-50"
              onClick={() => patch({ staff: sortAlpha(settings.people) })}
            >
              <RotateCcw className="h-3 w-3" /> Reset to Settings people
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line p-2.5">
            {draft.staff.map((name) => (
              <span key={name} className="chip bg-subtle text-ink">
                {name}
                <button
                  type="button"
                  title={`Remove ${name}`}
                  disabled={isBlocked}
                  onClick={() => patch({ staff: draft.staff.filter((s) => s !== name) })}
                  className="text-faint transition hover:text-rmit-red"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <span className="inline-flex items-center gap-1">
              <input
                className="h-7 w-32 rounded-lg border border-line bg-card px-2 text-xs text-ink outline-none placeholder:text-faint focus:border-rmit-red disabled:opacity-50"
                placeholder="Add name…"
                value={newStaff}
                disabled={isBlocked}
                onChange={(e) => setNewStaff(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addStaff())}
              />
              <button
                type="button"
                onClick={addStaff}
                title="Add staff member"
                disabled={isBlocked}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-rmit-navy text-white transition hover:opacity-90 dark:bg-navy-300 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </span>
          </div>
          <StepHint>Changes here only affect this showcase — the Settings people list stays untouched.</StepHint>
        </div>

        {/* Canvas + pacing */}
        <div className="grid gap-4 sm:grid-cols-2 mt-5">
          <div>
            <label className="label">Canvas</label>
            <Segmented
              options={[
                { id: '1920x1080', label: '16:9 · 1920×1080' },
                { id: '1080x1080', label: 'Square · 1080×1080' },
              ]}
              value={draft.canvas}
              onChange={(canvas) => patch({ canvas })}
            />
          </div>
          <div>
            <label className="label">Pacing</label>
            <Segmented
              options={[
                { id: 'relaxed', label: 'Relaxed' },
                { id: 'normal', label: 'Normal' },
                { id: 'fast', label: 'Fast' },
              ]}
              value={draft.pacing}
              onChange={(pacing) => patch({ pacing })}
            />
            <StepHint>How quickly animations and transitions move.</StepHint>
          </div>
        </div>
      </div>
    </div>
  )
}
