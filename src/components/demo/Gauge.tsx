import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from '../../showcase/useReducedMotion'

// ─────────────────────────────────────────────────────────────────────────────
// Workload gauge — the closing screen of demo mode.
//
// A five-band semicircular dial with an analogue needle. The needle is driven
// by a damped spring in requestAnimationFrame: it sweeps in from the lowest
// band, overshoots the target and settles with a couple of bounces, then keeps
// a faint tremble like the VU meter on an old amplifier. Display only — nothing
// here reads app data.
// ─────────────────────────────────────────────────────────────────────────────

const BANDS = [
  { label: 'LOW', fill: '#5BBA47', ink: '#0b2a12' },
  { label: 'MED', fill: '#FFB81C', ink: '#3a2600' },
  { label: 'HIGH', fill: '#F58220', ink: '#ffffff' },
  { label: 'VERY HIGH', fill: '#E61E2A', ink: '#ffffff' },
  { label: 'DIAL 000', fill: '#94121B', ink: '#ffffff' },
]
const SWEEP = 180 / BANDS.length // degrees per band

const CX = 320
const CY = 320
const R_OUT = 270
const R_IN = 172
const R_TEXT = 224

/** Point on a circle around the hub; `deg` is 0 at the right, 180 at the left, over the top. */
function pt(r: number, deg: number): string {
  const a = (deg * Math.PI) / 180
  return `${(CX + r * Math.cos(a)).toFixed(2)},${(CY - r * Math.sin(a)).toFixed(2)}`
}

/** Filled ring segment between two angles (left→right over the top). */
function bandPath(a0: number, a1: number): string {
  return `M ${pt(R_OUT, a0)} A ${R_OUT} ${R_OUT} 0 0 1 ${pt(R_OUT, a1)} L ${pt(R_IN, a1)} A ${R_IN} ${R_IN} 0 0 0 ${pt(R_IN, a0)} Z`
}

/** Arc for the curved label, same direction so the text reads upright. */
function textArc(a0: number, a1: number): string {
  return `M ${pt(R_TEXT, a0)} A ${R_TEXT} ${R_TEXT} 0 0 1 ${pt(R_TEXT, a1)}`
}

/** Band index under a needle angle (−90 = far left … +90 = far right). */
function bandAt(theta: number): number {
  return Math.min(BANDS.length - 1, Math.max(0, Math.floor((theta + 90) / SWEEP)))
}

// Spring tuning. ω₀ sets the sweep speed (≈1.2 s to first reach the target);
// ζ < 1 is what makes it overshoot and bounce — ~0.42 gives a visible first
// bounce, a small second one, then rest.
const OMEGA = 5.2
const ZETA = 0.42
const START = -90
const TARGET = 0 // dead centre — middle of the "High" band
const REST_AFTER_S = 2.4 // when the idle tremble fades in

export function Gauge({ startDelayMs = 0 }: { startDelayMs?: number }) {
  const needleRef = useRef<SVGGElement>(null)
  const reduced = useReducedMotion()
  const [band, setBand] = useState(() => bandAt(reduced ? TARGET : START))

  useEffect(() => {
    const g = needleRef.current
    if (!g) return
    const setAngle = (theta: number) => g.setAttribute('transform', `rotate(${theta.toFixed(3)} ${CX} ${CY})`)

    if (reduced) {
      setAngle(TARGET)
      setBand(bandAt(TARGET))
      return
    }

    setAngle(START)
    let x = START
    let v = 0
    let last = 0
    let elapsed = 0
    let nextKick = REST_AFTER_S + 1.2
    let raf = 0
    let currentBand = bandAt(START)

    const tick = (now: number) => {
      if (!last) last = now
      const dt = Math.min(0.032, (now - last) / 1000)
      last = now
      elapsed += dt

      // Idle tremble: a few incommensurate sines, ramped in once the sweep has
      // settled, plus an occasional tiny kick so the needle "reacts" now and then.
      const ramp = Math.min(1, Math.max(0, (elapsed - REST_AFTER_S) / 1.5))
      const tremble =
        ramp * (0.9 * Math.sin(elapsed * 2.3) + 0.45 * Math.sin(elapsed * 5.1 + 1.7) + 0.2 * Math.sin(elapsed * 11 + 0.4))
      if (elapsed > nextKick) {
        v += (Math.random() - 0.5) * 14
        nextKick = elapsed + 1.4 + Math.random() * 2.2
      }

      const target = TARGET + tremble
      const acc = -OMEGA * OMEGA * (x - target) - 2 * ZETA * OMEGA * v
      v += acc * dt
      x += v * dt
      setAngle(x)

      const b = bandAt(x)
      if (b !== currentBand) {
        currentBand = b
        setBand(b)
      }
      raf = requestAnimationFrame(tick)
    }

    const timer = window.setTimeout(() => {
      raf = requestAnimationFrame(tick)
    }, startDelayMs)
    return () => {
      window.clearTimeout(timer)
      cancelAnimationFrame(raf)
    }
  }, [reduced, startDelayMs])

  return (
    <div className="demo-gauge flex w-full max-w-[1000px] flex-col items-center px-6">
      {/* 640×420: the extra height below the hub keeps the caption clear of the needle/hub. */}
      <svg viewBox="0 0 640 420" className="w-full" role="img" aria-label="Workload level gauge">
        <defs>
          {BANDS.map((_, i) => {
            const a0 = 180 - i * SWEEP
            const a1 = 180 - (i + 1) * SWEEP
            return <path key={i} id={`demo-band-text-${i}`} d={textArc(a0, a1)} fill="none" />
          })}
          <filter id="demo-needle-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000054" floodOpacity="0.28" />
          </filter>
        </defs>

        {/* Bands, separated by hairlines in the page surface colour. */}
        {BANDS.map((b, i) => {
          const a0 = 180 - i * SWEEP
          const a1 = 180 - (i + 1) * SWEEP
          return (
            <path key={b.label} d={bandPath(a0, a1)} fill={b.fill} stroke="var(--surface)" strokeWidth={5} strokeLinejoin="round" />
          )
        })}

        {/* Curved labels along each band. */}
        {BANDS.map((b, i) => (
          <text
            key={b.label}
            fill={b.ink}
            fontSize={i === 3 ? 21 : 24}
            fontWeight={800}
            letterSpacing={1.5}
            style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
          >
            <textPath href={`#demo-band-text-${i}`} startOffset="50%" textAnchor="middle" dominantBaseline="middle">
              {b.label}
            </textPath>
          </text>
        ))}

        {/* Needle — rotated about the hub by the spring loop. */}
        <g ref={needleRef} transform={`rotate(${START} ${CX} ${CY})`} filter="url(#demo-needle-shadow)">
          <polygon points={`${CX},74 ${CX - 9},${CY} ${CX + 9},${CY}`} fill="#1c1c28" />
          <polygon points={`${CX},74 ${CX - 3},${CY - 40} ${CX + 3},${CY - 40}`} fill="#E61E2A" />
        </g>
        {/* Hub */}
        <circle cx={CX} cy={CY} r={30} fill="#1c1c28" />
        <circle cx={CX} cy={CY} r={12} fill="#ffffff" fillOpacity={0.9} />
        <circle cx={CX} cy={CY} r={5} fill="#E61E2A" />

        <text
          x={CX}
          y={404}
          textAnchor="middle"
          fill="#1c1c28"
          fontSize={22}
          fontWeight={800}
          letterSpacing={3}
          style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
        >
          WORKLOAD LEVEL
        </text>
      </svg>

      {/* Live readout of the band the needle is sitting in. */}
      <div className="mt-4 flex items-center gap-3 rounded-full border border-line bg-card px-6 py-3 shadow-soft">
        <span className="h-3.5 w-3.5 rounded-full" style={{ background: BANDS[band].fill }} aria-hidden />
        <span className="text-base font-semibold uppercase tracking-wider text-muted">Current level</span>
        <span className="font-display text-2xl font-bold text-rmit-navy">{BANDS[band].label}</span>
      </div>
    </div>
  )
}
