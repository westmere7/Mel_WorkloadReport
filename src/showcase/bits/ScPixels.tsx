import type { PixelSpec } from '../types'
import { dly } from './anim'

/**
 * RMIT pixel-pattern corner decoration: a seeded cluster of squares that pop
 * in staggered and then shimmer gently in place (settled-state life without
 * any camera movement). Colour comes from the panel's `--sc-pixel` var.
 */
export function ScPixels({ spec }: { spec: PixelSpec }) {
  return (
    <div className="sc-pixels" data-corner={spec.corner} aria-hidden>
      {spec.cells.map((c, i) => (
        <span
          key={i}
          className="sc-pixel"
          style={{
            ...dly(c.d),
            left: `${c.x * 2.4}em`,
            top: `${c.y * 2.4}em`,
          }}
        />
      ))}
    </div>
  )
}
