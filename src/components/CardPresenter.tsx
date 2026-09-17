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
import { Minimize2 } from 'lucide-react'
import { cardTitle, isFitCard, presentCards } from '../lib/present'

// ─────────────────────────────────────────────────────────────────────────────
// Per-card full screen.
//
// Click the expand icon in a card's header and that card is lifted out of the grid
// and blown up to fill the content column under its own title (lib/present.ts), so a
// chart stays live and interactive rather than becoming a picture of itself. Purely
// presentational: nothing is stored, no data is touched, and Escape (or the close
// button, or the backdrop) puts it back.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Logical width the card is laid out at before being scaled up to fill the canvas.
 * ~The width a dashboard card gets on a 1440px screen, so a full-screen card there
 * is 1:1 and everything above it is magnified instead of just spread thinner — on a
 * 2000px screen the type comes out ~1.5x. It also keeps the container-query stat
 * figures (`24cqw`) to a sane size: laid out at a raw 1680px they resolved to ~400px
 * tall and pushed the card far past its area.
 */
const APP_MAX_LW = 1120

interface PresentValue {
  /** The card currently presented, or null. */
  card: HTMLElement | null
  present: (card: HTMLElement) => void
  close: () => void
}

const PresentContext = createContext<PresentValue | null>(null)

export function CardPresenterProvider({ children }: { children: ReactNode }) {
  const [card, setCard] = useState<HTMLElement | null>(null)
  const present = useCallback((el: HTMLElement) => setCard(el), [])
  const close = useCallback(() => setCard(null), [])
  const value = useMemo<PresentValue>(() => ({ card, present, close }), [card, present, close])
  return <PresentContext.Provider value={value}>{children}</PresentContext.Provider>
}

/** Null outside the app shell (the public showcase viewer mounts no presenter). */
export function useCardPresenter(): PresentValue | null {
  return useContext(PresentContext)
}

/**
 * Whether `ref` sits inside the card currently shown full screen — so a panel can
 * show more of itself when it has the whole canvas. Cheap and safe to call anywhere
 * under the provider; always false when nothing is presented.
 */
export function useIsPresented(ref: RefObject<HTMLElement>): boolean {
  const ctx = useContext(PresentContext)
  const card = ctx?.card ?? null
  return Boolean(card && ref.current && card.contains(ref.current))
}

/**
 * The backdrop + title for a presented card. Mounted inside the content column
 * (see Layout) so the sidebar stays usable.
 */
export function CardPresenterOverlay() {
  const ctx = useContext(PresentContext)
  const card = ctx?.card ?? null
  const close = ctx?.close
  // Read the title before the card moves — it's the same node either way, but
  // reading it in render keeps the heading in step with a live re-render.
  const [title, setTitle] = useState('')
  // Restoring the scroll position: lifting the card out of the grid shortens the
  // page, which can clamp the scroll and leave the dashboard somewhere else on exit.
  const scrollRef = useRef(0)

  useLayoutEffect(() => {
    if (!card) return
    setTitle(cardTitle(card))
    const scroller = card.closest('main')
    scrollRef.current = scroller?.scrollTop ?? 0
    // ⚠️ Laid out at up to APP_MAX_LW and only magnified beyond that: the point is
    // to SEE MORE — at full width a mix legend shows every type instead of eight, the
    // campaign bars get room for their labels, and the Effort card lists more than
    // its top three. Scaling up harder would fill the same space with the same data.
    // `fit`: stat cards and ranked bars shrink-wrap and centre rather than
    // stretching into a tall, empty box.
    const restore = presentCards([card], { fit: isFitCard(card), maxLw: APP_MAX_LW, allowShrink: true })
    return () => {
      restore()
      if (scroller) scroller.scrollTop = scrollRef.current
    }
  }, [card])

  useEffect(() => {
    if (!card) return
    document.documentElement.setAttribute('data-present', 'card')
    return () => document.documentElement.removeAttribute('data-present')
  }, [card])

  useEffect(() => {
    if (!card || !close) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [card, close])

  if (!card || !close) return null

  return (
    <div className="present-overlay absolute inset-0 z-[60] bg-surface" onClick={close}>
      <div className="absolute inset-x-0 top-0 flex h-32 items-center justify-center px-20 text-center">
        {/* `dark:text-ink`: navy on the dark surface is all but invisible. */}
        <p className="present-title truncate font-display text-4xl font-bold leading-tight text-rmit-navy dark:text-ink sm:text-5xl">
          {title}
        </p>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          close()
        }}
        title="Close (Esc)"
        aria-label="Close full screen"
        className="absolute right-7 top-7 z-[62] flex h-10 items-center gap-2 rounded-xl border border-line bg-card px-3.5 text-xs font-semibold text-muted shadow-soft transition hover:text-ink"
      >
        <Minimize2 className="h-4 w-4" />
        Close
      </button>
    </div>
  )
}
