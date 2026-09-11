import { useEffect, useId, useRef, useState } from 'react'
import { Check, Loader2, Undo2 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { isMondayWorkloadEnabled, requestMondayWorkload, type MondayWorkloadStatus } from '../lib/mondayWorkload'
import type { Task } from '../types'

/** A deliberate acknowledgement of saved workload, separate from task completion. */
export function MondayWorkloadButton({ task, blockedReason }: { task?: Task; blockedReason?: string }) {
  const { canEdit } = useAuth()
  const descriptionId = useId()
  const [status, setStatus] = useState<MondayWorkloadStatus>({ configured: false })
  const [busy, setBusy] = useState<'status' | 'confirm' | 'unconfirm' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const generation = useRef(0)
  const enabled = isMondayWorkloadEnabled()
  const taskId = task?.id
  const updatedAt = task?.updatedAt
  const mondayUrl = task?.mondayUrl?.trim()

  useEffect(() => {
    const current = ++generation.current
    setStatus({ configured: false })
    setError(null)
    setBusy(null)
    inFlight.current = false
    if (!canEdit || !enabled || !taskId || !updatedAt || !mondayUrl) return
    setBusy('status')
    inFlight.current = true
    requestMondayWorkload(taskId, updatedAt, 'status')
      .then((result) => { if (current === generation.current) setStatus(result) })
      .catch((err: unknown) => {
        if (current === generation.current) setError(err instanceof Error ? err.message : 'Couldn’t check monday.com.')
      })
      .finally(() => {
        if (current === generation.current) { setBusy(null); inFlight.current = false }
      })
    return () => { generation.current++ }
  }, [canEdit, enabled, taskId, updatedAt, mondayUrl])

  // Keep the entire control (including setup/helper text) out of unlinked tasks.
  if (!canEdit || !mondayUrl) return null

  const reason = blockedReason || (!task ? 'Save this task first.'
    : task.draft ? 'Complete and save this draft first.'
    : !mondayUrl ? 'Link this task using monday.com auto-fill first.' : null)
  const setupPending = !enabled || (!busy && !error && !status.configured)
  const entered = status.entered === true
  const description = reason || (setupPending ? 'Setup pending — the monday.com workload column hasn’t been connected yet.'
    : entered ? `${status.columnTitle}: ${status.targetLabel}. Undo sets it to ${status.resetLabel ?? 'TBC'} on monday.com.`
    : status.configured ? `${status.columnTitle}: ${status.currentLabel || 'Not entered'}. Mark as ${status.targetLabel} when workload is recorded.`
    : 'Checks the workload entry status on monday.com.')

  async function run(action: 'status' | 'confirm' | 'unconfirm') {
    if (inFlight.current || !taskId || !updatedAt || reason || !enabled) return
    const current = generation.current
    inFlight.current = true
    setBusy(action)
    setError(null)
    try {
      const result = await requestMondayWorkload(taskId, updatedAt, action)
      if (current === generation.current) setStatus(result)
    } catch (err) {
      if (current === generation.current) {
        setStatus({ configured: false })
        setError(err instanceof Error ? err.message : 'Couldn’t update monday.com. Try again.')
      }
    } finally {
      if (current === generation.current) { setBusy(null); inFlight.current = false }
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border border-line bg-subtle px-3 py-2">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
          <img src="/monday.svg" alt="" className="h-3.5 w-3.5" /> Workload entry
        </p>
        <p id={descriptionId} className="mt-1 text-xs text-muted" role="status">{description}</p>
        {error && <p role="alert" className="mt-1 text-xs text-rmit-red dark:text-brand-300">{error}</p>}
      </div>
      <button
        type="button"
        className="btn-outline min-h-11 shrink-0 rounded-lg px-2.5 py-1.5 text-xs sm:min-h-9"
        aria-describedby={descriptionId}
        aria-busy={Boolean(busy)}
        disabled={Boolean(reason) || Boolean(busy) || setupPending}
        onClick={() => void run(error ? 'status' : entered ? 'unconfirm' : 'confirm')}
      >
        {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          : entered ? <Undo2 aria-hidden="true" className="h-3.5 w-3.5" />
          : <Check aria-hidden="true" className="h-3.5 w-3.5" />}
        {busy === 'confirm' || busy === 'unconfirm' ? 'Updating…' : busy === 'status' ? 'Checking…'
          : error ? 'Retry status check' : entered ? 'Undo entry' : 'Mark entered'}
      </button>
    </div>
  )
}
