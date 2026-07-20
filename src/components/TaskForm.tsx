import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, CalendarClock, ChevronDown, ChevronUp, ImagePlus, Loader2, Sparkles, Trash2, X } from 'lucide-react'
import type { AssetBreakdown, Half, Size, Squad, Task, TaskImage, TaskInput } from '../types'
import {
  SQUAD_DESCRIPTIONS,
  SIZES,
  SIZE_DESCRIPTIONS,
  SIZE_COLORS,
  formatDurationDays,
  withFallback,
} from '../constants'
import { useStore } from '../data/store'
import { MultiSelect } from './ui/MultiSelect'
import { ImageLightbox } from './ui/ImageLightbox'
import { addDaysISO, cx, toMessage } from '../lib/format'
import { compressToWebP, ACCEPTED_IMAGE_TYPES } from '../lib/image'
import { deriveHalf, parseTaskCode, type ParsedCode } from '../lib/taskCode'
import { isMondayLookupEnabled, resolvePeopleFromMonday, searchMonday, type MondayHit } from '../lib/monday'

const MAX_IMAGES = 10

interface TaskFormProps {
  initial?: Task
  submitLabel: string
  onSubmit: (input: TaskInput) => Promise<void> | void
  onCancel?: () => void
  onDelete?: () => void
}

function sumBreakdown(b: AssetBreakdown): number {
  return Object.values(b).reduce((acc, v) => acc + (Number(v) || 0), 0)
}

/**
 * Stable, order-independent signature of a task's editable fields, normalised
 * the same way `onSubmit` normalises them (trimmed strings, non-zero assets,
 * sorted multi-selects). Comparing two signatures tells us whether anything
 * actually changed — used to keep "Save changes" disabled until it did.
 */
function taskSignature(f: {
  squad: string
  campaign: string
  code: string
  name: string
  types: string[]
  people: string[]
  assetBreakdown: AssetBreakdown
  startDate: string | null
  endDate: string | null
  half: Half
  size: Size
  note: string
  images: string[]
}): string {
  return JSON.stringify({
    squad: f.squad,
    campaign: f.campaign.trim(),
    code: f.code.trim(),
    name: f.name.trim(),
    types: [...f.types].sort(),
    people: [...f.people].sort(),
    breakdown: Object.entries(f.assetBreakdown)
      .filter(([, v]) => Number(v) > 0)
      .map(([k, v]) => `${k}=${Number(v)}`)
      .sort(),
    startDate: f.startDate || null,
    endDate: f.endDate || null,
    half: f.half,
    size: f.size,
    note: f.note.trim(),
    images: [...f.images].sort(),
  })
}

/**
 * Safely evaluate a basic arithmetic expression (+ - * / and parentheses, with
 * unary +/-). Returns null if the expression is invalid. No eval/Function.
 */
function evalMath(input: string): number | null {
  const s = input.trim()
  if (s === '') return 0
  const tokens: Array<number | string> = []
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (c === ' ') {
      i++
    } else if ('+-*/()'.includes(c)) {
      tokens.push(c)
      i++
    } else if (/[0-9.]/.test(c)) {
      let num = ''
      while (i < s.length && /[0-9.]/.test(s[i])) num += s[i++]
      const n = Number(num)
      if (!Number.isFinite(n)) return null
      tokens.push(n)
    } else {
      return null
    }
  }
  // Shunting-yard → RPN
  const prec: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 }
  const out: Array<number | string> = []
  const ops: string[] = []
  let prev: 'num' | 'op' | 'open' | null = null
  for (const tok of tokens) {
    if (typeof tok === 'number') {
      out.push(tok)
      prev = 'num'
    } else if (tok === '(') {
      ops.push(tok)
      prev = 'open'
    } else if (tok === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') out.push(ops.pop() as string)
      if (ops.pop() !== '(') return null
      prev = 'num'
    } else {
      if ((tok === '-' || tok === '+') && prev !== 'num') out.push(0) // unary
      while (ops.length && ops[ops.length - 1] !== '(' && prec[ops[ops.length - 1]] >= prec[tok])
        out.push(ops.pop() as string)
      ops.push(tok)
      prev = 'op'
    }
  }
  while (ops.length) {
    const op = ops.pop() as string
    if (op === '(') return null
    out.push(op)
  }
  // Evaluate RPN
  const st: number[] = []
  for (const tok of out) {
    if (typeof tok === 'number') {
      st.push(tok)
      continue
    }
    const b = st.pop()
    const a = st.pop()
    if (a === undefined || b === undefined) return null
    st.push(tok === '+' ? a + b : tok === '-' ? a - b : tok === '*' ? a * b : a / b)
  }
  return st.length === 1 && Number.isFinite(st[0]) ? st[0] : null
}

/**
 * A count input that accepts basic math (e.g. "3+2") — evaluated on blur/Enter —
 * and responds to the mouse wheel on hover (no focus needed) to bump the value
 * up/down. The wheel listener is non-passive so the page doesn't scroll.
 */
function AssetInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const boxRef = useRef<HTMLLabelElement>(null)
  const [draft, setDraft] = useState<string | null>(null) // null → show the committed value
  const stateRef = useRef({ value, onChange })
  stateRef.current = { value, onChange }

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { value: v, onChange: cb } = stateRef.current
      cb(Math.max(0, v + (e.deltaY < 0 ? 1 : -1)))
      setDraft(null)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const commit = () => {
    if (draft === null) return
    const result = evalMath(draft)
    if (result !== null) onChange(Math.max(0, Math.round(result)))
    setDraft(null) // revert to the committed value (discards an invalid expression)
  }

  // Stepper / wheel bump: adjust the committed value and drop any in-progress draft.
  const bump = (delta: number) => {
    onChange(Math.max(0, value + delta))
    setDraft(null)
  }

  const active = value > 0
  // While typing a math expression, hide the label and widen the field so the
  // whole expression is visible; the label returns once it's calculated/blurred.
  // (Scroll-to-bump clears the draft, so the label stays put while scrolling.)
  const editingMath = draft !== null && /[-+*/()]/.test(draft)
  return (
    <label
      ref={boxRef}
      title={label}
      className={cx(
        'flex cursor-text items-center gap-2 rounded-xl px-3 py-2 transition focus-within:ring-2 focus-within:ring-brand-100 dark:focus-within:ring-brand-500/25',
        active
          ? 'bg-navy-100/60 text-navy-700 dark:border dark:border-navy-300 dark:bg-navy-300 dark:text-white'
          : 'bg-subtle text-muted hover:text-ink dark:border dark:border-line dark:bg-card dark:hover:border-navy-300',
      )}
    >
      {!editingMath && <span className="min-w-0 flex-1 truncate text-xs font-medium">{label}</span>}
      <input
        type="text"
        title="Type a number or basic math, e.g. 3+2"
        className={cx(
          'border-0 bg-transparent p-0 text-sm font-bold text-inherit outline-none focus:outline-none',
          editingMath ? 'w-24 text-left' : 'w-11 shrink-0 text-right',
        )}
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
        }}
      />
      {/* Stepper — quick ±1 without focusing the field (mouse-wheel on hover also works). */}
      <span className="-mr-1 flex shrink-0 flex-col">
        <button
          type="button"
          tabIndex={-1}
          title={`Increase ${label}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => bump(1)}
          className="flex h-3.5 w-4 cursor-pointer items-center justify-center rounded opacity-50 transition hover:opacity-100"
        >
          <ChevronUp className="h-3 w-3" strokeWidth={3} />
        </button>
        <button
          type="button"
          tabIndex={-1}
          disabled={value <= 0}
          title={`Decrease ${label}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => bump(-1)}
          className="flex h-3.5 w-4 cursor-pointer items-center justify-center rounded opacity-50 transition hover:opacity-100 disabled:opacity-20"
        >
          <ChevronDown className="h-3 w-3" strokeWidth={3} />
        </button>
      </span>
    </label>
  )
}

/** Pick black or white text for a coloured background, by perceived luminance. */
function readableOn(hex: string): string {
  const c = hex.replace('#', '')
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#1c1c28' : '#ffffff'
}

/**
 * Split a leading "[code] name" ONLY when the bracket holds a code we recognise
 * (a real task-code date format, per `parseTaskCode`). Misc bracket prefixes
 * like "[2026 H2 BPX VE] Trades Fleet Car Wrap" aren't codes — the whole string
 * (bracket included) stays as the name.
 */
function splitPastedName(value: string): { code?: string; name: string } {
  const m = value.match(/^\s*\[([^\]]+)\]\s*(.*)$/)
  if (m && parseTaskCode(m[1].trim()).valid) return { code: m[1].trim(), name: m[2] }
  return { name: value }
}

/** "12 Mar 26 → 20 Jun 26" style range for a monday result row. */
function fmtMondayRange(start: string | null, end: string | null): string {
  const fmt = (iso: string | null) => {
    if (!iso) return '—'
    const [y, m, d] = iso.split('-').map(Number)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${d} ${months[(m ?? 1) - 1]} ${String(y).slice(2)}`
  }
  return `${fmt(start)} → ${fmt(end)}`
}

/**
 * Combined identity field — one box for the task code + name (replaces the old
 * two-box row). The code shows as a colour-coded chip on the left (green valid /
 * amber legacy / red error), the rest is the name. Type or paste "[26.0716.A]
 * Name" and the leading bracket lifts into the chip; × clears it; clicking the
 * chip re-opens it for editing.
 *
 * When monday lookup is enabled, an "auto-fill" button sits inline on the right.
 * Clicking it searches monday for whatever is in the field (code + name) and
 * drops the matches (name · code · timeline · size, plus loading/not-found)
 * right under the box; picking one fills the task via `onPick`.
 */
function CodeNameField({
  code,
  name,
  parsed,
  codeError,
  filledIdentity,
  applyIdentity,
  setCode,
  setName,
  mondayEnabled,
  onPick,
}: {
  code: string
  name: string
  parsed: ParsedCode
  codeError: string | null
  /** True when name/code were just auto-filled from monday (green dot). */
  filledIdentity: boolean
  /** Lift a raw "[code] name" string into code + name (the form's onNameChange). */
  applyIdentity: (raw: string) => void
  setCode: (v: string) => void
  setName: (v: string) => void
  mondayEnabled: boolean
  onPick: (hit: MondayHit) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [editing, setEditing] = useState(false)
  const hasCode = code.trim().length > 0

  // monday auto-fill dropdown state.
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hits, setHits] = useState<MondayHit[] | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const query = [name.trim(), code.trim()].filter(Boolean).join(' ')

  const runSearch = async () => {
    setOpen(true)
    setSearchError(null)
    setHits(null)
    setLoading(true)
    try {
      setHits(await searchMonday(query))
    } catch (e) {
      setSearchError(toMessage(e))
    } finally {
      setLoading(false)
    }
  }

  // Close the dropdown on outside click / Escape.
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

  const chipCls = codeError
    ? 'bg-rmit-red/10 text-rmit-red border-rmit-red/40'
    : parsed.legacy
      ? 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30'
      : 'bg-accent-green/10 text-accent-green border-accent-green/40'
  const chipTitle = codeError
    ? codeError
    : parsed.valid && parsed.iso
      ? `${parsed.legacy ? 'Legacy format · ' : ''}Booked ${parsed.iso}`
      : undefined

  // Re-open the chip as editable "[code] name" text at the front of the field.
  const editCode = () => {
    const raw = `[${code}] ${name}`.trimEnd()
    const codeLen = code.length
    setEditing(true)
    setCode('')
    setName(raw)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (el) {
        el.focus()
        el.setSelectionRange(1, 1 + codeLen) // select the code inside the brackets
      }
    })
  }

  const commitEdit = () => {
    if (!editing) return
    applyIdentity(inputRef.current?.value ?? name)
    setEditing(false)
  }

  return (
    <div>
      <label className={cx('label', filledIdentity && 'is-filled')}>Task code &amp; name</label>
      <div ref={wrapRef} className="relative">
        <div
          className="flex h-12 items-center gap-2 rounded-xl border border-line bg-card px-2.5 transition focus-within:border-rmit-red focus-within:ring-2 focus-within:ring-brand-100 dark:focus-within:ring-brand-500/25"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) inputRef.current?.focus()
          }}
        >
          {hasCode && !editing && (
            <span
              className={cx(
                'inline-flex shrink-0 items-center gap-1 rounded-lg border py-1 pl-2 pr-1 font-mono text-sm font-semibold',
                chipCls,
              )}
              title={chipTitle}
            >
              <button type="button" onClick={editCode} className="max-w-[11rem] truncate outline-none" title="Edit code">
                {code}
              </button>
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setCode('')}
                className="rounded p-0.5 opacity-70 transition hover:opacity-100"
                aria-label="Remove code"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          <input
            ref={inputRef}
            className="h-full min-w-0 flex-1 bg-transparent text-base font-semibold text-ink outline-none placeholder:font-normal placeholder:text-faint"
            placeholder={hasCode ? 'Task name' : 'Task name — or paste “[26.0716.A] Name”'}
            value={name}
            onChange={(e) => (editing ? setName(e.target.value) : applyIdentity(e.target.value))}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (editing && e.key === 'Enter') {
                e.preventDefault()
                commitEdit()
              } else if (!editing && hasCode && e.key === 'Backspace') {
                const el = e.currentTarget
                if (el.selectionStart === 0 && el.selectionEnd === 0) {
                  e.preventDefault()
                  editCode()
                }
              }
            }}
          />
          {mondayEnabled && (
            <button
              type="button"
              onClick={runSearch}
              disabled={loading || !query}
              title="Search monday.com for this task and auto-fill"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs font-semibold text-ink transition hover:bg-subtle disabled:opacity-40"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <img src="/monday.svg" alt="" className="h-4 w-4" />
              )}
              auto-fill
            </button>
          )}
        </div>

        {open && (
          <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 rounded-xl border border-line bg-card p-1.5 shadow-lg">
            {loading ? (
              <p className="flex items-center gap-2 px-2 py-3 text-xs text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching monday…
              </p>
            ) : searchError ? (
              <p className="px-2 py-3 text-xs text-rmit-red">{searchError}</p>
            ) : hits && hits.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted">No matches on the board for “{query}”.</p>
            ) : hits ? (
              <ul className="flex max-h-[300px] flex-col gap-0.5 overflow-y-auto">
                {hits.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onPick(h)
                        setOpen(false)
                      }}
                      className="flex w-full flex-col items-start gap-0.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-subtle"
                    >
                      <span className="line-clamp-1 text-sm font-semibold text-ink">{h.name || 'Untitled item'}</span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
                        {h.code ? (
                          <span className="font-mono text-ink">{h.code}</span>
                        ) : (
                          <span className="text-faint">no code</span>
                        )}
                        <span>· {fmtMondayRange(h.startDate, h.endDate)}</span>
                        {h.size && <span className="rounded bg-subtle px-1.5 py-px font-semibold text-ink">{h.size}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </div>

      {codeError ? (
        <p className="mt-1.5 text-xs font-medium text-rmit-red">{codeError}</p>
      ) : parsed.valid && parsed.iso ? (
        <p className="mt-1.5 text-xs text-accent-green">
          {parsed.legacy ? 'Legacy format · ' : ''}Booked {parsed.iso}
        </p>
      ) : (
        <p className="mt-1.5 text-xs text-faint">
          Optional code goes in [brackets] at the front; the rest is the task name.
        </p>
      )}
    </div>
  )
}

/** A titled group of form fields, with a divider above (except the first). Can
 *  show an inline action beside the title and be made collapsible. */
function Section({
  title,
  first,
  action,
  collapsible = false,
  defaultOpen = true,
  children,
}: {
  title?: string
  first?: boolean
  action?: ReactNode
  collapsible?: boolean
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={cx('space-y-4', !first && 'border-t border-line pt-5')}>
      {(title || action) && (
        <div className="flex items-center gap-2.5">
          {collapsible && title ? (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="-my-1 flex items-center gap-1.5 py-1 text-sm font-bold text-ink"
            >
              {title}
              <ChevronDown
                className={cx('h-4 w-4 text-muted transition-transform', !open && '-rotate-90')}
              />
            </button>
          ) : (
            title && <h3 className="text-sm font-bold text-ink">{title}</h3>
          )}
          {action}
        </div>
      )}
      {(!collapsible || open) && children}
    </section>
  )
}

export function TaskForm({ initial, submitLabel, onSubmit, onCancel, onDelete }: TaskFormProps) {
  const { settings, tasks, supportsImages, uploadImage, deleteImage } = useStore()

  // Editable lists always include the reserved "Others" fallback as an option.
  const squadOptions = withFallback(settings.squads)
  const campaignOptions = withFallback(settings.campaigns)
  const typeOptions = withFallback(settings.types)
  const peopleOptions = withFallback(settings.people)
  const assetTypeOptions = withFallback(settings.assetTypes)

  const [squad, setSquad] = useState<Squad>(initial?.squad ?? settings.squads[0] ?? 'Others')
  const [campaign, setCampaign] = useState<string>(initial?.campaign ?? settings.campaigns[0] ?? '')
  const [code, setCode] = useState(initial?.code ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [types, setTypes] = useState<string[]>(initial?.types ?? [])
  const [people, setPeople] = useState<string[]>(initial?.people ?? [])
  const [breakdown, setBreakdown] = useState<AssetBreakdown>(() =>
    Object.fromEntries(assetTypeOptions.map((n) => [n, initial?.assetBreakdown?.[n] ?? 0])),
  )
  const [startDate, setStartDate] = useState<string>(initial?.startDate ?? '')
  const [startDateTouched, setStartDateTouched] = useState(Boolean(initial?.startDate))
  const [endDate, setEndDate] = useState<string>(initial?.endDate ?? '')
  const [endDateTouched, setEndDateTouched] = useState(Boolean(initial?.endDate))
  const [half, setHalf] = useState<Half>(initial?.half ?? 'H1')
  const [halfTouched, setHalfTouched] = useState(Boolean(initial))
  const [size, setSize] = useState<Size>(initial?.size ?? 'M')
  // Which fields were just auto-filled from monday.com (drives the green field dots).
  // Keys: 'identity' (code+name), 'startDate', 'endDate', 'size'. Cleared when the
  // user edits that field, so a green dot only means "as auto-filled, untouched".
  const [filled, setFilled] = useState<Set<string>>(() => new Set())
  const clearFilled = (key: string) =>
    setFilled((prev) => {
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  const [note, setNote] = useState(initial?.note ?? '')
  const [images, setImages] = useState<TaskImage[]>(initial?.images ?? [])
  const [uploading, setUploading] = useState(0)
  const [imgError, setImgError] = useState<string | null>(null)
  const [imagesOpen, setImagesOpen] = useState(false) // show the Demo (images) sub-panel
  const [lightbox, setLightbox] = useState<string | null>(null) // enlarged image URL
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  // Image bookkeeping for orphan cleanup. `sessionIds` = everything uploaded in
  // this form session; `initialIds` = what the task already had. Storage deletes
  // are deferred to save/cancel so cancelling truly discards all changes.
  const fileInputRef = useRef<HTMLInputElement>(null)
  const sessionIds = useRef<Set<string>>(new Set())
  const initialIds = useRef<Set<string>>(new Set((initial?.images ?? []).map((i) => i.id)))
  const imagesRef = useRef<TaskImage[]>(images)
  imagesRef.current = images
  const finalized = useRef(false) // true once save/cancel has reconciled deletions

  const canAddImages = images.length + uploading < MAX_IMAGES

  const addFiles = async (files: FileList) => {
    setImgError(null)
    const remaining = MAX_IMAGES - images.length - uploading
    const chosen = Array.from(files).slice(0, Math.max(0, remaining))
    if (chosen.length === 0) return
    setUploading((n) => n + chosen.length)
    await Promise.all(
      chosen.map(async (file) => {
        try {
          const { blob, width, height } = await compressToWebP(file)
          const img = await uploadImage(blob, width, height)
          sessionIds.current.add(img.id)
          setImages((prev) => [...prev, img])
        } catch (e) {
          setImgError(toMessage(e))
        } finally {
          setUploading((n) => n - 1)
        }
      }),
    )
  }

  // Removing only drops it from the form; the storage delete happens on save.
  const removeImage = (id: string) => setImages((prev) => prev.filter((i) => i.id !== id))

  // Fire-and-forget storage deletes (best-effort; never blocks the UI).
  const purge = (ids: Iterable<string>) => {
    for (const id of ids) void deleteImage(id).catch(() => {})
  }

  // After a successful save, delete images that are no longer part of the task
  // (removed originals + added-then-removed uploads).
  const reconcileSaved = (finalIds: Set<string>) => {
    finalized.current = true
    const orphans = [...initialIds.current, ...sessionIds.current].filter((id) => !finalIds.has(id))
    purge(orphans)
  }

  const handleCancel = () => {
    finalized.current = true
    purge(sessionIds.current) // nothing this session was committed
    onCancel?.()
  }

  // Safety net: if the form unmounts (e.g. modal X / Esc) without an explicit
  // save or cancel, clean up anything uploaded this session.
  useEffect(() => {
    return () => {
      if (!finalized.current) purge(sessionIds.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const parsed = useMemo(() => parseTaskCode(code), [code])
  const breakdownSum = useMemo(() => sumBreakdown(breakdown), [breakdown])

  // "Created" metadata shown beside the delete button when editing an existing task.
  const createdMeta = useMemo(() => {
    if (!initial?.createdAt) return null
    const d = new Date(initial.createdAt)
    if (Number.isNaN(d.getTime())) return null
    const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    return `${date}, ${time}`
  }, [initial])

  // End date estimated from start date + the (configurable) size duration.
  const suggestedEnd = useMemo(
    () => (startDate ? addDaysISO(startDate, settings.sizeDurations[size]) : ''),
    [startDate, size, settings.sizeDurations],
  )
  const durationLabel = formatDurationDays(settings.sizeDurations[size])
  // Auto-fill the end date from the estimate until the user sets it themselves.
  useEffect(() => {
    if (!endDateTouched && suggestedEnd) setEndDate(suggestedEnd)
  }, [suggestedEnd, endDateTouched])
  const endIsAuto = Boolean(suggestedEnd) && !endDateTouched && endDate === suggestedEnd

  // Live notice for the task code: wrong format or already used by another task.
  const codeError = useMemo(() => {
    const c = code.trim()
    if (!c) return null
    if (!parsed.valid) return 'Code must look like 26.0608.A (YY.MMDD.seq).'
    const dup = tasks.some(
      (t) => t.id !== initial?.id && t.code.trim().toUpperCase() === c.toUpperCase(),
    )
    if (dup) return 'This code is already used by another task.'
    return null
  }, [code, parsed, tasks, initial])

  const setBreakdownField = (key: string, value: number) => {
    setBreakdown((prev) => ({ ...prev, [key]: Math.max(0, value || 0) }))
  }

  // Auto-fill the start date from a valid code — unless the user has set it themselves.
  const fillDateFromCode = (codeValue: string) => {
    const p = parseTaskCode(codeValue)
    if (p.valid && p.iso && !startDateTouched) {
      setStartDate(p.iso)
      if (!halfTouched) setHalf(deriveHalf(p.iso))
    }
  }

  // Pasting "[26.0608.A] ISC Roadshow 2026…" pulls the code out and fills it + the date.
  // Also the single-field parser: a leading "[code]" lifts into the code, the rest is the name.
  const onNameChange = (value: string) => {
    clearFilled('identity')
    const parts = splitPastedName(value)
    if (parts.code !== undefined) {
      setCode(parts.code)
      setName(parts.name)
      fillDateFromCode(parts.code)
    } else {
      setName(value)
    }
  }

  const onStartDateChange = (value: string) => {
    clearFilled('startDate')
    setStartDate(value)
    setStartDateTouched(true)
    if (!halfTouched) setHalf(deriveHalf(value || null))
  }

  const onEndDateChange = (value: string) => {
    clearFilled('endDate')
    setEndDate(value)
    setEndDateTouched(true)
  }

  // Snap the end date back to the size-based estimate and re-enable auto-fill.
  const applyEstimatedEnd = () => {
    if (!suggestedEnd) return
    setEndDate(suggestedEnd)
    setEndDateTouched(false)
  }

  const applyDateFromCode = () => {
    if (parsed.valid && parsed.iso) {
      setStartDate(parsed.iso)
      setStartDateTouched(true)
      if (!halfTouched) setHalf(deriveHalf(parsed.iso))
    }
  }

  // Prefill from a monday.com board item (name, code, timeline → dates, size).
  // On-demand only; every field stays editable afterwards.
  const mondayEnabled = useMemo(isMondayLookupEnabled, [])
  const applyMondayHit = (hit: MondayHit) => {
    setName(hit.name)
    if (hit.code) setCode(hit.code)
    if (hit.startDate) {
      setStartDate(hit.startDate)
      setStartDateTouched(true)
      if (!halfTouched) setHalf(deriveHalf(hit.startDate))
    } else if (hit.code) {
      // No timeline on the item — fall back to the code-derived start date.
      fillDateFromCode(hit.code)
    }
    if (hit.endDate) {
      setEndDate(hit.endDate)
      setEndDateTouched(true)
    }
    if (hit.size) setSize(hit.size)
    // Map monday assignees → app people via the Settings monday-id map.
    const resolvedPeople = resolvePeopleFromMonday(hit.mondayPeopleIds, settings.peopleMondayIds, settings.people)
    if (resolvedPeople.length) setPeople(resolvedPeople)
    // Green-dot the fields this fill actually populated.
    setFilled(
      new Set([
        'identity',
        ...(hit.startDate ? ['startDate'] : []),
        ...(hit.endDate ? ['endDate'] : []),
        ...(hit.size ? ['size'] : []),
        ...(resolvedPeople.length ? ['people'] : []),
      ]),
    )
  }

  // The code is optional; if given, it must still be valid & unique. Everything
  // else — including start and end dates — is required, and total assets must be positive.
  const validate = (): string[] => {
    const errs: string[] = []
    if (codeError) errs.push(codeError)
    if (!name.trim()) errs.push('Task name is required.')
    if (!squad) errs.push('Squad is required.')
    if (!campaign) errs.push('Campaign is required.')
    if (types.length === 0) errs.push('Select at least one work type.')
    if (breakdownSum <= 0) errs.push('Total assets must be greater than 0.')
    if (people.length === 0) errs.push('Assign at least one person in charge.')
    if (!startDate) errs.push('Start date is required.')
    if (!endDate) errs.push('End date is required.')
    else if (startDate && endDate < startDate) errs.push('End date must be on or after the start date.')
    return errs
  }

  // Recomputed each render so the submit button greys out until the form is valid.
  const canSubmit = validate().length === 0

  // When editing, keep "Save changes" disabled until a field actually differs
  // from the loaded task. (New tasks have no baseline, so they're always "dirty".)
  const initialSig = useMemo(
    () =>
      initial
        ? taskSignature({
            squad: initial.squad,
            campaign: initial.campaign,
            code: initial.code,
            name: initial.name,
            types: initial.types,
            people: initial.people,
            assetBreakdown: initial.assetBreakdown,
            startDate: initial.startDate ?? null,
            endDate: initial.endDate ?? null,
            half: initial.half,
            size: initial.size,
            note: initial.note ?? '',
            images: (initial.images ?? []).map((i) => i.id),
          })
        : null,
    [initial],
  )
  const dirty =
    !initial ||
    taskSignature({
      squad,
      campaign,
      code,
      name,
      types,
      people,
      assetBreakdown: breakdown,
      startDate: startDate || null,
      endDate: endDate || null,
      half,
      size,
      note,
      images: images.map((i) => i.id),
    }) !== initialSig

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate()
    setErrors(errs)
    if (errs.length) return
    setSubmitting(true)
    // Claim cleanup for this save up-front, so if the modal closes during/after
    // submit the unmount handler won't purge images we're about to keep. Released
    // again only if the save fails (so a later cancel can still clean up).
    finalized.current = true
    try {
      await onSubmit({
        squad,
        campaign: campaign.trim(),
        code: code.trim(),
        name: name.trim(),
        types,
        assetTotal: breakdownSum,
        assetBreakdown: breakdown,
        people,
        startDate: startDate || null,
        endDate: endDate || null,
        half,
        size,
        note: note.trim(),
        images,
      })
      reconcileSaved(new Set(images.map((i) => i.id)))
    } catch (err) {
      finalized.current = false // save failed — let cancel/unmount clean up later
      setErrors([toMessage(err)])
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="task-form space-y-5">
      {imagesOpen ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setImagesOpen(false)}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-ink transition hover:text-rmit-red"
            >
              <ArrowLeft className="h-4 w-4" /> Back to task
            </button>
            {supportsImages && (
              <span className="rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold text-ink">
                {images.length}/{MAX_IMAGES}
              </span>
            )}
          </div>
          {!supportsImages ? (
            <p className="rounded-xl bg-subtle p-4 text-sm text-muted">
              Image upload requires Supabase — connect a project to enable it.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted">
                Attach up to {MAX_IMAGES} demo images — these feed the auto-showcase. Click one
                to view it larger.
              </p>
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                {images.map((img) => (
                  <div
                    key={img.id}
                    className="group relative aspect-square overflow-hidden rounded-xl border border-line bg-subtle"
                  >
                    <img
                      src={img.url}
                      alt=""
                      loading="lazy"
                      onClick={() => setLightbox(img.url)}
                      className="h-full w-full cursor-zoom-in object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(img.id)}
                      title="Remove image"
                      className="absolute right-1 top-1 rounded-lg bg-black/55 p-1 text-white opacity-0 transition hover:bg-black/75 group-hover:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {Array.from({ length: uploading }).map((_, i) => (
                  <div
                    key={`uploading-${i}`}
                    className="flex aspect-square items-center justify-center rounded-xl border border-line bg-subtle"
                  >
                    <Loader2 className="h-5 w-5 animate-spin text-muted" />
                  </div>
                ))}
                {canAddImages && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line text-muted transition hover:border-navy-300 hover:text-ink"
                  >
                    <ImagePlus className="h-6 w-6" />
                    <span className="text-xs font-medium">Add</span>
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_IMAGE_TYPES}
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files) void addFiles(e.target.files)
                  e.target.value = ''
                }}
              />
              {imgError && <p className="text-sm font-medium text-rmit-red">{imgError}</p>}
            </>
          )}
          <div className="flex justify-end border-t border-line pt-4">
            <button type="button" className="btn-primary" onClick={() => setImagesOpen(false)}>
              Done
            </button>
          </div>
        </div>
      ) : (
      <>
      {errors.length > 0 && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300">
          <ul className="list-disc space-y-0.5 pl-4">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <Section first>
      {/* Code + Name — the task's identity, in one combined field */}
      <CodeNameField
        code={code}
        name={name}
        parsed={parsed}
        codeError={codeError}
        filledIdentity={filled.has('identity')}
        applyIdentity={onNameChange}
        setCode={(v) => {
          setCode(v)
          clearFilled('identity')
        }}
        setName={setName}
        mondayEnabled={mondayEnabled}
        onPick={applyMondayHit}
      />

      {/* Squad, Campaign & Task size on one line */}
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_1.4fr]">
        <div>
          <label className="label">Squad (stakeholder)</label>
          <select className="input h-11" value={squad} onChange={(e) => setSquad(e.target.value)}>
            {!squadOptions.includes(squad) && squad && <option value={squad}>{squad}</option>}
            {squadOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {SQUAD_DESCRIPTIONS[squad] && (
            <p className="mt-1.5 text-[11px] text-faint">{SQUAD_DESCRIPTIONS[squad]}</p>
          )}
        </div>
        <div>
          <label className="label">Campaign</label>
          <select className="input h-11" value={campaign} onChange={(e) => setCampaign(e.target.value)}>
            {!campaignOptions.includes(campaign) && campaign && <option value={campaign}>{campaign}</option>}
            {campaignOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={cx('label', filled.has('size') && 'is-filled')}>Task size</label>
          <div className="grid grid-cols-5 gap-1.5">
            {SIZES.map((s) => {
              const active = size === s
              const color = SIZE_COLORS[s]
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setSize(s)
                    clearFilled('size')
                  }}
                  title={SIZE_DESCRIPTIONS[s]}
                  className={cx(
                    'rounded-lg border px-1 py-1.5 text-xs font-bold transition',
                    !active && 'border-line bg-card text-muted hover:border-navy-300 hover:text-ink',
                  )}
                  style={
                    active ? { backgroundColor: color, borderColor: color, color: readableOn(color) } : undefined
                  }
                >
                  {s}
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-xs text-muted">
            {SIZE_DESCRIPTIONS[size]} · {durationLabel}
          </p>
        </div>
      </div>

      {/* Work type — full width, badge multi-select (like task size) */}
      <div>
        <label className="label">Work type(s)</label>
        <div className="flex flex-wrap gap-2">
          {typeOptions.map((t) => {
            const active = types.includes(t)
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTypes(active ? types.filter((x) => x !== t) : [...types, t])}
                aria-pressed={active}
                className={cx(
                  'rounded-xl px-3 py-2 text-xs font-medium leading-5 transition',
                  active
                    ? 'bg-navy-100/60 text-navy-700 dark:border dark:border-navy-300 dark:bg-navy-300 dark:text-white'
                    : 'bg-subtle text-muted hover:text-ink dark:border dark:border-line dark:bg-card dark:hover:border-navy-300',
                )}
              >
                {t}
              </button>
            )
          })}
        </div>
      </div>
      </Section>

      <Section
        title="Assets"
        action={
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold text-ink">
              {breakdownSum} total
            </span>
            <button
              type="button"
              onClick={() => setImagesOpen(true)}
              title="Attach demo images to this task"
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 hover:text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300 dark:hover:bg-amber-500/25"
            >
              <ImagePlus className="h-3.5 w-3.5" />
              Demo Images
              {images.length > 0 && (
                <span className="rounded-full bg-amber-600 px-1.5 text-[10px] font-bold leading-4 text-white">
                  {images.length}
                </span>
              )}
            </button>
          </div>
        }
      >
        <div className="flex flex-wrap gap-2">
          {assetTypeOptions.map((name) => (
            <AssetInput
              key={name}
              label={name}
              value={breakdown[name] || 0}
              onChange={(v) => setBreakdownField(name, v)}
            />
          ))}
          {settings.assetTypes.length === 0 && (
            <p className="w-full text-xs text-muted">
              Add asset types in Settings to break down deliverables.
            </p>
          )}
        </div>
      </Section>

      <Section title="Assignment">
      {/* People + Note on one line */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={cx('label', filled.has('people') && 'is-filled')}>Person(s) in charge</label>
          <MultiSelect
            options={peopleOptions}
            value={people}
            onChange={(next) => {
              clearFilled('people')
              setPeople(next)
            }}
            placeholder="Assign team members…"
            overflowCollapse
          />
        </div>
        <div>
          <label className="label">Note</label>
          <input
            type="text"
            className="input h-11"
            placeholder="Optional — shows on hover in the task list."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>
      </Section>

      <Section title="Timeline">
      {/* Start / End / Half */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={cx('label', filled.has('startDate') && 'is-filled')}>Start date</label>
          <input
            type="date"
            className="input h-11"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
          />
          {parsed.valid && parsed.iso && parsed.iso !== startDate && (
            <button
              type="button"
              onClick={applyDateFromCode}
              className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-rmit-red hover:underline"
            >
              <CalendarClock className="h-3.5 w-3.5" /> Use date from code ({parsed.iso})
            </button>
          )}
          {!startDateTouched && parsed.valid && parsed.iso && parsed.iso === startDate && (
            <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-accent-green">
              <Sparkles className="h-3.5 w-3.5" /> Auto-set from code
            </p>
          )}
        </div>
        <div>
          <label className={cx('label', filled.has('endDate') && 'is-filled')}>End date</label>
          <input
            type="date"
            className="input h-11"
            value={endDate}
            min={startDate || undefined}
            onChange={(e) => onEndDateChange(e.target.value)}
          />
          {endIsAuto && (
            <p className="mt-1.5 text-xs text-accent-green">
              Auto-set from {size} size ({durationLabel})
            </p>
          )}
          {suggestedEnd && endDate !== suggestedEnd && (
            <button
              type="button"
              onClick={applyEstimatedEnd}
              className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-rmit-red hover:underline"
            >
              <Sparkles className="h-3.5 w-3.5" /> Auto-set from {size} size ({durationLabel})
            </button>
          )}
        </div>
        <div>
          <label className="label">Half of year</label>
          <div className="flex gap-2">
            {(['H1', 'H2'] as Half[]).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => {
                  setHalf(h)
                  setHalfTouched(true)
                }}
                className={cx(
                  'flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold transition',
                  half === h
                    ? 'border-rmit-navy bg-rmit-navy text-white dark:border-navy-300 dark:bg-navy-300'
                    : 'border-line bg-card text-muted hover:border-navy-300',
                )}
              >
                {h}
              </button>
            ))}
          </div>
        </div>
      </div>
      </Section>

      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-3 pt-2">
        <div className="flex items-center gap-3">
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted transition hover:bg-brand-50 hover:text-rmit-red dark:hover:bg-brand-500/15 dark:hover:text-brand-300"
            >
              <Trash2 className="h-4 w-4" /> Remove task
            </button>
          )}
          {initial && (
            <div className="flex flex-col leading-tight text-[11px] text-muted">
              <span>Created {createdMeta ?? '—'}</span>
              <span
                className="text-faint"
                title={initial.createdBy ? `Created by ${initial.createdBy}` : 'Created before creator tracking was added'}
              >
                by {initial.createdBy || '—'}
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {onCancel && (
            <button type="button" className="btn-outline" onClick={handleCancel}>
              Cancel
            </button>
          )}
          <button type="submit" className="btn-primary" disabled={submitting || !canSubmit || !dirty}>
            {submitting ? 'Saving…' : submitLabel}
          </button>
        </div>
      </div>
      </>
      )}
      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </form>
  )
}
