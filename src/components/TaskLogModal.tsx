import { History } from 'lucide-react'
import { Modal } from './ui/Modal'
import { cx } from '../lib/format'
import type { Task, TaskLogEntry } from '../types'

/**
 * Dedicated per-task edit-log view — every recorded create/edit with its
 * timestamp, author and field-level changes, newest first. The log lives on the
 * task itself (see lib/taskLog.ts), so it's deleted along with the task.
 */

const ACTION: Record<TaskLogEntry['action'], { label: string; cls: string }> = {
  created: { label: 'Created', cls: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300' },
  updated: { label: 'Edited', cls: 'bg-navy-100 text-navy-700 dark:bg-navy-500/25 dark:text-navy-100' },
  imported: { label: 'Imported', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
}

/** Human date + time, e.g. "24 Jul 2026, 2:05 pm". */
function fmtWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

export function TaskLogModal({ task, open, onClose }: { task: Task | null; open: boolean; onClose: () => void }) {
  // Newest first for reading; entries are stored oldest→newest.
  const entries = [...(task?.log ?? [])].reverse()

  return (
    <Modal
      open={open && !!task}
      onClose={onClose}
      title={
        <span className="flex min-w-0 items-center gap-2">
          <History className="h-4 w-4 shrink-0 text-muted" />
          <span className="truncate">Edit log — {task?.name || task?.code || 'task'}</span>
        </span>
      }
      footer={
        <button type="button" className="btn-outline" onClick={onClose}>
          Close
        </button>
      }
    >
      {entries.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-sm text-muted">
          No edits recorded yet — the log starts with the first change made after logging was introduced.
        </p>
      ) : (
        <ol className="max-h-[26rem] space-y-2.5 overflow-y-auto pr-1">
          {entries.map((e, i) => (
            <li key={`${e.at}-${i}`} className="rounded-xl border border-line bg-subtle/40 p-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span
                  className={cx(
                    'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                    (ACTION[e.action] ?? ACTION.updated).cls,
                  )}
                >
                  {(ACTION[e.action] ?? ACTION.updated).label}
                </span>
                <span className="font-semibold text-ink">{fmtWhen(e.at)}</span>
                {e.by && <span className="text-muted">by {e.by}</span>}
              </div>
              {e.changes && e.changes.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 pl-1 text-xs leading-relaxed text-muted">
                  {e.changes.map((c, j) => (
                    <li key={j} className="flex items-start gap-1.5">
                      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-faint" />
                      <span className="min-w-0">{c}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </Modal>
  )
}
