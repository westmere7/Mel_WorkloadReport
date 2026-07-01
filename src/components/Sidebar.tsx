import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Plus, Table2, Settings, type LucideIcon } from 'lucide-react'
import { cx } from '../lib/format'
import { useNewTask } from './NewTaskModal'

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

export function Sidebar() {
  const { openNewTask } = useNewTask()
  return (
    <aside className="flex w-[68px] flex-col items-center gap-1 border-r border-line bg-[var(--sidebar)] py-5 md:w-60 md:items-stretch md:px-4">
      {/* Brand */}
      <div className="mb-6 flex items-center gap-3 px-1 md:px-2">
        <img src="/RMIT_white.svg" alt="RMIT" className="h-5 w-auto shrink-0 md:h-7" />
        <div className="hidden md:block">
          <p className="text-sm font-bold leading-tight text-white">GCMC</p>
          <p className="text-[11px] leading-tight text-navy-100">Workload Report</p>
        </div>
      </div>

      <nav className="flex flex-col gap-1.5">
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

      {/* Subtle separator + primary action */}
      <div className="my-3 border-t border-white/10" />
      <button
        onClick={openNewTask}
        className="btn-primary w-full justify-center"
        title="New Task"
      >
        <Plus className="h-4 w-4 shrink-0" strokeWidth={2.5} />
        <span className="hidden md:inline">New Task</span>
      </button>

      <div className="flex-1" />

      <div className="hidden px-2 pt-4 md:block">
        <p className="text-[11px] leading-relaxed text-navy-200">
          Melbourne Design Team
        </p>
      </div>
    </aside>
  )
}
