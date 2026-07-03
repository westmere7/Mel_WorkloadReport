import { NavLink } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  List,
  Plus,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import { cx } from '../lib/format'
import { useNewTask } from './NewTaskModal'
import { useAuth } from '../lib/auth'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/tasks', label: 'Task List', icon: List },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { openNewTask } = useNewTask()
  const { canEdit } = useAuth()
  const nav = canEdit ? NAV : NAV.filter((item) => item.to !== '/settings')

  // Rail mode = icon-only 68px. Always on mobile; on desktop it's the collapsed
  // state. Expanded (desktop, not collapsed) shows the full 240px panel.
  // Each responsive class is dropped when collapsed so the rail holds at md+ too.
  const railOnly = (expandedMd: string) => (collapsed ? '' : expandedMd)
  const hideLabel = collapsed ? 'hidden' : 'hidden md:inline'

  return (
    <div className="relative hidden shrink-0 md:block">
      <aside
        onClick={onToggle}
        className={cx(
          'flex h-full cursor-pointer flex-col overflow-hidden bg-[var(--sidebar)] transition-[width] duration-200',
          collapsed ? 'w-[68px]' : 'w-[68px] md:w-60',
        )}
      >
        <div
          className={cx(
            'flex h-full shrink-0 flex-col items-center gap-1 py-5',
            collapsed ? 'w-[68px]' : 'w-[68px] md:w-60 md:items-stretch md:px-4',
          )}
        >
          {/* Brand — kept as reserved (invisible) space when collapsed so the nav icons
              don't shift up; the logo + name show in the header instead. Still visible on
              the mobile rail (collapse is desktop-only). */}
          <div className={cx('mb-6 flex items-center gap-3 px-1 md:px-2', collapsed && 'md:invisible')}>
            <img src="/RMIT_red.svg" alt="RMIT" className="h-5 w-auto shrink-0 md:h-7" />
            <div className="hidden min-w-0 whitespace-nowrap md:block">
              <p className="text-sm font-bold leading-tight text-white">GCMC</p>
              <p className="text-[11px] leading-tight text-navy-100">Workload Report</p>
            </div>
          </div>

          <nav className={cx('flex flex-col gap-1.5', railOnly('md:items-stretch'))}>
            {nav.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                title={label}
                onClick={(e) => e.stopPropagation()}
                className={({ isActive }) =>
                  cx(
                    'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                    collapsed ? 'justify-center' : 'justify-center md:justify-start',
                    isActive
                      ? 'bg-white/10 text-white shadow-inner'
                      : 'text-navy-100 hover:bg-white/5 hover:text-white',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className={cx('h-5 w-5 shrink-0', isActive ? 'text-rmit-red' : '')}
                      strokeWidth={2.2}
                    />
                    <span className={hideLabel}>{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {canEdit && (
            <>
              {/* Subtle separator + primary action */}
              <div className="my-3 w-full border-t border-white/10" />
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  openNewTask()
                }}
                className={cx(
                  // Rail mode: a compact square button (aligned with the nav icons),
                  // slightly less rounded. Expands to a full labelled button at md+.
                  'btn-primary h-11 w-11 justify-center !rounded-lg',
                  !collapsed && 'md:h-auto md:w-full md:!rounded-xl md:px-4',
                )}
                title="New Task"
              >
                <Plus className="h-4 w-4 shrink-0" strokeWidth={2.5} />
                <span className={hideLabel}>New Task</span>
              </button>
            </>
          )}

          <div className="flex-1" />

          <div className={cx('px-2 pb-1', collapsed ? 'hidden' : 'hidden md:block')}>
            <p className="text-[11px] leading-relaxed text-navy-200">RMIT GCMC Team</p>
            <p className="mt-0.5 text-[10px] leading-tight text-navy-300">v{__APP_VERSION__}</p>
          </div>
        </div>
      </aside>

      {/* Edge chevron — straddles the sidebar border; direction follows state.
          Hidden on mobile: the sidebar is a fixed rail there and can't be collapsed. */}
      <button
        onClick={onToggle}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute -right-3 top-[26px] z-20 hidden h-6 w-6 items-center justify-center rounded-full border border-line bg-card text-muted shadow-soft transition hover:text-ink md:flex"
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4" strokeWidth={2.4} />
        ) : (
          <ChevronLeft className="h-4 w-4" strokeWidth={2.4} />
        )}
      </button>
    </div>
  )
}

/** Bottom tab bar — the page navigation on mobile, where the sidebar is hidden. */
export function MobileNav() {
  const { openNewTask } = useNewTask()
  const { canEdit } = useAuth()
  const nav = canEdit ? NAV : NAV.filter((item) => item.to !== '/settings')

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-line bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
      {nav.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            cx(
              'flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-semibold transition',
              isActive ? 'text-rmit-red' : 'text-muted hover:text-ink',
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon className="h-5 w-5 shrink-0" strokeWidth={2.2} />
              <span>{label}</span>
              {isActive && <span className="sr-only">(current)</span>}
            </>
          )}
        </NavLink>
      ))}
      {canEdit && (
        <button
          type="button"
          onClick={openNewTask}
          className="flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-semibold text-rmit-red transition hover:opacity-80"
        >
          <Plus className="h-5 w-5 shrink-0" strokeWidth={2.5} />
          <span>New</span>
        </button>
      )}
    </nav>
  )
}
