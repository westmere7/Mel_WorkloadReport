import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftRight, ExternalLink, Settings2 } from 'lucide-react'
import { Card, CardHeader } from '../components/ui/Card'
import { Modal } from '../components/ui/Modal'
import { TaskDetails } from '../components/TaskDetails'
import { TaskStar } from '../components/TaskStar'
import { FunctionFilter } from '../components/FunctionFilter'
import { SquadFilter, useSquadParam } from '../components/SquadFilter'
import { ChartGroupsModal } from '../components/ChartGroupsModal'
import { EffortSummaryCard, VolumeCompactCard } from '../components/EffortStats'
import { PanelInfo } from '../components/PanelInfo'
import { PanelExpand } from '../components/PanelExpand'
import { useHeaderSlots } from '../components/Layout'
import { useNewTask } from '../components/NewTaskModal'
import { AreaTrendChart, MixChart, RankedBars, SquadVsRest, StackedBarChart, StackedLegend, useSquadColor, VBarChart } from '../components/charts'
import { useStore } from '../data/store'
import {
  assetsByCampaign,
  assetsBySquad,
  assetsByType,
  valueByMonth,
  countByField,
  countByMulti,
  valueBySize,
  demandByStakeholder,
  demandByStakeholderAssetType,
  demandShareForSquad,
  stakeholderGroup,
  STAKEHOLDER_GROUPS,
  summarize,
} from '../lib/analytics'
import { withFallback } from '../constants'
import { cx, todayISO, formatDate, formatDayMonth } from '../lib/format'
import { sliceTasksByFunctions } from '../lib/functionData'
import { SpanFilter } from '../components/SpanFilter'
import { filterBySpan, taskYears, type SpanMode } from '../lib/span'
import { COMMON_CAMPAIGNS, setDashboardPrefs, useDashboardPrefs, type DemandDim } from '../lib/dashboardPrefs'
import { effortByAssetType, formatHours, hasAnyRate, taskEffortHours } from '../lib/effort'
import { applyChartGroups, expandChartSelection } from '../lib/chartGroups'
import { useAuth } from '../lib/auth'
import type { Half, Squad, Task, TaskInput } from '../types'
import { TaskForm } from '../components/TaskForm'
import { TaskList } from './TaskList'

/** Row label for "every squad except the selected one" in the by-squad panels. */
const REST_SQUADS = 'All other squads'
/** Stack key + display label for the "everyone else" segment of the squad-share chart. */
const SHARE_KEYS = ['squad', 'rest']
const REST_LABEL = 'Rest of GCMC'

/** A drill-down's filters as a short title: "DOM · Videos · 2026". Long lists collapse to a count. */
function drillTitle(sp: URLSearchParams): string {
  const part = (key: string, noun: string) => {
    const v = sp.getAll(key)
    return v.length === 0 ? null : v.length <= 2 ? v.join(' + ') : `${v.length} ${noun}`
  }
  const year = sp.get('year')
  return (
    [
      part('squad', 'squads'),
      part('campaign', 'campaigns'),
      part('asset', 'asset types'),
      part('type', 'work types'),
      part('function', 'functions'),
      year && `${year}${sp.get('half') ? ` ${sp.get('half')}` : ''}`,
    ]
      .filter(Boolean)
      .join(' · ') || 'All tasks'
  )
}

/** A by-squad ranking reduced to the selected squad vs the sum of every other squad. */
function vsRest(rows: { name: string; value: number }[], squad: string) {
  const own = rows.find((r) => r.name === squad)?.value ?? 0
  const rest = rows.reduce((a, r) => (r.name === squad ? a : a + r.value), 0)
  return [
    { name: squad, value: own },
    { name: REST_SQUADS, value: rest },
  ]
}

/** One squad's share of each asset/work type (chart groups applied), in settings order. */
function squadShareRows(
  tasks: Task[],
  squad: string,
  dim: DemandDim,
  settings: { assetTypes: string[]; types: string[] },
  groups: Parameters<typeof applyChartGroups>[1],
) {
  const names = withFallback(dim === 'asset' ? settings.assetTypes : settings.types)
  return applyChartGroups(demandShareForSquad(tasks, squad, dim, names), groups)
}

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
  const { tasks: allTasks, settings, updateTask, deleteTask } = useStore()
  // DRAFTS contribute nothing to the dashboard — not even the task count. Every
  // aggregate below reads this filtered set.
  const tasks = useMemo(() => allTasks.filter((t) => !t.draft), [allTasks])
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
  // Squad filter — one requesting squad, or null = "All squads". Lives in the URL
  // (`/?squad=DOM`) so each squad can bookmark / be sent its own view, and the
  // sidebar carries it to the Task List and Calendar (see useSquadParam).
  const { squad: squadFilter, setSquad: setSquadFilter, options: squadOptions } = useSquadParam()
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
  const { demandDim, hideCommonCampaigns, groupAssetMix, groupWorkTypeMix, groupDemand } =
    useDashboardPrefs()
  // ── Effort weighting ──────────────────────────────────────────────────────
  // Re-values the across-the-year chart and shows the compact Volume panel + an
  // Effort panel. The by-squad, mix, demand and campaign panels keep counting
  // each asset as 1, and nothing is persisted — every figure below is derived
  // from the rates at render time.
  const assetRates = settings.assetRates ?? {}
  const ratesConfigured = hasAnyRate(assetRates)
  /** A task's value on the workload chart — effort hours. */
  const workloadValue = useMemo(
    () => (t: Task) => taskEffortHours(t, assetRates),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings.assetRates],
  )
  // Chart display GROUPS live in synced settings (shared across devices). Each
  // panel has its OWN local-only toggle to view grouped or fully individual,
  // without deleting the configured groups.
  const rawAssetGroups = settings.chartGroups?.asset ?? []
  const rawTypeGroups = settings.chartGroups?.type ?? []
  const assetGroups = groupAssetMix ? rawAssetGroups : [] // Asset mix panel
  const typeGroups = groupWorkTypeMix ? rawTypeGroups : [] // Work type mix panel
  // Demand panel: its own toggle, over whichever dimension it currently shows.
  const demandGroups = groupDemand ? (demandDim === 'asset' ? rawAssetGroups : rawTypeGroups) : []
  const navigate = useNavigate()

  // Tasks projected to the selected functions' slices (pass-through for All GCMC).
  const fnTasks = useMemo(
    () => sliceTasksByFunctions(tasks, fnFilter, settings.functions),
    [tasks, fnFilter, settings.functions],
  )

  // …then narrowed to the selected squad. EVERY panel reads this set, except the
  // squad-share panels, which need the other squads too (`filteredAll`).
  const squadTasks = useMemo(
    () => (squadFilter ? fnTasks.filter((t) => t.squad === squadFilter) : fnTasks),
    [fnTasks, squadFilter],
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
  const inSpan = useCallback(
    (list: Task[]) => {
      const base = filterBySpan(list, compare ? 'year' : span, activeYear, half)
      if (compare && ytd) {
        return base.filter((t) => t.startDate && t.startDate.slice(5) <= todayMD)
      }
      return base
    },
    [span, activeYear, half, compare, ytd, todayMD],
  )
  const inSource = useCallback(
    (list: Task[]) => {
      if (!compare) return []
      const base = filterBySpan(list, 'year', srcYear, half)
      if (ytd) {
        return base.filter((t) => t.startDate && t.startDate.slice(5) <= todayMD)
      }
      return base
    },
    [compare, srcYear, half, ytd, todayMD],
  )
  const filtered = useMemo(() => inSpan(squadTasks), [inSpan, squadTasks])
  const sourceTasks = useMemo(() => inSource(squadTasks), [inSource, squadTasks])
  // The same scope across EVERY squad — what a squad's share is measured against.
  // Identical to filtered/sourceTasks when no squad is selected.
  const filteredAll = useMemo(
    () => (squadFilter ? inSpan(fnTasks) : filtered),
    [squadFilter, inSpan, fnTasks, filtered],
  )
  const sourceAll = useMemo(
    () => (squadFilter ? inSource(fnTasks) : sourceTasks),
    [squadFilter, inSource, fnTasks, sourceTasks],
  )

  const summary = useMemo(() => summarize(filtered), [filtered])
  // With a squad selected, the by-squad panels show that squad against every other
  // squad combined (a one-row ranking says nothing); otherwise the full ranking.
  const bySquad = useMemo(
    () => (squadFilter ? vsRest(assetsBySquad(filteredAll), squadFilter) : assetsBySquad(filtered)),
    [squadFilter, filteredAll, filtered],
  )
  const bySquadTasks = useMemo(
    () => (squadFilter ? vsRest(countByField(filteredAll, 'squad'), squadFilter) : countByField(filtered, 'squad')),
    [squadFilter, filteredAll, filtered],
  )
  const assetCampaign = useMemo(() => assetsByCampaign(filtered), [filtered])
  const dropCommon = (rows: { name: string; value: number }[]) =>
    hideCommonCampaigns ? rows.filter((r) => !COMMON_CAMPAIGNS.includes(r.name)) : rows
  const assetCampaignShown = useMemo(() => dropCommon(assetCampaign), [assetCampaign, hideCommonCampaigns])
  const demand = useMemo(
    () =>
      applyChartGroups(
        demandDim === 'asset'
          ? demandByStakeholderAssetType(filtered, withFallback(settings.assetTypes))
          : demandByStakeholder(filtered, withFallback(settings.types)),
        demandGroups,
      ),
    [filtered, settings.types, settings.assetTypes, demandDim, demandGroups],
  )
  // Squad view: the demand panel becomes that squad's share of each type against
  // every other squad. Types the squad never asked for are dropped (and counted,
  // so the subtitle can say so); the rest lead with the squad's biggest share.
  const shareRows = useMemo(
    () => (squadFilter ? squadShareRows(filteredAll, squadFilter, demandDim, settings, demandGroups) : []),
    [squadFilter, filteredAll, demandDim, settings, demandGroups],
  )
  const shareShown = useMemo(
    () =>
      shareRows
        .filter((r) => r.squad > 0)
        .sort((a, b) => b.squad / (b.squad + b.rest) - a.squad / (a.squad + a.rest) || b.squad - a.squad),
    [shareRows],
  )
  const shareHidden = shareRows.length - shareShown.length
  // Ranked high→low so the biggest slices/segments lead (donut legend + stacked bar).
  const byValueDesc = (a: { value: number }, b: { value: number }) => b.value - a.value
  const assetMix = useMemo(
    () => applyChartGroups(assetsByType(filtered, withFallback(settings.assetTypes)), assetGroups).sort(byValueDesc),
    [filtered, settings.assetTypes, assetGroups],
  )
  const workTypeMix = useMemo(
    () => applyChartGroups(countByMulti(filtered, 'types'), typeGroups).sort(byValueDesc),
    [filtered, typeGroups],
  )
  // "Across the year" ignores the half sub-filter — it always shows the full 12
  // months of the active year (the latest year by default, or the selected one).
  const byMonth = useMemo(() => {
    let list = squadTasks.filter((t) => t.startDate && Number(t.startDate.slice(0, 4)) === chartYear)
    if (compare && ytd) {
      list = list.filter((t) => t.startDate && t.startDate.slice(5) <= todayMD)
    }
    return valueByMonth(list, workloadValue)
  }, [squadTasks, chartYear, compare, ytd, todayMD, workloadValue])
  // The same set of tasks the workload chart aggregates — scattered under the
  // line as individual clickable columns.
  const chartYearTasks = useMemo(() => {
    let list = squadTasks.filter((t) => t.startDate && Number(t.startDate.slice(0, 4)) === chartYear)
    if (compare && ytd) {
      list = list.filter((t) => t.startDate && t.startDate.slice(5) <= todayMD)
    }
    return list
  }, [squadTasks, chartYear, compare, ytd, todayMD])
  // ── Effort header aggregates ──────────────────────────────────────────────
  // Totals derived from the rates at render time; nothing here is stored, and the
  // count-based aggregates above are untouched.
  const effortTotal = useMemo(
    () => filtered.reduce((a, t) => a + taskEffortHours(t, assetRates), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, settings.assetRates],
  )
  const srcEffortTotal = useMemo(
    () => sourceTasks.reduce((a, t) => a + taskEffortHours(t, assetRates), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sourceTasks, settings.assetRates],
  )
  // Assets per task size — Volume's own breakdown, so the two header panels can be
  // compared directly (where the volume sits vs where the effort sits).
  const assetsBySize = useMemo(
    () => valueBySize(filtered, (t) => t.assetTotal || 0),
    [filtered],
  )
  const srcAssetsBySize = useMemo(
    () => valueBySize(sourceTasks, (t) => t.assetTotal || 0),
    [sourceTasks],
  )
  const effortByType = useMemo(
    () => effortByAssetType(filtered, assetRates),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, settings.assetRates],
  )
  /** Comparison context shared by the header panels. */
  const cmpCtx = useMemo(
    () => ({ on: compare, activeYear, srcYear, ytd, todayDM }),
    [compare, activeYear, srcYear, ytd, todayDM],
  )

  // The task currently under the pointer on the workload chart — shown live in
  // the card's top-right corner in place of the year.
  const [hoverTask, setHoverTask] = useState<Task | null>(null)
  // How many GCMC functions recorded workload on the hovered task. A legacy task
  // (no per-function slices) belongs wholly to the legacy function, so it counts 1.
  const hoverFnCount = hoverTask
    ? hoverTask.functionData
      ? Object.keys(hoverTask.functionData).length
      : 1
    : 0
  // Clicking a workload dot opens this task's read-only details, without leaving
  // the dashboard. Signed-in editors can jump from there into the edit form
  // (editTask) — and a delete confirm (deleteTask) — right on the dashboard.
  const [viewTask, setViewTask] = useState<Task | null>(null)
  // Drill-down: clicking a number opens the matching tasks in a near-full-screen
  // pop-up OVER the dashboard (the real Task List, seeded with the same filters),
  // so closing it lands back on the dashboard exactly as it was — span, compare,
  // function and squad filters, scroll position. "Open in Task List" still leaves
  // for the full page when that's wanted.
  const [drill, setDrill] = useState<URLSearchParams | null>(null)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Task | null>(null)
  // Chart groups editor pop-up (opened from the panels' gear icons) — remembers
  // which dimension tab to land on based on the panel that opened it.
  const [chartGroupsOpen, setChartGroupsOpen] = useState(false)
  const [chartGroupsTab, setChartGroupsTab] = useState<'asset' | 'type'>('asset')

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
  const srcBySquad = useMemo(
    () => (squadFilter ? vsRest(assetsBySquad(sourceAll), squadFilter) : assetsBySquad(sourceTasks)),
    [squadFilter, sourceAll, sourceTasks],
  )
  const srcBySquadTasks = useMemo(
    () => (squadFilter ? vsRest(countByField(sourceAll, 'squad'), squadFilter) : countByField(sourceTasks, 'squad')),
    [squadFilter, sourceAll, sourceTasks],
  )
  const srcAssetCampaign = useMemo(
    () => dropCommon(assetsByCampaign(sourceTasks)),
    [sourceTasks, hideCommonCampaigns], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const srcDemand = useMemo(
    () =>
      applyChartGroups(
        demandDim === 'asset'
          ? demandByStakeholderAssetType(sourceTasks, withFallback(settings.assetTypes))
          : demandByStakeholder(sourceTasks, withFallback(settings.types)),
        demandGroups,
      ),
    [sourceTasks, settings.types, settings.assetTypes, demandDim, demandGroups],
  )
  // The squad's share in the source year (kept whole — the chart inner-joins on the
  // types shown for the target year).
  const srcShareRows = useMemo(
    () => (squadFilter && compare ? squadShareRows(sourceAll, squadFilter, demandDim, settings, demandGroups) : []),
    [squadFilter, compare, sourceAll, demandDim, settings, demandGroups],
  )
  const srcAssetMix = useMemo(
    () => applyChartGroups(assetsByType(sourceTasks, withFallback(settings.assetTypes)), assetGroups).sort(byValueDesc),
    [sourceTasks, settings.assetTypes, assetGroups], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const srcWorkTypeMix = useMemo(
    () => applyChartGroups(countByMulti(sourceTasks, 'types'), typeGroups).sort(byValueDesc),
    [sourceTasks, typeGroups], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const srcByMonth = useMemo(() => {
    let list = squadTasks.filter((t) => t.startDate && Number(t.startDate.slice(0, 4)) === srcYear)
    if (ytd) {
      list = list.filter((t) => t.startDate && t.startDate.slice(5) <= todayMD)
    }
    return valueByMonth(list, workloadValue)
  }, [squadTasks, srcYear, ytd, todayMD, workloadValue])

  // ── Deep-link to the Task List, filtered to a single selection ──────────
  // Each click passes the chosen filter(s) PLUS the dashboard's current scope
  // (function selection + time span) via the URL query, so the Task List lands
  // on exactly the same task set the clicked number was counted from.
  const goTasks = (params: Array<[string, string]>) => {
    const sp = new URLSearchParams()
    for (const [k, v] of params) sp.append(k, v)
    // Carry the squad scope unless the click already names its own squads.
    if (squadFilter && !params.some(([k]) => k === 'squad')) sp.append('squad', squadFilter)
    for (const fn of fnFilter) sp.append('function', fn)
    // `filtered` uses year-mode in compare; mirror that so counts line up.
    const effSpan = compare ? 'year' : span
    if (effSpan !== 'total') {
      sp.append('year', String(activeYear))
      if (effSpan === 'half') sp.append('half', half)
    }
    setDrill(sp)
  }
  const squadsInGroup = (group: string) =>
    withFallback(settings.squads).filter((s) => stakeholderGroup(s as Squad) === group)
  /** Every squad except the selected one — what a "rest" row/segment opens. */
  const otherSquads = () => squadOptions.filter((s) => s !== squadFilter)
  /** Open the task list for a by-squad row (the "All other squads" row → every other squad). */
  const goSquadRow = (name: string) =>
    goTasks(
      squadFilter && name === REST_SQUADS
        ? otherSquads().map((s) => ['squad', s] as [string, string])
        : [['squad', name]],
    )

  // Per-panel controls: an independent grouped/individual toggle (only when that
  // panel's dimension has groups) + the gear that opens the Chart groups pop-up.
  const groupControls = (on: boolean, toggle: () => void, hasGroups: boolean, openTab: 'asset' | 'type') => (
    // `panel-action`: hidden until the card is hovered, like the ? and full-screen
    // controls beside it — the header should read as a title, not a toolbar.
    <div className="panel-action flex items-center gap-1.5">
      {hasGroups && (
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={toggle}
          title={
            on
              ? 'Grouped view — click to show every item individually'
              : 'Individual view — click to apply your chart groups'
          }
          aria-label="Toggle grouped view"
          className="flex items-center gap-1.5"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Group</span>
          <span
            className={cx(
              'relative h-4 w-7 shrink-0 rounded-full transition-colors',
              on ? 'bg-rmit-navy dark:bg-navy-300' : 'bg-line',
            )}
          >
            <span
              className={cx(
                'absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all dark:bg-navy-950',
                on ? 'left-3.5' : 'left-0.5',
              )}
            />
          </span>
        </button>
      )}
      {/* Editing the group DEFINITIONS writes shared settings — sign-in only. The
          local Group toggle above stays available to everyone. */}
      {canEdit && (
        <button
          type="button"
          onClick={() => {
            setChartGroupsTab(openTab)
            setChartGroupsOpen(true)
          }}
          title="Chart display settings — group items to declutter this chart"
          aria-label="Chart display settings"
          className="rounded-md p-1 text-faint transition hover:bg-subtle hover:text-ink"
        >
          <Settings2 className="h-4 w-4" />
        </button>
      )}
    </div>
  )
  const demandHasGroups = (demandDim === 'asset' ? rawAssetGroups : rawTypeGroups).length > 0

  // Per-name counts of relevant tasks, for the mix donuts' hover tooltips.
  // Group-aware: a grouped row counts tasks matching ANY member (each task once)
  // — the same set its click-through filter opens — while an ungrouped row's
  // members are just itself.
  const assetMixCounts = useMemo(() => {
    const rec: Record<string, number> = {}
    for (const d of assetMix) {
      const members = expandChartSelection(assetGroups, d.name)
      rec[d.name] = filtered.filter((t) => members.some((m) => (Number(t.assetBreakdown[m]) || 0) > 0)).length
    }
    return rec
  }, [assetMix, assetGroups, filtered])
  const srcAssetMixCounts = useMemo(() => {
    const rec: Record<string, number> = {}
    for (const d of srcAssetMix) {
      const members = expandChartSelection(assetGroups, d.name)
      rec[d.name] = sourceTasks.filter((t) => members.some((m) => (Number(t.assetBreakdown[m]) || 0) > 0)).length
    }
    return rec
  }, [srcAssetMix, assetGroups, sourceTasks])
  const workTypeCounts = useMemo(() => {
    const rec: Record<string, number> = {}
    for (const d of workTypeMix) {
      const members = expandChartSelection(typeGroups, d.name)
      rec[d.name] = filtered.filter((t) => t.types.some((ty) => members.includes(ty))).length
    }
    return rec
  }, [workTypeMix, typeGroups, filtered])
  const srcWorkTypeCounts = useMemo(() => {
    const rec: Record<string, number> = {}
    for (const d of srcWorkTypeMix) {
      const members = expandChartSelection(typeGroups, d.name)
      rec[d.name] = sourceTasks.filter((t) => t.types.some((ty) => members.includes(ty))).length
    }
    return rec
  }, [srcWorkTypeMix, typeGroups, sourceTasks])

  // Render the function filter (left) and span selector (right) into the top header bar.
  const setHeaderSlots = useHeaderSlots()
  useEffect(() => {
    setHeaderSlots({
      left: (
        // data-help: anchor for the Help-page screenshot of the scope controls.
        <div className="flex flex-wrap items-center gap-2" data-help="header-scope">
          <FunctionFilter functions={settings.functions} selected={fnFilter} onChange={setFnFilter} />
          <SquadFilter squads={squadOptions} selected={squadFilter} onChange={setSquadFilter} />
        </div>
      ),
      right: (
        // data-help: anchor for the Help-page screenshot of the scope controls (span side).
        <div className="flex flex-wrap items-center gap-3" data-help="header-span">
          {/* Match range leads, so it reads as a setting OF the comparison that follows. */}
          {compare && (
            <div
              className="flex items-center gap-2.5 cursor-pointer select-none border-r border-line pr-3"
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
        </div>
      ),
    })
    return () => setHeaderSlots({})
  }, [
    setHeaderSlots,
    fnFilter,
    settings.functions,
    squadOptions,
    squadFilter,
    setSquadFilter,
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
    todayDM,
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
  // When isolating functions, empty charts say WHY (that function simply has no
  // recorded workload here yet) instead of the generic "add tasks" nudges.
  const fnLabel =
    fnFilter.length === 1 ? `${fnFilter[0]} Team` : fnFilter.length > 1 ? 'the selected functions' : null
  const scopeLabel = [fnLabel, squadFilter && `${squadFilter} requests`].filter(Boolean).join(' on ')
  const fnEmpty = scopeLabel ? `No workload recorded for ${scopeLabel} in this view yet.` : undefined
  const rankedSubtitle = (base: string) =>
    squadFilter ? `${squadFilter} against all other squads${squadCompareSuffix}` : `${base}${squadCompareSuffix}`
  /** A by-squad card: the full ranking, or — in a squad view — the squad vs the rest. */
  const bySquadCard = (
    title: string,
    panel: 'tasksBySquad' | 'assetsBySquad',
    subtitle: string,
    data: { name: string; value: number }[],
    srcData: { name: string; value: number }[],
  ) => (
    <Card className={cx('flex flex-col', squadFilter && 'flex-1')}>
      <CardHeader
        title={title}
        subtitle={rankedSubtitle(subtitle)}
        action={
          <div className="flex items-center gap-1.5">
            <PanelExpand />
            <PanelInfo panel={panel} />
          </div>
        }
      />
      {squadFilter ? (
        <SquadVsRest
          data={data}
          colors={[squadColor(squadFilter), 'var(--chart-rest)']}
          emptyMessage={fnEmpty ?? `No work recorded in this view yet.`}
          onSelect={goSquadRow}
          compare={compare ? srcData : undefined}
          sourceLabel={String(srcYear)}
        />
      ) : (
        <RankedBars
          data={data}
          emptyMessage={fnEmpty ?? 'Add tasks for at least 2 squads.'}
          onSelect={goSquadRow}
          compare={compare ? srcData : undefined}
          sourceLabel={String(srcYear)}
        />
      )}
    </Card>
  )

  // The four lower panels, laid out per mode below.
  const workloadCard = (
    <Card className="flex min-h-0 flex-1 flex-col">
      <CardHeader
        // The period lives in the title, so the chart doesn't need a pill
        // repeating it underneath.
        title={`Workload & tasks in ${compare ? `${activeYear} over ${srcYear}` : chartYear}`}
        subtitle="Effort per month, not asset count · hover or click a dot for task details"
        action={
          // The "?" comes LAST and never shrinks, so it stays pinned to the
          // right edge; the hover readout grows into the space on its left
          // instead of shoving it about as tasks change.
          <div className="flex items-start gap-2">
            {/* Fixed height so the header (and card) doesn't resize as the
                hover readout swaps in and out. */}
            <div className="flex h-10 min-w-0 flex-col items-end justify-start gap-1">
            {hoverTask ? (
              <>
                <span className="inline-block max-w-[24rem] truncate rounded-full bg-subtle px-2.5 py-0.5 text-xs font-semibold text-ink">
                  {hoverTask.name}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted">
                  {hoverTask.assetTotal} {hoverTask.assetTotal === 1 ? 'asset' : 'assets'}
                  {/* The dot's height is hours, so name them. */}
                  {` ≈ ${formatHours(taskEffortHours(hoverTask, assetRates))}`} ·{' '}
                  {hoverTask.people.length} {hoverTask.people.length === 1 ? 'person' : 'people'} ·{' '}
                  {/* Functions recording workload on this task (legacy tasks = 1). */}
                  {hoverFnCount} {hoverFnCount === 1 ? 'function' : 'functions'} ·{' '}
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
            ) : null}
            </div>
            <PanelExpand />
            <PanelInfo panel="workload" />
          </div>
        }
      />
      {/* `relative` + `absolute inset-0` takes the chart out of flow so its
          measured height can't feed back and grow the flex parent (recharts
          ResponsiveContainer + flexbox growth loop). */}
      <div className="relative min-h-[180px] flex-1">
        <div className="absolute inset-0">
          <AreaTrendChart
            data={byMonth}
            height="100%"
            emptyMessage={
              fnEmpty ??
              (!ratesConfigured
                ? 'Set output rates in Settings → Timing & effort to plot effort across the year.'
                : undefined)
            }
            nowMonth={nowMonth}
            // Zoom to Jan→now whenever the year is still in progress: always
            // in single-year mode, and in compare mode only when matching ranges.
            fillToNow={compare ? ytd : true}
            tasks={chartYearTasks}
            onTaskClick={setViewTask}
            onHoverTask={setHoverTask}
            // Dots share the line's y-axis, so they must be valued the same way.
            taskValue={workloadValue}
            hideYLabels
            compare={
              compare
                ? { data: srcByMonth, label: String(srcYear), currentLabel: String(activeYear), tasks: sourceTasks }
                : undefined
            }
          />
        </div>
      </div>
    </Card>
  )
  const campaignCard = (
    <Card className="flex min-h-0 flex-1 flex-col">
      <CardHeader
        title="Asset count by campaign"
        subtitle={`Total deliverables produced per campaign${campaignSubtitleSuffix}${compareSubtitleSuffix}`}
        action={
        <div className="flex items-center gap-1.5">
          <PanelExpand />
          <PanelInfo panel="campaign" />
        </div>
      }
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
  )
  const mixesRow = (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card className="flex h-[376px] min-h-0 flex-col">
        <CardHeader
          title="Asset mix"
          className="shrink-0"
          subtitle={compare ? `Deliverables by type — ${activeYear} over ${srcYear}` : 'Deliverables by type'}
          action={
            <div className="flex items-center gap-1.5">
              {groupControls(
                groupAssetMix,
                () => setDashboardPrefs({ groupAssetMix: !groupAssetMix }),
                rawAssetGroups.length > 0,
                'asset',
              )}
              <PanelExpand />
              <PanelInfo panel="assetMix" />
            </div>
          }
        />
        <MixChart
          data={assetMix}
          scrollLegend
          height={200}
          emptyMessage={fnEmpty ?? 'Add tasks with asset counts to see the mix.'}
          compare={compare ? srcAssetMix : undefined}
          onSelect={(name) =>
            goTasks(expandChartSelection(assetGroups, name).map((v) => ['asset', v] as [string, string]))
          }
          taskCounts={assetMixCounts}
          prevTaskCounts={compare ? srcAssetMixCounts : undefined}
          sourceLabel={String(srcYear)}
        />
      </Card>
      <Card className="flex h-[376px] min-h-0 flex-col">
        <CardHeader
          title="Work type mix"
          className="shrink-0"
          subtitle={compare ? `Tasks by work type — ${activeYear} over ${srcYear}` : 'Tasks by work type'}
          action={
            <div className="flex items-center gap-1.5">
              {groupControls(
                groupWorkTypeMix,
                () => setDashboardPrefs({ groupWorkTypeMix: !groupWorkTypeMix }),
                rawTypeGroups.length > 0,
                'type',
              )}
              <PanelExpand />
              <PanelInfo panel="workTypeMix" />
            </div>
          }
        />
        <MixChart
          data={workTypeMix}
          scrollLegend
          height={200}
          emptyMessage={fnEmpty ?? 'Tag tasks with work types to see the mix.'}
          compare={compare ? srcWorkTypeMix : undefined}
          onSelect={(name) =>
            goTasks(expandChartSelection(typeGroups, name).map((v) => ['type', v] as [string, string]))
          }
          taskCounts={workTypeCounts}
          prevTaskCounts={compare ? srcWorkTypeCounts : undefined}
          sourceLabel={String(srcYear)}
        />
      </Card>
    </div>
  )
  const demandCard = (
    <Card className="flex min-h-0 flex-1 flex-col">
      <CardHeader
        title={squadFilter ? `${squadFilter}’s share of demand` : 'Squads demand distribution'}
        subtitle={
          squadFilter
            ? `Share of each ${demandDim === 'asset' ? 'asset type' : 'work type'} requested by ${squadFilter}, against all other squads${
                shareHidden > 0 ? ` · ${shareHidden} not requested` : ''
              }${compareSubtitleSuffix}`
            : `Share of each ${demandDim === 'asset' ? 'asset type' : 'work type'} across stakeholder groups${compareSubtitleSuffix}`
        }
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* Dimension tabs — split the chart by asset type or work type
                (mirrors the Settings → Dashboard preference; local only).
                Hover-only with the rest of the header controls. */}
            <div className="panel-action inline-flex items-center gap-0.5 rounded-lg bg-subtle p-0.5">
              {(
                [
                  ['asset', 'Asset types'],
                  ['type', 'Work types'],
                ] as [DemandDim, string][]
              ).map(([d, label]) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDashboardPrefs({ demandDim: d })}
                  aria-pressed={demandDim === d}
                  className={cx(
                    'rounded-md px-2 py-0.5 text-[11px] font-semibold transition',
                    demandDim === d
                      ? 'bg-rmit-navy text-white dark:bg-navy-300'
                      : 'text-muted hover:text-ink',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="panel-action h-4 w-px shrink-0 bg-line" aria-hidden="true" />
            {groupControls(
              groupDemand,
              () => setDashboardPrefs({ groupDemand: !groupDemand }),
              demandHasGroups,
              demandDim,
            )}
            <PanelExpand />
            <PanelInfo panel={squadFilter ? 'demandShare' : 'demand'} />
          </div>
        }
      />
      <div className="relative min-h-[220px] flex-1">
        <div className="absolute inset-0">
          {squadFilter ? (
            <StackedBarChart
              data={shareShown}
              keys={SHARE_KEYS}
              keyLabels={{ squad: squadFilter, rest: REST_LABEL }}
              // The squad keeps its usual colour (as on the workload dots); the
              // rest of GCMC recedes into a neutral grey.
              colors={[squadColor(squadFilter), 'var(--chart-rest)']}
              showShare
              height="100%"
              hideLegend
              emptyMessage={
                compare
                  ? `No ${demandDim === 'asset' ? 'asset types' : 'work types'} requested by ${squadFilter} in both ${srcYear} and ${activeYear}.`
                  : fnEmpty
              }
              compare={
                compare
                  ? { data: srcShareRows, label: String(srcYear), currentLabel: String(activeYear) }
                  : undefined
              }
              onSelect={(category, key) =>
                goTasks([
                  ...expandChartSelection(demandGroups, category).map(
                    (v) => [demandDim === 'asset' ? 'asset' : 'type', v] as [string, string],
                  ),
                  ...(key === 'squad' ? [squadFilter] : otherSquads()).map(
                    (s) => ['squad', s] as [string, string],
                  ),
                ])
              }
            />
          ) : (
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
                ...expandChartSelection(demandGroups, category).map(
                  (v) => [demandDim === 'asset' ? 'asset' : 'type', v] as [string, string],
                ),
                ...squadsInGroup(group).map((s) => ['squad', s] as [string, string]),
              ])
            }
          />
          )}
        </div>
      </div>
      {/* Stakeholder legend sits under the chart (centred), not in the header. */}
      <div className="mt-2 shrink-0">
        {squadFilter ? (
          <StackedLegend
            keys={SHARE_KEYS}
            keyLabels={{ squad: squadFilter, rest: REST_LABEL }}
            colors={[squadColor(squadFilter), 'var(--chart-rest)']}
            center
          />
        ) : (
          <StackedLegend keys={[...STAKEHOLDER_GROUPS]} paletteIndices={[0, 1, 2]} center />
        )}
      </div>
    </Card>
  )

  return (
    <div className="flex min-h-full flex-col gap-4">
      {/* Header stats: compact Volume panel + Effort panel + the two by-squad cards. */}
      {/* Volume gets a wider column than Effort — it carries two figures side by
          side, Effort only one. Only from 2xl though: at xl the uneven split
          squeezed Effort's column below the width its own header needs, so it
          stays on equal quarters until there's room. */}
      {/* Squad view: the two by-squad cards are just "squad vs everyone else", so they
          stack in ONE column (three columns, not four) and use the bigger SquadVsRest
          bars — a two-row ranking left most of a full-height card empty. */}
      <div
        className={cx(
          'grid items-stretch gap-4 lg:grid-cols-2',
          squadFilter
            ? 'xl:grid-cols-3 2xl:grid-cols-[1.4fr_1.05fr_1.15fr]'
            : 'xl:grid-cols-4 2xl:grid-cols-[1.4fr_1.05fr_1fr_1fr]',
        )}
      >
        <VolumeCompactCard
          assets={summary.totalAssets}
          tasks={summary.totalTasks}
          srcAssets={srcSummary.totalAssets}
          srcTasks={srcSummary.totalTasks}
          bySize={assetsBySize}
          srcBySize={srcAssetsBySize}
          cmp={cmpCtx}
        />
        <EffortSummaryCard
          hours={effortTotal}
          srcHours={srcEffortTotal}
          assets={summary.totalAssets}
          srcAssets={srcSummary.totalAssets}
          byType={effortByType}
          cmp={cmpCtx}
        />

        {squadFilter ? (
          <div className="flex flex-col gap-4 lg:col-span-2 xl:col-span-1">
            {bySquadCard('Tasks by squad', 'tasksBySquad', 'Requests by stakeholder team', bySquadTasks, srcBySquadTasks)}
            {bySquadCard('Assets by squad', 'assetsBySquad', 'Deliverables by stakeholder team', bySquad, srcBySquad)}
          </div>
        ) : (
          <>
            {bySquadCard('Tasks by squad', 'tasksBySquad', 'Requests by stakeholder team', bySquadTasks, srcBySquadTasks)}
            {bySquadCard('Assets by squad', 'assetsBySquad', 'Deliverables by stakeholder team', bySquad, srcBySquad)}
          </>
        )}
      </div>

      {squadFilter ? (
        // Squad view: a squad's campaign chart is usually a handful of bars, while its
        // share of demand spans every type it asked for — so the bottom row gets its own
        // split, campaign ⅓ and share of demand ⅔. The top row keeps workload | mixes.
        <>
          <div className="grid items-stretch gap-4 lg:grid-cols-2">
            <div className="grid min-h-0 grid-rows-[376px]">{workloadCard}</div>
            {mixesRow}
          </div>
          <div className="grid min-h-[300px] flex-1 items-stretch gap-4 lg:grid-cols-[1fr_2fr]">
            {campaignCard}
            {demandCard}
          </div>
        </>
      ) : (
        // Left: workload (fills height) above the campaign chart.
        // Right: the mix donuts above the full-height squads-demand distribution.
        <div className="grid min-h-0 flex-1 items-stretch gap-4 lg:grid-cols-2">
          {/* Workload row (376px — matches the donut cards opposite so the rows line up);
              remaining space belongs to the campaign chart. */}
          <div className="grid min-h-0 grid-rows-[376px_minmax(300px,1fr)] gap-4">
            {workloadCard}
            {campaignCard}
          </div>
          <div className="flex min-h-0 flex-col gap-4">
            {mixesRow}
            {demandCard}
          </div>
        </div>
      )}

      {/* Drill-down pop-up — the Task List over the dashboard. */}
      <Modal
        open={Boolean(drill)}
        onClose={() => setDrill(null)}
        widthClass="max-w-[96vw] min-h-[88vh]"
        title={
          <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <span className="min-w-0 truncate">Tasks — {drill ? drillTitle(drill) : ''}</span>
            <button
              type="button"
              onClick={() => drill && navigate({ pathname: '/tasks', search: `?${drill.toString()}` })}
              title="Leave the dashboard and open these tasks on the Task List page"
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold text-muted transition hover:bg-subtle hover:text-ink"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open in Task List
            </button>
          </span>
        }
      >
        {drill && <TaskList key={drill.toString()} seed={drill} embedded />}
      </Modal>

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

      {/* Chart groups editor — opened by the panels' gear icons. */}
      <ChartGroupsModal
        open={chartGroupsOpen}
        onClose={() => setChartGroupsOpen(false)}
        initialTab={chartGroupsTab}
      />

      {/* Edit form — reached from the details view; never leaves the dashboard. */}
      <Modal
        open={Boolean(editTask)}
        onClose={() => setEditTask(null)}
        title={
          <span className="flex items-center gap-2">
            Edit task
            {editTask && <TaskStar id={editTask.id} />}
          </span>
        }
        wide
      >
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
