import type { ShowcaseStat } from '../../lib/showcase'
import { dly } from '../bits/anim'
import { ScCounter } from '../bits/ScCounter'
import { ScMaskText } from '../bits/ScMaskText'

/** 1–3 scalar stats in centered columns: label → big value → accent underline. */
export function StatTrioScene({ stats, pace }: { stats: ShowcaseStat[]; pace: number }) {
  return (
    <div className="sc-body sc-center-col">
      <div className="sc-trio" style={{ gridTemplateColumns: `repeat(${stats.length}, 1fr)` }}>
        {stats.map((s, c) => (
          <div key={s.id} className="sc-trio-col">
            <p className="sc-stat-label sc-a-riseSoft" style={dly(200 + c * 150)}>
              {s.label}
            </p>
            {s.kind === 'number' ? (
              <span className="sc-stat-number sc-a-fade" style={dly(300 + c * 150)}>
                <ScCounter value={s.value ?? 0} delayMs={(400 + c * 150) * pace} durationMs={900 * pace} />
              </span>
            ) : (
              <span className="sc-stat-text">
                <ScMaskText text={s.text ?? '—'} per="word" delayMs={400 + c * 150} stepMs={60} />
              </span>
            )}
            <span className="sc-underline sc-a-barx" style={dly(700 + c * 150)} />
            {s.detail && (
              <p className="sc-sub sc-a-riseSoft" style={dly(850 + c * 150)}>
                {s.detail}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
