import { Fragment, useRef, type ReactNode } from 'react'
import { cx } from '../../lib/format'
import { useDemoRevealKey } from '../../lib/demo'

export function Card({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  // Demo mode only: content remounts as the card is revealed so its charts
  // animate in. The key is a constant 0 otherwise (see useDemoRevealKey).
  const ref = useRef<HTMLDivElement>(null)
  const revealKey = useDemoRevealKey(ref)
  return (
    <div ref={ref} className={cx('card p-5', className)}>
      <Fragment key={revealKey}>{children}</Fragment>
    </div>
  )
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  /** ReactNode so a heading can carry an inline badge, not just text. */
  title: ReactNode
  subtitle?: string
  action?: ReactNode
  /** Extra classes on the header row — e.g. a min-height so sibling cards' bodies
   *  start at the same offset even when one subtitle wraps to two lines. */
  className?: string
}) {
  return (
    <div className={cx('mb-4 flex items-start justify-between gap-3', className)}>
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
