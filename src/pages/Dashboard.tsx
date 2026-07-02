import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Images, Megaphone } from 'lucide-react'
import { Card, CardHeader } from '../components/ui/Card'
import { useHeaderSlots } from '../components/Layout'
import { useNewTask } from '../components/NewTaskModal'
import { StatCard } from '../components/ui/StatCard'
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
  // Chart display preferences — edited in Settings → Dashboard.
  const { demandDim, hideCommonCampaigns } = useDashboardPrefs()

  const years = useMemo(() => taskYears(tasks), [tasks])

  // Selected year falls back to the most recent year present in the data.
  const activeYear = year ?? years[0] ?? 0

  const filtered = useMemo(
    () => filterBySpan(tasks, span, activeYear, half),
    [tasks, span, activeYear, half],
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
  // "Across the year" ignores the half sub-filter — it always shows the full 12
  // months of the active year (the latest year by default, or the selected one).
  const byMonth = useMemo(
    () => assetsByMonth(tasks.filter((t) => t.startDate && Number(t.startDate.slice(0, 4)) === activeYear)),
    [tasks, activeYear],
  )
  // Mark "now" on the workload chart only when viewing the current calendar year.
  const nowMonth = useMemo(() => {
    const now = new Date()
    return activeYear === now.getFullYear() ? now.getMonth() : null
  }, [activeYear])
  const bySize = useMemo(() => countBySize(filtered), [filtered])

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
          <SpanFilter
            mode={span}
            year={activeYear}
            half={half}
            years={years}
            onMode={setSpan}
            onYear={setYear}
            onHalf={setHalf}
          />
          <span className="text-xs font-semibold text-muted">{filtered.length} tasks</span>
        </div>
      ),
    })
    return () => setHeaderSlots({})
  }, [setHeaderSlots, live, span, activeYear, half, years, filtered.length])

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

  return (
    <div className="space-y-4">
      {/* Header stats: three hero cards + a Tasks-by-squad card */}
      <div className="grid items-stretch gap-3 lg:grid-cols-4">
        <StatCard
          label="Total assets"
          value={compactNumber(summary.totalAssets)}
          icon={Images}
          accent="navy"
          size="xl"
          hint={`${summary.totalAssets} deliverables`}
        />
        <StatCard
          label="Total tasks"
          value={summary.totalTasks}
          icon={ClipboardList}
          accent="red"
          size="xl"
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
        <StatCard label="Total campaigns" value={summary.totalCampaigns} icon={Megaphone} accent="orange" size="xl" />

        <Card className="flex flex-col">
          <CardHeader title="Tasks by squad" subtitle="Requests by stakeholder team" />
          <RankedBars data={bySquad} emptyMessage="Add tasks for at least 2 squads." />
        </Card>
      </div>

      {/* Workload trend + asset mix + tasks by person — equal heights; the two bar/area
          charts fill their cards to match the (legend-driven) height of Asset mix. */}
      <div className="grid items-stretch gap-4 lg:grid-cols-3">
        <Card className="flex flex-col">
          <CardHeader
            title="Workload across the year"
            subtitle={`Assets booked per month in ${activeYear}`}
          />
          <div className="min-h-[180px] flex-1">
            <AreaTrendChart data={byMonth} height="100%" nowMonth={nowMonth} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Asset mix" subtitle="Deliverables by type" />
          <DonutChart data={assetMix} height={200} emptyMessage="Add tasks with asset counts to see the mix." />
        </Card>
        <Card className="flex flex-col">
          <CardHeader title="Tasks by person" subtitle="Tasks assigned per team member" />
          <div className="min-h-[180px] flex-1">
            <HBarChart data={byPerson} height="100%" emptyMessage="Assign people to at least 2 tasks." />
          </div>
        </Card>
      </div>

      {/* Campaign charts stacked; demand by stakeholders takes the full height on the right */}
      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <div className="grid content-start gap-4">
          <Card>
            <CardHeader
              title="Tasks by campaign"
              subtitle={`Work distribution across campaigns${campaignSubtitleSuffix}`}
            />
            <VBarChart data={byCampaignShown} height={220} emptyMessage="Add tasks across at least 2 campaigns." />
          </Card>
          <Card>
            <CardHeader
              title="Asset count by campaign"
              subtitle={`Total deliverables produced per campaign${campaignSubtitleSuffix}`}
            />
            <VBarChart
              data={assetCampaignShown}
              height={220}
              emptyMessage="Add tasks with asset counts across at least 2 campaigns."
            />
          </Card>
        </div>
        <Card className="flex flex-col">
          <CardHeader
            title="Demand by stakeholders"
            subtitle={`Deliverables per ${demandDim === 'asset' ? 'asset type' : 'work type'}, split by stakeholder group`}
          />
          <div className="flex-1">
            <StackedBarChart
              data={demand}
              keys={[...STAKEHOLDER_GROUPS]}
              paletteIndices={[0, 1, 2]}
              labelColors={['#ffffff', '#ffffff', '#000054']}
              height={540}
              emptyMessage="Add tasks with asset counts to see demand."
            />
          </div>
        </Card>
      </div>
    </div>
  )
}
