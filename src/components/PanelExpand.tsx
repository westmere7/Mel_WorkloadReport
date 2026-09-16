import { useRef } from 'react'
import { Maximize2 } from 'lucide-react'
import { useCardPresenter } from './CardPresenter'

/**
 * The small "full screen" control in a card header, sitting just left of the "?".
 * Finds its own card (the nearest `.card`) and hands it to the presenter, so no
 * page has to wire anything up beyond dropping this beside <PanelInfo/>.
 *
 * Hidden until the card is hovered or something inside it takes focus — see
 * `.panel-action` in index.css.
 */
export function PanelExpand() {
  const ref = useRef<HTMLButtonElement>(null)
  const presenter = useCardPresenter()
  // No presenter (or already presenting) → nothing to offer.
  if (!presenter || presenter.card) return null

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => {
        const card = ref.current?.closest<HTMLElement>('.card')
        if (card) presenter.present(card)
      }}
      title="Full screen"
      aria-label="Show this panel full screen"
      className="panel-action flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line text-muted transition hover:border-faint hover:text-ink"
    >
      <Maximize2 className="h-2.5 w-2.5" strokeWidth={2.6} />
    </button>
  )
}
