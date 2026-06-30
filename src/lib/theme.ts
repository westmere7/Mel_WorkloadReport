import { useCallback, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'mwr.theme'

function currentTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/** Theme state + toggle. Initial value reflects the class set by the
 *  inline boot script in index.html (so there's no flash on load). */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(currentTheme)

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.classList.toggle('dark', next === 'dark')
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* ignore storage errors */
    }
    setThemeState(next)
  }, [])

  const toggle = useCallback(() => {
    setTheme(currentTheme() === 'dark' ? 'light' : 'dark')
  }, [setTheme])

  return { theme, setTheme, toggle }
}
