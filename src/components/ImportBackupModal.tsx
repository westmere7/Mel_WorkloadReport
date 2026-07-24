import { useMemo, useRef, useState } from 'react'
import { Download, FileUp } from 'lucide-react'
import { Modal } from './ui/Modal'
import { SpanFilter } from './SpanFilter'
import { useStore } from '../data/store'
import { exportTasksCsv, parseTasksCsv } from '../lib/csv'
import { addedOrderMap } from '../lib/analytics'
import { filterBySpan, spanSuffix, taskYears, type SpanMode } from '../lib/span'
import { toMessage } from '../lib/format'
import type { Half, TaskInput } from '../types'

export function ImportBackupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { tasks, settings, importTasks } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)

  const [parsed, setParsed] = useState<TaskInput[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  // Backup span
  const years = useMemo(() => taskYears(tasks), [tasks])
  const [span, setSpan] = useState<SpanMode>('total')
  const [year, setYear] = useState<number | null>(null)
  const [half, setHalf] = useState<Half>('H1')
  const activeYear = year ?? years[0] ?? 0
  const backupTasks = useMemo(
    () => filterBySpan(tasks, span, activeYear, half),
    [tasks, span, activeYear, half],
  )
  // Global add-order (matches the task list's "No.") so the export mirrors it.
  const numbering = useMemo(() => addedOrderMap(tasks), [tasks])

  const readFile = async (file: File) => {
    setError(null)
    setResult(null)
    setParsed(null)
    setFileName(file.name)
    try {
      const inputs = parseTasksCsv(await file.text())
      if (!inputs.length) throw new Error('No task rows found in the file.')
      setParsed(inputs)
    } catch (e) {
      setError(toMessage(e))
    }
  }

  const runImport = async (mode: 'replace' | 'merge') => {
    if (!parsed) return
    if (
      mode === 'replace' &&
      !window.confirm(
        `Replace all ${tasks.length} current tasks with the ${parsed.length} rows from this file? This cannot be undone.`,
      )
    )
      return
    setBusy(true)
    setError(null)
    try {
      const { created, updated } = await importTasks(parsed, mode)
      setResult(
        mode === 'replace'
          ? `Cleaned and loaded ${created} tasks.`
          : `Merged — ${created} added, ${updated} updated.`,
      )
      setParsed(null)
      setFileName('')
      if (fileRef.current) fileRef.current.value = ''
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Import & Backup">
      <div className="space-y-6">
        {/* Import */}
        <section>
          <h3 className="text-sm font-bold text-ink">Import from CSV</h3>
          <p className="mt-0.5 text-xs text-muted">Load a CSV that was exported from this app.</p>

          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void readFile(f)
            }}
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className="btn-outline" onClick={() => fileRef.current?.click()}>
              <FileUp className="h-4 w-4" /> Choose file
            </button>
            {fileName && <span className="max-w-[240px] truncate text-sm text-muted">{fileName}</span>}
          </div>

          {error && <p className="mt-2 text-sm font-medium text-rmit-red">{error}</p>}

          {parsed && (
            <div className="mt-3 rounded-xl border border-line bg-subtle/40 p-3">
              <p className="text-sm text-ink">
                <strong>{parsed.length}</strong> tasks ready. How should they be loaded?
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="btn-primary" disabled={busy} onClick={() => runImport('replace')}>
                  Clean &amp; load all
                </button>
                <button type="button" className="btn-navy" disabled={busy} onClick={() => runImport('merge')}>
                  Only update what&rsquo;s new
                </button>
              </div>
              <p className="mt-2 text-xs text-muted">
                <strong className="text-ink">Clean &amp; load all</strong> deletes every current task first.{' '}
                <strong className="text-ink">Only update what&rsquo;s new</strong> keeps existing tasks, adds new
                codes and refreshes matching ones.
              </p>
            </div>
          )}

          {result && <p className="mt-2 text-sm font-medium text-accent-green">{result}</p>}
        </section>

        <div className="border-t border-line" />

        {/* Backup */}
        <section>
          <h3 className="text-sm font-bold text-ink">Back up to CSV</h3>
          <p className="mt-0.5 text-xs text-muted">
            Download tasks as a CSV you can re-import later. Pick how much to include.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <SpanFilter
              mode={span}
              year={activeYear}
              half={half}
              years={years}
              onMode={setSpan}
              onYear={setYear}
              onHalf={setHalf}
            />
            <span className="text-xs font-semibold text-muted">{backupTasks.length} tasks</span>
          </div>
          <button
            type="button"
            className="btn-primary mt-3"
            disabled={backupTasks.length === 0}
            onClick={() =>
              exportTasksCsv(backupTasks, settings.assetTypes, spanSuffix(span, activeYear, half), numbering)
            }
          >
            <Download className="h-4 w-4" /> Download backup
          </button>
        </section>
      </div>
    </Modal>
  )
}
