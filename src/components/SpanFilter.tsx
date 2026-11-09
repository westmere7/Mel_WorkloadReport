import { cx } from '../lib/format'
import type { SpanMode } from '../lib/span'
import type { Half } from '../types'

/**
 * A segmented control that LOOKS like one: a bordered, tinted track holding all the
 * options, with a hairline between neighbouring unselected options so the choices
 * read as separate segments (a bare row of words didn't say "pick one of three").
 */
function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: [T, string][]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex items-center rounded-lg border border-line bg-subtle p-[3px]" role="group">
      {options.map(([v, label], i) => {
        const on = value === v
        // Divider only between two unselected neighbours — the selected pill
        // separates itself.
        const divider = i > 0 && !on && value !== options[i - 1][0]
        return (
          <span key={v} className="flex items-center">
            {i > 0 && (
              <span className={cx('mx-0.5 h-4 w-px', divider ? 'bg-line' : 'bg-transparent')} aria-hidden="true" />
            )}
            <button
              type="button"
              onClick={() => onChange(v)}
              aria-pressed={on}
              className={cx(
                'rounded-md px-3 py-1 text-sm font-semibold transition',
                on
                  ? 'bg-rmit-navy text-white shadow-soft dark:bg-navy-300'
                  : 'text-muted hover:bg-card hover:text-ink',
              )}
            >
              {label}
            </button>
          </span>
        )
      })}
    </div>
  )
}

/** Segmented Total / By year / By half control, with a year select and H1/H2 toggle. */
export function SpanFilter({
  mode,
  year,
  half,
  years,
  onMode,
  onYear,
  onHalf,
  hideHalf = false,
}: {
  mode: SpanMode
  year: number
  half: Half
  years: number[]
  onMode: (m: SpanMode) => void
  onYear: (y: number) => void
  onHalf: (h: Half) => void
  /** Hide the "By half" segment + H1/H2 toggle (e.g. the task list). */
  hideHalf?: boolean
}) {
  const modes: [SpanMode, string][] = hideHalf
    ? [
        ['total', 'Total'],
        ['year', 'By year'],
      ]
    : [
        ['total', 'Total'],
        ['year', 'By year'],
        ['half', 'By half'],
      ]
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented options={modes} value={mode} onChange={onMode} />

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
        <Segmented<Half>
          options={[
            ['H1', 'H1'],
            ['H2', 'H2'],
          ]}
          value={half}
          onChange={onHalf}
        />
      )}
    </div>
  )
}
