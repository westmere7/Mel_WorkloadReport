import type { Top3Block } from '../../lib/showcase'
import { cssVars, dly } from '../bits/anim'
import { ScMaskText } from '../bits/ScMaskText'

/** The storyboard's pixel arrow (‹ ▪ ▪) that marks the focused row. */
function PixelArrow() {
  return (
    <span className="sc-pixel-arrow" aria-hidden>
      <i />
      <i />
      <i />
    </span>
  )
}

/**
 * Top-3 as a cycling spotlight list (the storyboard's project ticker): all
 * entries rest faded; focus walks 3 → 2 → 1, lifting each row with the pixel
 * arrow and its value; #1 keeps the spotlight and a shimmering gradient name.
 * One fast scene per block — no shared-screen podium.
 */
export function Top3Scene({ block }: { block: Top3Block }) {
  const entries = block.entries
  const FOCUS_MS = 1150 // per-entry focus window (pace-scaled in CSS)
  const START_MS = 1150 // after the label settles

  return (
    <div className="sc-body sc-center-col">
      <p className="sc-kicker sc-a-riseSoft" style={dly(150)}>
        Top {entries.length} · {block.label}
      </p>
      <div className="sc-focus-list">
        {[...entries]
          .map((e, rank) => ({ e, rank })) // rank 0 = #1
          .reverse() // countdown layout: 03 at the top … 01 at the bottom
          .map(({ e, rank }, row) => {
            // Focus walks the list downward (#3 first) and ends holding #1.
            const focusIdx = entries.length - 1 - rank
            const isFinal = rank === 0
            const fa = START_MS + focusIdx * FOCUS_MS
            const fd = isFinal ? FOCUS_MS * 2 : FOCUS_MS
            return (
              <div
                key={rank}
                className={`sc-focus-row${isFinal ? ' sc-focus-final' : ''}`}
                style={cssVars({ '--fa': `${fa}ms`, '--fd': `${fd}ms` })}
              >
                <span className="sc-focus-rank">{String(rank + 1).padStart(2, '0')}</span>
                <span className={`sc-focus-name${isFinal ? ' sc-gradtext sc-shimmer' : ''}`}>
                  <ScMaskText text={e.name} per="word" delayMs={250 + row * 120} stepMs={40} />
                </span>
                <span className="sc-focus-arrow">
                  <PixelArrow />
                </span>
                <span className="sc-focus-value">
                  {e.value.toLocaleString()} <span className="sc-focus-unit">{block.unit}</span>
                </span>
              </div>
            )
          })}
      </div>
    </div>
  )
}
