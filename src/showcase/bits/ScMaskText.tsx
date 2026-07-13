import { cx } from '../../lib/format'
import { dly } from './anim'

/**
 * Kinetic text: each word (or letter) rises from behind an overflow mask,
 * staggered left-to-right. All timing lives in CSS (`sc-a-rise` + `--d`).
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
  const effectClass = {
    rise: 'sc-a-rise',
    'slide-fade': 'sc-a-slide-fade',
    'zoom-fade': 'sc-a-zoom-fade',
  }[effect] || 'sc-a-rise'

  return (
    <span className={cx('sc-masktext', className)} role="text" aria-label={text}>
      {parts.map((part, i) => (
        <span key={i} className="sc-mask">
          <span className={effectClass} style={dly(delayMs + i * stepMs)}>
            {part === ' ' ? ' ' : part}
            {per === 'word' && i < parts.length - 1 ? ' ' : ''}
          </span>
        </span>
      ))}
    </span>
  )
}
