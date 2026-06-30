import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { LineChart as LineChartIcon } from 'lucide-react'
import type { NamedCount } from '../lib/analytics'
import { CHART_COLORS_DARK, CHART_COLORS_LIGHT } from '../constants'
import { useTheme } from '../lib/theme'

/** Theme-aware categorical palette (re-renders on theme toggle). */
function useChartColors() {
  return useTheme().theme === 'dark' ? CHART_COLORS_DARK : CHART_COLORS_LIGHT
}

const tooltipStyle = {
  borderRadius: 12,
  background: 'var(--card)',
  border: '1px solid var(--line)',
  boxShadow: '0 8px 24px rgba(0,0,84,0.18)',
  color: 'var(--ink)',
  fontSize: 12,
  padding: '8px 12px',
}

const AXIS = { fontSize: 12, fill: 'var(--chart-axis)' }
const AXIS_STRONG = { fontSize: 12, fill: 'var(--chart-axis-strong)' }
const CURSOR = { fill: 'var(--chart-cursor)' }

/** Shown when there isn't enough data to render a meaningful chart. */
export function NotEnough({ message, height = 200 }: { message?: string; height?: number }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line text-center"
      style={{ minHeight: height }}
    >
      <LineChartIcon className="h-6 w-6 text-faint" />
      <p className="text-sm font-semibold text-muted">Not enough data yet</p>
      <p className="max-w-[220px] text-xs text-faint">
        {message ?? 'Add more tasks to populate this chart.'}
      </p>
    </div>
  )
}

/** Donut chart with a centered total and an external legend. */
export function DonutChart({
  data,
  height = 240,
  minPoints = 1,
  emptyMessage,
}: {
  data: NamedCount[]
  height?: number
  minPoints?: number
  emptyMessage?: string
}) {
  const colors = useChartColors()
  const total = data.reduce((a, b) => a + b.value, 0)
  if (total === 0 || data.length < minPoints) return <NotEnough message={emptyMessage} height={height} />

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative" style={{ width: 180, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={58}
              outerRadius={84}
              paddingAngle={2}
              stroke="none"
            >
              {data.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-ink">{total}</span>
          <span className="text-[11px] uppercase tracking-wide text-muted">total</span>
        </div>
      </div>
      <ul className="flex-1 space-y-1.5">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 truncate">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: colors[i % colors.length] }}
              />
              <span className="truncate text-muted">{d.name}</span>
            </span>
            <span className="font-semibold text-ink">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Horizontal bar chart — good for ranked categories (people, squads). */
export function HBarChart({
  data,
  height = 260,
  minPoints = 2,
  emptyMessage,
}: {
  data: NamedCount[]
  height?: number
  minPoints?: number
  emptyMessage?: string
}) {
  const colors = useChartColors()
  if (data.length < minPoints) return <NotEnough message={emptyMessage} height={height} />
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={120}
          tick={AXIS_STRONG}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip cursor={CURSOR} contentStyle={tooltipStyle} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18}>
          {data.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Vertical bar chart — good for campaigns / sizes. */
export function VBarChart({
  data,
  height = 260,
  minPoints = 2,
  emptyMessage,
  colors,
  angledLabels = true,
}: {
  data: NamedCount[]
  height?: number
  minPoints?: number
  emptyMessage?: string
  colors?: string[]
  angledLabels?: boolean
}) {
  const themed = useChartColors()
  if (data.length < minPoints) return <NotEnough message={emptyMessage} height={height} />
  const palette = colors ?? themed
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
          axisLine={false}
          tickLine={false}
          interval={0}
          angle={angledLabels ? -25 : 0}
          textAnchor={angledLabels ? 'end' : 'middle'}
          height={angledLabels ? 64 : 28}
        />
        <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={28} />
        <Tooltip cursor={CURSOR} contentStyle={tooltipStyle} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={26}>
          {data.map((_, i) => (
            <Cell key={i} fill={palette[i % palette.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Area chart of a value across the 12 months of the year. */
export function AreaTrendChart({
  data,
  height = 260,
  minMonths = 2,
  emptyMessage,
}: {
  data: NamedCount[]
  height?: number
  minMonths?: number
  emptyMessage?: string
}) {
  const monthsWithData = data.filter((d) => d.value > 0).length
  if (monthsWithData < minMonths)
    return <NotEnough message={emptyMessage ?? 'Add tasks with start dates in different months.'} height={height} />

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 4 }}>
        <defs>
          <linearGradient id="workloadFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E61E2A" stopOpacity={0.32} />
            <stop offset="100%" stopColor="#E61E2A" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={32} />
        <Tooltip
          cursor={{ stroke: '#E61E2A', strokeWidth: 1, strokeDasharray: '4 4' }}
          contentStyle={tooltipStyle}
          formatter={(v: number) => [`${v} assets`, 'Workload']}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="#E61E2A"
          strokeWidth={2.5}
          fill="url(#workloadFill)"
          dot={{ r: 3, fill: '#E61E2A', strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
