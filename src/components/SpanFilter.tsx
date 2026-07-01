import { cx } from '../lib/format'
import type { SpanMode } from '../lib/span'
import type { Half } from '../types'

/** Segmented Total / By year / By half control, with a year select and H1/H2 toggle. */
export function SpanFilter({
  mode,
  year,
  half,
  years,
  onMode,
  onYear,
  onHalf,
}: {
  mode: SpanMode
  year: number
  half: Half
  years: number[]
  onMode: (m: SpanMode) => void
  onYear: (y: number) => void
  onHalf: (h: Half) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-0.5 rounded-lg bg-card p-1 shadow-soft">
        {(
          [
            ['total', 'Total'],
            ['year', 'By year'],
            ['half', 'By half'],
          ] as [SpanMode, string][]
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => onMode(m)}
            className={cx(
              'rounded-md px-3 py-1 text-sm font-semibold transition',
              mode === m ? 'bg-rmit-navy text-white dark:bg-navy-300' : 'text-muted hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode !== 'total' && years.length > 0 && (
        <select
          value={year}
          onChange={(e) => onYear(Number(e.target.value))}
          className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm font-semibold text-ink shadow-soft outline-none focus:border-rmit-red"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      )}

      {mode === 'half' && (
        <div className="flex items-center gap-0.5 rounded-lg bg-card p-1 shadow-soft">
          {(['H1', 'H2'] as Half[]).map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => onHalf(h)}
              className={cx(
                'rounded-md px-3 py-1 text-sm font-semibold transition',
                half === h ? 'bg-rmit-navy text-white dark:bg-navy-300' : 'text-muted hover:text-ink',
              )}
            >
              {h}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
