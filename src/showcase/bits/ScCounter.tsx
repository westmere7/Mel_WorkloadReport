import { useEffect, useState } from 'react'
import { AnimatedNumber } from '../../components/ui/AnimatedNumber'

/**
 * Odometer counter for the showcase: mounts at 0, rolls to the target after
 * `delayMs` (already pace-scaled by the caller). Reuses the app's AnimatedNumber
 * digit reels; reduced-motion snapping is handled inside AnimatedNumber itself.
 */
export function ScCounter({
  value,
  delayMs = 0,
  durationMs = 900,
}: {
  value: number
  delayMs?: number
  durationMs?: number
}) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setShown(value), Math.max(0, delayMs))
    return () => clearTimeout(t)
  }, [value, delayMs])
  return <AnimatedNumber value={shown} duration={durationMs} />
}
