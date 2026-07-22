import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cx } from '../lib/format'
import { functionColor } from '../constants'
import type { FunctionConfig } from '../types'

/**
 * Dropdown that filters a view by GCMC function. Empty selection = "All GCMC"
 * (no filter). Multi-select: picking functions narrows to their combined slice;
 * clearing all or picking every function snaps back to All GCMC. Shared by the
 * Dashboard and the Task List (both feed the selection to `sliceTasksByFunctions`).
 */
export function FunctionFilter({
  functions,
  selected,
  onChange,
}: {
  functions: FunctionConfig[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  const isAll = selected.length === 0
  const label = isAll ? 'All GCMC' : selected.length === 1 ? selected[0] : `${selected.length} functions`

  const toggleFn = (name: string) => {
    if (isAll) {
      onChange([name])
      return
    }
    const next = selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name]
    // Nothing left, or everything picked → that's just "All GCMC" again.
    onChange(next.length === 0 || next.length >= functions.length ? [] : next)
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Filter by GCMC function"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-1.5 text-sm font-semibold text-ink shadow-soft transition hover:border-faint"
      >
        {!isAll && (
          <span className="flex items-center -space-x-1">
            {functions
              .filter((f) => selected.includes(f.name))
              .map((f) => (
                <span
                  key={f.name}
                  className="h-2.5 w-2.5 rounded-full ring-2 ring-card"
                  style={{ backgroundColor: functionColor(f.color).hex }}
                />
              ))}
          </span>
        )}
        {label}
        <ChevronDown className={cx('h-3.5 w-3.5 text-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-40 min-w-[230px] rounded-xl border border-line bg-card p-1.5 shadow-lg">
          <button
            type="button"
            onClick={() => onChange([])}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-semibold text-ink transition hover:bg-subtle"
          >
            <span className="flex-1">All GCMC</span>
            {isAll && <Check className="h-4 w-4 shrink-0 text-accent-green" />}
          </button>
          <div className="my-1 border-t border-line" />
          {functions.map((f) => {
            const on = selected.includes(f.name)
            return (
              <button
                key={f.name}
                type="button"
                onClick={() => toggleFn(f.name)}
                aria-pressed={on}
                className={cx(
                  'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-subtle',
                  isAll ? 'opacity-50' : on ? 'text-ink' : 'text-muted',
                )}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: functionColor(f.color).hex }} />
                <span className="flex-1">{f.name}</span>
                {on && <Check className="h-4 w-4 shrink-0 text-accent-green" />}
              </button>
            )
          })}
          <p className="mt-1 border-t border-line px-2 pt-1.5 text-[10px] leading-snug text-faint">
            Shared tasks count only the selected functions&rsquo; share of assets.
          </p>
        </div>
      )}
    </div>
  )
}
