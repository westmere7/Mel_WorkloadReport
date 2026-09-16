import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useStore } from '../../data/store'
import { effortHeatColor } from '../../constants'
import { ratedAssetRows } from '../../lib/effort'
import { DEMO_INTRO_EASE, useDemoIntro } from '../../lib/demo'

// ─────────────────────────────────────────────────────────────────────────────
// Demo mode · output rates slide.
//
// The only slide that is NOT a lifted dashboard card: the rates comparison lives
// in a modal (EffortInfoModal → "How the asset types compare"), which can't be
// pulled out of the grid, so this renders the same data at presentation size. The
// rows come from `ratedAssetRows()` — shared with that modal, so the two can't
// drift — and are read live from settings.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Width the content is composed at; FitBox scales it to whatever the slide has.
 *
 * ⚠️ Uniform scaling makes the composed sizes arbitrary — what actually decides how
 * big the type lands is the content's ASPECT RATIO against the slide's, and how
 * much of each row's height is type rather than gap. With every rated asset type
 * listed (22 here) the list is height-bound, so the row gap is the enemy: it was
 * `space-y-2.5` under 19px text, which put nearly half of each row into spacing and
 * forced a 0.87 scale — 16.6px on screen. Tight rows with large type give ~21.5px
 * in the same box. This width is chosen so the content's ratio is close to the
 * slide area's, leaving neither axis badly under-used.
 */
const LOGICAL_W = 1160
/** Don't blow the type up past this, however few rated types there are. */
const MAX_SCALE = 1.9

/**
 * Scales `children` to fill the box as large as it will go without distortion —
 * `min(availW / logicalWidth, availH / naturalHeight)`, uniform on both axes.
 * Lets the slide fill the screen regardless of how many asset types carry a rate.
 *
 * The inner box is measured by ResizeObserver, which reports the LAYOUT box and so
 * ignores the transform — no feedback loop between scaling and measuring.
 */
function FitBox({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  // 0 = not measured yet; the content stays hidden so it can't flash at 1:1 first.
  const [scale, setScale] = useState(0)

  useLayoutEffect(() => {
    const o = outer.current
    const i = inner.current
    if (!o || !i) return
    const fit = () => {
      const availW = o.clientWidth
      const availH = o.clientHeight
      const naturalH = i.offsetHeight
      if (!availW || !availH || !naturalH) return
      setScale(Math.min(availW / LOGICAL_W, availH / naturalH, MAX_SCALE))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(o)
    ro.observe(i)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={outer} className="absolute inset-x-0 bottom-0 top-32 px-10 pb-10">
      <div className="flex h-full w-full items-center justify-center">
        <div
          ref={inner}
          style={{
            width: LOGICAL_W,
            transform: `scale(${scale || 1})`,
            transformOrigin: 'center center',
            visibility: scale ? 'visible' : 'hidden',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

export function RatesSlide() {
  const { settings } = useStore()
  const { rated, slowest } = ratedAssetRows(settings)
  // Bars sweep out from zero as the slide arrives, like every other demo chart.
  const { intro, ready } = useDemoIntro()

  if (!rated.length) {
    return (
      <FitBox>
        <p className="text-center text-2xl font-semibold text-muted">
          No output rates recorded yet.
        </p>
      </FitBox>
    )
  }

  return (
    <FitBox>
      <ul className="space-y-1.5">
        {rated.map((r, i) => (
          <li key={r.name} className="flex items-center gap-4 leading-tight">
            <span className="w-[21rem] shrink-0 truncate text-[24px] font-semibold text-ink" title={r.name}>
              {r.name}
            </span>
            <span className="h-4 min-w-0 flex-1 overflow-hidden rounded-full bg-subtle">
              <span
                className="block h-full rounded-full"
                style={{
                  width: ready ? `${(r.hours / slowest) * 100}%` : '0%',
                  // Stagger down the list so it reads as filling in, not flicking on.
                  transition: intro ? `width 900ms ${DEMO_INTRO_EASE} ${i * 55}ms` : undefined,
                  // The range is wide (minutes to weeks), so the quickest types are a
                  // sliver — keep them visible rather than letting them vanish.
                  minWidth: '4px',
                  backgroundColor: effortHeatColor(r.hours),
                }}
              />
            </span>
            <span className="w-[11rem] shrink-0 text-right text-[20px] font-semibold text-ink">{r.perUnit}</span>
            <span className="w-[8.5rem] shrink-0 text-right text-[15px] text-muted">{r.rate}</span>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-center text-[17px] text-muted">
        Time one of each takes, drawn to scale against the slowest — coloured quick (cool) to slow (hot).
      </p>
    </FitBox>
  )
}
