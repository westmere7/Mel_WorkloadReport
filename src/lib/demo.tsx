import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../data/store'
import { previewTheme, storedTheme } from './theme'
import { ratedAssetRows } from './effort'

// ─────────────────────────────────────────────────────────────────────────────
// Demo mode — a presentation walkthrough of the LIVE dashboard.
//
// Purely client-side and purely presentational: it never touches the store, the
// repository or any persisted preference. It forces light mode for the duration
// (via `previewTheme`, which leaves the saved theme alone) and puts the real
// theme back on exit, so other users and this browser's own settings are
// unaffected. All the visual work is CSS keyed off `html[data-demo="<stage>"]`
// (see index.css) plus the <DemoOverlay/> screens. The sidebar stays put the
// whole time — its Demo button reads "Next" and is the presenter's control.
//
// Stages, one click each:
//   blank  → the content area hidden behind a plain surface
//   title  → "GCMC Dashboard" animates in
//   reveal → the dashboard animates in panel by panel (L→R, T→B), live data —
//            each panel's content REMOUNTS as it appears so charts, bars and
//            counters run their intro animations (useDemoRevealKey / useDemoIntro)
//   slide  → one slide per DEMO_SLIDES entry: the real card(s) are lifted out of
//            the grid and sized to fill the content area under a label — still
//            live, charts re-layout at the bigger size. A slide may instead name a
//            `custom` renderer for data that has no dashboard card (the output
//            rates live in a modal), drawn by <DemoOverlay/> in the same area.
//   gauge  → panels animate out, workload gauge sweeps in
//   (next) → exit, back to where the user was
// ─────────────────────────────────────────────────────────────────────────────

export type DemoStage = 'off' | 'blank' | 'title' | 'reveal' | 'slide' | 'gauge'

/** A full-screen slide: which dashboard cards it shows (by panel title) and its caption. */
export interface DemoSlide {
  label: string
  sub: string
  /** Panel titles to include, in left→right order. A card matches when its title
   *  equals one of these or continues it with " ·" / " in" (compare-mode suffixes,
   *  "Workload & tasks in 2026"). Slides with no matching card are skipped. */
  titles: string[]
  /**
   * Renders its own content instead of lifting dashboard cards (`titles` is then
   * ignored). For data with no card to lift — the output rates comparison lives in
   * EffortInfoModal. <DemoOverlay/> maps the key to a component.
   */
  custom?: 'rates'
  /** Content-sized cards (stat cards, ranked bars): shrink-wrap to their content and
   *  centre vertically instead of stretching to the full height — a chart card fills. */
  fit?: boolean
  /**
   * Logical width, in px, each card is LAID OUT at before being scaled up to fill
   * its slot (see applySlide). This is the type-size dial: the smaller the logical
   * width, the bigger the scale factor and the bigger everything reads. It also
   * keeps the container-query figures (`24cqw` in EffortStats) inside their fixed
   * `h-[5.5rem]` row — laying a stat card out at full slide width is what made the
   * big numbers overlap the card header. Defaults to DEFAULT_SLIDE_LW.
   */
  lw?: number
}

/** Logical width for a full-width chart card — charts stay legible this wide. */
const DEFAULT_SLIDE_LW = 780
/** Stat/bar cards: narrow logical box → large scale → big type, no figure overlap. */
const FIT_SLIDE_LW = 400
/**
 * Mix cards. Two hard floors here, both from DonutChart:
 *   · below ~380px of CONTENT, MixChart swaps the donut for the stacked bar;
 *   · the ring is a FIXED 180px, so the legend only ever gets `content - 196`.
 * At 430 that left a category name ~122px against the ~125px "Concept development"
 * needs, and useNameMarquee clipped it — which reads as a bug on a projector.
 * 470 gives the legend ~234px and still scales the card up ~1.2-1.7x.
 */
const MIX_SLIDE_LW = 470
/**
 * Workload chart. Wider than the default on purpose, which makes its type a little
 * SMALLER than the other chart slides — because this card's header carries the
 * hover readout for the dot under the pointer, and that readout is as wide as the
 * task name (capped at `max-w-[24rem]` = 384px). Measured at 780: the header needs
 * max(title, subtitle) 392 + 12 + 384 + 8 + 20 = 816px of content, so the 740 it had
 * forced the subtitle to wrap to a second line the moment you hovered a dot — the
 * header grew 40 -> 54px and the chart under it jumped 422 -> 408px, on every hover.
 * 880 (= 840 content) keeps it on one line even with the longest name.
 */
const WORKLOAD_SLIDE_LW = 880

export const DEMO_SLIDES: DemoSlide[] = [
  {
    label: 'Volume & effort',
    sub: 'What was produced — and what it actually took',
    titles: ['Volume', 'Asset count', 'Effort', 'Task count'],
    fit: true,
    lw: FIT_SLIDE_LW,
  },
  {
    label: 'Output rates',
    sub: 'How long one of each deliverable takes to make',
    titles: [],
    custom: 'rates',
  },
  {
    label: 'Demand by squad',
    sub: 'Requests and deliverables by stakeholder team',
    titles: ['Tasks by squad', 'Assets by squad'],
    fit: true,
    lw: FIT_SLIDE_LW,
  },
  {
    label: 'Workload across the year',
    sub: 'Effort per month, with every task plotted',
    titles: ['Workload & tasks'],
    lw: WORKLOAD_SLIDE_LW,
  },
  {
    label: 'Asset & work type mix',
    sub: 'What the team makes, and how',
    titles: ['Asset mix', 'Work type mix'],
    lw: MIX_SLIDE_LW,
  },
  { label: 'Asset count by campaign', sub: 'Deliverables produced per campaign', titles: ['Asset count by campaign'] },
  {
    label: 'Squads demand distribution',
    sub: 'Share of each type across stakeholder groups',
    titles: ['Squads demand distribution'],
  },
]

/** Slide geometry (px, within the content column): caption band, outer padding, gap between cards. */
const SLIDE_LABEL_H = 128
const SLIDE_PAD = 28
const SLIDE_GAP = 24

interface DemoValue {
  stage: DemoStage
  /** Index into the resolved slides while `stage === 'slide'`, else -1. */
  slide: number
  /** Caption of the slide on screen, or null. */
  currentSlide: DemoSlide | null
  active: boolean
  /** True on the final stage — the button reads "Finish". */
  isLast: boolean
  /** Enter demo mode at the first stage (navigates to the dashboard first). */
  start: () => void
  /** Advance one stage; from the last stage this exits. */
  next: () => void
  /** Leave demo mode immediately, restoring the theme. */
  exit: () => void
}

const DemoContext = createContext<DemoValue | null>(null)

/** Top-level dashboard cards only — a card nested in a card rides along with its parent. */
function topLevelCards(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('main .card')).filter(
    (el) => !el.parentElement?.closest('.card'),
  )
}

/**
 * Tag the header (`.demo-el`) and every top-level dashboard card with a reveal
 * index in reading order (row by row, left to right, by their on-screen position),
 * so the CSS stagger runs L→R then T→B regardless of how the grid nests.
 * Returns a cleanup that removes every attribute it added.
 */
function tagPanels(): () => void {
  const chrome = Array.from(document.querySelectorAll<HTMLElement>('.demo-el'))
  const ROW_TOLERANCE = 40
  const sorted = topLevelCards()
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .sort((a, b) => {
      const rowDiff = a.r.top - b.r.top
      return Math.abs(rowDiff) > ROW_TOLERANCE ? rowDiff : a.r.left - b.r.left
    })
    .map((x) => x.el)
  const all = [...chrome, ...sorted]
  all.forEach((el, i) => {
    el.classList.add('demo-panel')
    el.style.setProperty('--demo-i', String(i))
  })
  return () => {
    all.forEach((el) => {
      el.classList.remove('demo-panel')
      el.style.removeProperty('--demo-i')
    })
  }
}

/** A card's panel title — the CardHeader <h3>, or a StatCard's label <p>. */
function cardTitle(el: HTMLElement): string {
  return (el.querySelector('h3, p')?.textContent ?? '').trim()
}

function titleMatches(title: string, wanted: string): boolean {
  return title === wanted || title.startsWith(`${wanted} ·`) || title.startsWith(`${wanted} in `)
}

interface ResolvedSlide {
  slide: DemoSlide
  els: HTMLElement[]
}

/**
 * Match DEMO_SLIDES against the cards currently on the dashboard, dropping any
 * slide with nothing to show. A `custom` slide lifts no cards, so it is kept on its
 * own terms — `hasRates` is how the rates slide is skipped when the team hasn't
 * recorded any (an empty chart on a projector is worse than one slide fewer).
 */
function resolveSlides(hasRates: boolean): ResolvedSlide[] {
  const cards = topLevelCards().map((el) => ({ el, title: cardTitle(el) }))
  return DEMO_SLIDES.map((slide) => ({
    slide,
    els: slide.titles.flatMap((t) => cards.filter((c) => titleMatches(c.title, t)).map((c) => c.el)),
  })).filter((s) => (s.slide.custom === 'rates' ? hasRates : s.els.length > 0))
}

/**
 * Lift a slide's cards out of the grid and blow them up to fill the content column
 * under the caption band. Absolute positioning against the column (`.demo-column`,
 * the nearest positioned ancestor) escapes <main>'s scroll clipping; the cards keep
 * every React handler. Returns a cleanup that puts them back exactly as they were.
 *
 * ⚠️ The card is laid out at a SMALL logical width (`slide.lw`) and then scaled up
 * with a transform, rather than simply being made as wide as the slot. Two reasons:
 *   · type — everything in the card (text, bars, chart labels, the donut) grows by
 *     the scale factor, which is the point of a slide; merely widening the card
 *     leaves 12px legend text at 12px.
 *   · correctness — the stat figures are container-query sized (`17cqw`/`24cqw`)
 *     inside a FIXED `h-[5.5rem]` row, so a full-width layout makes the number's
 *     line box taller than its row and it overlaps the card header.
 * Scale, not zoom: `transform` leaves layout alone, so the logical box stays exactly
 * what we set and charts (which measure px) lay out predictably, then scale crisply
 * as SVG. `transform-origin: 0 0` makes the visual box (left, top, w*z, h*z).
 */
function applySlide(entry: ResolvedSlide): () => void {
  const column = document.querySelector<HTMLElement>('.demo-column')
  // A custom slide draws itself inside the overlay — there is nothing to lift.
  if (!column || entry.els.length === 0) return () => {}
  const W = column.clientWidth
  const H = column.clientHeight
  const n = entry.els.length
  const areaH = H - SLIDE_LABEL_H - SLIDE_PAD
  const visualW = (W - 2 * SLIDE_PAD - SLIDE_GAP * (n - 1)) / n
  // Never below 1: on a narrow window the slot is already smaller than the logical
  // width, and shrinking the card would read as worse than the dashboard itself.
  const z = Math.max(1, visualW / (entry.slide.lw ?? DEFAULT_SLIDE_LW))
  const logicalW = visualW / z
  const logicalH = areaH / z
  const fit = Boolean(entry.slide.fit)
  entry.els.forEach((el, i) => {
    el.classList.add('demo-slide-card')
    Object.assign(el.style, {
      position: 'absolute',
      left: `${SLIDE_PAD + i * (visualW + SLIDE_GAP)}px`,
      top: `${SLIDE_LABEL_H}px`,
      width: `${logicalW}px`,
      // Inline `auto` beats the cards' own h-full/h-80 classes, so a fit slide
      // shrink-wraps its content; the cap keeps it inside the slide area.
      height: fit ? 'auto' : `${logicalH}px`,
      maxHeight: fit ? `${logicalH}px` : '',
      margin: '0',
      zIndex: '61',
      transformOrigin: '0 0',
      transform: `scale(${z})`,
    })
  })
  if (fit) {
    // Measure the natural (logical — transforms do not affect offsetHeight) heights,
    // then give the pair the tallest one and centre the scaled block vertically.
    const nat = Math.min(logicalH, Math.max(...entry.els.map((el) => el.offsetHeight)))
    const top = SLIDE_LABEL_H + (areaH - nat * z) / 2
    entry.els.forEach((el) => {
      el.style.height = `${nat}px`
      el.style.top = `${top}px`
    })
  }
  return () => {
    entry.els.forEach((el) => {
      el.classList.remove('demo-slide-card')
      for (const p of [
        'position', 'left', 'top', 'width', 'height', 'max-height',
        'margin', 'z-index', 'transform', 'transform-origin',
      ]) {
        el.style.removeProperty(p)
      }
    })
  }
}

interface Pos {
  stage: DemoStage
  slide: number
}
const OFF: Pos = { stage: 'off', slide: -1 }

export function DemoProvider({ children }: { children: ReactNode }) {
  const [pos, setPos] = useState<Pos>(OFF)
  const posRef = useRef(pos)
  posRef.current = pos
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const untagRef = useRef<(() => void) | null>(null)
  const slidesRef = useRef<ResolvedSlide[]>([])
  // Whether ANY asset type carries an output rate — decides if the rates slide is
  // worth showing. DemoProvider sits inside StoreProvider, so this is just a read.
  const { settings } = useStore()
  const hasRates = ratedAssetRows(settings).rated.length > 0
  const hasRatesRef = useRef(hasRates)
  hasRatesRef.current = hasRates

  const exit = useCallback(() => setPos(OFF), [])

  const start = useCallback(() => {
    if (pathname !== '/') navigate('/')
    setPos({ stage: 'blank', slide: -1 })
  }, [navigate, pathname])

  const next = useCallback(() => {
    const cur = posRef.current
    // Leaving the reveal: work out which slides have cards on THIS dashboard.
    if (cur.stage === 'reveal') slidesRef.current = resolveSlides(hasRatesRef.current)
    const slides = slidesRef.current
    setPos((p) => {
      switch (p.stage) {
        case 'blank':
          return { stage: 'title', slide: -1 }
        case 'title':
          return { stage: 'reveal', slide: -1 }
        case 'reveal':
          return slides.length ? { stage: 'slide', slide: 0 } : { stage: 'gauge', slide: -1 }
        case 'slide':
          return p.slide + 1 < slides.length ? { stage: 'slide', slide: p.slide + 1 } : { stage: 'gauge', slide: -1 }
        default:
          return OFF
      }
    })
  }, [])

  const { stage, slide } = pos

  // Root attribute drives all the CSS; theme is forced light while active.
  // Layout effect: the attribute must be on <html> before the browser paints
  // the commit that removes the overlay, or panels would flash in untagged.
  useLayoutEffect(() => {
    const root = document.documentElement
    if (stage === 'off') {
      root.removeAttribute('data-demo')
      return
    }
    root.setAttribute('data-demo', stage)
  }, [stage])

  const active = stage !== 'off'
  useEffect(() => {
    if (!active) return
    previewTheme('light')
    return () => {
      // Back to whatever the user had — read fresh in case they toggled it meanwhile.
      previewTheme(storedTheme())
    }
  }, [active])

  // The reveal needs each panel's reading-order index. Tag on entering `reveal`
  // (the dashboard is mounted and laid out by then); keep the tags through the
  // slides and the gauge's animate-out; strip them on exit.
  useLayoutEffect(() => {
    if (stage === 'reveal' && !untagRef.current) {
      untagRef.current = tagPanels()
    }
    if (stage === 'off' && untagRef.current) {
      untagRef.current()
      untagRef.current = null
    }
  }, [stage])
  useEffect(() => () => untagRef.current?.(), [])

  // Slides: position the current slide's cards; the cleanup restores them before
  // the next slide / the gauge / exit.
  useLayoutEffect(() => {
    if (stage !== 'slide') return
    const entry = slidesRef.current[slide]
    if (!entry) return
    return applySlide(entry)
  }, [stage, slide])

  // Presenter keys: → / Space / Enter advance, Esc leaves.
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'Escape') {
        e.preventDefault()
        exit()
      } else if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'ArrowRight') {
        // The presenter keys, and they win outright: preventDefault also cancels a
        // focused button's own activation (Space/Enter "click" a button), so after
        // clicking Next with the mouse a Space still advances exactly ONE stage
        // rather than two — or none. Only bound while a demo is running.
        e.preventDefault()
        next()
      } else if (e.key === 'Enter') {
        // Enter is left to the focused control (so Enter on "Exit demo" exits).
        if (tag === 'BUTTON') return
        e.preventDefault()
        next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, next, exit])

  const currentSlide = stage === 'slide' ? slidesRef.current[slide]?.slide ?? null : null
  const value = useMemo<DemoValue>(
    () => ({ stage, slide, currentSlide, active, isLast: stage === 'gauge', start, next, exit }),
    [stage, slide, currentSlide, active, start, next, exit],
  )
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>
}

export function useDemo(): DemoValue {
  const ctx = useContext(DemoContext)
  if (!ctx) throw new Error('useDemo must be used within <DemoProvider>')
  return ctx
}

/** Demo context, or null outside the app shell (e.g. the public showcase viewer). */
export function useDemoOptional(): DemoValue | null {
  return useContext(DemoContext)
}

/** Card animations that should remount the card's content: the reveal stagger, and
 *  a card arriving on a slide. */
const REMOUNT_ANIMATIONS = new Set(['demo-panel-in', 'demo-fade'])

/**
 * Remount key for a panel's CONTENT. It bumps when the panel's own entrance
 * animation starts — `demo-panel-in` after its stagger delay during the reveal,
 * `demo-fade` when the card is lifted onto a slide — so charts and counters mount,
 * and run their intro animations, at the moment the card becomes visible rather
 * than seconds earlier behind an opaque overlay. That is what makes the DATA animate
 * (recharts mount animations, the workload clip wipe, `useDemoIntro` grow-from-zero)
 * on every slide, not just once. Stays 0 outside demo mode, so normal rendering is
 * untouched.
 */
export function useDemoRevealKey(ref: RefObject<HTMLElement>): number {
  const demo = useDemoOptional()
  const animating = demo?.stage === 'reveal' || demo?.stage === 'slide'
  const [key, setKey] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!animating || !el) return
    const onStart = (e: AnimationEvent) => {
      if (e.target === el && REMOUNT_ANIMATIONS.has(e.animationName)) setKey((k) => k + 1)
    }
    el.addEventListener('animationstart', onStart)
    return () => el.removeEventListener('animationstart', onStart)
  }, [animating, ref])
  return key
}

/** Easing shared by the reveal's grow-from-zero intros. */
export const DEMO_INTRO_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

/**
 * "Grow from zero" flag for bars and counters that mount during the reveal or onto
 * a slide. `intro` is true only when the component mounted in one of those stages
 * (read ONCE, at mount); `ready` is then false on the mounting frame and true a
 * frame later, so a CSS transition carries the value from 0 to its real size.
 * Anywhere else `ready` is true from the start and nothing changes.
 */
export function useDemoIntro(): { intro: boolean; ready: boolean } {
  const demo = useDemoOptional()
  const intro = useRef(demo?.stage === 'reveal' || demo?.stage === 'slide').current
  const [ready, setReady] = useState(!intro)
  useEffect(() => {
    if (ready) return
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setReady(true))
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [ready])
  return { intro, ready }
}
