import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Moon, Sun } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { useTheme } from '../lib/theme'

const TITLES: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard', subtitle: '' },
  '/tasks': { title: 'Task List', subtitle: 'All registered tasks' },
  '/settings': { title: 'Settings', subtitle: 'Manage campaigns, work types and people' },
}

/** Lets the active page inject content into the header (left of the theme toggle / right of the title). */
type HeaderSlots = { left?: ReactNode; right?: ReactNode }
const HeaderSlotContext = createContext<(slots: HeaderSlots) => void>(() => {})
export const useHeaderSlots = () => useContext(HeaderSlotContext)

export function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const meta = TITLES[pathname] ?? { title: 'Workload Report', subtitle: '' }
  const { theme, toggle } = useTheme()
  const currentYear = new Date().getFullYear()

  const [slots, setSlots] = useState<HeaderSlots>({})
  const setHeaderSlots = useCallback((s: HeaderSlots) => setSlots(s), [])

  return (
    <HeaderSlotContext.Provider value={setHeaderSlots}>
      <div className="flex h-screen overflow-hidden bg-surface">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Top bar */}
          <header className="flex items-center justify-between gap-4 border-b border-line bg-card px-6 py-4">
            <div className="flex items-stretch gap-3">
              <div className="flex flex-col justify-center">
                <h1 className="text-lg font-bold text-ink">{meta.title}</h1>
                {meta.subtitle && <p className="text-xs text-muted">{meta.subtitle}</p>}
              </div>
              <span
                className="flex items-center rounded-xl border border-line px-4 text-2xl font-bold leading-none text-ink"
                title="Current year"
              >
                {currentYear}
              </span>
              {slots.left}
            </div>
            <div className="flex items-center gap-3">
              {slots.right}
              <button
                onClick={toggle}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-card text-muted transition hover:text-ink"
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </HeaderSlotContext.Provider>
  )
}
