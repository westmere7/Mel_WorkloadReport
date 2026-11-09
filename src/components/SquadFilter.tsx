import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, ChevronDown } from 'lucide-react'
import { cx } from '../lib/format'
import { withFallback } from '../constants'
import { useStore } from '../data/store'
import { useSquadColor } from './charts'

/** Squads pinned to the top of the list — the two that most often ask for their own view. */
const PINNED = ['DOM', 'INTON']

/** Pages whose sidebar links carry the current `?squad=` along (see Sidebar). */
export const SQUAD_SCOPED_PATHS = ['/', '/tasks', '/calendar']

/**
 * The page-level squad scope, kept in the URL as `?squad=<name>` so a squad's view
 * can be bookmarked or sent, and so the sidebar can carry it between Dashboard, Task
 * List and Calendar. A name that isn't a known squad (stale link after a rename) is
 * ignored → null, never an empty page. `options` = every squad, display order.
 */
export function useSquadParam() {
  const { settings } = useStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const options = useMemo(() => withFallback(settings.squads), [settings.squads])
  const param = searchParams.get('squad')
  const squad = param && options.includes(param) ? param : null
  const setSquad = useCallback(
    (next: string | null) =>
      setSearchParams(
        (prev) => {
          const sp = new URLSearchParams(prev)
          sp.delete('squad')
          if (next) sp.set('squad', next)
          return sp
        },
        { replace: true },
      ),
    [setSearchParams],
  )
  return { squad, setSquad, options }
}

/**
 * Dropdown that scopes a page (Dashboard, Task List, Calendar) to ONE requesting squad. `null` = "All squads"
 * (no filter). Single-select on purpose: a squad view answers "what did GCMC do
 * for us", and the share-of-demand panel compares one squad against the rest.
 * DOM and INTON lead the list; the rest follow A→Z (the fallback "Others" last,
 * as `withFallback` orders it).
 */
export function SquadFilter({
  squads,
  selected,
  onChange,
  summary,
}: {
  /** Every selectable squad, already in display order (e.g. `withFallback(settings.squads)`). */
  squads: string[]
  selected: string | null
  onChange: (next: string | null) => void
  /** Button text when the page has SEVERAL squads selected elsewhere (the Task List's own
      multi-select), e.g. "3 squads" — the button then reads as active with no single pick. */
  summary?: string
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const squadColor = useSquadColor()

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

  const pinned = PINNED.filter((s) => squads.includes(s))
  const rest = squads.filter((s) => !pinned.includes(s))

  const pick = (squad: string | null) => {
    onChange(squad)
    setOpen(false)
  }

  const item = (s: string) => {
    const on = selected === s
    return (
      <button
        key={s}
        type="button"
        onClick={() => pick(s)}
        aria-pressed={on}
        className={cx(
          'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-subtle',
          on ? 'font-semibold text-ink' : 'text-muted hover:text-ink',
        )}
      >
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: squadColor(s) }} />
        <span className="flex-1">{s}</span>
        {on && <Check className="h-4 w-4 shrink-0 text-accent-green" />}
      </button>
    )
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Show one squad's work only"
        aria-expanded={open}
        className={cx(
          'flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm font-semibold text-ink shadow-soft transition',
          // A squad view is a narrowed reading of the whole dashboard — outline it so
          // a screenshot never passes for the all-squads picture.
          selected || summary ? 'border-rmit-red' : 'border-line hover:border-faint',
        )}
      >
        {/* Small inline label, so the header says WHAT each dropdown filters
            without growing taller — screens 1360px+ only: measured, below that the header runs out
            of room and its controls wrap onto a second row. */}
        <span className="hidden text-[10px] font-semibold uppercase tracking-wide text-muted min-[1360px]:inline">Squad</span>
        {selected && (
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: squadColor(selected) }} />
        )}
        {selected ?? summary ?? 'All squads'}
        <ChevronDown className={cx('h-3.5 w-3.5 text-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-40 max-h-[70vh] min-w-[200px] overflow-y-auto rounded-xl border border-line bg-card p-1.5 shadow-lg">
          <button
            type="button"
            onClick={() => pick(null)}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-semibold text-ink transition hover:bg-subtle"
          >
            {/* A neutral bullet like every other row, so "All squads" reads as one of the choices. */}
            <span className="h-2 w-2 shrink-0 rounded-full bg-muted" />
            <span className="flex-1">All squads</span>
            {!selected && !summary && <Check className="h-4 w-4 shrink-0 text-accent-green" />}
          </button>
          {pinned.length > 0 && <div className="my-1 border-t border-line" />}
          {pinned.map(item)}
          {rest.length > 0 && <div className="my-1 border-t border-line" />}
          {rest.map(item)}
        </div>
      )}
    </div>
  )
}
