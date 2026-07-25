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
        widthClass="max-w-5xl"
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
              <div className="rounded-xl border border-line px-3 py-2.5">
                <dt className="text-xs font-semibold text-ink">Assets</dt>
                <dd className="mt-1 text-xs leading-relaxed text-muted">
                  Counts every deliverable as one, so a banner and a photo edit weigh the same. A team making
                  many quick assets looks busier than one making a few slow ones.
                </dd>
              </div>
              <div className="rounded-xl border border-line px-3 py-2.5">
                <dt className="text-xs font-semibold text-ink">Effort</dt>
                <dd className="mt-1 text-xs leading-relaxed text-muted">
                  Multiplies each month&rsquo;s assets by how long that type takes to make. Shows how much work
                  a month was — the shape is the point, so the scale is unlabelled.
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

          {rows.rated.length > 0 ? (
            // Divider + heading keeps the data clearly separate from the prose.
            <div className="border-t border-line pt-4">
              <h4 className="text-sm font-semibold text-ink">How the asset types compare</h4>
              <p className="mt-0.5 text-xs text-muted">
                Time one of each takes, drawn to scale and coloured from quick (cool) to slow (hot).
              </p>
              <ul ref={listRef} className="mt-3 max-h-[28rem] space-y-1.5 overflow-y-auto">
                {rows.rated.map((r) => (
                  <li key={r.name} className="flex items-center gap-2.5">
                    <span className="w-56 shrink-0 truncate text-sm font-medium text-ink" title={r.name}>
                      {r.name}
                    </span>
                    <span className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-subtle">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${(r.hours / rows.slowest) * 100}%`,
                          minWidth: '2px',
                          backgroundColor: effortHeatColor(r.hours),
                        }}
                      />
                    </span>
                    <span className="w-28 shrink-0 text-right text-xs text-muted">{r.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="rounded-xl border border-line px-3.5 py-3 text-xs text-muted">
              No output rates recorded yet, so there&rsquo;s nothing to compare.
              {canEdit ? ' Use “Edit output rates” below to add them.' : ''}
            </p>
          )}
        </div>
      </Modal>

      {/* The full editor, opened on top of this dialog. */}
      <AssetRatesModal open={editOpen} onClose={() => setEditOpen(false)} />
    </>
  )
}
