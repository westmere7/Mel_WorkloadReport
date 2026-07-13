import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { NewTaskProvider } from './components/NewTaskModal'
import { StoreProvider, useStore } from './data/store'
import { useAuth } from './lib/auth'
import { Dashboard } from './pages/Dashboard'
import { TaskList } from './pages/TaskList'
import { SettingsPage } from './pages/Settings'
import { ShowcasePage } from './pages/Showcase'
import { ShowcaseViewerPage } from './pages/ShowcaseViewer'

export default function App() {
  return (
    <Routes>
      {/* Public, chrome-free showcase viewer — anyone with the link, no sign-in,
          no store mount, no sidebar/header. */}
      <Route path="/showcase/:id" element={<ShowcaseViewerPage />} />

      {/* Everything else runs inside the app shell (store + chrome). */}
      <Route element={<StoreShell />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/tasks" element={<TaskList />} />
        <Route
          path="/showcase"
          element={
            <EditGate>
              <ShowcasePage />
            </EditGate>
          }
        />
        <Route
          path="/settings"
          element={
            <EditGate>
              <SettingsPage />
            </EditGate>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

/** Sign-in gate for edit-only pages (Settings, Showcase wizard). */
function EditGate({ children }: { children: React.ReactNode }) {
  const { canEdit } = useAuth()
  return canEdit ? <>{children}</> : <Navigate to="/" replace />
}

/** The app chrome: store + new-task modal + sidebar/header + data-loading gate. */
function StoreShell() {
  return (
    <StoreProvider>
      <NewTaskProvider>
        <Layout>
          <ShellBody />
        </Layout>
      </NewTaskProvider>
    </StoreProvider>
  )
}

function ShellBody() {
  const { loading, error } = useStore()
  return (
    <>
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
        <Outlet />
      )}
    </>
  )
}
