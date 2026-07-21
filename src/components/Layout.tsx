import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { LogIn, Moon, Sun, UserCog } from 'lucide-react'
import { Sidebar, MobileNav } from './Sidebar'
import { LoginModal } from './LoginModal'
import { AccountModal } from './AccountModal'
import { useTheme } from '../lib/theme'
import { useAuth } from '../lib/auth'
import { cx } from '../lib/format'

const TITLES: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard', subtitle: '' },
  '/tasks': { title: 'Task List', subtitle: 'All registered tasks' },
  '/showcase': { title: 'Showcase', subtitle: 'Build a shareable animated year-in-review' },
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
  const { user } = useAuth()

  const [loginOpen, setLoginOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
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
          {/* Top bar — wraps to two rows on mobile (title/controls, then the page slots).
              sm:min-h keeps the height identical across pages regardless of subtitle. */}
          <header className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-card px-3 py-3 sm:min-h-20 sm:gap-x-4 sm:py-4 sm:pl-8 sm:pr-6">
            {/* Title / brand cluster */}
            <div className="order-1 flex min-w-0 items-center gap-3">
              {/* Brand mark on mobile, where the sidebar rail is hidden. */}
              <img src="/RMIT_red.svg" alt="RMIT" className="h-7 w-auto shrink-0 md:hidden" />
              {/* When collapsed, the sidebar rail drops its logo + name — show them here
                  (full-colour on the light header, red/white on the dark one). */}
              {collapsed && (
                <div className="hidden items-center gap-2.5 md:flex" title="GCMC Workload Report">
                  <img src="/RMIT_full.svg" alt="RMIT" className="h-8 w-auto shrink-0 dark:hidden" />
                  <img src="/RMIT_red.svg" alt="RMIT" className="hidden h-8 w-auto shrink-0 dark:block" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold leading-tight text-ink">GCMC</p>
                    <p className="text-[11px] leading-tight text-muted">Workload Report</p>
                  </div>
                  <span className="mx-1 h-9 self-center border-l border-line" />
                </div>
              )}
              <div className="flex min-w-0 flex-col justify-center">
                <h1 className="truncate text-base font-bold text-ink sm:text-lg">{meta.title}</h1>
                {meta.subtitle && <p className="hidden truncate text-xs text-muted sm:block">{meta.subtitle}</p>}
              </div>
              {/* Page-injected left slot (e.g. the dashboard's function filter) —
                  hidden on mobile to keep the top row compact */}
              {slots.left && <div className="hidden items-center sm:flex">{slots.left}</div>}
            </div>

            {/* Controls cluster (theme + auth) */}
            <div
              className={cx(
                'order-2 flex shrink-0 items-center gap-2 sm:order-3 sm:gap-3',
                slots.right ? 'ml-auto sm:ml-0' : 'ml-auto',
              )}
            >
              {/* Separator to set the page controls apart from the theme/auth toggles */}
              <span className="h-6 w-px self-center bg-line" aria-hidden="true" />

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
                  onClick={() => setAccountOpen(true)}
                  className="flex h-9 items-center gap-2 rounded-xl border border-line bg-card px-3 text-xs font-semibold text-muted transition hover:text-ink"
                  title={`Signed in as ${user} — account settings`}
                >
                  <UserCog className="h-4 w-4" />
                  <span className="hidden max-w-[120px] truncate sm:inline">{user}</span>
                </button>
              ) : (
                <button
                  onClick={() => setLoginOpen(true)}
                  className="flex h-9 items-center gap-2 rounded-xl bg-rmit-navy px-3.5 text-sm font-semibold text-white transition hover:bg-navy-700 dark:bg-navy-300 dark:hover:bg-navy-200"
                  title="Sign in to edit"
                >
                  <LogIn className="h-4 w-4" />
                  Sign in
                </button>
              )}
            </div>

            {/* Page-injected slot (e.g. dashboard span filter) — full-width second row on
                mobile, inline on the right at sm+ */}
            {slots.right && (
              <div className="order-3 w-full sm:order-2 sm:ml-auto sm:w-auto">{slots.right}</div>
            )}
          </header>

          {/* Extra bottom padding on mobile so content clears the fixed bottom nav. */}
          <main className="flex-1 overflow-y-auto p-6 pb-24 md:pb-6">{children}</main>
          {/* Bottom navigation — mobile only (the sidebar is hidden there). */}
          <MobileNav />
        </div>
      </div>
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      <AccountModal open={accountOpen} onClose={() => setAccountOpen(false)} />
    </HeaderSlotContext.Provider>
  )
}
