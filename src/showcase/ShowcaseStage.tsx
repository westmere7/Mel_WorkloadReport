import { useEffect, useState, type ReactNode } from 'react'
import type { CanvasPreset, ShowcaseStyle } from '../lib/showcase'
import { CANVAS, showcaseTheme } from './theme'
import { cssVars } from './bits/anim'
import type { StageDecor } from './types'

/**
 * The letterboxed, scale-to-fit stage. Authored at true canvas pixels and
 * scaled with a single transform; the root font-size (canvas width / 100)
 * makes every em-based size proportional on both canvases. Aurora/geometric
 * decor and the grain overlay persist across scene transitions.
 */
export function ShowcaseStage({
  canvas,
  style,
  decor,
  pace,
  paused,
  children,
}: {
  canvas: CanvasPreset
  style: ShowcaseStyle
  decor: StageDecor
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

  const isMovingGradient = style.colorMode === 'gradient' && style.movingGradients

  return (
    <div className="sc-viewport">
      <div
        className={`sc-stage ${isMovingGradient ? 'sc-moving-gradient-bg' : ''}`}
        data-paused={paused || undefined}
        style={{
          width: w,
          height: h,
          fontSize: `${w / 100}px`,
          transform: `scale(${scale})`,
          ...showcaseTheme(style.colorMode, style.background),
          ...cssVars({ '--pace': pace }),
        }}
      >
        {style.background === 'gradient' && !isMovingGradient && (
          <div className="sc-aurora" aria-hidden>
            <span className="sc-blob sc-blob-1" style={{ animationDelay: `${decor.blobDelays[0]}s` }} />
            <span className="sc-blob sc-blob-2" style={{ animationDelay: `${decor.blobDelays[1]}s` }} />
            <span className="sc-blob sc-blob-3" style={{ animationDelay: `${decor.blobDelays[2]}s` }} />
          </div>
        )}
        {style.background === 'geometric' && (
          <div className="sc-geo" aria-hidden>
            <span className="sc-geo-ring" style={{ transform: `rotate(${decor.ringOffset}deg)` }} />
            <span className="sc-geo-circle" />
          </div>
        )}
        {children}
        {style.grain && <div className="sc-grain" aria-hidden />}
      </div>
    </div>
  )
}
