import { useEffect, useState } from 'react'
import { Check, Copy, ExternalLink, Loader2, Pencil, Sparkles, Trash2 } from 'lucide-react'
import { useStore } from '../../data/store'
import { Badge } from '../ui/Badge'
import { Modal } from '../ui/Modal'
import { toMessage } from '../../lib/format'
import {
  EXPIRY_OPTIONS,
  estimateRuntimeMs,
  showcaseUrl,
  type ExpiryPreset,
  type ShowcaseDraft,
  type ShowcaseMeta,
} from '../../lib/showcase'
import { WIZARD_STEPS } from './WizardProgress'

function fmtWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtRuntime(ms: number): string {
  const s = Math.round(ms / 1000)
  return s < 60 ? `~${s}s` : `~${Math.floor(s / 60)}m ${s % 60}s`
}

/** One recap row with a jump-to-step pencil. */
function RecapRow({ label, value, step, onJump }: { label: string; value: string; step: number; onJump: (s: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm text-ink">{value}</span>
        <button
          type="button"
          onClick={() => onJump(step)}
          className="shrink-0 text-faint transition hover:text-rmit-red"
          title={`Edit in ${WIZARD_STEPS[step]}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </span>
    </div>
  )
}

export function StepGenerate({
  draft,
  patch,
  onJump,
  onGenerated,
}: {
  draft: ShowcaseDraft
  patch: (p: Partial<ShowcaseDraft>) => void
  onJump: (step: number) => void
  onGenerated: () => void
}) {
  const { backend, showcases, refreshShowcases, generateShowcase, deleteShowcase } = useStore()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generated, setGenerated] = useState<ShowcaseMeta | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<ShowcaseMeta | null>(null)

  // Previous showcases — lazy load + expired purge on mount.
  useEffect(() => {
    void refreshShowcases().catch(() => {})
  }, [refreshShowcases])

  const runGenerate = async () => {
    setBusy(true)
    setError(null)
    try {
      const meta = await generateShowcase(draft)
      setGenerated(meta)
      onGenerated()
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setBusy(false)
    }
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
      if (generated?.id === deleting.id) setGenerated(null)
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setDeleting(null)
    }
  }

  const sectionsLabel = draft.sectionOrder
    .map((s) => ({ intro: 'Intro', projects: 'Projects', globalStats: 'Stats', top3: 'Top 3' })[s])
    .join(' → ')
  const runtime = fmtRuntime(estimateRuntimeMs(draft, draft.statIds.length, draft.top3Ids.length))

  return (
    <div className="space-y-5">
      {/* Recap */}
      <div className="rounded-xl border border-line px-4 py-2">
        <div className="divide-y divide-line">
          <RecapRow label="Showcase" value={`${draft.title || 'Untitled'} · ${draft.year} · ${draft.teamName}`} step={0} onJump={onJump} />
          <RecapRow label="Staff" value={`${draft.staff.length} member${draft.staff.length === 1 ? '' : 's'}`} step={0} onJump={onJump} />
          <RecapRow
            label="Canvas · pacing"
            value={`${draft.canvas === '1920x1080' ? '16:9 (1920×1080)' : 'Square (1080×1080)'} · ${draft.pacing}`}
            step={0}
            onJump={onJump}
          />
          <RecapRow
            label="Projects"
            value={`${draft.selectedIds.length} selected${draft.randomizeOrder ? ' · randomized order' : ''}`}
            step={1}
            onJump={onJump}
          />
          <RecapRow label="Global stats" value={`${draft.statIds.length} blocks`} step={2} onJump={onJump} />
          <RecapRow label="Top 3" value={`${draft.top3Ids.length} rankings`} step={3} onJump={onJump} />
          <RecapRow label="Sequence" value={sectionsLabel} step={4} onJump={onJump} />
          <RecapRow
            label="Style"
            value={`${draft.theme} theme · ${draft.style.background}${draft.style.grain ? ' · grain' : ''}`}
            step={5}
            onJump={onJump}
          />
          <div className="flex items-center justify-between gap-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Estimated runtime</span>
            <span className="text-sm font-semibold text-ink">{runtime}</span>
          </div>
        </div>
      </div>

      {/* Expiry + generate */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="label">Keep this link for</label>
          <select
            className="input h-11 w-44"
            value={draft.expiry}
            onChange={(e) => patch({ expiry: e.target.value as ExpiryPreset })}
          >
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="btn-primary h-11" onClick={runGenerate} disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Generating…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" /> Generate showcase
            </>
          )}
        </button>
      </div>
      {backend === 'local' && (
        <p className="rounded-xl bg-subtle px-4 py-3 text-xs text-muted">
          Local mode — the link only opens in this browser. Connect Supabase to share it with others.
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
          {error}
        </p>
      )}

      {/* Freshly generated link */}
      {generated && (
        <div className="rounded-xl border border-accent-green/40 bg-green-50 p-4 dark:bg-green-500/10">
          <p className="mb-2 text-sm font-semibold text-ink">Your showcase is live 🎉</p>
          <div className="flex flex-wrap items-center gap-2">
            <input readOnly className="input h-10 flex-1 font-mono text-xs" value={showcaseUrl(generated.id)} onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="btn-outline h-10" onClick={() => copy(generated.id)}>
              {copied === generated.id ? <Check className="h-4 w-4 text-accent-green" /> : <Copy className="h-4 w-4" />}
              {copied === generated.id ? 'Copied' : 'Copy'}
            </button>
            <a href={showcaseUrl(generated.id)} target="_blank" rel="noreferrer" className="btn-primary h-10">
              <ExternalLink className="h-4 w-4" /> Open
            </a>
          </div>
        </div>
      )}

      {/* Previous showcases */}
      {showcases.length > 0 && (
        <div>
          <p className="label">Previous showcases</p>
          <ul className="space-y-2">
            {showcases.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2.5">
                <Badge tone="navy">{s.year}</Badge>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{s.title || 'Untitled showcase'}</span>
                  <span className="block text-[11px] text-faint">
                    {fmtWhen(s.createdAt)}
                    {s.createdBy ? ` · ${s.createdBy}` : ''} · {s.taskCount} projects ·{' '}
                    {s.expiresAt ? `expires ${fmtWhen(s.expiresAt)}` : 'never expires'}
                  </span>
                </span>
                <button type="button" className="btn-ghost h-9 px-2.5 text-xs" onClick={() => copy(s.id)}>
                  {copied === s.id ? <Check className="h-3.5 w-3.5 text-accent-green" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied === s.id ? 'Copied' : 'Copy link'}
                </button>
                <a href={showcaseUrl(s.id)} target="_blank" rel="noreferrer" className="btn-ghost h-9 px-2.5 text-xs">
                  <ExternalLink className="h-3.5 w-3.5" /> Open
                </a>
                <button
                  type="button"
                  onClick={() => setDeleting(s)}
                  className="rounded-lg p-1.5 text-faint transition hover:bg-brand-50 hover:text-rmit-red dark:hover:bg-brand-500/15"
                  title="Delete showcase link"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Delete confirm */}
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
    </div>
  )
}
