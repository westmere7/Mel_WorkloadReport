import type { ReactNode } from 'react'
import { cx } from '../../lib/format'

export function Card({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={cx('card p-5', className)}>{children}</div>
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  /** ReactNode so a heading can carry an inline badge, not just text. */
  title: ReactNode
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      {/* min-w-0 so a long title/badge can shrink or wrap in a narrow card instead
          of forcing the header wider than the card. */}
      <div className="min-w-0">
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
