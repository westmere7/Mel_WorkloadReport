import { useCallback, useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'mwr.theme'
const listeners = new Set<() => void>()

function snapshot(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function apply(next: Theme) {
  document.documentElement.classList.toggle('dark', next === 'dark')
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* ignore storage errors */
  }
  listeners.forEach((l) => l())
}

/**
 * Reactive theme hook backed by an external store, so every consumer
 * (top bar toggle, charts, etc.) re-renders together when the theme flips.
 * Initial value reflects the class set by the inline boot script in index.html.
 */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, snapshot, () => 'light' as Theme)
  const setTheme = useCallback((t: Theme) => apply(t), [])
  const toggle = useCallback(() => apply(snapshot() === 'dark' ? 'light' : 'dark'), [])
  return { theme, setTheme, toggle }
}

/**
 * The theme the user actually chose — what the inline boot script in index.html
 * would apply on a fresh load (saved preference, else the OS setting). Used to
 * RESTORE the theme after a transient override (see `previewTheme`).
 */
export function storedTheme(): Theme {
  try {
    const t = localStorage.getItem(STORAGE_KEY)
    if (t === 'dark' || t === 'light') return t
  } catch {
    /* fall through */
  }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Apply a theme WITHOUT saving it — every consumer re-renders (charts flip
 * palette) but the user's stored preference is untouched, so `storedTheme()`
 * still knows what to go back to. Demo mode uses this to force light mode for
 * the duration of a presentation.
 */
export function previewTheme(next: Theme) {
  document.documentElement.classList.toggle('dark', next === 'dark')
  listeners.forEach((l) => l())
}
