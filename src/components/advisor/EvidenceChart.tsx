import { cx } from '../../lib/format'
import { formatHours } from '../../lib/effort'
import type { Evidence, EvidenceUnit } from '../../lib/advisor/findings'

// ─────────────────────────────────────────────────────────────────────────────
// Advisor · evidence renderers
//
// Small, self-contained charts for the series behind each finding. Deliberately
// NOT Recharts: these are annotations beside a sentence, not dashboards — div/flex
// bars scale with the card, inherit the theme for free, and can't misbehave inside
// a grid the way a measured SVG chart can. Every value is labelled; the reader
// should never have to hover to know a number.
// ─────────────────────────────────────────────────────────────────────────────

function fmt(v: number, unit: EvidenceUnit): string {
  if (unit === 'hours') return formatHours(v)
  if (unit === 'percent') return `${Math.round(v * 10) / 10}%`
  return v.toLocaleString()
}

/** Vertical month columns, the months the claim is about accented and labelled. */
function MonthsChart({ e }: { e: Extract<Evidence, { kind: 'months' }> }) {
  const max = Math.max(...e.points.map((p) => p.value), 1)
  return (
    <div>
      {/* No items-end here: columns must STRETCH to the row's full height, or the
          bars' percentage heights resolve against content height and collapse. */}
      <div className="flex h-28 gap-1">
        {e.points.map((p) => {
          const hot = e.highlight.includes(p.name)
          return (
            <div key={p.name} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
              {hot && (
                <span className="whitespace-nowrap text-[10px] font-semibold tabular-nums text-ink">
                  {fmt(p.value, e.unit)}
                </span>
              )}
              <div
                title={`${p.name}: ${fmt(p.value, e.unit)}`}
                style={{ height: `${Math.max(p.value > 0 ? 3 : 1, (p.value / max) * 100)}%` }}
                className={cx(
                  'w-full rounded-t-sm transition-colors',
                  hot ? 'bg-rmit-red' : 'bg-navy-200/70 dark:bg-navy-300/40',
                )}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-1 flex gap-1">
        {e.points.map((p) => (
          <span
            key={p.name}
            className={cx(
              'min-w-0 flex-1 text-center text-[9px] leading-tight',
              e.highlight.includes(p.name) ? 'font-bold text-ink' : 'text-faint',
            )}
          >
            {p.name}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Horizontal bars; `signed` centres the axis so +/− changes read correctly. */
function BarsChart({ e }: { e: Extract<Evidence, { kind: 'bars' }> }) {
  if (e.signed) {
    const maxAbs = Math.max(...e.rows.map((r) => Math.abs(r.value)), 1)
    return (
      <div className="space-y-2.5">
        {e.rows.map((r) => (
          <div key={r.name}>
            <div className="mb-0.5 flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate text-muted">{r.name}</span>
              <span className={cx('shrink-0 font-semibold tabular-nums', r.value < 0 ? 'text-rmit-red' : 'text-ink')}>
                {r.value > 0 ? '+' : r.value < 0 ? '−' : ''}
                {fmt(Math.abs(r.value), e.unit)}
              </span>
            </div>
            {/* Centre line with the bar growing left (negative) or right (positive). */}
            <div className="relative h-3 rounded bg-subtle">
              <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
              <div
                style={{
                  width: `${(Math.abs(r.value) / maxAbs) * 50}%`,
                  [r.value < 0 ? 'right' : 'left']: '50%',
                }}
                className={cx(
                  'absolute inset-y-0.5 rounded-sm',
                  r.value < 0 ? 'bg-rmit-red/80' : r.accent ? 'bg-accent-teal' : 'bg-rmit-navy dark:bg-navy-300',
                )}
              />
            </div>
          </div>
        ))}
      </div>
    )
  }
  const max = Math.max(...e.rows.map((r) => r.value), 1)
  return (
    <div className="space-y-2">
      {e.rows.map((r) => (
        <div key={r.name} className="flex items-center gap-2">
          <span className="w-32 shrink-0 truncate text-xs text-muted" title={r.name}>
            {r.name}
          </span>
          <div className="h-3.5 min-w-0 flex-1 rounded bg-subtle">
            <div
              style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }}
              className={cx('h-full rounded', r.accent ? 'bg-rmit-red' : 'bg-rmit-navy dark:bg-navy-300')}
            />
          </div>
          <span className="w-14 shrink-0 text-right text-xs font-semibold tabular-nums text-ink">
            {fmt(r.value, e.unit)}
          </span>
        </div>
      ))}
    </div>
  )
}

/** The same categories measured two ways — the gap between the bars is the point. */
function PairsChart({ e }: { e: Extract<Evidence, { kind: 'pairs' }> }) {
  const max = Math.max(...e.rows.flatMap((r) => [r.before, r.after]), 1)
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-sm bg-navy-200/80 dark:bg-white/25" />
          {e.beforeLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-sm bg-rmit-red" />
          {e.afterLabel}
        </span>
      </div>
      <div className="space-y-2.5">
        {e.rows.map((r) => (
          <div key={r.name}>
            <p className="mb-1 truncate text-xs text-muted" title={r.name}>
              {r.name}
            </p>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="h-2.5 min-w-0 flex-1 rounded bg-subtle">
                  <div
                    style={{ width: `${Math.max(1.5, (r.before / max) * 100)}%` }}
                    className="h-full rounded bg-navy-200/80 dark:bg-white/25"
                  />
                </div>
                <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-muted">
                  {fmt(r.before, e.unit)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2.5 min-w-0 flex-1 rounded bg-subtle">
                  <div
                    style={{ width: `${Math.max(1.5, (r.after / max) * 100)}%` }}
                    className="h-full rounded bg-rmit-red"
                  />
                </div>
                <span className="w-12 shrink-0 text-right text-[11px] font-semibold tabular-nums text-ink">
                  {fmt(r.after, e.unit)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function EvidenceChart({ evidence }: { evidence: Evidence }) {
  if (evidence.kind === 'months') return <MonthsChart e={evidence} />
  if (evidence.kind === 'bars') return <BarsChart e={evidence} />
  return <PairsChart e={evidence} />
}
