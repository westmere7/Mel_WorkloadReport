import type { Top3Block } from '../../lib/showcase'
import { dly } from '../bits/anim'
import { ScCounter } from '../bits/ScCounter'
import { ScMaskText } from '../bits/ScMaskText'

/** Podium columns arranged 2–1–3; ranks reveal 3 → 2 → 1 with #1 emphasized. */
export function Top3Scene({ block, pace }: { block: Top3Block; pace: number }) {
  const entries = block.entries
  // Visual order (left→right): #2, #1, #3 — classic podium. Missing ranks just skip.
  const order = [1, 0, 2].filter((rank) => rank < entries.length)
  const revealAt = [2900, 1800, 900] // by rank index (0 = gold)

  return (
    <div className="sc-body sc-center-col">
      <h2 className="sc-dist-title">
        <ScMaskText text={block.label} per="word" delayMs={200} stepMs={60} />
      </h2>
      <div className="sc-podium">
        {order.map((rank) => {
          const e = entries[rank]
          const at = revealAt[rank]
          return (
            <div key={rank} className={`sc-podium-col sc-rank-${rank + 1}`}>
              {rank === 0 && <span className="sc-bloom sc-a-bloom" style={dly(at + 200)} />}
              <span className={`sc-medal sc-a-pop sc-medal-${rank + 1}`} style={dly(at + 150)}>
                {rank + 1}
              </span>
              <p className={`sc-podium-name sc-a-riseSoft${rank === 0 ? ' sc-gold-name' : ''}`} style={dly(at + 250)}>
                {e.name}
              </p>
              <p className="sc-podium-value sc-a-fade" style={dly(at + 350)}>
                <ScCounter value={e.value} delayMs={(at + 400) * pace} durationMs={800 * pace} />
                <span className="sc-podium-unit"> {block.unit}</span>
              </p>
              {e.detail && (
                <p className="sc-sub sc-a-riseSoft" style={dly(at + 500)}>
                  {e.detail}
                </p>
              )}
              <span className={`sc-podium-bar sc-a-bary${rank === 0 ? ' sc-spring' : ''}`} style={dly(at)} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
