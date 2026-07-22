import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { cx } from '../../lib/format'

interface MultiSelectProps {
  options: string[]
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  /** Keep chips on one line, collapsing the overflow to a "+N" chip only when they don't fit. */
  overflowCollapse?: boolean
  /** Show a search box atop the dropdown to filter options (for long lists). */
  searchable?: boolean
}

const CHIP_CLS = 'chip shrink-0 bg-navy-50 text-navy-600 dark:bg-white/10 dark:text-navy-100'
const GAP = 6

export function MultiSelect({ options, value, onChange, placeholder = 'Select…', overflowCollapse, searchable }: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const measRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(value.length)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  // Clear the search each time the dropdown closes.
  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  // Measure how many chips fit on one line; collapse the rest into a "+N" chip.
  useLayoutEffect(() => {
    if (!overflowCollapse) {
      setVisibleCount(value.length)
      return
    }
    const row = rowRef.current
    const meas = measRef.current
    if (!row || !meas) return
    const compute = () => {
      const avail = row.clientWidth
      const chips = Array.from(meas.querySelectorAll('[data-chip]')) as HTMLElement[]
      const pillW = (meas.querySelector('[data-pill]') as HTMLElement | null)?.offsetWidth ?? 0

      const total = chips.reduce((sum, el, i) => sum + el.offsetWidth + (i > 0 ? GAP : 0), 0)
      if (total <= avail) {
        setVisibleCount(value.length)
        return
      }
      let used = 0
      let count = 0
      for (let i = 0; i < chips.length; i++) {
        const w = chips[i].offsetWidth + (count > 0 ? GAP : 0)
        if (used + w + pillW + GAP <= avail) {
          used += w
          count++
        } else break
      }
      setVisibleCount(count)
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(row)
    return () => ro.disconnect()
  }, [value, overflowCollapse])

  const toggle = (opt: string) => {
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt])
  }

  const remove = (opt: string, e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(value.filter((v) => v !== opt))
  }

  const shown = overflowCollapse ? value.slice(0, visibleCount) : value
  const hidden = value.length - shown.length

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'input flex min-h-[44px] items-center gap-1.5 text-left',
          // Show the standard field highlight while open (focus moves to the search
          // box, so the button's own :focus ring wouldn't otherwise show).
          open && 'border-rmit-red ring-2 ring-brand-100 dark:ring-brand-500/25',
        )}
      >
        <div
          ref={rowRef}
          className={cx(
            'flex min-w-0 flex-1 items-center gap-1.5',
            overflowCollapse ? 'flex-nowrap overflow-hidden' : 'flex-wrap',
          )}
        >
          {value.length === 0 && <span className="text-faint">{placeholder}</span>}
          {shown.map((v) => (
            <span key={v} className={CHIP_CLS} onClick={(e) => e.stopPropagation()}>
              {v}
              <X className="h-3 w-3 cursor-pointer hover:text-rmit-red" onClick={(e) => remove(v, e)} />
            </span>
          ))}
          {hidden > 0 && <span className={CHIP_CLS}>+{hidden}</span>}
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-faint" />
      </button>

      {/* Hidden row used only to measure natural chip widths for the overflow calc. */}
      {overflowCollapse && (
        <div
          ref={measRef}
          aria-hidden
          className="pointer-events-none invisible absolute left-0 top-0 flex flex-nowrap items-center gap-1.5"
        >
          {value.map((v) => (
            <span key={v} data-chip className={CHIP_CLS}>
              {v}
              <X className="h-3 w-3" />
            </span>
          ))}
          <span data-pill className={CHIP_CLS}>
            +{value.length}
          </span>
        </div>
      )}

      {open && (
        <div className="absolute z-30 mt-1.5 flex max-h-64 w-full flex-col overflow-hidden rounded-xl border border-line bg-card shadow-card">
          {searchable && (
            <div className="relative shrink-0 border-b border-line p-1.5">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="h-8 w-full rounded-lg border border-line bg-subtle pl-8 pr-2 text-sm text-ink outline-none placeholder:text-faint"
              />
            </div>
          )}
          <div className="overflow-auto py-1.5">
          {options.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted">No options — add them in Settings.</p>
          )}
          {options
            .filter((opt) => !query || opt.toLowerCase().includes(query.trim().toLowerCase()))
            .map((opt) => {
            const selected = value.includes(opt)
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-subtle"
              >
                <span className={cx(selected ? 'font-semibold text-ink' : 'text-muted')}>{opt}</span>
                <span
                  className={cx(
                    'flex h-4 w-4 items-center justify-center rounded border',
                    selected ? 'border-rmit-red bg-rmit-red text-white' : 'border-faint',
                  )}
                >
                  {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
              </button>
            )
          })}
          {options.length > 0 &&
            query &&
            !options.some((opt) => opt.toLowerCase().includes(query.trim().toLowerCase())) && (
              <p className="px-3 py-2 text-xs text-muted">No matches for “{query.trim()}”.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
