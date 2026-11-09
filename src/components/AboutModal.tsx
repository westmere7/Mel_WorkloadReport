import { useNavigate } from 'react-router-dom'
import { BookOpen, Database, HardDrive } from 'lucide-react'
import { Modal } from './ui/Modal'
import { useStore } from '../data/store'
import { APP_VERSION, CHANGELOG } from '../lib/changelog'
import { formatDate } from '../lib/format'

/**
 * "About" — opened by clicking the RMIT logo (sidebar, or the header when the
 * sidebar is collapsed / on mobile). Who the dashboard is for, which build is
 * running and where its data lives: the questions people ask before they trust
 * a number on it.
 */
export function AboutModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { backend, live, tasks } = useStore()
  const navigate = useNavigate()
  const release = CHANGELOG.find((r) => r.version === APP_VERSION) ?? CHANGELOG[0]
  const recorded = tasks.filter((t) => !t.draft).length
  const drafts = tasks.length - recorded

  const row = (label: string, value: React.ReactNode) => (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </>
  )

  return (
    <Modal open={open} onClose={onClose} title="About" widthClass="max-w-md">
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <img src="/RMIT_full.svg" alt="RMIT" className="h-10 w-auto shrink-0 dark:hidden" />
          <img src="/RMIT_red.svg" alt="RMIT" className="hidden h-10 w-auto shrink-0 dark:block" />
          <span className="h-9 border-l border-line" aria-hidden="true" />
          <div>
            <p className="text-lg font-bold leading-tight text-ink">GCMC Dashboard</p>
            <p className="text-xs text-muted">RMIT GCMC design team</p>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-muted">
          The team&rsquo;s single record of creative work: every task GCMC is briefed on, the deliverables
          that come out of it, who asked for it, who made it and when. From that record it builds the
          dashboard, the task list and the calendar — so workload can be shown, planned for and compared
          fairly, by function and by squad.
        </p>

        {/* Kept small on purpose — reference facts, not the point of the dialog. */}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg bg-subtle px-3 py-2 text-xs">
          {row(
            'Version',
            <>
              v{APP_VERSION}
              {release?.date && <span className="text-muted"> · {formatDate(release.date)}</span>}
              {release?.title && <span className="text-muted"> · {release.title}</span>}
            </>,
          )}
          {row(
            'Data',
            <span className="inline-flex items-center gap-1.5">
              {backend === 'supabase' ? (
                <Database className="h-3 w-3 text-muted" />
              ) : (
                <HardDrive className="h-3 w-3 text-muted" />
              )}
              {backend === 'supabase' ? 'Supabase' : 'This browser only'}
              <span className="text-muted">·</span>
              <span className={live ? 'h-1.5 w-1.5 rounded-full bg-accent-green' : 'h-1.5 w-1.5 rounded-full bg-faint'} />
              <span className="text-muted">{live ? 'live' : 'not live'}</span>
            </span>,
          )}
          {row(
            'Recorded',
            <>
              {recorded.toLocaleString()} tasks
              {drafts > 0 && <span className="text-muted"> + {drafts} draft{drafts === 1 ? '' : 's'}</span>}
            </>,
          )}
        </dl>

        <button
          type="button"
          onClick={() => {
            onClose()
            navigate('/help')
          }}
          className="btn-outline self-start"
        >
          <BookOpen className="h-4 w-4" /> Read the guide
        </button>
      </div>
    </Modal>
  )
}
