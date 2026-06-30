import { useMemo, useState } from 'react'
import { ClipboardList, Images, Megaphone, Users } from 'lucide-react'
import { Card, CardHeader } from '../components/ui/Card'
import { useNewTask } from '../components/NewTaskModal'
import { StatCard } from '../components/ui/StatCard'
import { AreaTrendChart, DonutChart, HBarChart, VBarChart } from '../components/charts'
import { useStore } from '../data/store'
import {
  assetsByMonth,
  assetsByType,
  countByField,
  countByMulti,
  countBySize,
  summarize,
} from '../lib/analytics'
import { SIZES, SIZE_COLORS } from '../constants'
import { compactNumber, cx } from '../lib/format'
import type { Half } from '../types'

type Filter = 'all' | Half

export function Dashboard() {
  const { tasks, live } = useStore()
  const { openNewTask } = useNewTask()
  const [filter, setFilter] = useState<Filter>('all')

  const filtered = useMemo(
    () => (filter === 'all' ? tasks : tasks.filter((t) => t.half === filter)),
    [tasks, filter],
  )

  const summary = useMemo(() => summarize(filtered), [filtered])
  const bySquad = useMemo(() => countByField(filtered, 'squad'), [filtered])
  const byCampaign = useMemo(() => countByField(filtered, 'campaign'), [filtered])
  const byPerson = useMemo(() => countByMulti(filtered, 'people'), [filtered])
  const assetMix = useMemo(() => assetsByType(filtered), [filtered])
  const byMonth = useMemo(() => assetsByMonth(filtered), [filtered])
  const bySize = useMemo(() => countBySize(filtered), [filtered])
  const halfCounts = useMemo(
    () => ({
      all: tasks.length,
      H1: tasks.filter((t) => t.half === 'H1').length,
      H2: tasks.filter((t) => t.half === 'H2').length,
    }),
    [tasks],
  )

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
      {/* Live status + Half filter */}
      <div className="flex items-center justify-between gap-3">
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

        <div className="flex items-center gap-1.5">
          {(['all', 'H1', 'H2'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cx(
                'rounded-lg px-3.5 py-1.5 text-sm font-semibold transition',
                filter === f ? 'bg-rmit-navy text-white dark:bg-navy-300' : 'bg-card text-muted shadow-soft hover:text-ink',
              )}
            >
              {f === 'all' ? 'All year' : f}
              <span className="ml-1.5 opacity-60">{halfCounts[f]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total tasks" value={summary.totalTasks} icon={ClipboardList} accent="red" />
        <StatCard
          label="Total assets"
          value={compactNumber(summary.totalAssets)}
          icon={Images}
          accent="navy"
          hint={`${summary.totalAssets} deliverables`}
        />
        <StatCard label="Active campaigns" value={summary.activeCampaigns} icon={Megaphone} accent="orange" />
        <StatCard label="People engaged" value={summary.peopleEngaged} icon={Users} accent="teal" />
      </div>

      {/* Campaign bar + workload trend */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Workload across the year" subtitle="Total assets booked per month, by start date" />
          <AreaTrendChart data={byMonth} height={180} />
        </Card>
        <Card>
          <CardHeader title="Asset mix" subtitle="Deliverables by type" />
          <DonutChart data={assetMix} height={180} emptyMessage="Add tasks with asset counts to see the mix." />
        </Card>
      </div>

      {/* Campaign + distribution charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Tasks by campaign" subtitle="Work distribution across campaigns" />
          <VBarChart data={byCampaign} height={200} emptyMessage="Add tasks across at least 2 campaigns." />
        </Card>
        <Card>
          <CardHeader title="Tasks by size" subtitle="Effort distribution (XS → XL)" />
          <VBarChart
            data={bySize}
            height={200}
            minPoints={1}
            angledLabels={false}
            colors={SIZES.map((s) => SIZE_COLORS[s])}
            emptyMessage="Add tasks to see the size spread."
          />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Workload by person" subtitle="Tasks assigned per team member" />
          <HBarChart data={byPerson} height={210} emptyMessage="Assign people to at least 2 tasks." />
        </Card>
        <Card>
          <CardHeader title="Tasks by squad" subtitle="Requests by stakeholder team" />
          <HBarChart data={bySquad} height={210} emptyMessage="Add tasks for at least 2 squads." />
        </Card>
      </div>
    </div>
  )
}
