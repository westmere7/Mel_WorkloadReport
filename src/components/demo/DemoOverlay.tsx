import { cx } from '../../lib/format'
import { useDemo } from '../../lib/demo'
import { Gauge } from './Gauge'
import { RatesSlide } from './RatesSlide'

/**
 * The demo-mode screens. Mounted inside <Layout/>'s content column (the area
 * right of the sidebar), so the sidebar — and its "Next" button — stays visible
 * and usable throughout. Renders nothing unless demo mode is active; the `reveal`
 * stage has no overlay at all — the live dashboard underneath is the screen (its
 * panels are animated by CSS keyed off `html[data-demo]`, see index.css). During
 * the slides the overlay is the backdrop + caption; the slide's real cards are
 * positioned above it by lib/demo.tsx, except for a `custom` slide, which has no
 * card to lift and draws its content here instead.
 */
export function DemoOverlay() {
  const { stage, slide, currentSlide, active } = useDemo()
  if (!active || stage === 'reveal') return null

  return (
    <div
      className={cx(
        'demo-overlay absolute inset-0 z-[60] flex items-center justify-center bg-surface',
        // The gauge waits for the panels to animate out before fading in.
        stage === 'gauge' && 'demo-overlay-late',
      )}
    >
      {stage === 'title' && <TitleScreen />}
      {stage === 'slide' && currentSlide && (
        // Keyed by slide so the caption re-animates for each one.
        <div
          // Keys are per-slide so each one re-animates — and distinct from the
          // custom-content key below, which is a SIBLING: sharing `slide` for both
          // is a duplicate key, and React then leaves a stale label in the DOM.
          key={`label-${slide}`}
          className="demo-slide-label absolute inset-x-0 top-0 flex h-32 flex-col items-center justify-center px-8 text-center"
        >
          <p className="font-display text-4xl font-bold leading-tight text-rmit-navy sm:text-5xl">{currentSlide.label}</p>
          <p className="mt-2 text-sm font-semibold uppercase tracking-[0.25em] text-muted">{currentSlide.sub}</p>
        </div>
      )}
      {/* Keyed by slide so re-entering it replays the bar intro. */}
      {stage === 'slide' && currentSlide?.custom === 'rates' && <RatesSlide key={`rates-${slide}`} />}
      {stage === 'gauge' && <Gauge startDelayMs={1500} />}
    </div>
  )
}

function TitleScreen() {
  return (
    <div className="demo-title flex flex-col items-center px-8 text-center">
      <h1 className="font-display text-[clamp(3rem,9vw,8rem)] font-bold leading-[1.05] text-rmit-navy">
        <span className="demo-word">
          <span className="text-rmit-red">GCMC</span>
        </span>{' '}
        <span className="demo-word">
          <span style={{ '--d': '140ms' } as React.CSSProperties}>Dashboard</span>
        </span>
      </h1>
      <span className="demo-rule mt-6 block h-1 w-24 rounded-full bg-rmit-red" aria-hidden />
      <p className="demo-sub mt-6 text-base font-semibold uppercase tracking-[0.28em] text-muted sm:text-xl">
        RMIT GCMC Workload Report
      </p>
    </div>
  )
}
