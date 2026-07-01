import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  ChevronsLeft,
  ChevronsRight,
  LayoutDashboard,
  Plus,
  Settings,
  Table2,
  type LucideIcon,
} from 'lucide-react'
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

const STORAGE_KEY = 'mwr.sidebar'

export function Sidebar() {
  const { openNewTask } = useNewTask()
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'collapsed'
    } catch {
      return false
    }
  })

  const toggle = () =>
    setCollapsed((c) => {
      const next = !c
      try {
        localStorage.setItem(STORAGE_KEY, next ? 'collapsed' : 'expanded')
      } catch {
        /* ignore */
      }
      return next
    })

  return (
    <aside
      className={cx(
        'flex shrink-0 flex-col border-r border-line bg-[var(--sidebar)]',
        collapsed ? 'w-8' : 'w-60',
      )}
    >
      {collapsed ? (
        // Fully collapsed — only a slim handle remains to expand it again.
        <button
          onClick={toggle}
          title="Expand sidebar"
          aria-label="Expand sidebar"
          className="flex h-full w-full justify-center pt-5 text-navy-100 transition hover:bg-white/5 hover:text-white"
        >
          <ChevronsRight className="h-5 w-5 shrink-0" strokeWidth={2.2} />
        </button>
      ) : (
        <div className="flex h-full flex-col gap-1 px-4 py-5">
          {/* Brand */}
          <div className="mb-6 flex items-center gap-3 px-2">
            <img src="/RMIT_white.svg" alt="RMIT" className="h-7 w-auto shrink-0" />
            <div className="min-w-0">
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
                title={label}
                className={({ isActive }) =>
                  cx(
                    'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
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
                    <span>{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Subtle separator + primary action */}
          <div className="my-3 w-full border-t border-white/10" />
          <button onClick={openNewTask} className="btn-primary w-full justify-center" title="New Task">
            <Plus className="h-4 w-4 shrink-0" strokeWidth={2.5} />
            <span>New Task</span>
          </button>

          <div className="flex-1" />

          <div className="px-2 pb-2">
            <p className="text-[11px] leading-relaxed text-navy-200">Melbourne Design Team</p>
          </div>

          <button
            onClick={toggle}
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
            className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-navy-100 transition hover:bg-white/5 hover:text-white"
          >
            <ChevronsLeft className="h-5 w-5 shrink-0" strokeWidth={2.2} />
            <span>Collapse</span>
          </button>
        </div>
      )}
    </aside>
  )
}
