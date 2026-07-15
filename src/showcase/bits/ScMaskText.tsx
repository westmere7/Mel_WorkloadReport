import { cx } from '../../lib/format'
import { dly } from './anim'

/**
 * Kinetic text: each word (or letter) animates in, staggered left-to-right.
 * All timing lives in CSS (effect class + `--d`).
 *
 * Effects: 'rise' (mask rise), 'slide-fade', 'zoom-fade', 'ticker' (slide-
 * through with trailing fade — the storyboard's moving-number language), and
 * 'type' (typewriter hard-appear; pair with a `sc-caret` on the parent).
 */
export function ScMaskText({
  text,
  per = 'word',
  delayMs = 0,
  stepMs = 60,
  className,
  effect = 'rise',
}: {
  text: string
  per?: 'word' | 'letter'
  delayMs?: number
  stepMs?: number
  className?: string
  effect?: string
}) {
  const parts = per === 'letter' ? Array.from(text) : text.split(' ')
  const effectClass =
    {
      rise: 'sc-a-rise',
      'slide-fade': 'sc-a-slide-fade',
      'zoom-fade': 'sc-a-zoom-fade',
      ticker: 'sc-a-ticker',
      type: 'sc-a-type',
    }[effect] || 'sc-a-rise'
  // Rise stays inside an overflow mask; the other effects need to overflow it.
  const mask = effect === 'rise'

  return (
    <span className={cx('sc-masktext', className)} role="text" aria-label={text}>
      {parts.map((part, i) => (
        <span key={i} className={mask ? 'sc-mask' : undefined}>
          <span className={effectClass} style={dly(delayMs + i * stepMs)}>
            {part === ' ' ? ' ' : part}
            {per === 'word' && i < parts.length - 1 ? ' ' : ''}
          </span>
        </span>
      ))}
    </span>
  )
}
