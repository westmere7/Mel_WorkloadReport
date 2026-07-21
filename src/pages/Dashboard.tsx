import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftRight, Check, ChevronDown } from 'lucide-react'
import { Card, CardHeader } from '../components/ui/Card'
import { Modal } from '../components/ui/Modal'
import { TaskDetails } from '../components/TaskDetails'
import { useHeaderSlots } from '../components/Layout'
import { useNewTask } from '../components/NewTaskModal'
import { StatCard } from '../components/ui/StatCard'
import { TrendDelta } from '../components/ui/TrendDelta'
import { AnimatedNumber } from '../components/ui/AnimatedNumber'
import { AreaTrendChart, DonutChart, HBarChart, RankedBars, StackedBarChart, StackedLegend, useSquadColor, VBarChart } from '../components/charts'
import { useStore } from '../data/store'
import {
  assetsByCampaign,
  assetsByMonth,
  assetsBySquad,
  assetsByType,
  countByField,
  countByMulti,
  demandByStakeholder,
  demandByStakeholderAssetType,
  stakeholderGroup,
  STAKEHOLDER_GROUPS,
  summarize,
} from '../lib/analytics'
import { functionColor, withFallback } from '../constants'
import { cx, todayISO, formatDate, formatDayMonth } from '../lib/format'
import { sliceTasksByFunctions } from '../lib/functionData'
import { SpanFilter } from '../components/SpanFilter'
import { filterBySpan, taskYears, type SpanMode } from '../lib/span'
import { COMMON_CAMPAIGNS, useDashboardPrefs } from '../lib/dashboardPrefs'
import { useAuth } from '../lib/auth'
import type { FunctionConfig, Half, Squad, Task, TaskInput } from '../types'
import { TaskForm } from '../components/TaskForm'

/**
 * The current local date as `yyyy-mm-dd`, re-rendering only when the day rolls
 * over. A kiosk left running for days keeps every "today"-relative view (match
 * range, the "Now" marker, the current-year default) accurate without a refresh.
 */
function useToday(): string {
  const [today, setToday] = useState(todayISO)
  useEffect(() => {
    // Poll each minute but only re-render on the rare tick where the day changed.
    const id = window.setInterval(() => {
      const t = todayISO()
      setToday((prev) => (prev === t ? prev : t))
    }, 60_000)
    return () => window.clearInterval(id)
  }, [])
  return today
}

export function Dashboard() {
  const { tasks, settings, updateTask, deleteTask } = useStore()
  const { openNewTask } = useNewTask()
  const { canEdit } = useAuth()
  const squadColor = useSquadColor()
  const [span, setSpan] = useState<SpanMode>('year')
  const [year, setYear] = useState<number | null>(null)
  const [half, setHalf] = useState<Half>('H1')
  // GCMC function filter — [] = "All GCMC" (the combined default on landing).
  // Every chart below reads the SLICED task set, so a specific selection shows
  // only those functions' recorded workload (shared tasks count their slice only).
  const [fnFilter, setFnFilter] = useState<string[]>([])
  // Comparison mode: measure the target year against a source (baseline) year.
  const [compare, setCompare] = useState(false)
  const [sourceYear, setSourceYear] = useState<number | null>(null)
  const [ytd, setYtd] = useState(true)
  // Reactive "today" so a kiosk left running updates day-relative views at midnight.
  const today = useToday()
  const todayMD = useMemo(() => today.slice(5), [today])
  const todayDM = useMemo(() => {
    const parts = formatDate(today).split(' ')
    return `${parts[0]} ${parts[1]}` // e.g. "2 Jul"
  }, [today])
  // Chart display preferences — edited in Settings → Dashboard.
  const { demandDim, hideCommonCampaigns, showTasksByPerson } = useDashboardPrefs()
  const navigate = useNavigate()

  // Tasks projected to the selected functions' slices (pass-through for All GCMC).
  const fnTasks = useMemo(
    () => sliceTasksByFunctions(tasks, fnFilter, settings.functions),
    [tasks, fnFilter, settings.functions],
  )

  // Year options stay based on ALL tasks so the selector doesn't jump around
  // when a function with a shorter history is isolated.
  const years = useMemo(() => taskYears(tasks), [tasks])

  // Default to the current calendar year when it has data, else the most recent.
  const currentYear = Number(today.slice(0, 4))
  const activeYear = year ?? (years.includes(currentYear) ? currentYear : years[0]) ?? 0

  // The "Workload across the year" chart is decoupled from the span filter (it always
  // shows a full 12-month year). In Total mode it tracks the LATEST year — not a year
  // left sticky in `year` from a prior "By year" selection. Year/half/compare follow
  // the selected/target year.
  const chartYear = !compare && span === 'total' ? years[0] ?? activeYear : activeYear

  // Source year defaults to the year before the target (and can never equal it).
  const srcYear = sourceYear != null && sourceYear !== activeYear ? sourceYear : activeYear - 1
  const sourceYearOptions = useMemo(() => {
    const set = new Set<number>([...years, activeYear - 1])
    set.delete(activeYear)
    return [...set].sort((a, b) => b - a)
  }, [years, activeYear])

  // In comparison mode the span filter is replaced by whole-year target vs source.
  const filtered = useMemo(() => {
    const base = filterBySpan(fnTasks, compare ? 'year' : span, activeYear, half)
    if (compare && ytd) {
      return base.filter((t) => t.startDate && t.startDate.slice(5) <= todayMD)
    }
    return base
  }, [fnTasks, span, activeYear, half, compare, ytd, todayMD])

  const sourceTasks = useMemo(() => {
    if (!compare) return []
    const base = filterBySpan(fnTasks, 'year', srcYear, half)
    if (ytd) {
      return base.filter((t) => t.startDate && t.startDate.slice(5) <= todayMD)
    }
    return base
  }, [fnTasks, compare, srcYear, half, ytd, todayMD])

  const summary = useMemo(() => summarize(filtered), [filtered])
  const bySquad = useMemo(() => assetsBySquad(filtered), [filtered])
  const bySquadTasks = useMemo(() => countByField(filtered, 'squad'), [filtered])
  const assetCampaign = useMemo(() => assetsByCampaign(filtered), [filtered])
  const dropCommon = (rows: { name: string; value: number }[]) =>
    hideCommonCampaigns ? rows.filter((r) => !COMMON_CAMPAIGNS.includes(r.name)) : rows
  const assetCampaignShown = useMemo(() => dropCommon(assetCampaign), [assetCampaign, hideCommonCampaigns])
  const demand = useMemo(
    () =>
      demandDim === 'asset'
        ? demandByStakeholderAssetType(filtered, withFallback(settings.assetTypes))
        : demandByStakeholder(filtered, withFallback(settings.types)),
    [filtered, settings.types, settings.assetTypes, demandDim],
  )
  const byPerson = useMemo(() => countByMulti(filtered, 'people'), [filtered])
  const assetMix = useMemo(
    () => assetsByType(filtered, withFallback(settings.assetTypes)),
    [filtered, settings.assetTypes],
  )
  const workTypeMix = useMemo(() => countByMulti(filtered, 'types'), [filtered])
  // "Across the year" ignores the half sub-filter — it always shows the full 12
  // months of the active year (the latest year by default, or the selected one).
  const byMonth = useMemo(() => {
    let list = fnTasks.filter((t) => t.startDate && Number(t.startDate.slice(0, 4)) === chartYear)
    if (compare && ytd) {
      list = list.filter((t) => t.startDate && t.startDate.slice(5) <= todayMD)
    }
    return assetsByMonth(list)
  }, [fnTasks, chartYear, compare, ytd, todayMD])
  // The same set of tasks the workload chart aggregates — scattered under the
  // line as individual clickable columns.
  const chartYearTasks = useMemo(() => {
    let list = fnTasks.filter((t) => t.startDate && Number(t.startDate.slice(0, 4)) === chartYear)
    if (compare && ytd) {
      list = list.filter((t) => t.startDate && t.startDate.slice(5) <= todayMD)
    }
    return list
  }, [fnTasks, chartYear, compare, ytd, todayMD])
  // The task currently under the pointer on the workload chart — shown live in
  // the card's top-right corner in place of the year.
  const [hoverTask, setHoverTask] = useState<Task | null>(null)
  // Clicking a workload dot opens this task's read-only details, without leaving
  // the dashboard. Signed-in editors can jump from there into the edit form
  // (editTask) — and a delete confirm (deleteTask) — right on the dashboard.
  const [viewTask, setViewTask] = useState<Task | null>(null)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Task | null>(null)

  const handleUpdateTask = async (input: TaskInput) => {
    if (!editTask) return
    await updateTask(editTask.id, input)
    setEditTask(null)
  }
  const confirmDeleteTask = async () => {
    if (!deleteConfirm) return
    await deleteTask(deleteConfirm.id)
    setDeleteConfirm(null)
    setEditTask(null)
  }
  // Mark "now" on the workload chart only when viewing the current calendar year.
  const nowMonth = useMemo(() => {
    const y = Number(today.slice(0, 4))
    return chartYear === y ? Number(today.slice(5, 7)) - 1 : null
  }, [chartYear, today])

  // ── Source-year aggregates (comparison mode only) ──────────────────────
  const srcSummary = useMemo(() => summarize(sourceTasks), [sourceTasks])
  const srcBySquad = useMemo(() => assetsBySquad(sourceTasks), [sourceTasks])
  const srcBySquadTasks = useMemo(() => countByField(sourceTasks, 'squad'), [sourceTasks])
  const srcAssetCampaign = useMemo(
    () => dropCommon(assetsByCampaign(sourceTasks)),
    [sourceTasks, hideCommonCampaigns], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const srcDemand = useMemo(
    () =>
      demandDim === 'asset'
        ? demandByStakeholderAssetType(sourceTasks, withFallback(settings.assetTypes))
        : demandByStakeholder(sourceTasks, withFallback(settings.types)),
    [sourceTasks, settings.types, settings.assetTypes, demandDim],
  )
  const srcAssetMix = useMemo(
    () => assetsByType(sourceTasks, withFallback(settings.assetTypes)),
    [sourceTasks, settings.assetTypes],
  )
  const srcWorkTypeMix = useMemo(() => countByMulti(sourceTasks, 'types'), [sourceTasks])
  const srcByMonth = useMemo(() => {
    let list = fnTasks.filter((t) => t.startDate && Number(t.startDate.slice(0, 4)) === srcYear)
    if (ytd) {
      list = list.filter((t) => t.startDate && t.startDate.slice(5) <= todayMD)
    }
    return assetsByMonth(list)
  }, [fnTasks, srcYear, ytd, todayMD])

  // ── Deep-link to the Task List, filtered to a single selection ──────────
  // Each click passes exactly the chosen filter(s) via the URL query; the Task
  // List seeds fresh from those params, so any prior filters are dropped.
  const goTasks = (params: Array<[string, string]>) => {
    const sp = new URLSearchParams()
    for (const [k, v] of params) sp.append(k, v)
    navigate({ pathname: '/tasks', search: `?${sp.toString()}` })
  }
  const squadsInGroup = (group: string) =>
    withFallback(settings.squads).filter((s) => stakeholderGroup(s as Squad) === group)

  // Per-name counts of relevant tasks, for the mix donuts' hover tooltips.
  // (Work-type counts equal the donut value; asset-type counts don't — a task
  // with multiple asset types is one task but many assets.)
  const assetMixCounts = useMemo(() => {
    const rec: Record<string, number> = {}
    for (const d of assetMix)
      rec[d.name] = filtered.filter((t) => (Number(t.assetBreakdown[d.name]) || 0) > 0).length
    return rec
  }, [assetMix, filtered])
  const srcAssetMixCounts = useMemo(() => {
    const rec: Record<string, number> = {}
    for (const d of srcAssetMix)
      rec[d.name] = sourceTasks.filter((t) => (Number(t.assetBreakdown[d.name]) || 0) > 0).length
    return rec
  }, [srcAssetMix, sourceTasks])
  const workTypeCounts = useMemo(
    () => Object.fromEntries(workTypeMix.map((d) => [d.name, d.value])),
    [workTypeMix],
  )
  const srcWorkTypeCounts = useMemo(
    () => Object.fromEntries(srcWorkTypeMix.map((d) => [d.name, d.value])),
    [srcWorkTypeMix],
  )

  // Render the function filter (left) and span selector (right) into the top header bar.
  const setHeaderSlots = useHeaderSlots()
  useEffect(() => {
    setHeaderSlots({
      left: <FunctionFilter functions={settings.functions} selected={fnFilter} onChange={setFnFilter} />,
      right: (
        <div className="flex flex-wrap items-center gap-3">
          {compare ? (
            <div className="flex items-center gap-1.5" title="Comparing the target year over the baseline year">
              <select
                value={activeYear}
                onChange={(e) => setYear(Number(e.target.value))}
                title="Target year to measure"
                className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm font-semibold text-ink shadow-soft outline-none focus:border-rmit-red"
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">over</span>
              <select
                value={srcYear}
                onChange={(e) => setSourceYear(Number(e.target.value))}
                title="Baseline year to compare against"
                className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm font-semibold text-ink shadow-soft outline-none focus:border-rmit-red"
              >
                {sourceYearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <SpanFilter
              mode={span}
              year={activeYear}
              half={half}
              years={years}
              onMode={setSpan}
              onYear={setYear}
              onHalf={setHalf}
            />
          )}
          <button
            type="button"
            onClick={() => {
              const nextCompare = !compare
              setCompare(nextCompare)
              if (nextCompare) {
                setYtd(true)
              }
            }}
            title={compare ? 'Exit comparison mode' : 'Compare two years'}
            className={cx(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold shadow-soft transition border',
              compare 
                ? 'bg-rmit-navy text-white border-transparent dark:bg-navy-300' 
                : 'bg-card border-line text-muted hover:text-ink hover:border-faint',
            )}
          >
            <ArrowLeftRight className="h-3.5 w-3.5" /> {compare ? 'Exit compare mode' : 'Compare'}
          </button>

          {compare && (
            <div
              className="flex items-center gap-2.5 cursor-pointer select-none border-l border-line pl-3"
              title={`Compare both years only through ${todayDM}, so this year's partial data isn't measured against last year's full year.`}
              onClick={() => setYtd((y) => !y)}
            >
              <span className="text-xs font-semibold text-muted">Match range</span>
              <button
                type="button"
                role="switch"
                aria-checked={ytd}
                className={cx(
                  'relative inline-flex h-[18px] w-8 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out outline-none border',
                  ytd ? 'bg-rmit-red border-transparent' : 'bg-subtle dark:bg-surface border-line'
                )}
              >
                <span
                  className={cx(
                    'pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200 ease-in-out absolute top-[1px] left-[1px]',
                    ytd ? 'translate-x-3.5' : 'translate-x-0'
                  )}
                />
              </button>
            </div>
          )}
        </div>
      ),
    })
    return () => setHeaderSlots({})
  }, [
    setHeaderSlots,
    fnFilter,
    settings.functions,
    span,
    activeYear,
    half,
    years,
    filtered.length,
    compare,
    srcYear,
    sourceYearOptions,
    sourceTasks.length,
    ytd,
  ])

  if (tasks.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <p className="text-base font-semibold text-ink">No tasks yet</p>
        <p className="max-w-sm text-sm text-muted">
          {canEdit
            ? 'Register your first task to start tracking the team’s workload — or populate sample data from Settings → Developer.'
            : 'Nothing has been registered yet. Sign in to start adding tasks.'}
        </p>
        {canEdit && (
          <button onClick={openNewTask} className="btn-primary mt-2">
            Create a task
          </button>
        )}
      </Card>
    )
  }

  // Campaign charts can exclude the ongoing/catch-all campaigns (Settings → Dashboard).
  const campaignSubtitleSuffix = hideCommonCampaigns ? ' — excl. Always On / BAU / Others' : ''
  // Split-column charts fade the source year and only keep categories in both years.
  const ytdLabel = ytd ? ` (up to ${todayDM})` : ''
  const compareSubtitleSuffix = compare ? ` — ${activeYear} over ${srcYear} (${srcYear} faded)${ytdLabel}` : ''
  // The squad ranked-bar cards mark the source year with a tick, not a faded bar.
  const squadCompareSuffix = compare ? ` — ${activeYear} over ${srcYear} (bar)${ytdLabel}` : ''
  // Human-readable description of the current (non-compare) span, for stat hints.
  const spanDesc = span === 'total' ? 'all time' : span === 'half' ? `${activeYear} ${half}` : `${activeYear}`
  // When isolating functions, empty charts say WHY (that function simply has no
  // recorded workload here yet) instead of the generic "add tasks" nudges.
  const fnLabel =
    fnFilter.length === 1 ? `${fnFilter[0]} Team` : fnFilter.length > 1 ? 'the selected functions' : null
  const fnEmpty = fnLabel ? `No workload recorded for ${fnLabel} in this view yet.` : undefined

  return (
    <div className="flex min-h-full flex-col gap-4">
      {/* Header stats: three hero cards + a Tasks-by-squad card */}
      <div className="grid items-stretch gap-3 lg:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={compare ? `Asset count · ${activeYear} over ${srcYear}` : 'Asset count'}
          value={<AnimatedNumber value={summary.totalAssets} />}
          accent="navy"
          size="xl"
          delta={
            compare ? (
              <TrendDelta
                size="lg"
                current={summary.totalAssets}
                previous={srcSummary.totalAssets}
                title={`${srcYear}: ${srcSummary.totalAssets} → ${activeYear}: ${summary.totalAssets}`}
              />
            ) : undefined
          }
          hint={
            compare
              ? ytd
                ? `deliverables up to ${todayDM} · was ${srcSummary.totalAssets.toLocaleString()} in ${srcYear} (same period)`
                : `deliverables from ${activeYear} · was ${srcSummary.totalAssets.toLocaleString()} in ${srcYear}`
              : `deliverables from ${spanDesc}`
          }
        />
        <StatCard
          label={compare ? `Task count · ${activeYear} over ${srcYear}` : 'Task count'}
          value={<AnimatedNumber value={summary.totalTasks} />}
          accent="red"
          size="xl"
          delta={
            compare ? (
              <TrendDelta
                size="lg"
                current={summary.totalTasks}
                previous={srcSummary.totalTasks}
                title={`${srcYear}: ${srcSummary.totalTasks} → ${activeYear}: ${summary.totalTasks}`}
              />
            ) : undefined
          }
          hint={
            compare
              ? ytd
                ? `tasks up to ${todayDM} · was ${srcSummary.totalTasks.toLocaleString()} in ${srcYear} (same period)`
                : `tasks from ${activeYear} · was ${srcSummary.totalTasks.toLocaleString()} in ${srcYear}`
              : `Across ${summary.totalCampaigns} campaign${summary.totalCampaigns === 1 ? '' : 's'}`
          }
        />

        <Card className="flex flex-col">
          <CardHeader title="Tasks by squad" subtitle={`Requests by stakeholder team${squadCompareSuffix}`} />
          <RankedBars
            data={bySquadTasks}
            emptyMessage={fnEmpty ?? 'Add tasks for at least 2 squads.'}
            onSelect={(name) => goTasks([['squad', name]])}
            compare={compare ? srcBySquadTasks : undefined}
            sourceLabel={String(srcYear)}
          />
        </Card>

        <Card className="flex flex-col">
          <CardHeader title="Assets by squad" subtitle={`Deliverables by stakeholder team${squadCompareSuffix}`} />
          <RankedBars
            data={bySquad}
            emptyMessage={fnEmpty ?? 'Add tasks for at least 2 squads.'}
            onSelect={(name) => goTasks([['squad', name]])}
            compare={compare ? srcBySquad : undefined}
            sourceLabel={String(srcYear)}
          />
        </Card>
      </div>

      {/* Left: workload (fills height) above the two campaign charts, side by side.
          Right: the mix donuts above the full-height squads-demand distribution. */}
      <div className="grid min-h-0 flex-1 items-stretch gap-4 lg:grid-cols-2">
        {/* LEFT column — two equal-height rows so the workload and campaign cards match. */}
        <div className="grid min-h-0 grid-rows-2 gap-4">
          <Card className="flex min-h-0 flex-1 flex-col">
            <CardHeader
              title="Workload & tasks across the year"
              subtitle="Assets per month · hover or click a dot for task details"
              action={
                // Fixed height so the header (and card) doesn't resize as the
                // hover readout swaps in and out.
                <div className="flex h-10 flex-col items-end justify-start gap-1">
                  {hoverTask ? (
                    <>
                      <span className="inline-block max-w-[24rem] truncate rounded-full bg-subtle px-2.5 py-0.5 text-xs font-semibold text-ink">
                        {hoverTask.name}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted">
                        {hoverTask.assetTotal} {hoverTask.assetTotal === 1 ? 'asset' : 'assets'} ·{' '}
                        {hoverTask.people.length} {hoverTask.people.length === 1 ? 'person' : 'people'} ·{' '}
                        <span
                          className="inline-block rounded-full px-1.5 py-px font-semibold"
                          style={{
                            backgroundColor: squadColor(hoverTask.squad),
                            // Dark text on the light gold "Other Stakeholders" pill; white on the rest.
                            color: stakeholderGroup(hoverTask.squad) === 'Other Stakeholders' ? '#6B4E00' : '#fff',
                          }}
                        >
                          {hoverTask.squad}
                        </span>
                        {' '}· {hoverTask.size} · Start day: {formatDayMonth(hoverTask.startDate)}
                      </span>
                    </>
                  ) : (
                    <span className="rounded-full bg-subtle px-2.5 py-0.5 text-xs font-semibold text-ink">
                      {compare ? `${activeYear} over ${srcYear}` : chartYear}
                    </span>
                  )}
                </div>
              }
            />
            {/* `relative` + `absolute inset-0` takes the chart out of flow so its
                measured height can't feed back and grow the flex parent (recharts
                ResponsiveContainer + flexbox growth loop). */}
            <div className="relative min-h-[300px] flex-1">
              <div className="absolute inset-0">
                <AreaTrendChart
                  data={byMonth}
                  height="100%"
                  emptyMessage={fnEmpty}
                  nowMonth={nowMonth}
                  // Zoom to Jan→now whenever the year is still in progress: always
                  // in single-year mode, and in compare mode only when matching ranges.
                  fillToNow={compare ? ytd : true}
                  tasks={chartYearTasks}
                  onTaskClick={setViewTask}
                  onHoverTask={setHoverTask}
                  compare={
                    compare
                      ? { data: srcByMonth, label: String(srcYear), currentLabel: String(activeYear), tasks: sourceTasks }
                      : undefined
                  }
                />
              </div>
            </div>
          </Card>
          <Card className="flex min-h-0 flex-1 flex-col">
            <CardHeader
              title="Asset count by campaign"
              subtitle={`Total deliverables produced per campaign${campaignSubtitleSuffix}${compareSubtitleSuffix}`}
            />
            <div className="relative min-h-[220px] flex-1">
              <div className="absolute inset-0">
                <VBarChart
                  data={assetCampaignShown}
                  height="100%"
                  emptyMessage={
                    fnEmpty ??
                    (compare
                      ? `No campaigns with assets in both ${srcYear} and ${activeYear}.`
                      : 'Add tasks with asset counts across at least 2 campaigns.')
                  }
                  compare={
                    compare
                      ? { data: srcAssetCampaign, label: String(srcYear), currentLabel: String(activeYear) }
                      : undefined
                  }
                  onSelect={(name) => goTasks([['campaign', name]])}
                />
              </div>
            </div>
          </Card>
        </div>

        {/* RIGHT column */}
        <div className="flex min-h-0 flex-col gap-4">
          <div className={cx('grid gap-4', showTasksByPerson ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
            <Card>
              <CardHeader
                title="Asset mix"
                subtitle={compare ? `Deliverables by type — ${activeYear} over ${srcYear}` : 'Deliverables by type'}
              />
              <DonutChart
                data={assetMix}
                height={200}
                emptyMessage={fnEmpty ?? 'Add tasks with asset counts to see the mix.'}
                compare={compare ? srcAssetMix : undefined}
                onSelect={(name) => goTasks([['asset', name]])}
                taskCounts={assetMixCounts}
                prevTaskCounts={compare ? srcAssetMixCounts : undefined}
                sourceLabel={String(srcYear)}
              />
            </Card>
            <Card>
              <CardHeader
                title="Work type mix"
                subtitle={compare ? `Tasks by work type — ${activeYear} over ${srcYear}` : 'Tasks by work type'}
              />
              <DonutChart
                data={workTypeMix}
                height={200}
                emptyMessage={fnEmpty ?? 'Tag tasks with work types to see the mix.'}
                compare={compare ? srcWorkTypeMix : undefined}
                onSelect={(name) => goTasks([['type', name]])}
                taskCounts={workTypeCounts}
                prevTaskCounts={compare ? srcWorkTypeCounts : undefined}
                sourceLabel={String(srcYear)}
              />
            </Card>
            {showTasksByPerson && (
              <Card className="flex flex-col">
                <CardHeader title="Tasks by person" subtitle="Tasks assigned per team member" />
                <div className="relative min-h-[180px] flex-1">
                  <div className="absolute inset-0">
                    <HBarChart
                      data={byPerson}
                      height="100%"
                      emptyMessage={fnEmpty ?? 'Assign people to at least 2 tasks.'}
                    />
                  </div>
                </div>
              </Card>
            )}
          </div>
          <Card className="flex min-h-0 flex-1 flex-col">
            <CardHeader
              title="Squads demand distribution"
              subtitle={`Share of each ${demandDim === 'asset' ? 'asset type' : 'work type'} across stakeholder groups${compareSubtitleSuffix}`}
              action={<StackedLegend keys={[...STAKEHOLDER_GROUPS]} paletteIndices={[0, 1, 2]} />}
            />
            <div className="relative min-h-[320px] flex-1">
              <div className="absolute inset-0">
                <StackedBarChart
                  data={demand}
                  keys={[...STAKEHOLDER_GROUPS]}
                  paletteIndices={[0, 1, 2]}
                  height="100%"
                  hideLegend
                  emptyMessage={
                    fnEmpty ??
                    (compare
                      ? `No ${demandDim === 'asset' ? 'asset types' : 'work types'} with demand in both ${srcYear} and ${activeYear}.`
                      : 'Add tasks with asset counts to see demand.')
                  }
                  compare={
                    compare
                      ? { data: srcDemand, label: String(srcYear), currentLabel: String(activeYear) }
                      : undefined
                  }
                  onSelect={(category, group) =>
                    goTasks([
                      [demandDim === 'asset' ? 'asset' : 'type', category],
                      ...squadsInGroup(group).map((s) => ['squad', s] as [string, string]),
                    ])
                  }
                />
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Task details, opened by clicking a workload dot. Signed-in editors get
          an "Edit task details" button that swaps in the edit form below. */}
      <Modal open={Boolean(viewTask)} onClose={() => setViewTask(null)} title="Task details" wide>
        {viewTask && (
          <TaskDetails
            task={viewTask}
            onClose={() => setViewTask(null)}
            onEdit={
              canEdit
                ? () => {
                    setEditTask(viewTask)
                    setViewTask(null)
                  }
                : undefined
            }
          />
        )}
      </Modal>

      {/* Edit form — reached from the details view; never leaves the dashboard. */}
      <Modal open={Boolean(editTask)} onClose={() => setEditTask(null)} title="Edit task" wide>
        {editTask && (
          <TaskForm
            initial={editTask}
            submitLabel="Save changes"
            onSubmit={handleUpdateTask}
            onCancel={() => setEditTask(null)}
            onDelete={() => setDeleteConfirm(editTask)}
          />
        )}
      </Modal>

      {/* Delete confirm */}
      <Modal
        open={Boolean(deleteConfirm)}
        onClose={() => setDeleteConfirm(null)}
        title="Delete task"
        footer={
          <>
            <button className="btn-outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={confirmDeleteTask}>
              Delete
            </button>
          </>
        }
      >
        <p className="text-sm text-muted">
          Delete <strong className="text-ink">{deleteConfirm?.name}</strong>
          {deleteConfirm?.code ? ` (${deleteConfirm.code})` : ''}? This cannot be undone.
        </p>
      </Modal>
    </div>
  )
}

/**
 * Header dropdown filtering the whole dashboard by GCMC function. Toggleable
 * items; "All GCMC" on top = the combined view (default on landing) and greys
 * the individual functions out. Selecting every function (or none) snaps back
 * to All GCMC.
 */
function FunctionFilter({
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
        title="Filter the dashboard by GCMC function"
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
                  className={cx('h-2.5 w-2.5 rounded-full ring-2 ring-card', functionColor(f.color).dot)}
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
                <span className={cx('h-2 w-2 shrink-0 rounded-full', functionColor(f.color).dot)} />
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
