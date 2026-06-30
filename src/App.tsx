import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { useStore } from './data/store'
import { Dashboard } from './pages/Dashboard'
import { TaskInput } from './pages/TaskInput'
import { TaskList } from './pages/TaskList'
import { SettingsPage } from './pages/Settings'

export default function App() {
  const { loading, error } = useStore()

  return (
    <Layout>
      {error && (
        <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300">
          <strong className="font-semibold">Couldn’t load data:</strong> {error}
        </div>
      )}
      {loading ? (
        <div className="flex h-full items-center justify-center text-sm text-muted">
          Loading workload…
        </div>
      ) : (
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/new" element={<TaskInput />} />
          <Route path="/tasks" element={<TaskList />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </Layout>
  )
}
