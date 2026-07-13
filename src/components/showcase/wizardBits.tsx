import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cx } from '../../lib/format'

/** Small segmented control (the DashboardPrefs toggle pattern, generalised). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg bg-subtle p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cx(
            'rounded-md px-3 py-1.5 text-xs font-semibold transition',
            value === o.id ? 'bg-rmit-navy text-white dark:bg-navy-300' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Selectable option card used by the Stats and Top-3 steps. */
export function SelectableCard({
  selected,
  disabled,
  ordinal,
  title,
  description,
  onToggle,
  children,
}: {
  selected: boolean
  disabled?: boolean
  /** 1-based display-order badge shown when selected. */
  ordinal?: number
  title: string
  description: string
  onToggle: () => void
  children?: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      aria-pressed={selected}
      className={cx(
        'relative flex flex-col gap-2 rounded-xl border p-4 text-left transition',
        disabled
          ? 'cursor-not-allowed border-line opacity-45'
          : selected
            ? 'border-rmit-red ring-2 ring-brand-100 dark:ring-brand-500/25'
            : 'border-line hover:border-navy-300',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{title}</p>
          <p className="mt-0.5 text-xs text-muted">{description}</p>
        </div>
        <span
          className={cx(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-white transition',
            selected ? 'border-rmit-red bg-rmit-red' : 'border-line bg-card',
          )}
        >
          {selected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
        </span>
      </div>
      {children}
      {selected && ordinal != null && (
        <span className="absolute -left-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-rmit-navy text-[11px] font-bold text-white dark:bg-navy-300">
          {ordinal}
        </span>
      )}
    </button>
  )
}

/** Muted helper line under a step title. */
export function StepHint({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted">{children}</p>
}
