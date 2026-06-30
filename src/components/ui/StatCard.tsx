import type { LucideIcon } from 'lucide-react'
import { cx } from '../../lib/format'

interface StatCardProps {
  label: string
  value: string | number
  icon: LucideIcon
  hint?: string
  accent?: 'red' | 'navy' | 'orange' | 'teal' | 'green'
}

const ACCENTS: Record<NonNullable<StatCardProps['accent']>, string> = {
  red: 'bg-brand-50 text-rmit-red dark:bg-brand-500/15 dark:text-brand-300',
  navy: 'bg-navy-50 text-rmit-navy dark:bg-white/10 dark:text-navy-100',
  orange: 'bg-orange-50 text-accent-orange dark:bg-orange-500/15 dark:text-accent-orange',
  teal: 'bg-cyan-50 text-accent-teal dark:bg-cyan-500/15 dark:text-accent-teal',
  green: 'bg-green-50 text-accent-green dark:bg-green-500/15 dark:text-accent-green',
}

export function StatCard({ label, value, icon: Icon, hint, accent = 'navy' }: StatCardProps) {
  return (
    <div className="card flex items-center gap-4 p-5">
      <div className={cx('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl', ACCENTS[accent])}>
        <Icon className="h-6 w-6" strokeWidth={2.2} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
        <p className="text-2xl font-bold leading-tight text-ink">{value}</p>
        {hint && <p className="truncate text-xs text-muted">{hint}</p>}
      </div>
    </div>
  )
}
