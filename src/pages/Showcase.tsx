import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { useStore } from '../data/store'
import {
  clearDraft,
  defaultDraft,
  loadDraft,
  saveDraft,
  type ShowcaseDraft,
} from '../lib/showcase'
import { WIZARD_STEPS, WizardProgress } from '../components/showcase/WizardProgress'
import { StepIntro } from '../components/showcase/StepIntro'
import { StepProjects } from '../components/showcase/StepProjects'
import { StepStats } from '../components/showcase/StepStats'
import { StepTop3 } from '../components/showcase/StepTop3'
import { StepSequence } from '../components/showcase/StepSequence'
import { StepStyle } from '../components/showcase/StepStyle'
import { StepGenerate } from '../components/showcase/StepGenerate'

/** Restore the saved draft, dropping task ids that no longer exist. */
function initialDraft(tasksIds: Set<string>, fallback: () => ShowcaseDraft): ShowcaseDraft {
  const saved = loadDraft()
  if (!saved) return fallback()
  return { ...fallback(), ...saved, selectedIds: saved.selectedIds.filter((id) => tasksIds.has(id)) }
}

export function ShowcasePage() {
  const { tasks, settings } = useStore()

  const [draft, setDraft] = useState<ShowcaseDraft>(() =>
    initialDraft(new Set(tasks.map((t) => t.id)), () => defaultDraft(tasks, settings)),
  )
  const step = Math.min(Math.max(draft.step, 0), WIZARD_STEPS.length - 1)

  const patch = (p: Partial<ShowcaseDraft>) => setDraft((d) => ({ ...d, ...p }))
  const jump = (s: number) => patch({ step: s })

  // Debounced autosave so a reload resumes where you were.
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveDraft(draft), 400)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [draft])

  // Per-step validation gates the Next button (earlier steps stay reachable).
  const yearHasTasks = useMemo(
    () => tasks.some((t) => t.startDate?.startsWith(String(draft.year))),
    [tasks, draft.year],
  )
  const stepValid: boolean[] = [
    Boolean(draft.title.trim() && draft.teamName.trim() && draft.staff.length >= 1 && yearHasTasks),
    draft.selectedIds.length >= 1,
    draft.statIds.length >= 1,
    true, // Top 3 optional
    true, // Sequence
    true, // Style
    true, // Generate re-checks
  ]
  const stepInvalidHint = [
    !yearHasTasks
      ? `No tasks start in ${draft.year} — pick another year.`
      : 'Fill in the name, team and at least one staff member.',
    'Select at least one project.',
    'Select at least one stat.',
    '',
    '',
    '',
    '',
  ]

  const startOver = () => {
    clearDraft()
    setDraft(defaultDraft(tasks, settings))
  }

  const steps = [
    <StepIntro key="intro" draft={draft} patch={patch} tasks={tasks} />,
    <StepProjects key="projects" draft={draft} patch={patch} tasks={tasks} />,
    <StepStats key="stats" draft={draft} patch={patch} tasks={tasks} />,
    <StepTop3 key="top3" draft={draft} patch={patch} tasks={tasks} />,
    <StepSequence key="sequence" draft={draft} patch={patch} />,
    <StepStyle key="style" draft={draft} patch={patch} />,
    <StepGenerate key="generate" draft={draft} patch={patch} onJump={jump} onGenerated={clearDraft} />,
  ]

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Card className="py-4">
        <WizardProgress step={step} maxReached={WIZARD_STEPS.length - 1} onJump={jump} />
      </Card>

      <Card>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-ink">
              Step {step + 1} · {WIZARD_STEPS[step]}
            </h3>
            {!stepValid[step] && <p className="mt-0.5 text-xs font-medium text-rmit-red">{stepInvalidHint[step]}</p>}
          </div>
          <button
            type="button"
            onClick={startOver}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted transition hover:bg-subtle hover:text-ink"
            title="Discard this draft and start fresh"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Start over
          </button>
        </div>

        {steps[step]}

        {/* Footer nav — Generate lives inside the last step. */}
        <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
          <button type="button" className="btn-outline" onClick={() => jump(step - 1)} disabled={step === 0}>
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          {step < WIZARD_STEPS.length - 1 && (
            <button type="button" className="btn-primary" onClick={() => jump(step + 1)} disabled={!stepValid[step]}>
              Next <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </Card>
    </div>
  )
}
