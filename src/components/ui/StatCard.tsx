import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cx } from '../../lib/format'

interface StatCardProps {
  label: string
  value: string | number
  icon: LucideIcon
  hint?: string
  /** Rich footer under the value (xl only) — e.g. a per-size distribution. */
  footer?: ReactNode
  accent?: 'red' | 'navy' | 'orange' | 'teal' | 'green'
  size?: 'md' | 'lg' | 'xl'
}

const ACCENTS: Record<NonNullable<StatCardProps['accent']>, string> = {
  red: 'bg-brand-50 text-rmit-red dark:bg-brand-500/15 dark:text-brand-300',
  navy: 'bg-navy-50 text-rmit-navy dark:bg-white/10 dark:text-navy-100',
  orange: 'bg-orange-50 text-accent-orange dark:bg-orange-500/15 dark:text-accent-orange',
  teal: 'bg-cyan-50 text-accent-teal dark:bg-cyan-500/15 dark:text-accent-teal',
  green: 'bg-green-50 text-accent-green dark:bg-green-500/15 dark:text-accent-green',
}

export function StatCard({ label, value, icon: Icon, hint, footer, accent = 'navy', size = 'md' }: StatCardProps) {
  const lg = size === 'lg'

  // Hero: a tall, vertical KPI card whose huge number fills its (stretched) cell.
  if (size === 'xl') {
    return (
      <div className="card flex h-full flex-col p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted">{label}</p>
          <div className={cx('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl', ACCENTS[accent])}>
            <Icon className="h-7 w-7" strokeWidth={2.2} />
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <p className="text-[clamp(3.5rem,7vw,8.5rem)] font-bold leading-none text-rmit-navy dark:text-ink">{value}</p>
          {hint && <p className="mt-3 truncate text-base text-muted">{hint}</p>}
          {footer && <div className="mt-3">{footer}</div>}
        </div>
      </div>
    )
  }

  return (
    <div className={cx('card flex items-center', lg ? 'gap-4 p-5' : 'gap-3.5 p-4')}>
      <div
        className={cx(
          'flex shrink-0 items-center justify-center rounded-2xl',
          lg ? 'h-14 w-14' : 'h-11 w-11',
          ACCENTS[accent],
        )}
      >
        <Icon className={lg ? 'h-7 w-7' : 'h-5 w-5'} strokeWidth={2.2} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
        <p className={cx('font-bold leading-tight text-ink', lg ? 'text-3xl' : 'text-2xl')}>{value}</p>
        {hint && <p className="truncate text-xs text-muted">{hint}</p>}
      </div>
    </div>
  )
}
