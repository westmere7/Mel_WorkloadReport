import { NavLink } from 'react-router-dom'
import { LayoutDashboard, FilePlus2, Table2, Settings, type LucideIcon } from 'lucide-react'
import { cx } from '../lib/format'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/new', label: 'New Task', icon: FilePlus2 },
  { to: '/tasks', label: 'Task List', icon: Table2 },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  return (
    <aside className="flex w-[68px] flex-col items-center gap-1 bg-rmit-navy py-5 md:w-60 md:items-stretch md:px-4">
      {/* Brand */}
      <div className="mb-6 flex items-center gap-3 px-1 md:px-2">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rmit-red font-extrabold text-white">
          R
        </div>
        <div className="hidden md:block">
          <p className="text-sm font-bold leading-tight text-white">RMIT</p>
          <p className="text-[11px] leading-tight text-navy-100">Workload Report</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1.5">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cx(
                'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                'justify-center md:justify-start',
                isActive
                  ? 'bg-white/10 text-white shadow-inner'
                  : 'text-navy-100 hover:bg-white/5 hover:text-white',
              )
            }
            title={label}
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

      <div className="hidden px-2 pt-4 md:block">
        <p className="text-[11px] leading-relaxed text-navy-200">
          Melbourne Design Team
        </p>
      </div>
    </aside>
  )
}
