import { useLocation } from 'react-router-dom'
import { Database, HardDrive, Moon, Plus, Sun } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { useStore } from '../data/store'
import { useTheme } from '../lib/theme'
import { useNewTask } from './NewTaskModal'

const TITLES: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard', subtitle: 'Team workload at a glance' },
  '/tasks': { title: 'Task List', subtitle: 'All registered tasks' },
  '/settings': { title: 'Settings', subtitle: 'Manage campaigns, work types and people' },
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const meta = TITLES[pathname] ?? { title: 'Workload Report', subtitle: '' }
  const { backend } = useStore()
  const { theme, toggle } = useTheme()
  const { openNewTask } = useNewTask()

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between gap-4 border-b border-line bg-card px-6 py-4">
          <div>
            <h1 className="text-lg font-bold text-ink">{meta.title}</h1>
            {meta.subtitle && <p className="text-xs text-muted">{meta.subtitle}</p>}
          </div>
          <div className="flex items-center gap-3">
            <span
              className="chip bg-subtle text-muted"
              title={
                backend === 'supabase'
                  ? 'Connected to Supabase cloud database'
                  : 'Running locally (browser storage)'
              }
            >
              {backend === 'supabase' ? (
                <Database className="h-3.5 w-3.5 text-accent-teal" />
              ) : (
                <HardDrive className="h-3.5 w-3.5 text-accent-green" />
              )}
              {backend === 'supabase' ? 'Supabase' : 'Local'}
            </span>
            <button
              onClick={toggle}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-card text-muted transition hover:text-ink"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button onClick={openNewTask} className="btn-primary">
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              <span className="hidden sm:inline">New Task</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
