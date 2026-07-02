import { ChevronDown, ChevronUp, Minus } from 'lucide-react'
import { cx } from '../../lib/format'

/**
 * Animated up/down comparison indicator: chevron(s) + percentage change of
 * `current` vs `previous` (the comparison baseline). Used in dashboard
 * comparison mode. Renders "New" when there was no baseline value.
 *
 * `size="lg"` is the prominent variant — an infinite escalator of chevrons
 * moving in the trend direction, with a large percentage.
 */
export function TrendDelta({
  current,
  previous,
  size = 'md',
  title,
}: {
  current: number
  previous: number
  size?: 'sm' | 'md' | 'lg'
  title?: string
}) {
  const lg = size === 'lg'
  const sm = size === 'sm'
  const iconCls = sm ? 'h-3 w-3' : 'h-4 w-4'
  const textCls = lg ? 'text-2xl' : sm ? 'text-[11px]' : 'text-sm'

  if (previous <= 0 && current <= 0) {
    return (
      <span className={cx('font-semibold text-faint', textCls)} title={title}>
        —
      </span>
    )
  }

  // No baseline — the item only exists in the target year.
  if (previous <= 0) {
    return (
      <span
        className={cx('inline-flex items-center gap-1 font-bold text-accent-green', textCls)}
        title={title}
      >
        {lg ? <ChevronEscalator up /> : <ChevronUp className={cx(iconCls, 'animate-bounce')} strokeWidth={3} />}
        New
      </span>
    )
  }

  const pct = ((current - previous) / previous) * 100
  if (Math.abs(pct) < 0.05) {
    return (
      <span className={cx('inline-flex items-center gap-1 font-bold text-muted', textCls)} title={title}>
        <Minus className={iconCls} strokeWidth={3} />
        0%
      </span>
    )
  }

  const up = pct > 0
  const magnitude = Math.abs(pct) < 10 ? Math.abs(pct).toFixed(1) : String(Math.round(Math.abs(pct)))
  const color = up ? 'text-accent-green' : 'text-rmit-red dark:text-brand-300'

  return (
    <span className={cx('inline-flex items-center gap-1 font-bold', color, textCls)} title={title}>
      {lg ? (
        <ChevronEscalator up={up} />
      ) : up ? (
        <ChevronUp className={cx(iconCls, 'animate-bounce')} strokeWidth={3} />
      ) : (
        <ChevronDown className={cx(iconCls, 'animate-bounce')} strokeWidth={3} />
      )}
      {up ? '+' : '−'}
      {magnitude}%
    </span>
  )
}

/**
 * A vertical "escalator" of three chevrons that continuously travel in the trend
 * direction and loop forever — the prominent comparison indicator.
 */
function ChevronEscalator({ up }: { up: boolean }) {
  const Icon = up ? ChevronUp : ChevronDown
  const anim = up ? 'animate-chevron-rise' : 'animate-chevron-fall'
  return (
    <span className="relative flex h-7 w-5 items-center justify-center overflow-hidden" aria-hidden="true">
      {[0, 0.4, 0.8].map((delay) => (
        <Icon
          key={delay}
          className={cx('absolute h-5 w-5', anim)}
          strokeWidth={3}
          style={{ animationDelay: `${delay}s` }}
        />
      ))}
    </span>
  )
}
