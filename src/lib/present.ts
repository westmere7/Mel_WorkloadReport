// ─────────────────────────────────────────────────────────────────────────────
// Presenting a dashboard card full screen (components/CardPresenter.tsx).
//
// Lifts a live card out of the grid and blows it up to fill the content column,
// keeping every React handler and every chart interactive. The geometry lives here
// because getting it wrong has specific, non-obvious failure modes, documented on
// `presentCards`.
// ─────────────────────────────────────────────────────────────────────────────

/** The content column (right of the sidebar) that presented cards are placed over. */
const COLUMN_SELECTOR = '.present-column'

/** Height reserved at the top of the column for the title. */
const PRESENT_LABEL_H = 128
/** Outer padding around the presented card(s). */
const PRESENT_PAD = 28
/** Gap between cards presented side by side. */
const PRESENT_GAP = 24

/** A card's panel title — the CardHeader <h3>, or a StatCard's label <p>. */
export function cardTitle(el: HTMLElement): string {
  return (el.querySelector('h3, p')?.textContent ?? '').trim()
}

/**
 * Whether a card's title is the one wanted, tolerating the suffixes the dashboard
 * adds: compare mode appends " · 2026 over 2025", and the workload card is titled
 * "Workload & tasks in 2026".
 */
function titleMatches(title: string, wanted: string): boolean {
  return title === wanted || title.startsWith(`${wanted} ·`) || title.startsWith(`${wanted} in `)
}

/**
 * Content-sized cards (stat cards, ranked bars), by panel title. When presented they
 * shrink-wrap to their content and centre vertically instead of stretching into a
 * tall, empty box; every other card (charts) fills the area.
 */
const FIT_CARD_TITLES = ['Volume', 'Asset count', 'Effort', 'Task count', 'Tasks by squad', 'Assets by squad']

/** Whether `el` is one of the content-sized cards above (see PresentOptions.fit). */
export function isFitCard(el: HTMLElement): boolean {
  const title = cardTitle(el)
  return FIT_CARD_TITLES.some((t) => titleMatches(title, t))
}

export interface PresentOptions {
  /**
   * Cap on the logical width each card is LAID OUT at before being scaled up: the
   * card is laid out at `min(slot, maxLw)` and scaled up to fill the slot. The
   * type-size dial — smaller means a bigger scale and bigger type — and also a
   * correctness control; see the warnings below. On a wide screen this is what
   * makes the type grow instead of the layout just getting emptier.
   */
  maxLw?: number
  /**
   * Content-sized cards (stat cards, ranked bars): shrink-wrap to their content and
   * centre vertically instead of stretching to the full height. A chart card fills.
   */
  fit?: boolean
  /**
   * Let a `fit` card scale BELOW 1 when its content is taller than the area. Without
   * it a too-tall card keeps its scale and simply overflows its own box.
   */
  allowShrink?: boolean
}

/**
 * Lay `els` out side by side across the column, under the title band, scaled to
 * fill it. Returns a cleanup that restores them exactly.
 *
 * ⚠️ Cards are laid out at a SMALL logical width and scaled with a transform rather
 * than simply being made as wide as the slot. Two reasons, both load-bearing:
 *   · type — everything scales together (text, bars, chart labels, the donut).
 *     Merely widening the card leaves 12px legend text at 12px on a 2000px screen.
 *   · correctness — the stat figures are container-query sized (`17cqw` / `24cqw` in
 *     EffortStats). Laid out at the full width of a wide screen, `24cqw` resolves to
 *     ~400px and the card grows far past the area it was given.
 *
 * ⚠️ A `fit` card's height is re-measured with a ResizeObserver rather than taken
 * once. Its content is still moving when it arrives — its container-query figures
 * re-resolve against the new width, and a presented panel may choose to show more
 * rows than it did in the grid (see useIsPresented).
 * Measuring once froze a stale height and the content spilled out of the card, by
 * as much as 1483px on a 2000px screen. `offsetHeight` ignores transforms, so
 * re-applying the scale from it can't feed back into the measurement.
 *
 * Scale, not `zoom`: `transform` leaves layout alone, so the logical box is exactly
 * what we set and charts (which measure px) lay out predictably, then scale crisply
 * as SVG. `transform-origin: 0 0` makes the visual box `(left, top, lw*z, h*z)`.
 *
 * ⚠️ Anything that maps pointer position into a chart's own coordinates must divide
 * by the measured scale — see `toUser` in components/charts.tsx.
 */
export function presentCards(els: HTMLElement[], o: PresentOptions = {}): () => void {
  const column = document.querySelector<HTMLElement>(COLUMN_SELECTOR)
  if (!column || els.length === 0) return () => {}

  const W = column.clientWidth
  const H = column.clientHeight
  const n = els.length
  const areaH = H - PRESENT_LABEL_H - PRESENT_PAD
  const slotW = (W - 2 * PRESENT_PAD - PRESENT_GAP * (n - 1)) / n
  const logicalW = Math.min(slotW, o.maxLw ?? Infinity)
  // Never below 1 here: on a narrow window the slot is already smaller than the
  // logical width, and shrinking would read as worse than the dashboard itself.
  const baseZ = Math.max(1, slotW / logicalW)

  const place = (el: HTMLElement, i: number, z: number, height: string) => {
    Object.assign(el.style, {
      position: 'absolute',
      // Centre in the slot: a fit card that had to shrink is narrower than its slot.
      left: `${PRESENT_PAD + i * (slotW + PRESENT_GAP) + (slotW - logicalW * z) / 2}px`,
      width: `${logicalW}px`,
      height,
      margin: '0',
      zIndex: '61',
      transformOrigin: '0 0',
      transform: `scale(${z})`,
    })
  }

  els.forEach((el, i) => {
    el.classList.add('present-card')
    // Inline `auto` beats the cards' own h-full/h-80 classes so a fit card
    // shrink-wraps; a chart card is given the whole area to fill.
    place(el, i, baseZ, o.fit ? 'auto' : `${areaH / baseZ}px`)
    el.style.top = `${PRESENT_LABEL_H}px`
  })

  let observer: ResizeObserver | null = null
  if (o.fit) {
    // Re-fit whenever the content's own height changes (see the warning above).
    const refit = () => {
      const nat = Math.max(...els.map((el) => el.offsetHeight))
      if (!nat) return
      const z = o.allowShrink ? Math.min(baseZ, areaH / nat) : baseZ
      const top = PRESENT_LABEL_H + Math.max(0, (areaH - nat * z) / 2)
      els.forEach((el, i) => {
        place(el, i, z, `${nat}px`)
        el.style.top = `${top}px`
      })
    }
    refit()
    observer = new ResizeObserver(() => {
      // Height is read from `auto` content, so release the fixed height first.
      els.forEach((el) => {
        el.style.height = 'auto'
      })
      refit()
    })
    els.forEach((el) => observer!.observe(el))
  }

  return () => {
    observer?.disconnect()
    els.forEach((el) => {
      el.classList.remove('present-card')
      for (const p of [
        'position', 'left', 'top', 'width', 'height', 'max-height',
        'margin', 'z-index', 'transform', 'transform-origin',
      ]) {
        el.style.removeProperty(p)
      }
    })
  }
}
