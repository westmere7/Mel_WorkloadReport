import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ReferenceLine,
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

// Recharts colours item/label text from the series colour, which is undefined
// when bars are coloured via <Cell> (defaults to black → invisible on dark).
// Force both to the themed ink so tooltips stay readable in either theme.
const tooltipItemStyle = { color: 'var(--ink)' }
const tooltipLabelStyle = { color: 'var(--ink)', fontWeight: 600 }

const AXIS = { fontSize: 12, fill: 'var(--chart-axis)' }
const AXIS_STRONG = { fontSize: 12, fill: 'var(--chart-axis-strong)' }
const CURSOR = { fill: 'var(--chart-cursor)' }

/** Shown when there isn't enough data to render a meaningful chart. */
export function NotEnough({ message, height = 200 }: { message?: string; height?: number | string }) {
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
            <Tooltip
              contentStyle={tooltipStyle}
              itemStyle={tooltipItemStyle}
              labelStyle={tooltipLabelStyle}
            />
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
  height?: number | string
  minPoints?: number
  emptyMessage?: string
}) {
  const colors = useChartColors()
  if (data.length < minPoints) return <NotEnough message={emptyMessage} height={height} />
  // Size the label gutter to the longest name so it hugs short names but never clips long ones.
  const longest = data.reduce((m, d) => Math.max(m, d.name.length), 0)
  const yWidth = Math.min(140, Math.max(36, longest * 7 + 12))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={yWidth}
          tick={AXIS_STRONG}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={CURSOR}
          contentStyle={tooltipStyle}
          itemStyle={tooltipItemStyle}
          labelStyle={tooltipLabelStyle}
        />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18}>
          {data.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/**
 * A ranked list of proportional progress bars — a lighter, axis-free alternative
 * to the recharts bar charts (each row shows the label, a filled track, and the value).
 */
export function RankedBars({
  data,
  minPoints = 2,
  emptyMessage,
}: {
  data: NamedCount[]
  minPoints?: number
  emptyMessage?: string
}) {
  const colors = useChartColors()
  if (data.length < minPoints) return <NotEnough message={emptyMessage} height={180} />
  const max = data.reduce((m, d) => Math.max(m, d.value), 0) || 1
  return (
    <div className="flex flex-col gap-2.5">
      {data.map((d, i) => (
        <div key={d.name}>
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-ink" title={d.name}>
              {d.name}
            </span>
            <span className="shrink-0 font-semibold text-muted">{d.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-subtle">
            <div
              className="h-full rounded-full transition-[width]"
              style={{ width: `${(d.value / max) * 100}%`, background: colors[i % colors.length] }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Horizontal category-axis tick that wraps long labels onto multiple lines. */
function WrappedTick(props: { x?: number; y?: number; payload?: { value?: string | number } }) {
  const { x = 0, y = 0, payload } = props
  const words = String(payload?.value ?? '').split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (next.length > 12 && cur) {
      lines.push(cur)
      cur = w
    } else {
      cur = next
    }
  }
  if (cur) lines.push(cur)
  return (
    <text x={x} y={y} textAnchor="middle" fontSize={11} fill="var(--chart-axis)">
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? '0.72em' : '1.05em'}>
          {line}
        </tspan>
      ))}
    </text>
  )
}

/** Vertical bar chart — good for campaigns / sizes. Long labels wrap onto multiple lines. */
export function VBarChart({
  data,
  height = 260,
  minPoints = 2,
  emptyMessage,
  colors,
}: {
  data: NamedCount[]
  height?: number
  minPoints?: number
  emptyMessage?: string
  colors?: string[]
}) {
  const themed = useChartColors()
  if (data.length < minPoints) return <NotEnough message={emptyMessage} height={height} />
  const palette = colors ?? themed
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
        <XAxis
          dataKey="name"
          tick={<WrappedTick />}
          axisLine={false}
          tickLine={false}
          interval={0}
          height={48}
        />
        <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={28} />
        <Tooltip
          cursor={CURSOR}
          contentStyle={tooltipStyle}
          itemStyle={tooltipItemStyle}
          labelStyle={tooltipLabelStyle}
        />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={64}>
          {data.map((_, i) => (
            <Cell key={i} fill={palette[i % palette.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/**
 * 100%-stacked bar chart. Each row is stacked across `keys`, normalised so every
 * bar fills the height; absolute segment totals are labelled inside. Colours come
 * from the themed palette via `paletteIndices` (defaults to sequential).
 */
export function StackedBarChart({
  data,
  keys,
  paletteIndices,
  labelColors,
  height = 300,
  minPoints = 1,
  emptyMessage,
}: {
  data: Array<Record<string, string | number>>
  keys: string[]
  paletteIndices?: number[]
  labelColors?: string[]
  height?: number
  minPoints?: number
  emptyMessage?: string
}) {
  const themed = useChartColors()
  if (data.length < minPoints) return <NotEnough message={emptyMessage} height={height} />
  const colorAt = (i: number) => themed[(paletteIndices?.[i] ?? i) % themed.length]
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} stackOffset="expand" margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis
          dataKey="name"
          tick={<WrappedTick />}
          axisLine={false}
          tickLine={false}
          interval={0}
          height={52}
        />
        <YAxis
          tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
          tick={AXIS}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <Tooltip
          cursor={CURSOR}
          contentStyle={tooltipStyle}
          itemStyle={tooltipItemStyle}
          labelStyle={tooltipLabelStyle}
        />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" />
        {keys.map((k, i) => (
          <Bar key={k} dataKey={k} stackId="stack" fill={colorAt(i)} maxBarSize={64}>
            <LabelList
              dataKey={k}
              position="center"
              formatter={(v: number | string) => (v ? `${v}` : '')}
              fill={labelColors?.[i] ?? '#ffffff'}
              fontSize={11}
              fontWeight={700}
            />
          </Bar>
        ))}
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
  nowMonth,
}: {
  data: NamedCount[]
  height?: number | string
  minMonths?: number
  emptyMessage?: string
  /** Index (0–11) of the current month to mark with a "Now" line; null to hide. */
  nowMonth?: number | null
}) {
  const monthsWithData = data.filter((d) => d.value > 0).length
  if (monthsWithData < minMonths)
    return <NotEnough message={emptyMessage ?? 'Add tasks with start dates in different months.'} height={height} />

  const showNow = nowMonth != null && nowMonth >= 0 && nowMonth < data.length

  // Fraction of the x-axis where "Now" sits — used to switch the line from red
  // (past/present) to grey (future) at that point via a hard gradient stop.
  const nowOffset = showNow ? `${((nowMonth as number) / Math.max(1, data.length - 1)) * 100}%` : '0%'
  const FUTURE_GREY = 'var(--chart-axis-strong)'

  // Colour each dot: red up to and including "Now", grey afterward.
  const renderDot = (props: { cx?: number; cy?: number; index?: number }) => {
    const { cx, cy, index = 0 } = props
    if (cx == null || cy == null) return <g key={`dot-${index}`} />
    const isFuture = showNow && index > (nowMonth as number)
    return (
      <circle
        key={`dot-${index}`}
        cx={cx}
        cy={cy}
        r={2.5}
        fill="var(--card)"
        stroke={isFuture ? FUTURE_GREY : '#E61E2A'}
        strokeWidth={1.5}
      />
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 4 }}>
        <defs>
          {/* RMIT red fill fading out toward the baseline */}
          <linearGradient id="workloadFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E61E2A" stopOpacity={0.45} />
            <stop offset="60%" stopColor="#E61E2A" stopOpacity={0.14} />
            <stop offset="100%" stopColor="#E61E2A" stopOpacity={0.02} />
          </linearGradient>
          {/* Line colour: red before "Now", grey after (hard switch at the offset) */}
          {showNow && (
            <linearGradient id="workloadStroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset={nowOffset} stopColor="#E61E2A" />
              <stop offset={nowOffset} stopColor={FUTURE_GREY} />
            </linearGradient>
          )}
        </defs>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={32} />
        <Tooltip
          cursor={{ stroke: '#E61E2A', strokeWidth: 1, strokeDasharray: '4 4' }}
          contentStyle={tooltipStyle}
          itemStyle={tooltipItemStyle}
          labelStyle={tooltipLabelStyle}
          formatter={(v: number) => [`${v} assets`, 'Workload']}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={showNow ? 'url(#workloadStroke)' : '#E61E2A'}
          strokeWidth={3}
          fill="url(#workloadFill)"
          dot={renderDot}
          activeDot={{ r: 5 }}
        />
        {showNow && (
          <ReferenceLine
            x={data[nowMonth as number].name}
            stroke="var(--chart-axis-strong)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            label={{
              value: 'Now',
              position: 'insideTopRight',
              fontSize: 10,
              fontWeight: 600,
              fill: 'var(--chart-axis-strong)',
            }}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  )
}
