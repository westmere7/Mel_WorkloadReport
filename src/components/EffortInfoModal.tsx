import { useMemo, useState } from 'react'
import { FlaskConical, Pencil } from 'lucide-react'
import { Badge } from './ui/Badge'
import { Modal } from './ui/Modal'
import { AssetRatesModal } from './AssetRatesModal'
import { useStore } from '../data/store'
import { useAuth } from '../lib/auth'
import { useScrollFade } from '../lib/useScrollFade'
import { effortHeatColor, formatRatePerUnit, hoursPerUnit, sortAlpha } from '../constants'

/**
 * Explains the workload chart's Assets ↔ Effort switch, shows how the rated asset
 * types compare, and (for signed-in editors) opens the rate editor. Reached from
 * the "?" beside the switch.
 *
 * The copy stays on WHAT the two measures mean; it deliberately says nothing about
 * lines, axes or scales — how the chart draws them is visible on the chart itself.
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
  const { settings } = useStore()
  const { canEdit } = useAuth()
  const [editOpen, setEditOpen] = useState(false)
  const listRef = useScrollFade<HTMLUListElement>()
  const rates = settings.assetRates ?? {}

  /** Rated types, slowest first, with the bar scale taken from the slowest. */
  const rows = useMemo(() => {
    const rated = sortAlpha(settings.assetTypes)
      .map((name) => ({
        name,
        hours: hoursPerUnit(rates[name]),
        label: formatRatePerUnit(rates[name]).replace('≈ ', ''),
      }))
      .filter((r) => r.hours > 0)
      .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name))
    return { rated, slowest: rated.length ? rated[0].hours : 0 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.assetTypes, settings.assetRates])

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
              <div className="space-y-1.5 rounded-xl border border-line px-3.5 py-3">
                <dt className="text-sm font-semibold text-ink">Assets</dt>
                <dd className="space-y-1.5 text-xs leading-relaxed text-muted">
                  <p>
                    Counts every deliverable as one. A photo edit and a 12-page publication each add 1, so
                    you&rsquo;re measuring <strong className="text-ink">volume</strong> — how many things the
                    team shipped that month.
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
                    Weights each deliverable by how long its type takes to make. Every asset type has an output
                    rate — say 300 statics a day, or one guide every two weeks — so each asset counts for the
                    time one of them costs the team.
                  </p>
                  <p>
                    So 40 publications can outweigh 400 photo edits, which is usually closer to how the month
                    actually felt. The rates are hand-set estimates, so treat this as a{' '}
                    <strong className="text-ink">rough comparison between months</strong>, not a precise
                    measurement.
                  </p>
                </dd>
              </div>
            </dl>
            <p className="text-xs leading-relaxed text-faint">
              Effort changes this chart only, and only for you. Every other card, export and stored total still
              counts each asset as one — the switch changes how this chart is measured, never the data itself.
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
                and {unratedInScope.length === 1 ? 'counts' : 'count'} as zero effort, so the total comes out a
                little low: {unratedInScope.join(', ')}.
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
