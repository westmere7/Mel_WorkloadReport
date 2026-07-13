import { FALLBACK_ITEM } from '../../constants'
import type { ShowcaseStat } from '../../lib/showcase'
import { cssVars, dly } from '../bits/anim'
import { ScCounter } from '../bits/ScCounter'
import { ScMaskText } from '../bits/ScMaskText'

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** One distribution: horizontal ranked bars, or the 12-month vertical variant. */
export function StatDistScene({ stat, pace }: { stat: ShowcaseStat; pace: number }) {
  const series = stat.series ?? []

  if (stat.monthly) {
    const max = Math.max(1, ...series.map((r) => r.value))
    const peakIdx = series.reduce((best, r, i) => (r.value > series[best].value ? i : best), 0)
    return (
      <div className="sc-body sc-center-col">
        <h2 className="sc-dist-title">
          <ScMaskText text={stat.label} per="word" delayMs={250} stepMs={60} />
        </h2>
        <div className="sc-months">
          {series.map((r, i) => (
            <div key={r.name} className="sc-month">
              <div className="sc-month-track">
                <span
                  className={`sc-month-fill sc-a-bary${i === peakIdx ? ' sc-peak' : ''}`}
                  style={{ ...dly(800 + i * 40), height: `${Math.max(4, (r.value / max) * 100)}%` }}
                />
              </div>
              <span
                className={`sc-month-label sc-a-fade${i === peakIdx ? ' sc-peak-label' : ''}`}
                style={dly(900 + i * 40)}
              >
                {MONTHS_SHORT[i] ?? r.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Ranked horizontal bars — top 6 plus an aggregated "Others" tail.
  let rows = series
  if (series.length > 7) {
    const head = series.slice(0, 6)
    const tail = series.slice(6).reduce((sum, r) => sum + r.value, 0)
    rows = [...head, { name: FALLBACK_ITEM, value: tail }]
  }
  const max = Math.max(1, ...rows.map((r) => r.value))

  return (
    <div className="sc-body sc-center-col">
      <h2 className="sc-dist-title">
        <ScMaskText text={stat.label} per="word" delayMs={250} stepMs={60} />
      </h2>
      <div className="sc-dist">
        {rows.map((r, i) => (
          <div key={r.name} className="sc-dist-row">
            <span className="sc-dist-label sc-a-riseSoft" style={dly(700 + i * 90)}>
              {r.name}
            </span>
            <span className="sc-dist-track">
              <span
                className={`sc-dist-fill sc-a-barx${i === 0 ? ' sc-peak' : ''}`}
                style={{ ...dly(800 + i * 90), ...cssVars({ width: `${Math.max(3, (r.value / max) * 100)}%` }) }}
              />
            </span>
            <span className="sc-dist-value sc-a-fade" style={dly(850 + i * 90)}>
              <ScCounter value={r.value} delayMs={(900 + i * 90) * pace} durationMs={800 * pace} />
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
