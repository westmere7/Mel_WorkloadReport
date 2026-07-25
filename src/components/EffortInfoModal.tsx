import { useState } from 'react'
import { FlaskConical, Pencil } from 'lucide-react'
import { Badge } from './ui/Badge'
import { Modal } from './ui/Modal'
import { AssetRatesModal } from './AssetRatesModal'
import { useAuth } from '../lib/auth'

/**
 * Explains the workload chart's Assets ↔ Effort switch in plain language, and
 * (for signed-in editors) opens the rate editor. Reached from the "?" beside the
 * switch. Deliberately text only — the per-type comparison lives in the editor,
 * where the numbers it describes are actually being set.
 */
export function EffortInfoModal({
  open,
  onClose,
  unratedInScope = [],
}: {
  open: boolean
  onClose: () => void
  /** Asset types with volume on the chart but no rate — they count as zero. */
  unratedInScope?: string[]
}) {
  const { canEdit } = useAuth()
  const [editOpen, setEditOpen] = useState(false)

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        // Text only now the bars are gone, so narrower than the editor — two
        // ~26rem columns keep the line length comfortable to read.
        widthClass="max-w-4xl"
        title={
          <span className="flex items-center gap-2">
            Measuring workload by effort
            <Badge tone="plum">Experimental</Badge>
          </span>
        }
        footer={
          <>
            {canEdit && (
              <button
                type="button"
                className="btn-outline flex items-center gap-1.5"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit output rates
              </button>
            )}
            <button type="button" className="btn-navy" onClick={onClose}>
              Done
            </button>
          </>
        }
      >
        <div className="space-y-5">
          {/* The two modes, side by side — the contrast IS the explanation. */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-faint">What the switch does</p>
            <dl className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5 rounded-xl border border-line px-3.5 py-3">
                <dt className="text-sm font-semibold text-ink">Assets</dt>
                <dd className="space-y-1.5 text-xs leading-relaxed text-muted">
                  <p>
                    Counts every deliverable as one. A photo edit and a 12-page publication each add 1, so the
                    line measures <strong className="text-ink">volume</strong> — how many things the team
                    shipped that month.
                  </p>
                  <p>
                    This is the app&rsquo;s standard measure and what every other card uses. It&rsquo;s exact
                    and easy to check against the task list, but it treats a quick job and a slow one as equal,
                    so a month of heavy design work can look quieter than a month of light touch-ups.
                  </p>
                </dd>
              </div>
              <div className="space-y-1.5 rounded-xl border border-line px-3.5 py-3">
                <dt className="text-sm font-semibold text-ink">Effort</dt>
                <dd className="space-y-1.5 text-xs leading-relaxed text-muted">
                  <p>
                    Weights each deliverable by how long its type takes. Every asset type has an output rate —
                    say 300 statics a day, or one guide every two weeks — and the chart multiplies the assets
                    booked in a month by the time one of them takes.
                  </p>
                  <p>
                    So 40 publications can outweigh 400 photo edits, which is usually closer to how the month
                    actually felt. The rates are hand-set estimates, so read the{' '}
                    <strong className="text-ink">shape and the peaks</strong>, not the height — that&rsquo;s why
                    the scale carries no numbers.
                  </p>
                </dd>
              </div>
            </dl>
            <p className="text-xs leading-relaxed text-faint">
              Effort changes this chart only, and only for you. Every other card, export and stored total still
              counts each asset as one — the switch re-draws a line, it never edits data.
            </p>
          </div>

          {unratedInScope.length > 0 && (
            <div className="flex gap-2.5 rounded-xl border border-line bg-subtle px-3.5 py-3">
              <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-accent-plum" />
              <p className="text-xs leading-relaxed text-muted">
                <strong className="text-ink">
                  {unratedInScope.length} asset type{unratedInScope.length === 1 ? '' : 's'} in view{' '}
                  {unratedInScope.length === 1 ? 'has' : 'have'} no rate yet
                </strong>{' '}
                and {unratedInScope.length === 1 ? 'counts' : 'count'} as zero effort, so the line sits a little
                low: {unratedInScope.join(', ')}.
              </p>
            </div>
          )}

        </div>
      </Modal>

      {/* The full editor, opened on top of this dialog. */}
      <AssetRatesModal open={editOpen} onClose={() => setEditOpen(false)} />
    </>
  )
}
