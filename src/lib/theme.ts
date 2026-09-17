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
