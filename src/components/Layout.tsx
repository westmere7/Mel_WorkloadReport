import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { LogIn, LogOut, Moon, Sun } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { LoginModal } from './LoginModal'
import { useTheme } from '../lib/theme'
import { useAuth } from '../lib/auth'

const TITLES: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard', subtitle: '' },
  '/tasks': { title: 'Task List', subtitle: 'All registered tasks' },
  '/settings': { title: 'Settings', subtitle: 'Manage campaigns, work types and people' },
}

const SIDEBAR_KEY = 'mwr.sidebar'

/** Lets the active page inject content into the header (left of the theme toggle / right of the title). */
type HeaderSlots = { left?: ReactNode; right?: ReactNode }
const HeaderSlotContext = createContext<(slots: HeaderSlots) => void>(() => {})
export const useHeaderSlots = () => useContext(HeaderSlotContext)

export function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const meta = TITLES[pathname] ?? { title: 'Workload Report', subtitle: '' }
  const { theme, toggle } = useTheme()
  const { user, signOut } = useAuth()
  const currentYear = new Date().getFullYear()

  const [loginOpen, setLoginOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === 'collapsed'
    } catch {
      return false
    }
  })
  const toggleSidebar = () =>
    setCollapsed((c) => {
      const next = !c
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? 'collapsed' : 'expanded')
      } catch {
        /* ignore */
      }
      return next
    })

  const [slots, setSlots] = useState<HeaderSlots>({})
  const setHeaderSlots = useCallback((s: HeaderSlots) => setSlots(s), [])

  return (
    <HeaderSlotContext.Provider value={setHeaderSlots}>
      <div className="flex h-screen overflow-hidden bg-surface">
        <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Top bar */}
          <header className="flex items-center justify-between gap-4 border-b border-line bg-card py-4 pl-8 pr-6">
            <div className="flex items-stretch gap-3">
              {collapsed && (
                <div className="flex items-center gap-2.5" title="GCMC Workload Report">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--sidebar)]">
                    <img src="/RMIT_white.svg" alt="RMIT" className="h-4 w-auto" />
                  </span>
                  <div className="hidden sm:block">
                    <p className="text-sm font-bold leading-tight text-ink">GCMC</p>
                    <p className="text-[11px] leading-tight text-muted">Workload Report</p>
                  </div>
                  <span className="mx-1 h-9 self-center border-l border-line" />
                </div>
              )}
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
              {user ? (
                <button
                  onClick={signOut}
                  className="flex h-9 items-center gap-2 rounded-xl border border-line bg-card px-3 text-xs font-semibold text-muted transition hover:text-ink"
                  title={`Signed in as ${user} — click to sign out`}
                >
                  <span className="hidden max-w-[120px] truncate sm:inline">{user}</span>
                  <LogOut className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={() => setLoginOpen(true)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-card text-muted transition hover:text-ink"
                  title="Sign in to edit"
                  aria-label="Sign in"
                >
                  <LogIn className="h-4 w-4" />
                </button>
              )}
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </HeaderSlotContext.Provider>
  )
}
