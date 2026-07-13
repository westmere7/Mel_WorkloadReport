import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, RotateCcw, Smartphone, FolderOpen, Loader2, Copy, Check, ExternalLink, Trash2 } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { useStore } from '../data/store'
import { toMessage } from '../lib/format'
import {
  clearDraft,
  defaultDraft,
  loadDraft,
  saveDraft,
  showcaseUrl,
  type ShowcaseDraft,
  type ShowcaseMeta,
} from '../lib/showcase'
import { WIZARD_STEPS, WizardProgress } from '../components/showcase/WizardProgress'
import { StepIntro } from '../components/showcase/StepIntro'
import { StepProjects } from '../components/showcase/StepProjects'
import { StepStats } from '../components/showcase/StepStats'
import { StepTop3 } from '../components/showcase/StepTop3'
import { StepSequence } from '../components/showcase/StepSequence'
import { StepStyle } from '../components/showcase/StepStyle'
import { StepGenerate } from '../components/showcase/StepGenerate'

function fmtWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Restore the saved draft, dropping task ids that no longer exist. */
function initialDraft(tasksIds: Set<string>, fallback: () => ShowcaseDraft): ShowcaseDraft {
  const saved = loadDraft()
  if (!saved) return fallback()
  return { ...fallback(), ...saved, selectedIds: saved.selectedIds.filter((id) => tasksIds.has(id)) }
}

export function ShowcasePage() {
  const { tasks, settings, showcases, refreshShowcases, deleteShowcase, getShowcase } = useStore()
  const [isMobile, setIsMobile] = useState(false)

  const [loadingConfig, setLoadingConfig] = useState<string | null>(null)
  const [missingTasks, setMissingTasks] = useState<{ name: string; code: string }[]>([])
  const [pendingLoadConfig, setPendingLoadConfig] = useState<any | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<ShowcaseMeta | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent))
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Lazy load showcases on mount
  useEffect(() => {
    void refreshShowcases().catch(() => {})
  }, [refreshShowcases])

  const [draft, setDraft] = useState<ShowcaseDraft>(() =>
    initialDraft(new Set(tasks.map((t) => t.id)), () => defaultDraft(tasks, settings)),
  )
  // Per-step validation gates the Next button (earlier steps stay reachable).
  const yearAssets = useMemo(() => {
    return tasks
      .filter((t) => t.startDate?.startsWith(String(draft.year)))
      .reduce((sum, t) => sum + (t.assetTotal || 0), 0)
  }, [tasks, draft.year])

  const yearHasEnoughAssets = yearAssets >= 100

  const step = yearHasEnoughAssets ? Math.min(Math.max(draft.step, 0), WIZARD_STEPS.length - 1) : 0

  const patch = (p: Partial<ShowcaseDraft>) => setDraft((d) => ({ ...d, ...p }))
  const jump = (s: number) => {
    if (!yearHasEnoughAssets) return
    patch({ step: s })
  }

  // Debounced autosave so a reload resumes where you were.
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveDraft(draft), 400)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [draft])

  const stepValid: boolean[] = [
    Boolean(draft.title.trim() && draft.teamName.trim() && draft.staff.length >= 1 && yearHasEnoughAssets),
    draft.selectedIds.length >= 1,
    draft.statIds.length >= 1,
    true, // Top 3 optional
    true, // Sequence
    true, // Style
    true, // Generate re-checks
  ]
  const stepInvalidHint = [
    yearAssets < 100
      ? `The selected year ${draft.year} only has ${yearAssets} assets total (minimum 100 required).`
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

  const copy = (id: string) => {
    void navigator.clipboard?.writeText(showcaseUrl(id)).then(() => {
      setCopied(id)
      setTimeout(() => setCopied(null), 1400)
    })
  }

  const confirmDelete = async () => {
    if (!deleting) return
    try {
      await deleteShowcase(deleting.id)
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setDeleting(null)
    }
  }

  const loadConfigIntoDraft = (config: any) => {
    const existingIds = config.projects
      .map((p: any) => p.id)
      .filter((id: string) => tasks.some((t) => t.id === id))

    const newDraft: Partial<ShowcaseDraft> = {
      step: 0,
      year: config.year,
      title: config.title,
      teamName: config.teamName,
      staff: config.staff,
      canvas: config.canvas,
      pacing: config.pacing,
      selectedIds: existingIds,
      randomizeOrder: config.randomizeOrder,
      seed: config.seed,
      statIds: config.stats.map((s: any) => s.id),
      top3Ids: config.top3.map((b: any) => b.id),
      sectionOrder: config.sectionOrder,
      theme: config.theme,
      style: config.style,
    }
    patch(newDraft)
    jump(0) // Go to step 1
  }

  const loadShowcaseConfig = async (id: string) => {
    setLoadingConfig(id)
    setError(null)
    try {
      const record = await getShowcase(id)
      if (!record) {
        throw new Error('Showcase configuration not found')
      }
      const config = record.config
      const missing = config.projects.filter((p: any) => !tasks.some((t) => t.id === p.id))
      
      if (missing.length > 0) {
        setMissingTasks(missing.map((p: any) => ({ name: p.name, code: p.code })))
        setPendingLoadConfig(config)
      } else {
        loadConfigIntoDraft(config)
      }
    } catch (e) {
      setError(`Failed to load showcase: ${toMessage(e)}`)
    } finally {
      setLoadingConfig(null)
    }
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

  if (isMobile) {
    return (
      <Card className="flex flex-col items-center justify-center text-center p-8 space-y-3">
        <Smartphone className="h-10 w-10 text-rmit-red" />
        <h3 className="text-lg font-bold text-ink">Showcase Builder Disabled</h3>
        <p className="text-sm text-muted max-w-md">
          Creating and editing showcases is optimized for desktop displays. Please open this page on a desktop screen to build or customize a showreel.
        </p>
      </Card>
    )
  }

  return (
    <div className="mx-auto max-w-[1440px] grid gap-6 lg:grid-cols-3 items-start">
      {/* Left panel: main wizard */}
      <div className="lg:col-span-2 space-y-4">
        <Card className="py-4">
          <WizardProgress step={step} maxReached={yearHasEnoughAssets ? WIZARD_STEPS.length - 1 : 0} onJump={jump} />
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

        {error && (
          <p className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300">
            {error}
          </p>
        )}
      </div>

      {/* Right panel: Dedicated Permanent Previous Showcases Section */}
      <div className="lg:col-span-1">
        <Card className="p-4 space-y-3 flex flex-col h-full max-h-[700px] overflow-hidden">
          <p className="label text-xs uppercase tracking-wider mb-1">Previous Showcases</p>
          {showcases.length === 0 ? (
            <p className="text-xs text-muted italic">No showcases generated yet.</p>
          ) : (
            <ul className="space-y-2.5 overflow-y-auto pr-1 flex-1">
              {showcases.map((s) => (
                <ShowcaseItemRow
                  key={s.id}
                  s={s}
                  loadingConfig={loadingConfig}
                  loadShowcaseConfig={loadShowcaseConfig}
                  copy={copy}
                  copied={copied}
                  setDeleting={setDeleting}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Delete confirm Modal */}
      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete showcase link"
        footer={
          <>
            <button className="btn-outline" onClick={() => setDeleting(null)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={confirmDelete}>
              Delete
            </button>
          </>
        }
      >
        <p className="text-sm text-muted">
          Delete <strong className="text-ink">{deleting?.title || 'this showcase'}</strong> ({deleting?.year})? The link
          stops working immediately. This cannot be undone.
        </p>
      </Modal>

      {/* Missing tasks warning Modal */}
      <Modal
        open={missingTasks.length > 0}
        onClose={() => { setMissingTasks([]); setPendingLoadConfig(null); }}
        title="Missing Tasks in Showcase"
        footer={
          <>
            <button className="btn-outline" onClick={() => { setMissingTasks([]); setPendingLoadConfig(null); }}>
              Cancel
            </button>
            <button
              className="btn-primary bg-rmit-red hover:bg-red-700 border-none"
              onClick={() => {
                if (pendingLoadConfig) {
                  loadConfigIntoDraft(pendingLoadConfig)
                }
                setMissingTasks([])
                setPendingLoadConfig(null)
              }}
            >
              Load Anyway
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">
            The showcase you are loading references <strong className="text-ink">{missingTasks.length} task(s)</strong> that no longer exist in the workload report database:
          </p>
          <ul className="max-h-[160px] overflow-y-auto rounded-lg bg-subtle p-3 divide-y divide-line text-xs font-mono text-ink">
            {missingTasks.map((t, idx) => (
              <li key={idx} className="py-1">
                {t.code ? `[${t.code}] ` : ''}{t.name}
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted">
            If you load this showcase, these missing tasks will be omitted from the selected play order. The rest of the showcase settings will load normally.
          </p>
        </div>
      </Modal>
    </div>
  )
}

function ShowcaseItemRow({
  s,
  loadingConfig,
  loadShowcaseConfig,
  copy,
  copied,
  setDeleting,
}: {
  s: ShowcaseMeta
  loadingConfig: string | null
  loadShowcaseConfig: (id: string) => Promise<void>
  copy: (id: string) => void
  copied: string | null
  setDeleting: (s: ShowcaseMeta) => void
}) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-line p-3 bg-subtle/30 hover:bg-subtle/50 transition">
      {/* Left: Info */}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <Badge tone="navy" className="text-[10px] px-1.5 py-0.5 leading-none">{s.year}</Badge>
          <span className="truncate text-sm font-bold text-ink leading-tight" title={s.title || 'Untitled showcase'}>
            {s.title || 'Untitled'}
          </span>
        </div>
        <div className="text-xs text-muted leading-tight space-y-0.5">
          <p>{fmtWhen(s.createdAt)} · {s.taskCount} projects</p>
          <p className="text-[11px] text-faint">
            {s.expiresAt ? `Expires ${fmtWhen(s.expiresAt)}` : 'Never expires'}
          </p>
        </div>
      </div>

      {/* Right: Compact Icon Buttons Grid (2x2) */}
      <div className="grid grid-cols-2 gap-1 shrink-0">
        <button
          type="button"
          disabled={loadingConfig !== null}
          onClick={() => loadShowcaseConfig(s.id)}
          className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-subtle hover:text-rmit-red text-faint transition disabled:opacity-40"
          title="Load showcase configuration"
        >
          {loadingConfig === s.id ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FolderOpen className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-subtle text-faint transition"
          onClick={() => copy(s.id)}
          title="Copy link"
        >
          {copied === s.id ? <Check className="h-4 w-4 text-accent-green" /> : <Copy className="h-4 w-4" />}
        </button>
        <a
          href={showcaseUrl(s.id)}
          target="_blank"
          rel="noreferrer"
          className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-subtle text-faint transition"
          title="Open showcase in new tab"
        >
          <ExternalLink className="flex h-4 w-4" />
        </a>
        <button
          type="button"
          onClick={() => setDeleting(s)}
          className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-brand-50 hover:text-rmit-red dark:hover:bg-brand-500/15 text-faint transition"
          title="Delete showcase"
        >
          <Trash2 className="flex h-4 w-4" />
        </button>
      </div>
    </li>
  )
}
