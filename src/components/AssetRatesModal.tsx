import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpDown, FlaskConical, Timer, X } from 'lucide-react'
import { Badge } from './ui/Badge'
import { Modal } from './ui/Modal'
import { useStore } from '../data/store'
import { cx } from '../lib/format'
import { useScrollFade } from '../lib/useScrollFade'
import {
  sortAlpha,
  RATE_UNITS,
  rateUnitLabel,
  formatRatePerUnit,
  hoursPerUnit,
  effortHeatColor,
  HOURS_PER_WORKING_DAY,
  WORKING_DAYS_PER_WEEK,
} from '../constants'
import type { AssetRate, AssetRates, RatePer } from '../types'

/** One row's in-progress values — kept as strings so a half-typed number survives. */
type RateDraft = { qty: string; every: string; per: RatePer }

/**
 * Number field for the output-rate rows. Mouse-wheel steps the value (±1, ±10
 * with Shift) whenever the pointer is over the field — no focus or click needed.
 * The listener is registered natively with `passive: false`: React routes wheel
 * events through a passive root listener, so an onWheel prop couldn't
 * preventDefault and the surrounding list would scroll instead of the value
 * changing. NB the flip side of hover-stepping is that the wheel can't scroll the
 * list while the pointer sits on a field — move off the inputs to scroll.
 */
function RateNumberInput({
  value,
  onValue,
  onEnter,
  min,
  ariaLabel,
  className,
  placeholder,
}: {
  value: string
  onValue: (next: string) => void
  onEnter: () => void
  min: number
  ariaLabel: string
  className: string
  placeholder?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  // Latest callback in a ref so the listener is registered once, not per render.
  const emit = useRef(onValue)
  emit.current = onValue

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const current = Number(el.value)
      const base = el.value.trim() === '' || !Number.isFinite(current) ? min : current
      const step = e.shiftKey ? 10 : 1
      const next = base + (e.deltaY < 0 ? step : -step)
      emit.current(String(Math.max(min, Math.round(next * 100) / 100)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [min])

  return (
    <input
      ref={ref}
      type="number"
      min={min}
      step="any"
      inputMode="decimal"
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={className}
      value={value}
      onChange={(e) => onValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onEnter()
        }
      }}
    />
  )
}

/**
 * Output rates per asset type — "how many assets in how long" (e.g. 300 images
 * per day, or 1 publication per 3 days).
 *
 * EXPERIMENTAL / RECORDED ONLY. This writes `settings.assetRates` and NOTHING
 * reads it: every dashboard number, chart, total and export still counts each
 * asset as 1. It exists so the real per-unit effort of each asset type is
 * captured now, for an effort-weighted view to be built on later.
 */
export function AssetRatesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, saveSettings } = useStore()
  const assetTypes = useMemo(() => sortAlpha(settings.assetTypes), [settings.assetTypes])
  const stored = settings.assetRates ?? {}

  const toDraft = (): Record<string, RateDraft> =>
    Object.fromEntries(
      assetTypes.map((name) => {
        const r = stored[name]
        return [
          name,
          { qty: r ? String(r.qty) : '', every: r ? String(r.every) : '1', per: r?.per ?? 'day' },
        ]
      }),
    )
  const [draft, setDraft] = useState<Record<string, RateDraft>>(toDraft)
  const [saving, setSaving] = useState(false)
  const listRef = useScrollFade<HTMLUListElement>()

  // Re-seed each time the pop-up opens, and whenever the asset-type list or the
  // stored rates change under it (adds, removals and renames from the Asset types
  // panel flow straight through — both read the same settings).
  useEffect(() => {
    if (!open) return
    const seeded = toDraft()
    setDraft(seeded)
    setSortMode('effort') // every visit opens ranked by effort
    setEffortRank(rankByEffort(seeded))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, settings.assetRates, settings.assetTypes])

  const set = (name: string, patch: Partial<RateDraft>) =>
    setDraft((d) => ({ ...d, [name]: { ...(d[name] ?? { qty: '', every: '1', per: 'day' }), ...patch } }))

  /** A row as a storable rate — null when blank or not a positive pair (= "not set"). */
  const parseRow = (row: RateDraft | undefined): AssetRate | null => {
    if (!row) return null
    const qty = Number(row.qty)
    const every = row.every.trim() === '' ? 1 : Number(row.every)
    if (!Number.isFinite(qty) || qty <= 0) return null
    if (!Number.isFinite(every) || every <= 0) return null
    return { qty, every, per: row.per }
  }

  // Only rates for asset types that still exist are kept — saving also prunes
  // any stale keys left behind by types removed before this panel existed.
  const next = useMemo(() => {
    const out: AssetRates = {}
    for (const name of assetTypes) {
      const r = parseRow(draft[name])
      if (r) out[name] = r
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, assetTypes])

  /** Hours one unit takes for a row's CURRENT draft (0 = unrated). */
  const rowHours = (name: string) => hoursPerUnit(parseRow(draft[name]) ?? undefined)

  /**
   * Scale for the inline effort bars — the slowest rated type fills its bar and
   * every other type is drawn in proportion, so the gap between a photo edit and
   * a publication is visible right where the numbers are typed. Needs two rates
   * before there's any relationship worth drawing.
   */
  const scale = useMemo(() => {
    const rated = assetTypes.map(rowHours).filter((h) => h > 0)
    if (rated.length < 2) return null
    return { slowest: Math.max(...rated) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, assetTypes])

  /** Row order — effort (slowest first) is the default; 'name' is plain A–Z. */
  const [sortMode, setSortMode] = useState<'effort' | 'name'>('effort')
  /**
   * The effort ranking, FROZEN. Re-taken only when the pop-up opens or the sort
   * button is pressed — never derived live from the draft, because re-ranking
   * rows while someone types would move the field out from under their cursor.
   */
  const [effortRank, setEffortRank] = useState<string[]>([])

  /** Rank a draft by effort: slowest first, unrated last, ties A–Z. */
  const rankByEffort = (d: Record<string, RateDraft>) =>
    assetTypes
      .map((name) => ({ name, hours: hoursPerUnit(parseRow(d[name]) ?? undefined) }))
      .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name))
      .map((r) => r.name)

  const orderedTypes = useMemo(() => {
    if (sortMode === 'name') return assetTypes // already alphabetical
    const rank = new Map(effortRank.map((n, i) => [n, i]))
    // A type ADDED since the snapshot has no rank — it falls to the end, A–Z —
    // and one removed simply never appears, so the rows track the asset-type list.
    return [...assetTypes].sort(
      (a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity) || a.localeCompare(b),
    )
  }, [assetTypes, sortMode, effortRank])

  const same = (a: AssetRate | undefined, b: AssetRate | undefined) =>
    (!a && !b) || (!!a && !!b && a.qty === b.qty && a.every === b.every && a.per === b.per)
  const dirty = assetTypes.some((n) => !same(next[n], stored[n]))
  const setCount = Object.keys(next).length

  const save = async () => {
    if (!dirty) return
    setSaving(true)
    try {
      await saveSettings({ ...settings, assetRates: next })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      widthClass="max-w-7xl"
      title={
        <span className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-accent-plum" />
          Output rates — asset types
          <Badge tone="plum">Experimental</Badge>
        </span>
      }
      footer={
        <>
          <button className="btn-outline" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary disabled:cursor-default disabled:opacity-40"
            type="button"
            onClick={save}
            disabled={!dirty || saving}
          >
            {saving ? 'Saving…' : 'Save rates'}
          </button>
        </>
      }
    >
      {/* Explanation on the left, the rates themselves on the right — the asset
          type list is long, so it gets the room and its own scroll. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
        <div className="space-y-3">
          {/* What this does RIGHT NOW — stated first so nobody expects the
              dashboard to move after filling this in. */}
          <div className="flex gap-2.5 rounded-xl border border-line bg-subtle px-3 py-2.5">
            <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-accent-plum" />
            <p className="text-xs leading-relaxed text-muted">
              <strong className="text-ink">Nothing uses these yet.</strong> Saving a rate changes no number
              anywhere in the app — the dashboard, every chart and all exports still count each asset as 1.
              We&rsquo;re collecting the data now so an effort-weighted view can be built on it later.
            </p>
          </div>

          <div className="space-y-2.5 text-xs leading-relaxed text-muted">
            <p>
              <strong className="text-ink">Why we need this.</strong> The report counts assets, so 300 photo
              edits and 10 banners read as a 30:1 difference in output — even when the banners took longer to
              make. A rate records how much work one unit of each asset type actually is, so the two can be
              compared fairly.
            </p>
            <p>
              <strong className="text-ink">What to enter.</strong> Roughly how many of that asset type{' '}
              <em>one person</em> finishes in a given stretch of time, for a typical job of that kind. Count
              hands-on working time only — leave out waiting on feedback, approvals, or assets from someone
              else. Use whichever span reads most naturally: &ldquo;300 per 1 day&rdquo; or &ldquo;1 per 3
              days&rdquo;.
            </p>
            <p>
              <strong className="text-ink">Rough is fine.</strong> What matters is the gap between 30 minutes
              and 3 days, not 40 minutes versus 45. Leave anything you&rsquo;re unsure about blank — a blank
              rate is recorded as &ldquo;not specified&rdquo;, which is more useful to us than a guess.
            </p>
          </div>
        </div>

        {assetTypes.length === 0 ? (
          <p className="rounded-xl border border-line px-3.5 py-3 text-sm text-muted">
            No asset types yet — add some in the Asset types list first.
          </p>
        ) : (
          <div className="flex min-w-0 flex-col">
            {/* Sorting is explicit: ranking rows live as the numbers change would
                shift the field under the cursor mid-edit. */}
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-faint">
                {scale
                  ? 'Bars are to scale against the slowest rated type. Hover a field and scroll to nudge it (Shift for ±10).'
                  : 'Rate two or more types to see how they compare.'}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (sortMode === 'effort') {
                    setSortMode('name')
                  } else {
                    setEffortRank(rankByEffort(draft)) // re-rank on demand, from what's typed now
                    setSortMode('effort')
                  }
                }}
                className="btn-outline flex h-7 shrink-0 items-center gap-1.5 px-2.5 text-[11px]"
                title={
                  sortMode === 'effort'
                    ? 'List the rows alphabetically instead'
                    : 'Re-rank the rows by effort, slowest first (a one-off — rows never move while you type)'
                }
              >
                <ArrowUpDown className="h-3 w-3" />
                {sortMode === 'effort' ? 'Sort A–Z' : 'Sort by effort'}
              </button>
            </div>
            <div className="mb-1.5 flex items-center gap-2.5 px-2.5 text-[10px] font-semibold uppercase tracking-wide text-faint">
              <span className="min-w-0 flex-1">Asset type</span>
              <span className="w-[16.75rem] shrink-0">Assets per time</span>
              <span
                className="w-40 shrink-0"
                title={`Bar length is to scale against the slowest rated type; colour is a heat scale from under 15 min (cool) to over 3 days (hot). Assumes a ${HOURS_PER_WORKING_DAY}-hour working day and a ${WORKING_DAYS_PER_WEEK}-day week.`}
              >
                Relative effort
              </span>
              <span className="w-[5.5rem] shrink-0 text-right">Works out as</span>
              <span className="w-6 shrink-0" />
            </div>
            <ul ref={listRef} className="max-h-[30rem] space-y-1 overflow-y-auto">
              {orderedTypes.map((name) => {
                const row = draft[name] ?? { qty: '', every: '1', per: 'day' as RatePer }
                const parsed = parseRow(row)
                const everyNum = Number(row.every) || 1
                const hours = parsed ? hoursPerUnit(parsed) : 0
                return (
                  <li
                    key={name}
                    className="flex items-center gap-2.5 rounded-lg border border-line px-2.5 py-1"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-green" />
                      <span className="truncate text-sm font-medium text-ink" title={name}>
                        {name}
                      </span>
                    </span>
                    <span className="flex w-[16.75rem] shrink-0 items-center gap-1.5">
                      <RateNumberInput
                        min={0}
                        placeholder="—"
                        ariaLabel={`${name} — assets produced`}
                        className="input input-stepper h-8 w-[4.25rem] px-2 py-0 text-right text-sm"
                        value={row.qty}
                        onValue={(qty) => set(name, { qty })}
                        onEnter={() => void save()}
                      />
                      <span className="shrink-0 text-[11px] text-muted">per</span>
                      <RateNumberInput
                        min={1}
                        ariaLabel={`${name} — length of the time span`}
                        className="input input-stepper h-8 w-[4rem] px-2 py-0 text-right text-sm"
                        value={row.every}
                        onValue={(every) => set(name, { every })}
                        onEnter={() => void save()}
                      />
                      <select
                        aria-label={`${name} — time unit`}
                        className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-card px-1.5 text-xs text-ink outline-none focus:border-rmit-red"
                        value={row.per}
                        onChange={(e) => set(name, { per: e.target.value as RatePer })}
                      >
                        {RATE_UNITS.map((u) => (
                          <option key={u} value={u}>
                            {rateUnitLabel(everyNum, u)}
                          </option>
                        ))}
                      </select>
                    </span>
                    {/* Effort bar — this row's time per unit against the slowest
                        rated type, so the relationship between the asset types is
                        visible right where the numbers are entered. */}
                    <span className="h-2.5 w-40 shrink-0 overflow-hidden rounded-full bg-subtle">
                      {scale && hours > 0 && (
                        <span
                          className="block h-full rounded-full"
                          // Floored at 2px so a type that really is 3000× quicker
                          // is still visible instead of vanishing to zero width.
                          style={{
                            width: `${(hours / scale.slowest) * 100}%`,
                            minWidth: '2px',
                            backgroundColor: effortHeatColor(hours),
                          }}
                        />
                      )}
                    </span>
                    {/* Implied time for one unit — a sanity check on the numbers
                        to the left, not a stored value. */}
                    <span
                      className={cx(
                        'w-[5.5rem] shrink-0 truncate text-right text-[11px]',
                        parsed ? 'text-muted' : 'text-faint',
                      )}
                    >
                      {parsed ? formatRatePerUnit(parsed).replace('≈ ', '') : 'Not set'}
                    </span>
                    <button
                      type="button"
                      onClick={() => set(name, { qty: '', every: '1', per: 'day' })}
                      disabled={!row.qty}
                      title="Clear this rate"
                      aria-label={`Clear the rate for ${name}`}
                      className="shrink-0 rounded-md p-1 text-faint transition hover:bg-subtle hover:text-ink disabled:invisible"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                )
              })}
            </ul>
            <p className="mt-2 text-[11px] text-faint">
              {setCount} of {assetTypes.length} asset type{assetTypes.length === 1 ? ' has' : 's have'} a rate.
            </p>
          </div>
        )}
      </div>

    </Modal>
  )
}
