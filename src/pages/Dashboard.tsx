import { useMemo, useState } from 'react'
import { ClipboardList, Images, Layers, Megaphone } from 'lucide-react'
import { Card, CardHeader } from '../components/ui/Card'
import { useNewTask } from '../components/NewTaskModal'
import { StatCard } from '../components/ui/StatCard'
import { AreaTrendChart, DonutChart, HBarChart, StackedBarChart, VBarChart } from '../components/charts'
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
import type { Half, Size } from '../types'

type DemandDim = 'type' | 'asset'

export function Dashboard() {
  const { tasks, live, settings } = useStore()
  const { openNewTask } = useNewTask()
  const [span, setSpan] = useState<SpanMode>('total')
  const [year, setYear] = useState<number | null>(null)
  const [half, setHalf] = useState<Half>('H1')
  const [demandDim, setDemandDim] = useState<DemandDim>('type')

  const years = useMemo(() => taskYears(tasks), [tasks])

  // Selected year falls back to the most recent year present in the data.
  const activeYear = year ?? years[0] ?? 0

  const filtered = useMemo(
    () => filterBySpan(tasks, span, activeYear, half),
    [tasks, span, activeYear, half],
  )

  const summary = useMemo(() => summarize(filtered), [filtered])
  const byCampaign = useMemo(() => countByField(filtered, 'campaign'), [filtered])
  const assetCampaign = useMemo(() => assetsByCampaign(filtered), [filtered])
  const demand = useMemo(
    () =>
      demandDim === 'asset'
        ? demandByStakeholderAssetType(filtered, withFallback(settings.assetTypes))
        : demandByStakeholder(filtered, settings.types),
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
  const bySize = useMemo(() => countBySize(filtered), [filtered])

  if (tasks.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <p className="text-base font-semibold text-ink">No tasks yet</p>
        <p className="max-w-sm text-sm text-muted">
          Register your first task to start tracking the team’s workload — or populate sample data
          from Settings → Developer.
        </p>
        <button onClick={openNewTask} className="btn-primary mt-2">
          Create a task
        </button>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Live status + time-span selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span
          className="inline-flex items-center gap-2 rounded-lg bg-card px-3 py-1.5 text-xs font-semibold text-muted shadow-soft"
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
      </div>

      {/* Header stats: three big hero cards + a stacked secondary column */}
      <div className="grid items-stretch gap-3 lg:grid-cols-4">
        <StatCard
          label="Total assets"
          value={compactNumber(summary.totalAssets)}
          icon={Images}
          accent="navy"
          size="xl"
          hint={`${summary.totalAssets} deliverables`}
        />
        <StatCard label="Total tasks" value={summary.totalTasks} icon={ClipboardList} accent="red" size="xl" />
        <StatCard label="Total campaigns" value={summary.totalCampaigns} icon={Megaphone} accent="orange" size="xl" />

        <div className="grid content-start gap-3">
          <StatCard
            label="Top request type"
            value={summary.topRequestType?.name ?? '—'}
            icon={Layers}
            accent="teal"
            size="md"
            hint={summary.topRequestType ? `${summary.topRequestType.count} tasks` : undefined}
          />
          <Card>
            <CardHeader title="Tasks by size" subtitle="Effort distribution (XS → XL)" />
            <div className="grid grid-cols-5 gap-1.5">
              {bySize.map((s) => (
                <div
                  key={s.name}
                  className="flex flex-col items-center gap-1 rounded-xl border border-line px-1 py-2.5"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: SIZE_COLORS[s.name as Size] }}
                  />
                  <span className="text-xl font-bold leading-none text-ink">{s.value}</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{s.name}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Workload trend + asset mix + workload by person */}
      <div className="grid items-stretch gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader
            title="Workload across the year"
            subtitle={`Assets booked per month in ${activeYear} — warmer band marks peak season`}
          />
          <AreaTrendChart data={byMonth} height={200} />
        </Card>
        <Card>
          <CardHeader title="Asset mix" subtitle="Deliverables by type" />
          <DonutChart data={assetMix} height={200} emptyMessage="Add tasks with asset counts to see the mix." />
        </Card>
        <Card>
          <CardHeader title="Workload by person" subtitle="Tasks assigned per team member" />
          <HBarChart data={byPerson} height={200} emptyMessage="Assign people to at least 2 tasks." />
        </Card>
      </div>

      {/* Campaign charts stacked; demand by stakeholders takes the full height on the right */}
      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <div className="grid content-start gap-4">
          <Card>
            <CardHeader title="Tasks by campaign" subtitle="Work distribution across campaigns" />
            <VBarChart data={byCampaign} height={220} emptyMessage="Add tasks across at least 2 campaigns." />
          </Card>
          <Card>
            <CardHeader title="Asset count by campaign" subtitle="Total deliverables produced per campaign" />
            <VBarChart
              data={assetCampaign}
              height={220}
              emptyMessage="Add tasks with asset counts across at least 2 campaigns."
            />
          </Card>
        </div>
        <Card className="flex flex-col">
          <CardHeader
            title="Demand by stakeholders"
            subtitle={`Deliverables per ${demandDim === 'asset' ? 'asset type' : 'work type'}, split by stakeholder group`}
            action={
              <div className="flex items-center gap-0.5 rounded-lg bg-subtle p-0.5">
                {(
                  [
                    ['type', 'Work type'],
                    ['asset', 'Asset type'],
                  ] as [DemandDim, string][]
                ).map(([d, label]) => (
                  <button
                    key={d}
                    onClick={() => setDemandDim(d)}
                    className={cx(
                      'rounded-md px-2.5 py-1 text-xs font-semibold transition',
                      demandDim === d ? 'bg-rmit-navy text-white dark:bg-navy-300' : 'text-muted hover:text-ink',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            }
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
