import { useEffect, useRef } from 'react'

/**
 * Fade the bottom edge of a scrollable list to hint "there's more below". Returns
 * a ref for the scroll container; the `is-scroll-faded` mask (index.css) is toggled
 * on only while more content sits below the fold, so it disappears at the bottom and
 * when the list isn't scrollable. Re-checks on scroll, viewport resize and content
 * changes (items added/removed).
 */
export function useScrollFade<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const moreBelow = el.scrollHeight - el.scrollTop - el.clientHeight > 1
      el.classList.toggle('is-scroll-faded', moreBelow)
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    const mo = new MutationObserver(update)
    mo.observe(el, { childList: true, subtree: true })
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
      mo.disconnect()
    }
  }, [])
  return ref
}
