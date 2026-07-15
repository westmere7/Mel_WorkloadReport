import type { ShowcaseStat } from '../../lib/showcase'
import type { StatSoloVariant } from '../types'
import { dly } from '../bits/anim'
import { ScCounter } from '../bits/ScCounter'
import { ScMaskText } from '../bits/ScMaskText'

/**
 * One stat, one panel — the storyboard's bold single-figure beats. Fast,
 * kinetic, and different every time via the seeded variant:
 * - counter:    giant odometer rolls up, label rides beside it
 * - ticker:     the figure slides through the frame with a trailing fade
 * - gradient:   giant gradient-filled figure that keeps shimmering once settled
 * - typewriter: text stats type in, blinking I-beam caret stays alive
 * - split:      red|navy split panel, figure white across the seam
 */
export function StatSoloScene({ stat, variant, pace }: { stat: ShowcaseStat; variant: StatSoloVariant; pace: number }) {
  const isNumber = stat.kind === 'number'
  const label = stat.label
  const detail = stat.detail

  // Typewriter — text stats (biggest stakeholder, busiest month …).
  if (variant === 'typewriter') {
    const text = stat.text ?? '—'
    return (
      <div className="sc-body sc-solo sc-solo-center">
        <p className="sc-kicker sc-a-riseSoft" style={dly(150)}>
          {label}
        </p>
        <h2 className="sc-hero-word sc-caret" style={dly(300 + text.length * 55)}>
          <ScMaskText text={text} per="letter" delayMs={450} stepMs={55} effect="type" />
        </h2>
        {detail && (
          <p className="sc-hero-label sc-solo-center sc-a-riseSoft" style={dly(650 + text.length * 55)}>
            {detail}
          </p>
        )}
      </div>
    )
  }

  // Gradient type — settled shimmer keeps the "still" frame alive.
  if (variant === 'gradient') {
    return (
      <div className="sc-body sc-solo sc-solo-center">
        <h2 className="sc-hero-number sc-gradtext sc-shimmer sc-a-zoom-fade" style={dly(200)}>
          {isNumber ? (
            <ScCounter value={stat.value ?? 0} delayMs={350 * pace} durationMs={900 * pace} />
          ) : (
            stat.text ?? '—'
          )}
        </h2>
        <p className="sc-hero-label sc-solo-center sc-a-riseSoft" style={dly(800)}>
          {label}
          {detail ? ` · ${detail}` : ''}
        </p>
      </div>
    )
  }

  // Split panel — the figure sits white across the red|navy seam.
  if (variant === 'split') {
    return (
      <div className="sc-body sc-solo sc-solo-center">
        <h2 className="sc-hero-number sc-sheen sc-a-pop" style={dly(250)}>
          {isNumber ? (
            <ScCounter value={stat.value ?? 0} delayMs={400 * pace} durationMs={900 * pace} />
          ) : (
            stat.text ?? '—'
          )}
        </h2>
        <span className="sc-underline sc-a-barx" style={dly(900)} />
        <p className="sc-hero-label sc-solo-center sc-a-riseSoft" style={dly(1050)}>
          {label}
          {detail ? ` · ${detail}` : ''}
        </p>
      </div>
    )
  }

  // Ticker — the number slides through the frame (storyboard "100,000").
  if (variant === 'ticker') {
    return (
      <div className="sc-body sc-solo">
        <div className="sc-solo-row">
          <span className="sc-hero-label sc-a-ticker" style={dly(80)}>
            {label}
          </span>
          <h2 className="sc-hero-number sc-sheen sc-a-ticker" style={dly(0)}>
            {isNumber ? (
              <ScCounter value={stat.value ?? 0} delayMs={250 * pace} durationMs={800 * pace} />
            ) : (
              stat.text ?? '—'
            )}
          </h2>
        </div>
        {detail && (
          <p className="sc-sub sc-a-riseSoft" style={dly(950)}>
            {detail}
          </p>
        )}
      </div>
    )
  }

  // Counter (default) — big odometer, label beside it (storyboard "36,000").
  return (
    <div className="sc-body sc-solo">
      <div className="sc-solo-row">
        <h2 className="sc-hero-number sc-sheen sc-a-fade" style={dly(150)}>
          {isNumber ? (
            <ScCounter value={stat.value ?? 0} delayMs={300 * pace} durationMs={1000 * pace} />
          ) : (
            stat.text ?? '—'
          )}
        </h2>
        <span className="sc-hero-label sc-a-riseSoft" style={dly(700)}>
          {label}
          {detail ? <><br />{detail}</> : null}
        </span>
      </div>
    </div>
  )
}
