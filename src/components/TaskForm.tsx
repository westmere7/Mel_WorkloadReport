import { useMemo, useState } from 'react'
import { Sparkles, CalendarClock } from 'lucide-react'
import type { AssetBreakdown, Half, Size, Squad, Task, TaskInput } from '../types'
import { EMPTY_BREAKDOWN } from '../types'
import { SQUADS, SQUAD_DESCRIPTIONS, ASSET_FIELDS, SIZES, SIZE_DESCRIPTIONS } from '../constants'
import { useStore } from '../data/store'
import { MultiSelect } from './ui/MultiSelect'
import { cx, toMessage } from '../lib/format'
import { deriveHalf, parseTaskCode, suggestCodeForDate } from '../lib/taskCode'
import { todayISO } from '../lib/format'

interface TaskFormProps {
  initial?: Task
  submitLabel: string
  onSubmit: (input: TaskInput) => Promise<void> | void
  onCancel?: () => void
}

function sumBreakdown(b: AssetBreakdown): number {
  return ASSET_FIELDS.reduce((acc, f) => acc + (Number(b[f.key]) || 0), 0)
}

export function TaskForm({ initial, submitLabel, onSubmit, onCancel }: TaskFormProps) {
  const { settings, tasks } = useStore()

  const [squad, setSquad] = useState<Squad>(initial?.squad ?? 'INTON')
  const [campaign, setCampaign] = useState<string>(initial?.campaign ?? settings.campaigns[0] ?? '')
  const [code, setCode] = useState(initial?.code ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [types, setTypes] = useState<string[]>(initial?.types ?? [])
  const [people, setPeople] = useState<string[]>(initial?.people ?? [])
  const [breakdown, setBreakdown] = useState<AssetBreakdown>(initial?.assetBreakdown ?? { ...EMPTY_BREAKDOWN })
  const [assetTotal, setAssetTotal] = useState<number>(initial?.assetTotal ?? 0)
  const [startDate, setStartDate] = useState<string>(initial?.startDate ?? '')
  const [endDate, setEndDate] = useState<string>(initial?.endDate ?? '')
  const [half, setHalf] = useState<Half>(initial?.half ?? 'H1')
  const [halfTouched, setHalfTouched] = useState(Boolean(initial))
  const [size, setSize] = useState<Size>(initial?.size ?? 'M')
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const parsed = useMemo(() => parseTaskCode(code), [code])
  const breakdownSum = useMemo(() => sumBreakdown(breakdown), [breakdown])

  const setBreakdownField = (key: keyof AssetBreakdown, value: number) => {
    setBreakdown((prev) => ({ ...prev, [key]: Math.max(0, value || 0) }))
  }

  const applyDateFromCode = () => {
    if (parsed.valid && parsed.iso) {
      setStartDate(parsed.iso)
      if (!halfTouched) setHalf(deriveHalf(parsed.iso))
    }
  }

  const onCodeBlur = () => {
    if (parsed.valid && parsed.iso && !startDate) applyDateFromCode()
  }

  const onStartDateChange = (value: string) => {
    setStartDate(value)
    if (!halfTouched) setHalf(deriveHalf(value || null))
  }

  const suggestCode = () => {
    const iso = startDate || todayISO()
    setCode(suggestCodeForDate(iso, tasks))
    if (!startDate) onStartDateChange(iso)
  }

  const validate = (): string[] => {
    const errs: string[] = []
    if (!name.trim()) errs.push('Task name is required.')
    if (!squad) errs.push('Squad is required.')
    if (!campaign) errs.push('Campaign is required.')
    if (code && !parsed.valid) errs.push('Task code must look like 26.0629.A (YY.MMDD.seq).')
    return errs
  }

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
        assetTotal: assetTotal || breakdownSum,
        assetBreakdown: breakdown,
        people,
        startDate: startDate || null,
        endDate: endDate || null,
        half,
        size,
      })
    } catch (err) {
      setErrors([toMessage(err)])
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {errors.length > 0 && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300">
          <ul className="list-disc space-y-0.5 pl-4">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Squad + Campaign */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Squad (stakeholder)</label>
          <select className="input" value={squad} onChange={(e) => setSquad(e.target.value as Squad)}>
            {SQUADS.map((s) => (
              <option key={s} value={s}>
                {s} — {SQUAD_DESCRIPTIONS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Campaign</label>
          <select className="input" value={campaign} onChange={(e) => setCampaign(e.target.value)}>
            {!settings.campaigns.includes(campaign) && campaign && <option value={campaign}>{campaign}</option>}
            {settings.campaigns.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Code + Name */}
      <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
        <div>
          <label className="label">Task code</label>
          <input
            className="input font-mono"
            placeholder="26.0629.A"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onBlur={onCodeBlur}
          />
          <button
            type="button"
            onClick={suggestCode}
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-rmit-red hover:underline"
          >
            <Sparkles className="h-3.5 w-3.5" /> Suggest next code
          </button>
        </div>
        <div>
          <label className="label">Task name</label>
          <input
            className="input"
            placeholder="2026 Open Day"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <p className="mt-1.5 text-xs text-muted">
            Saved as{' '}
            <span className="font-mono text-ink">
              {code ? `[${code}] ` : ''}
              {name || '…'}
            </span>
            {parsed.valid && parsed.iso && (
              <span className="ml-2 text-accent-green">· booked {parsed.iso}</span>
            )}
          </p>
        </div>
      </div>

      {/* Types */}
      <div>
        <label className="label">Work type(s)</label>
        <MultiSelect
          options={settings.types}
          value={types}
          onChange={setTypes}
          placeholder="Select work types…"
        />
      </div>

      {/* Assets */}
      <div>
        <div className="mb-1.5 flex items-end justify-between">
          <label className="label mb-0">Asset breakdown</label>
          <span className="text-xs text-muted">
            Breakdown sums to <strong className="text-ink">{breakdownSum}</strong>
            {assetTotal !== breakdownSum && (
              <button
                type="button"
                onClick={() => setAssetTotal(breakdownSum)}
                className="ml-2 font-medium text-rmit-red hover:underline"
              >
                use as total
              </button>
            )}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {ASSET_FIELDS.map((f) => (
            <div key={f.key}>
              <span className="mb-1 block text-[11px] font-medium text-muted">{f.label}</span>
              <input
                type="number"
                min={0}
                className="input"
                value={breakdown[f.key] || 0}
                onChange={(e) => setBreakdownField(f.key, e.target.valueAsNumber)}
              />
            </div>
          ))}
        </div>
        <div className="mt-3 max-w-[200px]">
          <label className="label">Total assets</label>
          <input
            type="number"
            min={0}
            className="input font-semibold"
            value={assetTotal}
            onChange={(e) => setAssetTotal(Math.max(0, e.target.valueAsNumber || 0))}
          />
        </div>
      </div>

      {/* People */}
      <div>
        <label className="label">Person(s) in charge</label>
        <MultiSelect
          options={settings.people}
          value={people}
          onChange={setPeople}
          placeholder="Assign team members…"
        />
      </div>

      {/* Task size */}
      <div>
        <label className="label">Task size</label>
        <div className="grid grid-cols-5 gap-2">
          {SIZES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSize(s)}
              title={SIZE_DESCRIPTIONS[s]}
              className={cx(
                'rounded-xl border px-3 py-2.5 text-sm font-bold transition',
                size === s
                  ? 'border-rmit-navy bg-rmit-navy text-white dark:border-navy-300 dark:bg-navy-300'
                  : 'border-line bg-card text-muted hover:border-navy-300',
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted">{SIZE_DESCRIPTIONS[size]}</p>
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
            onChange={(e) => setEndDate(e.target.value)}
          />
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

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <button type="button" className="btn-outline" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
