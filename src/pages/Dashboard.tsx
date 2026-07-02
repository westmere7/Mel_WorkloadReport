import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, ClipboardList, Images, Megaphone } from 'lucide-react'
import { Card, CardHeader } from '../components/ui/Card'
import { useHeaderSlots } from '../components/Layout'
import { useNewTask } from '../components/NewTaskModal'
import { StatCard } from '../components/ui/StatCard'
import { TrendDelta } from '../components/ui/TrendDelta'
import { AreaTrendChart, DonutChart, HBarChart, RankedBars, StackedBarChart, VBarChart } from '../components/charts'
import { useStore } from '../data/store'
import {
  assetsByCampaign,
  assetsByMonth,
  assetsByType,
  countByField,
  countByMulti,
  countBySize,
  demandByStakeholder,
  demandByStakeholderAssetType,
  STAKEHOLDER_GROUPS,
  summarize,
} from '../lib/analytics'
import { SIZE_COLORS, withFallback } from '../constants'
import { compactNumber, cx } from '../lib/format'
import { SpanFilter } from '../components/SpanFilter'
import { filterBySpan, taskYears, type SpanMode } from '../lib/span'
import { COMMON_CAMPAIGNS, useDashboardPrefs } from '../lib/dashboardPrefs'
import { useAuth } from '../lib/auth'
import type { Half, Size } from '../types'

export function Dashboard() {
  const { tasks, live, settings } = useStore()
  const { openNewTask } = useNewTask()
  const { canEdit } = useAuth()
  const [span, setSpan] = useState<SpanMode>('total')
  const [year, setYear] = useState<number | null>(null)
  const [half, setHalf] = useState<Half>('H1')
  // Comparison mode: measure the target year against a source (baseline) year.
  const [compare, setCompare] = useState(false)
  const [sourceYear, setSourceYear] = useState<number | null>(null)
  // Chart display preferences — edited in Settings → Dashboard.
  const { demandDim, hideCommonCampaigns, showTasksByPerson } = useDashboardPrefs()

  const years = useMemo(() => taskYears(tasks), [tasks])

  // Selected year falls back to the most recent year present in the data.
  const activeYear = year ?? years[0] ?? 0

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
  const filtered = useMemo(
    () => filterBySpan(tasks, compare ? 'year' : span, activeYear, half),
    [tasks, span, activeYear, half, compare],
  )
  const sourceTasks = useMemo(
    () => (compare ? filterBySpan(tasks, 'year', srcYear, half) : []),
    [tasks, compare, srcYear, half],
  )

  const summary = useMemo(() => summarize(filtered), [filtered])
  const bySquad = useMemo(() => countByField(filtered, 'squad'), [filtered])
  const byCampaign = useMemo(() => countByField(filtered, 'campaign'), [filtered])
  const assetCampaign = useMemo(() => assetsByCampaign(filtered), [filtered])
  const dropCommon = (rows: { name: string; value: number }[]) =>
    hideCommonCampaigns ? rows.filter((r) => !COMMON_CAMPAIGNS.includes(r.name)) : rows
  const byCampaignShown = useMemo(() => dropCommon(byCampaign), [byCampaign, hideCommonCampaigns])
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
  const byMonth = useMemo(
    () => assetsByMonth(tasks.filter((t) => t.startDate && Number(t.startDate.slice(0, 4)) === chartYear)),
    [tasks, chartYear],
  )
  // Mark "now" on the workload chart only when viewing the current calendar year.
  const nowMonth = useMemo(() => {
    const now = new Date()
    return chartYear === now.getFullYear() ? now.getMonth() : null
  }, [chartYear])
  const bySize = useMemo(() => countBySize(filtered), [filtered])

  // ── Source-year aggregates (comparison mode only) ──────────────────────
  const srcSummary = useMemo(() => summarize(sourceTasks), [sourceTasks])
  const srcByCampaign = useMemo(
    () => dropCommon(countByField(sourceTasks, 'campaign')),
    [sourceTasks, hideCommonCampaigns], // eslint-disable-line react-hooks/exhaustive-deps
  )
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
  const srcByMonth = useMemo(
    () => assetsByMonth(tasks.filter((t) => t.startDate && Number(t.startDate.slice(0, 4)) === srcYear)),
    [tasks, srcYear],
  )

  // Render the Live badge (left) and span selector (right) into the top header bar.
  const setHeaderSlots = useHeaderSlots()
  useEffect(() => {
    setHeaderSlots({
      left: (
        <span
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted"
          title={live ? 'Dashboard updates automatically when tasks change' : 'Live updates unavailable'}
        >
          <span className={cx('relative flex h-2 w-2', !live && 'opacity-40')}>
            {live && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-green opacity-75" />
            )}
            <span className={cx('relative inline-flex h-2 w-2 rounded-full', live ? 'bg-accent-green' : 'bg-faint')} />
          </span>
          {live ? 'Live' : 'Offline'}
        </span>
      ),
      right: (
        <div className="flex flex-wrap items-center gap-2">
          {compare ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">Base</span>
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
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">vs</span>
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
            onClick={() => setCompare((c) => !c)}
            title={compare ? 'Exit comparison mode' : 'Compare two years'}
            className={cx(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold shadow-soft transition',
              compare ? 'bg-rmit-navy text-white dark:bg-navy-300' : 'bg-card text-muted hover:text-ink',
            )}
          >
            <ArrowLeftRight className="h-3.5 w-3.5" /> Compare
          </button>
          <span className="text-xs font-semibold text-muted">
            {compare ? `${sourceTasks.length} → ${filtered.length} tasks` : `${filtered.length} tasks`}
          </span>
        </div>
      ),
    })
    return () => setHeaderSlots({})
  }, [
    setHeaderSlots,
    live,
    span,
    activeYear,
    half,
    years,
    filtered.length,
    compare,
    srcYear,
    sourceYearOptions,
    sourceTasks.length,
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
  const compareSubtitleSuffix = compare ? ` — ${srcYear} (faded) vs ${activeYear}` : ''

  return (
    <div className="space-y-4">
      {/* Header stats: three hero cards + a Tasks-by-squad card */}
      <div className="grid items-stretch gap-3 lg:grid-cols-4">
        <StatCard
          label={compare ? `Assets · ${activeYear}` : 'Total assets'}
          value={compactNumber(summary.totalAssets)}
          icon={Images}
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
              ? `${summary.totalAssets} vs ${srcSummary.totalAssets} deliverables in ${srcYear}`
              : `${summary.totalAssets} deliverables`
          }
        />
        <StatCard
          label={compare ? `Tasks · ${activeYear}` : 'Total tasks'}
          value={summary.totalTasks}
          icon={ClipboardList}
          accent="red"
          size="xl"
          delta={
            compare ? (
              <TrendDelta
                current={summary.totalTasks}
                previous={srcSummary.totalTasks}
                title={`${srcYear}: ${srcSummary.totalTasks} → ${activeYear}: ${summary.totalTasks}`}
              />
            ) : undefined
          }
          hint={compare ? `vs ${srcSummary.totalTasks} tasks in ${srcYear}` : undefined}
          footer={
            <div className="flex flex-wrap gap-x-2.5 gap-y-1 text-sm">
              {bySize.map((s) => (
                <span key={s.name} className="whitespace-nowrap">
                  <span className="font-bold" style={{ color: SIZE_COLORS[s.name as Size] }}>
                    {s.name}
                  </span>
                  <span className="text-muted">:{s.value}</span>
                </span>
              ))}
            </div>
          }
        />
        <StatCard
          label={compare ? `Campaigns · ${activeYear}` : 'Total campaigns'}
          value={summary.totalCampaigns}
          icon={Megaphone}
          accent="orange"
          size="xl"
          delta={
            compare ? (
              <TrendDelta
                current={summary.totalCampaigns}
                previous={srcSummary.totalCampaigns}
                title={`${srcYear}: ${srcSummary.totalCampaigns} → ${activeYear}: ${summary.totalCampaigns}`}
              />
            ) : undefined
          }
          hint={compare ? `vs ${srcSummary.totalCampaigns} campaigns in ${srcYear}` : undefined}
        />

        <Card className="flex flex-col">
          <CardHeader title="Tasks by squad" subtitle="Requests by stakeholder team" />
          <RankedBars data={bySquad} emptyMessage="Add tasks for at least 2 squads." />
        </Card>
      </div>

      {/* Workload trend + asset mix + work type mix (+ tasks by person, optional) — equal
          heights. When Tasks-by-person is hidden, Workload gets the extra width. */}
      <div className="grid items-stretch gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <Card className={cx('flex flex-col', !showTasksByPerson && 'lg:col-span-2 xl:col-span-2')}>
          <CardHeader
            title="Workload across the year"
            subtitle="Assets produced per month"
            action={
              <span className="shrink-0 rounded-full bg-subtle px-2.5 py-0.5 text-xs font-semibold text-ink">
                {compare ? `${srcYear} vs ${activeYear}` : chartYear}
              </span>
            }
          />
          <div className="min-h-[180px] flex-1">
            <AreaTrendChart
              data={byMonth}
              height="100%"
              nowMonth={nowMonth}
              compare={
                compare
                  ? { data: srcByMonth, label: String(srcYear), currentLabel: String(activeYear) }
                  : undefined
              }
            />
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Asset mix"
            subtitle={compare ? `Deliverables by type — % vs ${srcYear}` : 'Deliverables by type'}
          />
          <DonutChart
            data={assetMix}
            height={200}
            emptyMessage="Add tasks with asset counts to see the mix."
            compare={compare ? srcAssetMix : undefined}
          />
        </Card>
        <Card>
          <CardHeader
            title="Work type mix"
            subtitle={compare ? `Tasks by work type — % vs ${srcYear}` : 'Tasks by work type'}
          />
          <DonutChart
            data={workTypeMix}
            height={200}
            emptyMessage="Tag tasks with work types to see the mix."
            compare={compare ? srcWorkTypeMix : undefined}
          />
        </Card>
        {showTasksByPerson && (
          <Card className="flex flex-col">
            <CardHeader title="Tasks by person" subtitle="Tasks assigned per team member" />
            <div className="min-h-[180px] flex-1">
              <HBarChart data={byPerson} height="100%" emptyMessage="Assign people to at least 2 tasks." />
            </div>
          </Card>
        )}
      </div>

      {/* Campaign charts stacked; demand by stakeholders takes the full height on the right */}
      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <div className="grid content-start gap-4">
          <Card>
            <CardHeader
              title="Tasks by campaign"
              subtitle={`Work distribution across campaigns${campaignSubtitleSuffix}${compareSubtitleSuffix}`}
            />
            <VBarChart
              data={byCampaignShown}
              height={220}
              emptyMessage={
                compare
                  ? `No campaigns with tasks in both ${srcYear} and ${activeYear}.`
                  : 'Add tasks across at least 2 campaigns.'
              }
              compare={
                compare
                  ? { data: srcByCampaign, label: String(srcYear), currentLabel: String(activeYear) }
                  : undefined
              }
            />
          </Card>
          <Card>
            <CardHeader
              title="Asset count by campaign"
              subtitle={`Total deliverables produced per campaign${campaignSubtitleSuffix}${compareSubtitleSuffix}`}
            />
            <VBarChart
              data={assetCampaignShown}
              height={220}
              emptyMessage={
                compare
                  ? `No campaigns with assets in both ${srcYear} and ${activeYear}.`
                  : 'Add tasks with asset counts across at least 2 campaigns.'
              }
              compare={
                compare
                  ? { data: srcAssetCampaign, label: String(srcYear), currentLabel: String(activeYear) }
                  : undefined
              }
            />
          </Card>
        </div>
        <Card className="flex flex-col">
          <CardHeader
            title="Demand by stakeholders"
            subtitle={`Deliverables per ${demandDim === 'asset' ? 'asset type' : 'work type'}, split by stakeholder group${compareSubtitleSuffix}`}
          />
          <div className="flex-1">
            <StackedBarChart
              data={demand}
              keys={[...STAKEHOLDER_GROUPS]}
              paletteIndices={[0, 1, 2]}
              labelColors={['#ffffff', '#ffffff', '#000054']}
              height={540}
              emptyMessage={
                compare
                  ? `No ${demandDim === 'asset' ? 'asset types' : 'work types'} with demand in both ${srcYear} and ${activeYear}.`
                  : 'Add tasks with asset counts to see demand.'
              }
              compare={
                compare
                  ? { data: srcDemand, label: String(srcYear), currentLabel: String(activeYear) }
                  : undefined
              }
            />
          </div>
        </Card>
      </div>
    </div>
  )
}
