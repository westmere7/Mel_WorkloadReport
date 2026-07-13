import { useState } from 'react'
import { Plus, RotateCcw, X } from 'lucide-react'
import type { Task } from '../../types'
import { taskYears } from '../../lib/span'
import { sortAlpha } from '../../constants'
import { useStore } from '../../data/store'
import { deriveSelection, type ShowcaseDraft } from '../../lib/showcase'
import { Segmented, StepHint } from './wizardBits'

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

  const years = (() => {
    const set = new Set<number>(taskYears(tasks))
    set.add(draft.year)
    return Array.from(set).sort((a, b) => b - a)
  })()

  const changeYear = (year: number) => {
    // Year defines the dataset — reset the project selection to the fresh default.
    patch({ year, selectedIds: deriveSelection(tasks, year, draft.sizeFilter) })
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
            className="input h-11"
            placeholder={`GCMC ${draft.year} Showcase`}
            value={draft.title}
            onChange={(e) => patch({ title: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Team name</label>
          <input
            className="input h-11"
            placeholder="GCMC"
            value={draft.teamName}
            onChange={(e) => patch({ teamName: e.target.value })}
          />
        </div>
      </div>

      {/* Staff — a showcase-local copy of the people list */}
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label className="label mb-0">Staff ({draft.staff.length})</label>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs font-medium text-rmit-red hover:underline"
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
                onClick={() => patch({ staff: draft.staff.filter((s) => s !== name) })}
                className="text-faint transition hover:text-rmit-red"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <span className="inline-flex items-center gap-1">
            <input
              className="h-7 w-32 rounded-lg border border-line bg-card px-2 text-xs text-ink outline-none placeholder:text-faint focus:border-rmit-red"
              placeholder="Add name…"
              value={newStaff}
              onChange={(e) => setNewStaff(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addStaff())}
            />
            <button
              type="button"
              onClick={addStaff}
              title="Add staff member"
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-rmit-navy text-white transition hover:opacity-90 dark:bg-navy-300"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
        <StepHint>Changes here only affect this showcase — the Settings people list stays untouched.</StepHint>
      </div>

      {/* Canvas + pacing */}
      <div className="grid gap-4 sm:grid-cols-2">
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
  )
}
