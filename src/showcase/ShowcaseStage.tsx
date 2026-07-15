import { useEffect, useState, type ReactNode } from 'react'
import type { CanvasPreset, ShowcaseStyle } from '../lib/showcase'
import { CANVAS } from './theme'
import { cssVars } from './bits/anim'

/**
 * The letterboxed, scale-to-fit stage. Authored at true canvas pixels and
 * scaled with a single transform; the root font-size (canvas width / 100)
 * makes every em-based size proportional on both canvases.
 *
 * The stage itself is a neutral dark room — every SCENE paints its own brand
 * panel (`.sc-bg-*`), so backgrounds change on every cut. Only the grain
 * overlay persists across scenes.
 */
export function ShowcaseStage({
  canvas,
  style,
  pace,
  paused,
  children,
}: {
  canvas: CanvasPreset
  style: ShowcaseStyle
  pace: number
  paused: boolean
  children: ReactNode
}) {
  const { w, h } = CANVAS[canvas]
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const fit = () => setScale(Math.round(Math.min(window.innerWidth / w, window.innerHeight / h) * 10000) / 10000)
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [w, h])

  return (
    <div className="sc-viewport">
      <div
        className="sc-stage"
        data-paused={paused || undefined}
        style={{
          width: w,
          height: h,
          fontSize: `${w / 100}px`,
          transform: `scale(${scale})`,
          ...cssVars({ '--pace': pace }),
        }}
      >
        {children}
        {style.grain && <div className="sc-grain" aria-hidden />}
      </div>
    </div>
  )
}
