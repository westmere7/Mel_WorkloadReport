import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarClock, Sparkles, Trash2 } from 'lucide-react'
import type { AssetBreakdown, Half, Size, Squad, Task, TaskInput } from '../types'
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
import { addDaysISO, cx, toMessage } from '../lib/format'
import { deriveHalf, parseTaskCode } from '../lib/taskCode'

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
  const ref = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<string | null>(null) // null → show the committed value
  const stateRef = useRef({ value, onChange })
  stateRef.current = { value, onChange }

  useEffect(() => {
    const el = ref.current
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

  return (
    <div>
      <span className="mb-1 block truncate text-[11px] font-medium text-muted" title={label}>
        {label}
      </span>
      <input
        ref={ref}
        type="text"
        className="input"
        title="Type a number or basic math, e.g. 3+2"
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
    </div>
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

/** Split a pasted "[26.0608.A] Some name" into its bracketed code + remaining name. */
function splitPastedName(value: string): { code?: string; name: string } {
  const m = value.match(/^\s*\[([^\]]+)\]\s*(.*)$/)
  if (m) return { code: m[1].trim(), name: m[2] }
  return { name: value }
}

export function TaskForm({ initial, submitLabel, onSubmit, onCancel, onDelete }: TaskFormProps) {
  const { settings, tasks } = useStore()

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
  const [note, setNote] = useState(initial?.note ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

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

  const onCodeChange = (value: string) => {
    setCode(value)
    fillDateFromCode(value)
  }

  // Pasting "[26.0608.A] ISC Roadshow 2026…" pulls the code out and fills it + the date.
  const onNameChange = (value: string) => {
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
    setStartDate(value)
    setStartDateTouched(true)
    if (!halfTouched) setHalf(deriveHalf(value || null))
  }

  const onEndDateChange = (value: string) => {
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

  // Code and end date are optional; a code, if given, must still be valid & unique.
  // Everything else is required and total assets must be positive.
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
    return errs
  }

  // Recomputed each render so the submit button greys out until the form is valid.
  const canSubmit = validate().length === 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate()
    setErrors(errs)
    if (errs.length) return
    setSubmitting(true)
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
      })
    } catch (err) {
      setErrors([toMessage(err)])
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="task-form space-y-6">
      {errors.length > 0 && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300">
          <ul className="list-disc space-y-0.5 pl-4">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Code + Name — the task's identity, kept at the top */}
      <div className="grid gap-4 sm:grid-cols-[170px_1fr]">
        <div>
          <label className="label">Task code</label>
          <input
            className={cx('input font-mono', codeError && 'border-rmit-red focus:border-rmit-red')}
            placeholder="26.0608.A"
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
          />
          {codeError ? (
            <p className="mt-1.5 text-xs font-medium text-rmit-red">{codeError}</p>
          ) : parsed.valid && parsed.iso ? (
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-accent-green">
              Booked {parsed.iso}
              {parsed.legacy && (
                <span className="rounded bg-subtle px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Legacy format
                </span>
              )}
            </p>
          ) : null}
        </div>
        <div>
          <label className="label">Task name</label>
          <input
            className="input text-base font-semibold"
            placeholder="Paste name with [code] here for code auto-fill."
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
          />
          <p className="mt-1.5 text-xs text-muted">
            Saved as{' '}
            <span className="font-mono text-ink">
              {code ? `[${code}] ` : ''}
              {name || '…'}
            </span>
          </p>
        </div>
      </div>

      {/* Squad + Campaign */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Squad (stakeholder)</label>
          <select className="input" value={squad} onChange={(e) => setSquad(e.target.value)}>
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
          <select className="input" value={campaign} onChange={(e) => setCampaign(e.target.value)}>
            {!campaignOptions.includes(campaign) && campaign && <option value={campaign}>{campaign}</option>}
            {campaignOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Types */}
      <div>
        <label className="label">Work type(s)</label>
        <MultiSelect
          options={typeOptions}
          value={types}
          onChange={setTypes}
          placeholder="Select work types…"
        />
      </div>

      {/* Assets — total is the live sum of the breakdown */}
      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <label className="label mb-0">Asset breakdown</label>
          <span className="rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold text-ink">
            {breakdownSum} total
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {assetTypeOptions.map((name) => (
            <AssetInput
              key={name}
              label={name}
              value={breakdown[name] || 0}
              onChange={(v) => setBreakdownField(name, v)}
            />
          ))}
          {settings.assetTypes.length === 0 && (
            <p className="col-span-full text-xs text-muted">
              Add asset types in Settings to break down deliverables.
            </p>
          )}
        </div>
      </div>

      {/* People + Task size on one line */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Person(s) in charge</label>
          <MultiSelect
            options={peopleOptions}
            value={people}
            onChange={setPeople}
            placeholder="Assign team members…"
            overflowCollapse
          />
        </div>
        <div>
          <label className="label">Task size</label>
          <div className="grid grid-cols-5 gap-1.5">
            {SIZES.map((s) => {
              const active = size === s
              const color = SIZE_COLORS[s]
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSize(s)}
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
          <p className="mt-1.5 truncate text-xs text-muted">{SIZE_DESCRIPTIONS[size]}</p>
        </div>
      </div>

      {/* Timeline + Half */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label">Start date</label>
          <input
            type="date"
            className="input"
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
        </div>
        <div>
          <label className="label">End date (optional)</label>
          <input
            type="date"
            className="input"
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

      {/* Note */}
      <div>
        <label className="label">Note</label>
        <textarea
          className="input min-h-[64px] resize-y"
          placeholder="Optional — shows on hover in the task list."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

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
            <button type="button" className="btn-outline" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="submit" className="btn-primary" disabled={submitting || !canSubmit}>
            {submitting ? 'Saving…' : submitLabel}
          </button>
        </div>
      </div>
    </form>
  )
}
