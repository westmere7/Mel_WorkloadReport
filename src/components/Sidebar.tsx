import { NavLink } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Plus,
  Settings,
  Table2,
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
  { to: '/tasks', label: 'Task List', icon: Table2 },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { openNewTask } = useNewTask()
  const { canEdit } = useAuth()
  const nav = canEdit ? NAV : NAV.filter((item) => item.to !== '/settings')

  return (
    <div className="relative shrink-0">
      <aside
        className={cx(
          'flex h-full flex-col overflow-hidden bg-[var(--sidebar)] transition-[width] duration-200',
          collapsed ? 'w-0' : 'w-[68px] border-r border-line md:w-60',
        )}
      >
        {/* Fixed-width inner column so content doesn't squish mid-transition.
            Mobile (<md) shows an icon-only rail; md+ shows the full sidebar. */}
        <div className="flex h-full w-[68px] shrink-0 flex-col items-center gap-1 py-5 md:w-60 md:items-stretch md:px-4">
          {/* Brand */}
          <div className="mb-6 flex items-center gap-3 px-1 md:px-2">
            <img src="/RMIT_white.svg" alt="RMIT" className="h-5 w-auto shrink-0 md:h-7" />
            <div className="hidden min-w-0 md:block">
              <p className="text-sm font-bold leading-tight text-white">GCMC</p>
              <p className="text-[11px] leading-tight text-navy-100">Workload Report</p>
            </div>
          </div>

          <nav className="flex flex-col gap-1.5 md:items-stretch">
            {nav.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                title={label}
                className={({ isActive }) =>
                  cx(
                    'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                    'justify-center md:justify-start',
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
                    <span className="hidden md:inline">{label}</span>
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
                onClick={openNewTask}
                className="btn-primary w-full justify-center px-0 md:px-4"
                title="New Task"
              >
                <Plus className="h-4 w-4 shrink-0" strokeWidth={2.5} />
                <span className="hidden md:inline">New Task</span>
              </button>
            </>
          )}

          <div className="flex-1" />

          <div className="hidden px-2 pb-1 md:block">
            <p className="text-[11px] leading-relaxed text-navy-200">Melbourne Design Team</p>
          </div>
        </div>
      </aside>

      {/* Edge chevron — straddles the sidebar border; direction follows state. */}
      <button
        onClick={onToggle}
        title={collapsed ? 'Show sidebar' : 'Hide sidebar'}
        aria-label={collapsed ? 'Show sidebar' : 'Hide sidebar'}
        className="absolute -right-3 top-[26px] z-20 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-card text-muted shadow-soft transition hover:text-ink"
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
