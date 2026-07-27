import { useCallback, useRef } from 'react'

/**
 * Auto-scrolling name cells. Returns a ref to put on any container holding
 * `.name-marquee` elements (each wrapping exactly one inline-block child).
 *
 * Measures how far a clipped name must travel to reveal its tail and stashes it
 * as `--marquee-shift`, with `--marquee-dur` scaled to the distance so every name
 * scrolls at the same speed regardless of length. `is-clipped` gates both the
 * fade and the scroll, so a name that already fits is left completely alone —
 * no mask eating its last characters, no movement on hover.
 *
 * Same measurement contract as the function-tab marquee in TaskForm; the shared
 * `tab-marquee-scroll` keyframes and the `.name-marquee` rules live in index.css.
 *
 * A callback ref, not a `useRef` object, so it re-arms every time the container
 * attaches — a modal title measures correctly on each open, not just on the first.
 */
export function useNameMarquee<T extends HTMLElement>() {
  const teardown = useRef<(() => void) | null>(null)

  return useCallback((node: T | null) => {
    teardown.current?.()
    teardown.current = null
    if (!node) return

    let disposed = false
    const measure = () => {
      if (disposed) return
      node.querySelectorAll<HTMLElement>('.name-marquee').forEach((el) => {
        const inner = el.firstElementChild as HTMLElement | null
        if (!inner) return
        const shift = Math.min(0, el.clientWidth - inner.scrollWidth)
        el.style.setProperty('--marquee-shift', `${shift}px`)
        // ~55px/s across the moving part of the cycle — reading pace, not the
        // slow drift the narrow function tabs use, because a task name can
        // overrun by 200px and nobody hovers a row for seven seconds. Floored so
        // short overruns still read calmly, and capped so a very long modal title
        // just travels faster rather than crawling. A full there-and-back is 2×
        // this (CSS `alternate`).
        const dur = Math.min(5, Math.max(1.8, Math.abs(shift) / 55))
        el.style.setProperty('--marquee-dur', `${dur}s`)
        el.classList.toggle('is-clipped', inner.scrollWidth > el.clientWidth + 1)
      })
    }

    measure()
    // A late webfont swap changes text width without resizing the container, so
    // the first measure can be off by a few px on a cold load.
    void document.fonts?.ready.then(measure)

    const ro = new ResizeObserver(measure)
    ro.observe(node)
    // childList only — measure() writes styles and classes, which would retrigger
    // an attribute observer and loop.
    const mo = new MutationObserver(measure)
    mo.observe(node, { childList: true, subtree: true })

    teardown.current = () => {
      disposed = true
      ro.disconnect()
      mo.disconnect()
    }
  }, [])
}
