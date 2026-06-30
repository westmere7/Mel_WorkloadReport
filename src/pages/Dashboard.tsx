import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, Images, Megaphone, Users } from 'lucide-react'
import { Card, CardHeader } from '../components/ui/Card'
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
  const byHalf = useMemo(() => countByField(tasks, 'half'), [tasks])

  if (tasks.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <p className="text-base font-semibold text-ink">No tasks yet</p>
        <p className="max-w-sm text-sm text-muted">
          Register your first task to start tracking the team’s workload — or populate sample data
          from Settings → Developer.
        </p>
        <Link to="/new" className="btn-primary mt-2">
          Create a task
        </Link>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
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
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

      {/* Workload across the year */}
      <Card>
        <CardHeader
          title="Workload across the year"
          subtitle="Total assets booked per month, by task start date"
        />
        <AreaTrendChart data={byMonth} />
      </Card>

      {/* Campaign bar + asset mix donut */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Tasks by campaign" subtitle="How work is distributed across campaigns" />
          <VBarChart data={byCampaign} emptyMessage="Add tasks across at least 2 campaigns." />
        </Card>
        <Card>
          <CardHeader title="Asset mix" subtitle="Deliverables by type" />
          <DonutChart data={assetMix} emptyMessage="Add tasks with asset counts to see the mix." />
        </Card>
      </div>

      {/* Person + squad */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Workload by person" subtitle="Tasks assigned per team member" />
          <HBarChart data={byPerson} emptyMessage="Assign people to at least 2 tasks." />
        </Card>
        <Card>
          <CardHeader title="Tasks by squad" subtitle="Requests by stakeholder team" />
          <HBarChart data={bySquad} emptyMessage="Add tasks for at least 2 squads." />
        </Card>
      </div>

      {/* Size + half */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Tasks by size" subtitle="Effort distribution (XS → XL)" />
          <VBarChart
            data={bySize}
            minPoints={1}
            angledLabels={false}
            colors={SIZES.map((s) => SIZE_COLORS[s])}
            emptyMessage="Add tasks to see the size spread."
          />
        </Card>
        <Card>
          <CardHeader title="H1 vs H2" subtitle="Split across the year" />
          <DonutChart data={byHalf} minPoints={1} emptyMessage="Add tasks to see the split." />
        </Card>
      </div>
    </div>
  )
}
