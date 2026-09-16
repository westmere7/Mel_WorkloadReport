import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, Pin } from 'lucide-react'
import { Card, CardHeader } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { TaskDetails } from '../components/TaskDetails'
import { useHeaderSlots } from '../components/Layout'
import { useSquadColor } from '../components/charts'
import { useTheme } from '../lib/theme'
import { useStore } from '../data/store'
import { stakeholderGroup } from '../lib/analytics'
import { hasAnyRate, formatHours } from '../lib/effort'
import { cx, formatDate, todayISO } from '../lib/format'
import { taskYears } from '../lib/span'
import {
  HEAT_STEPS,
  MONTHS,
  UNIT_LABEL,
  WEEKDAYS,
  buildYearLoad,
  heatColor,
  heatInk,
  heatLevel,
  monthCells,
  taskDays,
  type CalendarUnit,
} from '../lib/calendar'
import { REGION_LABEL, holidayIndex, vietnamConfirmed, type HolidayRegion } from '../lib/holidays'
import type { Task } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// Calendar — a year of workload as a heatmap, one cell per day, with Melbourne
// and Vietnam public holidays and RMIT's Christmas closure marked on the days.
// Hover a day to see what was running; hover a task in that list and its whole
// span lights up across the months; click a day to pin it.
// ─────────────────────────────────────────────────────────────────────────────

const UNITS: CalendarUnit[] = ['tasks', 'assets', 'effort']

/** Marker colours for the holiday dots — deliberately NOT red, which is the heat. */
const REGION_DOT: Record<HolidayRegion, string> = {
  vic: 'bg-rmit-navy dark:bg-navy-100',
  vn: 'bg-accent-gold',
  rmit: '', // shown as a dashed outline, not a dot
}
const REGION_TONE: Record<HolidayRegion, 'navy' | 'gold' | 'gray'> = { vic: 'navy', vn: 'gold', rmit: 'gray' }

/** Spacing the cell-size fit has to account for (px) — keep in step with the JSX. */
const MONTH_GAP_X = 24
const MONTH_GAP_Y = 20
const MONTH_HEAD_H = 40 // month title + weekday row
const MONTH_HEAD_COMPACT_H = 22 // title only — the weekday row is dropped for small cells
/** Below this cell size the weekday labels go: they cost a row that the days need more. */
const WEEKDAY_MIN_CELL = 21
const CELL_GAP = 3
const CELL_MIN = 16
const CELL_MAX = 44

/**
 * Day-cell size that lets all twelve months fit the space the grid is given.
 * Width always constrains; height only when the page is in its two-column
 * layout (xl and up), where the card is bounded by the viewport — below that the
 * calendar stacks above the panel and is allowed to scroll. Cells never go below
 * CELL_MIN: on a small screen scrolling beats an illegible calendar.
 */
function useFitCells(ref: React.RefObject<HTMLElement>) {
  const [fit, setFit] = useState({ cols: 4, cell: 26, weekdays: true })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const W = el.clientWidth
      const H = el.clientHeight
      if (!W) return
      const bounded = window.matchMedia('(min-width: 1280px)').matches && H > 0
      // ⚠️ Try every column count and keep whichever yields the LARGEST cell. A
      // width breakpoint alone picked 3 columns (4 rows) at 1440×900, where the
      // height was the binding constraint, and drove the cells to the 16px floor;
      // 4 columns (3 rows) fits the same months at 20px+.
      let best = { cols: 4, cell: 0, weekdays: true }
      for (const cols of [4, 3, 2]) {
        const rows = Math.ceil(12 / cols)
        const cellW = ((W - MONTH_GAP_X * (cols - 1)) / cols - CELL_GAP * 6) / 7
        for (const weekdays of [true, false]) {
          const head = weekdays ? MONTH_HEAD_H : MONTH_HEAD_COMPACT_H
          const cellH = bounded ? ((H - MONTH_GAP_Y * (rows - 1)) / rows - head - CELL_GAP * 5) / 6 : Infinity
          const cell = Math.floor(Math.min(cellW, cellH, CELL_MAX))
          // Keep the weekday row unless dropping it is what lets the cells grow.
          if (weekdays && cell >= WEEKDAY_MIN_CELL) {
            if (cell > best.cell) best = { cols, cell, weekdays: true }
            break
          }
          if (!weekdays && cell > best.cell) best = { cols, cell, weekdays: false }
        }
      }
      best.cell = Math.max(CELL_MIN, best.cell)
      setFit((f) => (f.cols === best.cols && f.cell === best.cell && f.weekdays === best.weekdays ? f : best))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [ref])
  return fit
}

export function CalendarPage() {
  const { tasks: allTasks, settings } = useStore()
  const setHeaderSlots = useHeaderSlots()
  const squadColor = useSquadColor()
  const dark = useTheme().theme === 'dark'
  const tasks = useMemo(() => allTasks.filter((t) => !t.draft), [allTasks])

  const years = useMemo(() => {
    const ys = taskYears(tasks)
    const now = new Date().getFullYear()
    return ys.includes(now) ? ys : [...ys, now].sort((a, b) => b - a)
  }, [tasks])
  const [year, setYear] = useState<number>(() => new Date().getFullYear())
  const ratesConfigured = hasAnyRate(settings.assetRates)
  const [unit, setUnit] = useState<CalendarUnit>('tasks')
  const activeUnit: CalendarUnit = unit === 'effort' && !ratesConfigured ? 'tasks' : unit

  const load = useMemo(() => buildYearLoad(tasks, year, activeUnit, settings.assetRates ?? {}), [tasks, year, activeUnit, settings.assetRates])
  const holidays = useMemo(() => holidayIndex(year, settings.customHolidays ?? []), [year, settings.customHolidays])

  const [hoverDay, setHoverDay] = useState<string | null>(null)
  const [pinnedDay, setPinnedDay] = useState<string | null>(null)
  const [hoverTask, setHoverTask] = useState<Task | null>(null)
  const [viewTask, setViewTask] = useState<Task | null>(null)
  const day = pinnedDay ?? hoverDay
  const today = todayISO()
  const gridRef = useRef<HTMLDivElement>(null)
  const fit = useFitCells(gridRef)
  const dayLoad = day ? load.days.get(day) : undefined

  // The block to light up: every day of the hovered task's span.
  const strong = useMemo(() => new Set(hoverTask ? taskDays(hoverTask) : []), [hoverTask])

  useEffect(() => {
    setHeaderSlots({
      left: (
        <div className="flex items-center gap-0.5 rounded-lg bg-subtle p-0.5">
          {UNITS.filter((u) => u !== 'effort' || ratesConfigured).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setUnit(u)}
              aria-pressed={activeUnit === u}
              className={cx(
                'rounded-md px-2.5 py-1 text-xs font-semibold transition',
                activeUnit === u ? 'bg-rmit-navy text-white dark:bg-navy-300' : 'text-muted hover:text-ink',
              )}
            >
              {UNIT_LABEL[u]}
            </button>
          ))}
        </div>
      ),
      right: (
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="input w-auto py-1.5 text-sm font-semibold">
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      ),
    })
    return () => setHeaderSlots({})
  }, [setHeaderSlots, years, year, activeUnit, ratesConfigured])

  const valueLabel = (v: number) =>
    activeUnit === 'effort' ? formatHours(v) : activeUnit === 'assets' ? `${Math.round(v).toLocaleString()} assets/day` : `${v} ${v === 1 ? 'task' : 'tasks'}`

  return (
    // xl: the whole page is one viewport tall and the calendar card fills it, so the
    // twelve months are sized to fit (useFitCells) instead of scrolling.
    <div className="grid gap-4 xl:h-full xl:grid-cols-[minmax(0,1fr)_300px] xl:grid-rows-[minmax(0,1fr)] 2xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="flex min-h-0 min-w-0 flex-col">
        <CardHeader
          className="shrink-0"
          title={`${year} workload calendar`}
          subtitle={`Each day is coloured by ${UNIT_LABEL[activeUnit].toLowerCase()} active that day · hover a day for the tasks, click to pin`}
        />
        {/* ⚠️ No mouseleave reset here: the day has to SURVIVE the pointer travelling
            from the grid to the side panel, or a task row can never be hovered without
            pinning first. The last hovered day simply stays until another is hovered. */}
        <div
          ref={gridRef}
          // `content-between`: when width is the binding constraint the month rows would
          // otherwise clump at the top and leave a dead band above the legend.
          className="grid min-h-0 flex-1 content-between"
          style={{
            gridTemplateColumns: `repeat(${fit.cols}, minmax(0, 1fr))`,
            columnGap: MONTH_GAP_X,
            rowGap: MONTH_GAP_Y,
          }}
        >
          {MONTHS.map((name, m) => (
            <div key={name} className="min-w-0">
              <p className="mb-1.5 text-center text-xs font-bold uppercase tracking-wide text-ink">{name}</p>
              <div
                className="grid justify-center"
                style={{ gridTemplateColumns: `repeat(7, ${fit.cell}px)`, gap: CELL_GAP }}
              >
                {fit.weekdays &&
                  WEEKDAYS.map((w) => (
                    <span key={w} className="text-center font-semibold text-faint" style={{ fontSize: Math.max(8, Math.round(fit.cell * 0.36)) }}>
                      {fit.cell >= 26 ? w : w[0]}
                    </span>
                  ))}
                {monthCells(year, m).map((d, i) => {
                  if (!d) return <span key={`b${i}`} />
                  const l = load.days.get(d)
                  const level = heatLevel(l?.value ?? 0, load.thresholds)
                  const bg = heatColor(level, dark)
                  const hs = holidays.get(d) ?? []
                  const closed = hs.some((h) => h.region === 'rmit')
                  const isStrong = strong.has(d)
                  const isDay = d === day
                  // Days still to come are all but faded out — what's there is a plan,
                  // not a record. They come back to full strength when they're part
                  // of a highlighted block, are the hovered day, or under the pointer.
                  const future = d > today && !isStrong && !isDay
                  return (
                    <button
                      key={d}
                      type="button"
                      onMouseEnter={() => setHoverDay(d)}
                      onClick={() => setPinnedDay((p) => (p === d ? null : d))}
                      title={`${formatDate(d)}${l ? ` · ${valueLabel(l.value)}` : ''}${hs.length ? ` · ${hs.map((h) => h.name).join(', ')}` : ''}`}
                      style={{
                        width: fit.cell,
                        height: fit.cell,
                        // Smaller than the cell wants: the number is a label, the colour is the data.
                        fontSize: Math.max(8, Math.round(fit.cell * 0.34)),
                        ...(bg ? { backgroundColor: bg, color: heatInk(level, dark) } : {}),
                      }}
                      className={cx(
                        'relative flex items-center justify-center rounded-[4px] font-medium transition',
                        future && 'opacity-[0.18] hover:opacity-100',
                        !bg && 'bg-subtle text-muted',
                        closed && 'outline outline-1 outline-dashed outline-offset-[-1px] outline-rmit-navy dark:outline-navy-100',
                        isStrong && 'z-10 ring-2 ring-rmit-navy dark:ring-white',
                        isDay && 'z-20 ring-2 ring-offset-1 ring-offset-card ring-ink',
                      )}
                    >
                      {Number(d.slice(-2))}
                      {hs.some((h) => h.region !== 'rmit') && (
                        <span className="absolute right-[2px] top-[2px] flex gap-[2px]">
                          {(['vic', 'vn'] as HolidayRegion[])
                            .filter((r) => hs.some((h) => h.region === r))
                            .map((r) => (
                              <span key={r} className={cx('h-[5px] w-[5px] rounded-full', REGION_DOT[r])} />
                            ))}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-4 flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-3 text-[11px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="mr-1">Quieter</span>
            {Array.from({ length: HEAT_STEPS }, (_, i) => (
              <span key={i} className="h-3 w-3 rounded-[3px]" style={{ backgroundColor: heatColor(i + 1, dark) ?? undefined }} />
            ))}
            <span className="ml-1">Busier</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className={cx('h-[6px] w-[6px] rounded-full', REGION_DOT.vic)} /> Melbourne public holiday
          </span>
          <span className="flex items-center gap-1.5">
            <span className={cx('h-[6px] w-[6px] rounded-full', REGION_DOT.vn)} /> Vietnam public holiday
            {!vietnamConfirmed(year) && <span className="text-faint">(provisional for {year})</span>}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[3px] outline outline-1 outline-dashed outline-rmit-navy dark:outline-navy-100" /> RMIT Christmas closure
          </span>
          <span className="text-faint">Team holidays are added in Settings → Holidays &amp; closures.</span>
        </div>
      </Card>

      {/* Day panel */}
      <Card className="flex min-h-0 flex-col xl:overflow-hidden">
        {day ? (
          <>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-ink">{formatDate(day)}</p>
                <p className="mt-0.5 text-xs text-muted">{dayLoad ? valueLabel(dayLoad.value) : 'Nothing active'}</p>
              </div>
              {pinnedDay && (
                <button type="button" onClick={() => setPinnedDay(null)} title="Unpin" className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-muted hover:bg-subtle hover:text-ink">
                  <Pin className="h-3 w-3" /> Pinned
                </button>
              )}
            </div>
            {(holidays.get(day) ?? []).length > 0 && (
              <ul className="mt-3 space-y-1">
                {(holidays.get(day) ?? []).map((h, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-ink">
                    <Badge tone={REGION_TONE[h.region]}>{REGION_LABEL[h.region]}</Badge>
                    <span className="truncate">{h.name}</span>
                    {h.custom && <Badge tone="plum">Team</Badge>}
                    {h.provisional && <span className="text-[10px] text-faint">provisional</span>}
                  </li>
                ))}
              </ul>
            )}
            {dayLoad && dayLoad.tasks.length > 0 && (
              <ul className="mt-4 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1" onMouseLeave={() => setHoverTask(null)}>
                {dayLoad.tasks.map((t) => {
                  const span = taskDays(t)
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onMouseEnter={() => setHoverTask(t)}
                        onClick={() => setViewTask(t)}
                        className={cx(
                          'w-full rounded-lg px-2.5 py-2 text-left transition hover:bg-subtle',
                          hoverTask?.id === t.id && 'bg-subtle',
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold"
                            style={{
                              backgroundColor: squadColor(t.squad),
                              color: stakeholderGroup(t.squad) === 'Other Stakeholders' ? '#6B4E00' : '#fff',
                            }}
                          >
                            {t.squad}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink" title={t.name}>
                            {t.name}
                          </span>
                          <span className="shrink-0 text-xs font-semibold tabular-nums text-muted">{t.assetTotal}</span>
                        </div>
                        <p className="mt-0.5 text-[10px] text-muted">
                          {t.code && <span className="font-mono">{t.code} · </span>}
                          {formatDate(t.startDate)}
                          {span.length > 1 && ` → ${formatDate(t.endDate)} · ${span.length} days`}
                          {' · '}
                          {t.campaign}
                        </p>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <CalendarDays className="h-6 w-6 text-faint" />
            <p className="text-sm font-semibold text-ink">Hover a day</p>
            <p className="text-xs text-muted">
              {load.tasks.length} {load.tasks.length === 1 ? 'task touches' : 'tasks touch'} {year}. Hover a task in the list to see the whole
              block it covers; click a day to pin it.
            </p>
          </div>
        )}
      </Card>

      <Modal open={Boolean(viewTask)} onClose={() => setViewTask(null)} title="Task details" wide>
        {viewTask && <TaskDetails task={viewTask} onClose={() => setViewTask(null)} />}
      </Modal>
    </div>
  )
}
