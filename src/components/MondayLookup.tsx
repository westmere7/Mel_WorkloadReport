import { useEffect, useRef, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { cx, toMessage } from '../lib/format'
import { searchMonday, type MondayHit } from '../lib/monday'

/** monday.com dot-mark (three brand-colour pills). */
function MondayMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none">
      <rect x="3" y="4" width="4.4" height="16" rx="2.2" fill="#E2445C" />
      <rect x="9.8" y="4" width="4.4" height="16" rx="2.2" fill="#FDAB3D" />
      <rect x="16.6" y="4" width="4.4" height="16" rx="2.2" fill="#00C875" />
    </svg>
  )
}

const fmtDate = (iso: string | null): string => {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d} ${months[(m ?? 1) - 1]} ${String(y).slice(2)}`
}

/**
 * A small monday.com logo button that opens a search popover over the configured
 * board. Picking a result calls `onPick` with the normalized hit so the caller
 * can prefill its form. On-demand only — no sync.
 */
export function MondayLookup({ initialQuery = '', onPick }: { initialQuery?: string; onPick: (hit: MondayHit) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(initialQuery)
  const [hits, setHits] = useState<MondayHit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const reqId = useRef(0)

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  // Seed the query from the form when opening, and focus the input.
  useEffect(() => {
    if (open) {
      setQuery((q) => q || initialQuery)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open, initialQuery])

  // Debounced search as the query changes (while open).
  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q.length < 2) {
      setHits([])
      setSearched(false)
      setError(null)
      return
    }
    const id = ++reqId.current
    setLoading(true)
    setError(null)
    const t = setTimeout(async () => {
      try {
        const results = await searchMonday(q)
        if (reqId.current === id) {
          setHits(results)
          setSearched(true)
        }
      } catch (e) {
        if (reqId.current === id) {
          setError(toMessage(e))
          setHits([])
        }
      } finally {
        if (reqId.current === id) setLoading(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [query, open])

  const pick = (hit: MondayHit) => {
    onPick(hit)
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Find on monday.com"
        aria-label="Find on monday.com"
        aria-expanded={open}
        className={cx(
          'flex h-6 w-6 items-center justify-center rounded-md border transition',
          open ? 'border-navy-300 bg-subtle' : 'border-line hover:bg-subtle',
        )}
      >
        <MondayMark className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute left-0 top-8 z-30 w-[340px] rounded-xl border border-line bg-card p-2 shadow-lg">
          <div className="flex items-center gap-2 rounded-lg border border-line px-2.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-faint" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search monday board by name or code…"
              className="h-9 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
            />
            {loading && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted" />}
          </div>

          <div className="mt-2 max-h-[280px] overflow-y-auto">
            {error ? (
              <p className="px-2 py-3 text-xs text-rmit-red">{error}</p>
            ) : query.trim().length < 2 ? (
              <p className="px-2 py-3 text-xs text-faint">Type at least 2 characters to search.</p>
            ) : searched && hits.length === 0 && !loading ? (
              <p className="px-2 py-3 text-xs text-muted">No matching items on the board.</p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {hits.map((hit) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      onClick={() => pick(hit)}
                      className="flex w-full flex-col items-start gap-0.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-subtle"
                    >
                      <span className="line-clamp-1 text-sm font-semibold text-ink">{hit.name || 'Untitled item'}</span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
                        {hit.code ? <span className="font-mono text-ink">{hit.code}</span> : <span className="text-faint">no code</span>}
                        <span>· {fmtDate(hit.startDate)} → {fmtDate(hit.endDate)}</span>
                        {hit.size && <span className="rounded bg-subtle px-1.5 py-px font-semibold text-ink">{hit.size}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="mt-1 border-t border-line px-2 pt-1.5 text-[10px] text-faint">
            Fills name, code, timeline &amp; size. Doesn’t sync — you can edit after.
          </p>
        </div>
      )}
    </div>
  )
}
