import { useEffect, useState } from 'react'

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

// Vertical fade so digits rolling in/out ghost at the top/bottom edges (odometer look).
const FADE_MASK = 'linear-gradient(to bottom, transparent 0%, #000 16%, #000 84%, transparent 100%)'

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

/**
 * Odometer-style number. Each digit is a vertical reel (0–9 stacked) that
 * `translateY`s to the current digit via a CSS transition, so a change rolls the
 * digits vertically (with a top/bottom fade). Reels are keyed by decimal position
 * (units, tens, hundreds…), so a given place is the SAME reel across renders and
 * keeps rolling even when the number's length changes (only appearing/disappearing
 * leading digits mount/unmount). CSS transitions apply their end state even when the
 * tab is hidden, so the value is never stale. Honours `prefers-reduced-motion`.
 */
export function AnimatedNumber({
  value,
  duration = 850,
  group = true,
}: {
  value: number
  duration?: number
  /** Insert thousands separators (commas). */
  group?: boolean
}) {
  const n = Math.max(0, Math.round(value))
  const s = String(n)
  const len = s.length
  const label = group ? n.toLocaleString() : s

  const nodes: React.ReactNode[] = []
  for (let i = 0; i < len; i++) {
    const place = len - 1 - i // 0 = units, 1 = tens, …
    if (group && place !== len - 1 && (place + 1) % 3 === 0) {
      nodes.push(
        <span
          key={`c${place}`}
          aria-hidden
          className="inline-flex items-end justify-center text-[0.65em] pb-0 -mx-[0.06em] translate-y-[0.15em]"
          style={{ height: '1em' }}
        >
          ,
        </span>,
      )
    }
    nodes.push(<Reel key={`d${place}`} digit={Number(s[i])} duration={duration} />)
  }

  return (
    <span className="inline-flex items-center tabular-nums leading-none font-display font-bold" aria-label={label}>
      {nodes}
    </span>
  )
}

function Reel({ digit, duration }: { digit: number; duration: number }) {
  const reduced = usePrefersReducedMotion()
  return (
    <span
      aria-hidden
      className="relative inline-block overflow-hidden px-[0.06em] -mx-[0.08em]"
      style={{ height: '1em', WebkitMaskImage: FADE_MASK, maskImage: FADE_MASK }}
    >
      <span
        className="flex flex-col"
        style={{
          transform: `translateY(-${digit}em)`,
          transition: reduced ? undefined : `transform ${duration}ms cubic-bezier(0.2, 0.8, 0.2, 1)`,
        }}
      >
        {DIGITS.map((d) => (
          <span key={d} className="flex items-center justify-center" style={{ height: '1em' }}>
            {d}
          </span>
        ))}
      </span>
    </span>
  )
}
