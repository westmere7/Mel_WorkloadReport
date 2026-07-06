import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Customized,
  Legend,
  Pie,
  PieChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { LineChart as LineChartIcon } from 'lucide-react'
import type { NamedCount } from '../lib/analytics'
import { STAKEHOLDER_GROUPS, stakeholderGroup } from '../lib/analytics'
import type { Squad, Task } from '../types'
import { CHART_COLORS_DARK, CHART_COLORS_LIGHT } from '../constants'
import { useTheme } from '../lib/theme'
import { TrendDelta } from './ui/TrendDelta'
import { cx } from '../lib/format'
import { useEffect, useState, type KeyboardEvent } from 'react'

/** True on narrow (mobile) viewports — Tailwind's `sm` breakpoint is 640px. */
function useIsMobile(): boolean {
  const query = '(max-width: 640px)'
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia?.(query)
    if (!mq) return
    const on = () => setMobile(mq.matches)
    on() // resync in case the width changed between initial render and mount
    mq.addEventListener('change', on)
    // Also on plain resize — some environments don't fire matchMedia 'change'.
    window.addEventListener('resize', on)
    return () => {
      mq.removeEventListener('change', on)
      window.removeEventListener('resize', on)
    }
  }, [])
  return mobile
}

/** A comparison-mode baseline series: the source-year data + labels for both years. */
export interface CompareSeries {
  data: NamedCount[]
  /** Source-year label, e.g. "2025". */
  label: string
  /** Target-year label, e.g. "2026". */
  currentLabel: string
  /** Source-year tasks — scattered as small, non-interactive dots in compare mode. */
  tasks?: Task[]
}

/** Theme-aware categorical palette (re-renders on theme toggle). */
function useChartColors() {
  return useTheme().theme === 'dark' ? CHART_COLORS_DARK : CHART_COLORS_LIGHT
}

/**
 * Colour for a squad — by its stakeholder group (DOMESTIC / INTON / Other),
 * matching the workload dots and the demand-chart legend. Theme-aware.
 */
export function useSquadColor(): (squad: Squad) => string {
  const colors = useChartColors()
  return (squad) => colors[STAKEHOLDER_GROUPS.indexOf(stakeholderGroup(squad))] ?? colors[2]
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
/** The target-year workload line colour (RMIT red) — its peak matches it. */
const WORKLOAD_LINE = '#E61E2A'

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
  compare,
  onSelect,
  taskCounts,
  prevTaskCounts,
  sourceLabel,
}: {
  data: NamedCount[]
  height?: number
  minPoints?: number
  emptyMessage?: string
  /** Comparison baseline — legend rows get an up/down % vs this series. */
  compare?: NamedCount[]
  /** Clicking a legend row calls this with the row name (e.g. to open the filtered task list). */
  onSelect?: (name: string) => void
  /** Per-name count of relevant tasks — shown in the row's hover tooltip. */
  taskCounts?: Record<string, number>
  /** Source-year task counts (compare mode) — appended to the tooltip. */
  prevTaskCounts?: Record<string, number>
  /** Label for the source year, used in the compare tooltip. */
  sourceLabel?: string
}) {
  const colors = useChartColors()
  // Index of the section currently hovered (via a slice or its legend row).
  const [active, setActive] = useState<number | null>(null)
  const total = data.reduce((a, b) => a + b.value, 0)
  const prevByName = compare ? new Map(compare.map((d) => [d.name, d.value])) : null
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
              activeIndex={active ?? undefined}
              activeShape={(props: any) => (
                <Sector
                  cx={props.cx}
                  cy={props.cy}
                  innerRadius={props.innerRadius}
                  outerRadius={props.outerRadius + 6}
                  startAngle={props.startAngle}
                  endAngle={props.endAngle}
                  fill={props.fill}
                />
              )}
              onMouseEnter={(_, i) => setActive(i)}
              onMouseLeave={() => setActive(null)}
            >
              {data.map((_, i) => (
                <Cell
                  key={i}
                  fill={colors[i % colors.length]}
                  fillOpacity={active == null || active === i ? 1 : 0.35}
                />
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
      <ul className="w-full space-y-1.5 sm:flex-1">
        {data.map((d, i) => {
          const clickable = Boolean(onSelect)
          const n = taskCounts?.[d.name]
          const p = prevTaskCounts?.[d.name]
          const tip =
            n == null
              ? undefined
              : `${n} task${n === 1 ? '' : 's'}${
                  compare && p != null ? ` · ${p} in ${sourceLabel ?? 'source'}` : ''
                }`
          return (
            <li key={d.name}>
              <div
                className={cx(
                  'flex items-center gap-2 rounded-md -mx-1 px-1 py-0.5 text-sm transition-colors',
                  clickable && 'cursor-pointer',
                  active === i && 'bg-subtle',
                )}
                title={tip}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                {...(clickable
                  ? {
                      role: 'button',
                      tabIndex: 0,
                      onClick: () => onSelect!(d.name),
                      onKeyDown: (e: KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onSelect!(d.name)
                        }
                      },
                    }
                  : {})}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: colors[i % colors.length] }}
                  />
                  <span className="truncate text-muted">{d.name}</span>
                </span>
                {/* Subtle leader line connecting the name to its value. */}
                <span aria-hidden="true" className="min-w-[0.75rem] flex-1 self-center border-b border-dotted border-line" />
                <span className="flex shrink-0 items-center gap-2">
                  {prevByName && (
                    <TrendDelta
                      size="sm"
                      current={d.value}
                      previous={prevByName.get(d.name) ?? 0}
                      title={`${prevByName.get(d.name) ?? 0} → ${d.value}`}
                    />
                  )}
                  <span className="font-semibold text-ink">{d.value}</span>
                </span>
              </div>
            </li>
          )
        })}
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
 * A ranked list of proportional bars — a lighter, axis-free alternative to the
 * recharts bar charts. Each row is a single line: label, a filled track, then the
 * value, so the list stays compact.
 *
 * `compare` only affects comparison mode; the single-year layout is untouched.
 * There each row shows a % trend delta before the value (mirroring the donut
 * legend), and a tall source-year marker on the track — sized on the same axis
 * as the bar, so when the target year is higher the marker sits inside the bar
 * yet still pokes above/below it to stay visible.
 */
export function RankedBars({
  data,
  minPoints = 2,
  emptyMessage,
  onSelect,
  compare,
  sourceLabel,
}: {
  data: NamedCount[]
  minPoints?: number
  emptyMessage?: string
  /** Clicking a row calls this with the row name (e.g. to open the filtered task list). */
  onSelect?: (name: string) => void
  /** Comparison baseline — rows gain a source-year bar marker + a % trend delta. */
  compare?: NamedCount[]
  /** Label for the source year, used in the marker/delta tooltips. */
  sourceLabel?: string
}) {
  const colors = useChartColors()
  if (data.length < minPoints) return <NotEnough message={emptyMessage} height={180} />
  const prevByName = compare ? new Map(compare.map((d) => [d.name, d.value])) : null
  // Shared scale so the target-year bar and the source-year marker line up. In
  // single-year mode this collapses to the largest value (the original behaviour).
  const max =
    Math.max(
      data.reduce((m, d) => Math.max(m, d.value), 0),
      compare ? compare.reduce((m, d) => Math.max(m, d.value), 0) : 0,
    ) || 1
  const clickable = Boolean(onSelect)
  return (
    <div className="flex flex-col gap-2">
      {data.map((d, i) => {
        const color = colors[i % colors.length]
        const prev = prevByName?.get(d.name) ?? 0
        return (
          <div
            key={d.name}
            className={cx(
              'flex items-center gap-2.5 rounded-md -mx-1 px-1 py-0.5 text-xs transition-colors',
              clickable && 'cursor-pointer hover:bg-subtle',
            )}
            title={clickable ? `View tasks in ${d.name}` : undefined}
            {...(clickable
              ? {
                  role: 'button',
                  tabIndex: 0,
                  onClick: () => onSelect!(d.name),
                  onKeyDown: (e: KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelect!(d.name)
                    }
                  },
                }
              : {})}
          >
            <span className="w-28 shrink-0 truncate text-ink" title={d.name}>
              {d.name}
            </span>
            {compare ? (
              // No `overflow-hidden` here so the taller source-year marker can poke
              // above and below the track when it sits inside the target-year bar.
              <div className="relative h-2.5 flex-1 rounded-full bg-subtle">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-[width]"
                  style={{ width: `${(d.value / max) * 100}%`, background: color }}
                />
                {prev > 0 && (
                  <span
                    className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{ left: `${(prev / max) * 100}%`, background: 'var(--chart-axis-strong)' }}
                    title={`${sourceLabel ?? 'source'}: ${prev}`}
                  />
                )}
              </div>
            ) : (
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-subtle">
                <div
                  className="h-full rounded-full transition-[width]"
                  style={{ width: `${(d.value / max) * 100}%`, background: color }}
                />
              </div>
            )}
            {compare ? (
              <span className="flex shrink-0 items-center justify-end gap-1.5 tabular-nums">
                <TrendDelta size="sm" current={d.value} previous={prev} title={`${prev} → ${d.value}`} />
                <span className="w-9 text-right font-semibold text-muted">{d.value}</span>
              </span>
            ) : (
              <span className="w-7 shrink-0 text-right font-semibold tabular-nums text-muted">{d.value}</span>
            )}
          </div>
        )
      })}
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

/**
 * Vertical bar chart — good for campaigns / sizes. Long labels wrap onto multiple lines.
 * With `compare`, each category splits into two half-columns — source year (faded)
 * left of target year — and categories missing from either year are hidden.
 */
export function VBarChart({
  data,
  height = 260,
  minPoints = 2,
  emptyMessage,
  colors,
  compare,
  onSelect,
}: {
  data: NamedCount[]
  height?: number | string
  minPoints?: number
  emptyMessage?: string
  colors?: string[]
  compare?: CompareSeries
  /** Clicking a bar calls this with the category name (e.g. to open the filtered task list). */
  onSelect?: (name: string) => void
}) {
  const themed = useChartColors()
  const palette = colors ?? themed
  const barClick = onSelect
    ? (d: { name?: string; payload?: { name?: string } }) => onSelect(String(d?.name ?? d?.payload?.name ?? ''))
    : undefined
  const barCursor = onSelect ? 'cursor-pointer' : undefined

  if (compare) {
    const prev = new Map(compare.data.map((d) => [d.name, d.value]))
    // Only categories that exist (non-zero) in BOTH years are comparable.
    const rows = data
      .filter((d) => d.value > 0 && (prev.get(d.name) ?? 0) > 0)
      .map((d) => ({ name: d.name, value: d.value, prev: prev.get(d.name) as number }))
    if (rows.length < minPoints) return <NotEnough message={emptyMessage} height={height} />
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
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
          <Bar
            dataKey="prev"
            name={compare.label}
            radius={[4, 4, 0, 0]}
            maxBarSize={32}
            fillOpacity={0.45}
            onClick={barClick}
            className={barCursor}
          >
            {rows.map((_, i) => (
              <Cell key={i} fill={palette[i % palette.length]} />
            ))}
          </Bar>
          <Bar
            dataKey="value"
            name={compare.currentLabel}
            radius={[4, 4, 0, 0]}
            maxBarSize={32}
            onClick={barClick}
            className={barCursor}
          >
            {rows.map((_, i) => (
              <Cell key={i} fill={palette[i % palette.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    )
  }

  if (data.length < minPoints) return <NotEnough message={emptyMessage} height={height} />
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
        <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={64} onClick={barClick} className={barCursor}>
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
 * bar fills the height. Colours come from the themed palette via `paletteIndices`.
 */
export function StackedBarChart({
  data,
  keys,
  paletteIndices,
  height = 300,
  minPoints = 1,
  emptyMessage,
  compare,
  onSelect,
  hideLegend,
}: {
  data: Array<Record<string, string | number>>
  keys: string[]
  paletteIndices?: number[]
  height?: number | string
  minPoints?: number
  emptyMessage?: string
  /** Hide the built-in bottom legend (e.g. when rendering it in a card header). */
  hideLegend?: boolean
  /** Clicking a segment calls this with the category (x-axis) name and the stacked key (group). */
  onSelect?: (category: string, group: string) => void
  /** Comparison baseline rows (same key shape) — splits each column into two
      half-columns, source year (faded) beside target year; categories missing
      from either year are hidden. */
  compare?: { data: Array<Record<string, string | number>>; label: string; currentLabel: string }
}) {
  const themed = useChartColors()
  const colorAt = (i: number) => themed[(paletteIndices?.[i] ?? i) % themed.length]

  // In compare mode, inner-join rows on name and stash the baseline under prev_* keys.
  let rows = data
  if (compare) {
    const src = new Map(compare.data.map((r) => [String(r.name), r]))
    rows = data
      .filter((r) => src.has(String(r.name)))
      .map((r) => {
        const s = src.get(String(r.name))!
        const merged: Record<string, string | number> = { name: r.name }
        for (const k of keys) {
          merged[k] = Number(r[k]) || 0
          merged[`prev_${k}`] = Number(s[k]) || 0
        }
        return merged
      })
  }
  if (rows.length < minPoints) return <NotEnough message={emptyMessage} height={height} />

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} stackOffset="expand" margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
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
        {!hideLegend && (
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            iconType="circle"
            // In compare mode both years share the same key colours — collapse the
            // legend to one entry per key instead of listing each year twice.
            payload={
              compare
                ? keys.map((k, i) => ({ value: k, type: 'circle' as const, color: colorAt(i), id: k }))
                : undefined
            }
          />
        )}
        {/* Source-year half-columns (faded, left) — labelled per-key in the tooltip only. */}
        {compare &&
          keys.map((k, i) => (
            <Bar
              key={`prev_${k}`}
              dataKey={`prev_${k}`}
              name={`${k} (${compare.label})`}
              stackId="prev"
              fill={colorAt(i)}
              fillOpacity={0.45}
              legendType="none"
              maxBarSize={40}
            />
          ))}
        {keys.map((k, i) => (
          <Bar
            key={k}
            dataKey={k}
            name={compare ? `${k} (${compare.currentLabel})` : k}
            stackId={compare ? 'cur' : 'stack'}
            fill={colorAt(i)}
            maxBarSize={compare ? 40 : 64}
            onClick={
              onSelect
                ? (d: { name?: string; payload?: { name?: string } }) =>
                    onSelect(String(d?.name ?? d?.payload?.name ?? ''), k)
                : undefined
            }
            className={onSelect ? 'cursor-pointer' : undefined}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

/**
 * Standalone legend for StackedBarChart — colours match the chart's themed
 * palette. Render it outside the plot (e.g. a card header) to save the vertical
 * space the built-in bottom legend would take.
 */
export function StackedLegend({ keys, paletteIndices }: { keys: string[]; paletteIndices?: number[] }) {
  const themed = useChartColors()
  const colorAt = (i: number) => themed[(paletteIndices?.[i] ?? i) % themed.length]
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[11px] font-semibold text-muted">
      {keys.map((k, i) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: colorAt(i) }} />
          {k}
        </span>
      ))}
    </div>
  )
}

/**
 * "Peak" caption drawn above a peak dot. Anchors inward at the line's ends
 * (leftmost month → text extends right, rightmost → extends left) so it never
 * clips off the chart edge. Handles either recharts viewBox shape.
 */
function PeakLabel(props: { viewBox?: any; color?: string; align?: 'start' | 'middle' | 'end' }) {
  const { viewBox, color, align = 'middle' } = props
  if (!viewBox) return null
  const cx = viewBox.cx != null ? viewBox.cx : (viewBox.x ?? 0) + (viewBox.width ?? 0) / 2
  const dotTop = viewBox.cy != null ? viewBox.cy - (viewBox.r ?? 5) : (viewBox.y ?? 0)
  return (
    <text x={cx} y={dotTop - 6} textAnchor={align} fontSize={11} fontWeight={700} fill={color}>
      Peak
    </text>
  )
}

/**
 * A "nice" y-axis for a [0, peak] range: rounds the top up to a round tick just
 * above the peak (peak ~310 → top 400) so gridlines stay uniformly spaced and
 * the peak sits comfortably below the top edge — no stray line pinned to the
 * exact peak. Returns the domain top and the full set of uniform ticks.
 */
function niceScale(peak: number): { top: number; ticks: number[] } {
  if (peak <= 0) return { top: 1, ticks: [0] }
  const rough = peak / 5
  const mag = Math.pow(10, Math.floor(Math.log10(rough)))
  const norm = rough / mag
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag
  let top = Math.ceil(peak / step) * step
  if (top <= peak) top += step // keep the peak strictly below the top gridline
  const ticks: number[] = []
  for (let v = 0; v <= top + step * 1e-6; v += step) ticks.push(v)
  return { top, ticks }
}

const DOT_R = 3.5 // task-dot radius in px
const DOT_R_HOT = 6 // hovered task-dot radius
const DOT_R_COMPARE = 2.25 // smaller radius for the two overlaid year sets in compare mode
const COL_STAGGER_MS = 700 // total left→right entry-animation spread

/**
 * One dot per task, scattered under the workload line: x = the task's true
 * day-of-year, y = its asset count on the SAME y-axis as the line (a 300-asset
 * task sits at 300). Because height tracks the asset count, several tasks that
 * start on the same day still separate vertically instead of stacking into a
 * single bar. Each dot's fill comes from `colorFor` (by squad's stakeholder
 * group). Rendered via <Customized>,
 * which injects the plot `offset`; a transparent hit layer snaps a dashed
 * cursor + highlight to the nearest dot (2D, so stacked dots stay targetable).
 */
function TaskDotsLayer({
  offset,
  tasks = [],
  maxVal = 0,
  colorFor,
  hoveredId,
  onHover,
  onPick,
  animKey = '',
  radius = DOT_R,
  interactive = true,
}: {
  offset?: { left: number; top: number; width: number; height: number }
  tasks?: Task[]
  maxVal?: number
  /** Fill colour for a task's dot (by squad, or by year in compare mode). */
  colorFor: (task: Task) => string
  hoveredId?: string | null
  onHover?: (task: Task | null) => void
  onPick?: (task: Task) => void
  /** Dataset signature — changing it remounts the dots so the L→R pop replays. */
  animKey?: string
  /** Dot radius in px. Compare mode uses a smaller value so the two years overlap cleanly. */
  radius?: number
  /** When false, dots are display-only: no hover highlight, cursor, or click hit-layer. */
  interactive?: boolean
}) {
  if (!offset || !tasks.length || maxVal <= 0) return null
  const { left, top, width, height: plotH } = offset
  const minX = left + radius
  const maxX = left + width - radius
  // Each dot sits at its true day-of-year x (clamped to the plot edges) and a
  // y set by its asset count. Positions scale with the plot, so dots stay
  // aligned with the line and month ticks at any width. Sorted L→R for a tidy
  // staggered entry.
  const placed = tasks
    .map((t) => {
      const [y, mo, day] = (t.startDate as string).split('-').map(Number)
      if (!y || !mo) return null
      const doy = new Date(y, mo - 1, day || 1).getTime() - new Date(y, 0, 1).getTime()
      const frac = Math.min(1, Math.max(0, doy / 86400000 / 366))
      const val = t.assetTotal || 0
      const cx = Math.max(minX, Math.min(maxX, left + frac * width))
      const cy = top + plotH - (val / maxVal) * plotH
      return { t, cx, cy, color: colorFor(t) }
    })
    .filter((c): c is { t: Task; cx: number; cy: number; color: string } => c !== null)
    .sort((a, b) => a.cx - b.cx)
  const hovered = placed.find((c) => c.t.id === hoveredId) ?? null

  // Nearest dot by 2D distance so same-day dots (which differ only in y) can
  // each be picked out with the pointer.
  const nearest = (clientX: number, clientY: number, box: DOMRect) => {
    const mx = left + (clientX - box.left)
    const my = top + (clientY - box.top)
    let best = placed[0]
    let bestD = Infinity
    for (const c of placed) {
      const d = (c.cx - mx) ** 2 + (c.cy - my) ** 2
      if (d < bestD) {
        bestD = d
        best = c
      }
    }
    return best
  }

  return (
    <g>
      {placed.map(({ t, cx, cy, color }) => {
        const delay = Math.round(((cx - left) / Math.max(1, width)) * COL_STAGGER_MS)
        return (
          <circle
            key={`${animKey}-${t.id}`}
            cx={cx}
            cy={cy}
            r={radius}
            fill={color}
            fillOpacity={!interactive ? 0.75 : hovered ? (t.id === hoveredId ? 1 : 0.35) : 0.8}
            stroke="var(--card)"
            strokeWidth={1}
            className="workload-dot transition-[fill-opacity]"
            style={{ animationDelay: `${delay}ms` }}
          />
        )
      })}
      {hovered && (
        <>
          {/* Dashed date cursor + the hovered dot re-drawn on top, enlarged. */}
          <line
            x1={hovered.cx}
            x2={hovered.cx}
            y1={top}
            y2={top + plotH}
            stroke={hovered.color}
            strokeWidth={1}
            strokeDasharray="4 4"
            pointerEvents="none"
          />
          <circle
            cx={hovered.cx}
            cy={hovered.cy}
            r={DOT_R_HOT}
            fill={hovered.color}
            stroke="var(--card)"
            strokeWidth={2}
            pointerEvents="none"
          />
        </>
      )}
      {/* Transparent hit layer: follows the pointer and snaps to the nearest dot.
          Omitted for display-only (compare-mode) layers so they never intercept
          the pointer or the target-year layer's own hit testing. */}
      {interactive && (
        <rect
          x={left}
          y={top}
          width={width}
          height={plotH}
          fill="transparent"
          className="cursor-pointer"
          onMouseMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect()
            const c = nearest(e.clientX, e.clientY, box)
            if (c && c.t.id !== hoveredId) onHover?.(c.t)
          }}
          onMouseLeave={() => onHover?.(null)}
          onClick={(e) => {
            const box = e.currentTarget.getBoundingClientRect()
            const c = nearest(e.clientX, e.clientY, box)
            if (c) onPick?.(c.t)
          }}
        />
      )}
    </g>
  )
}

// The workload chart shares ONE x-scale across the line and the task dots:
// day-of-year as a 0–1 fraction (matching TaskDotsLayer's /366). Each month's
// aggregate value sits at that month's mid-point, so the smooth curve peaks in
// the middle of a month's span.
const MONTH_MID_FRAC = Array.from({ length: 12 }, (_, m) =>
  (new Date(2025, m, 15).getTime() - new Date(2025, 0, 1).getTime()) / 86400000 / 366,
)
// Month tick labels sit at each month's START (Jan 1, Feb 1, …) and flow to the
// right, so a dot on the 1st of a month lines up directly under that month's
// name instead of appearing half a month early (labels used to be mid-month).
const MONTH_START_FRAC = Array.from({ length: 12 }, (_, m) =>
  (new Date(2025, m, 1).getTime() - new Date(2025, 0, 1).getTime()) / 86400000 / 366,
)
const nearestMonthStartIndex = (frac: number) => {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < MONTH_START_FRAC.length; i++) {
    const d = Math.abs(MONTH_START_FRAC[i] - frac)
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

/** Area chart of a value across the 12 months of the year. */
export function AreaTrendChart({
  data,
  height = 260,
  minMonths = 2,
  emptyMessage,
  nowMonth,
  compare,
  tasks,
  onTaskClick,
  onHoverTask,
}: {
  data: NamedCount[]
  height?: number | string
  minMonths?: number
  emptyMessage?: string
  /** Index (0–11) of the current month to mark with a "Now" line; null to hide. */
  nowMonth?: number | null
  /** Comparison baseline — draws the source year as a second overlapping line. */
  compare?: CompareSeries
  /** Individual tasks scattered under the line as thin columns (height ∝ assets). */
  tasks?: Task[]
  /** Called when a task column is clicked — opens that task's info. */
  onTaskClick?: (task: Task) => void
  /** Called as the pointer moves across the columns — the nearest task, or null on leave. */
  onHoverTask?: (task: Task | null) => void
}) {
  const colors = useChartColors()
  const squadColor = useSquadColor()
  const isMobile = useIsMobile()
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // Act on hover: highlight the column, snap the dashed cursor, update readout.
  const setHover = (t: Task | null) => {
    setHoveredId(t?.id ?? null)
    onHoverTask?.(t)
  }

  // One dot per task with a start date and assets. Outside compare mode these are
  // coloured by squad and fully interactive (hover/click). In compare mode we draw
  // two display-only sets instead — target vs source year — each in its own colour.
  const hasDot = (t: Task) => Boolean(t.startDate) && (t.assetTotal || 0) > 0
  const scatterTasks = compare ? [] : (tasks ?? []).filter(hasDot)
  const targetDots = compare ? (tasks ?? []).filter(hasDot) : []
  const sourceDots = compare ? (compare.tasks ?? []).filter(hasDot) : []

  const monthsWithData = data.filter((d) => d.value > 0).length
  const compareMonths = compare ? compare.data.filter((d) => d.value > 0).length : 0
  if (Math.max(monthsWithData, compareMonths) < minMonths)
    return <NotEnough message={emptyMessage ?? 'Add tasks with start dates in different months.'} height={height} />

  // Merge the baseline series in by month index, and give every point its x on
  // the shared day-of-year scale (month mid-point) so both lines share the axis.
  const base = compare
    ? data.map((d, i) => ({ ...d, prev: compare.data[i]?.value ?? 0 }))
    : data
  const rows = base.map((d, i) => ({ ...d, x: MONTH_MID_FRAC[i] ?? 0, monthIndex: i }))
  const compareColor = colors[1]

  // "Now" marker — shown only when viewing the current calendar year. The target
  // line is cut off here: nothing (line, fill, or dot) is drawn past this month.
  const showNow = nowMonth != null && nowMonth >= 0 && nowMonth < data.length
  const nowFrac = showNow ? (MONTH_MID_FRAC[nowMonth as number] ?? 0) : 0
  const isFutureMonth = (r: { monthIndex?: number }) =>
    showNow && Number(r.monthIndex) > (nowMonth as number)

  // Flat end-caps at the year's edges (Jan 1 / Dec 31) so the area/line spans the
  // full plot width even though the monthly points sit at month mid-points. The
  // caps repeat the first/last month's value and are flagged `anchor` so they
  // draw no dot. Compare mode inherits them via `prev`.
  const first = rows[0]
  const last = rows[rows.length - 1]
  const areaRowsFull =
    first && last
      ? [{ ...first, x: 0, anchor: true }, ...rows, { ...last, x: 1, anchor: true }]
      : rows
  // Drop the target value on future months so the line and fill end at "Now"
  // rather than trailing across the empty rest of the year.
  const areaRows = showNow
    ? areaRowsFull.map((r) => (isFutureMonth(r) ? { ...r, value: null } : r))
    : areaRowsFull

  // Peak of a series — optionally restricted to the drawn (non-cut-off) months.
  const peakOf = (getVal: (r: any) => number, skipFuture = false) => {
    let best = -1
    for (let i = 0; i < rows.length; i++) {
      if (skipFuture && isFutureMonth(rows[i])) continue
      if (best === -1 || getVal(rows[i]) > getVal(rows[best])) best = i
    }
    if (best === -1) return null
    const value = getVal(rows[best])
    return value > 0 ? { value, x: rows[best].x, idx: best } : null
  }

  // Scale the y-axis to a clean round top above the tallest point across ALL
  // months (including cut-off ones, so future task dots still fit), so gridlines
  // stay uniform. `yTop` also scales the task columns so they line up with the axis.
  const scaleMax = Math.max(
    peakOf((r) => Number(r.value) || 0)?.value ?? 0,
    compare ? peakOf((r) => Number(r.prev) || 0)?.value ?? 0 : 0,
  )
  const { top: yTop, ticks: yTicks } = niceScale(scaleMax)

  // Peak markers sit on the drawn curve, so the target peak ignores cut-off months.
  const peaks: Array<{ value: number; color: string; x: number; idx: number }> = []
  const targetPeak = peakOf((r) => Number(r.value) || 0, true)
  if (targetPeak) peaks.push({ ...targetPeak, color: WORKLOAD_LINE })
  if (compare) {
    const sourcePeak = peakOf((r) => Number(r.prev) || 0)
    if (sourcePeak) peaks.push({ ...sourcePeak, color: compareColor })
  }

  // One little dot per real month on the target line, in RMIT red.
  const renderDot = (props: { cx?: number; cy?: number; index?: number; payload?: any }) => {
    const { cx, cy, index = 0, payload } = props
    // Skip the flat end-caps; cut-off future months are already null (no dot).
    if (cx == null || cy == null || payload?.anchor) return <g key={`dot-${index}`} />
    return (
      <circle
        key={`dot-${index}`}
        cx={cx}
        cy={cy}
        r={2.5}
        fill="var(--card)"
        stroke="#E61E2A"
        strokeWidth={1.5}
      />
    )
  }

  // Signature of the current dataset — changes on year / span / compare / ytd
  // switches but NOT on hover. Keying the areas by it remounts them so recharts
  // replays its left-to-right reveal, matching the task columns' L→R entrance.
  const animKey = [
    compare ? 'cmp' : 'one',
    rows.map((r) => r.value).join(','),
    rows.map((r) => (r as { prev?: number }).prev ?? 0).join(','),
  ].join('|')

  // Legend entries. Compare mode: one per year, each showing its line + dot.
  // Single-year mode: the stakeholder-group colours used to paint the task dots.
  // Dot markers are dropped on mobile, where the scattered dots are hidden.
  const legendItems: Array<{ label: string; color: string; line: boolean; dot: boolean }> = compare
    ? [
        { label: compare.currentLabel, color: WORKLOAD_LINE, line: true, dot: !isMobile && targetDots.length > 0 },
        { label: compare.label, color: compareColor, line: true, dot: !isMobile && sourceDots.length > 0 },
      ]
    : isMobile
      ? [{ label: 'Workload', color: WORKLOAD_LINE, line: true, dot: false }]
      : STAKEHOLDER_GROUPS.filter((g) => scatterTasks.some((t) => stakeholderGroup(t.squad) === g)).map((g) => ({
          label: g,
          color: colors[STAKEHOLDER_GROUPS.indexOf(g)] ?? colors[2],
          line: false,
          dot: true,
        }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={areaRows} margin={{ left: 0, right: 12, top: 28, bottom: 4 }}>
        <defs>
          {/* RMIT red fill fading out toward the baseline */}
          <linearGradient id="workloadFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E61E2A" stopOpacity={0.45} />
            <stop offset="60%" stopColor="#E61E2A" stopOpacity={0.14} />
            <stop offset="100%" stopColor="#E61E2A" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis
          type="number"
          dataKey="x"
          domain={[0, 1]}
          ticks={MONTH_START_FRAC}
          interval={0}
          tick={(props: { x?: number; y?: number; payload?: { value?: number } }) => {
            const { x = 0, y = 0, payload } = props
            const name = rows[nearestMonthStartIndex(payload?.value ?? 0)]?.name ?? ''
            // Anchor the label at the month's start and flow it right into the
            // month's span, so a 1st-of-month dot sits under its name.
            return (
              <text x={x} y={y} dy={12} dx={2} textAnchor="start" fontSize={12} fill="var(--chart-axis)">
                {name}
              </text>
            )
          }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={AXIS}
          axisLine={false}
          tickLine={false}
          width={32}
          domain={scaleMax > 0 ? [0, yTop] : undefined}
          ticks={scaleMax > 0 ? yTicks : undefined}
        />
        {legendItems.length > 0 && (
          <Legend
            verticalAlign="bottom"
            content={() => (
              <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs font-semibold mt-2">
                {legendItems.map((it, index) => (
                  <li key={`item-${index}`} className="flex items-center gap-1.5" style={{ color: it.color }}>
                    {it.line && (
                      <span className="inline-block h-0.5 w-3.5 rounded-full" style={{ backgroundColor: it.color }} />
                    )}
                    {it.dot && (
                      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: it.color }} />
                    )}
                    <span>{it.label}</span>
                  </li>
                ))}
              </ul>
            )}
          />
        )}
        {/* Source year — drawn first so the target-year line sits on top of it. */}
        {compare && (
          <Area
            key={`prev-${animKey}`}
            type="monotone"
            dataKey="prev"
            name={compare.label}
            stroke={compareColor}
            strokeWidth={2}
            fill={compareColor}
            fillOpacity={0.06}
            dot={{ r: 2, fill: 'var(--card)', stroke: compareColor, strokeWidth: 1.5 }}
            activeDot={{ r: 4 }}
            isAnimationActive
            animationDuration={900}
            animationEasing="ease-out"
          />
        )}
        <Area
          key={`value-${animKey}`}
          type="monotone"
          dataKey="value"
          name={compare ? compare.currentLabel : 'Workload'}
          stroke="#E61E2A"
          strokeWidth={3}
          fill="url(#workloadFill)"
          dot={renderDot}
          activeDot={{ r: 5 }}
          isAnimationActive
          animationDuration={900}
          animationEasing="ease-out"
        />
        {/* Task dots are hidden on mobile — too dense to target there, and
            there's no room for the hover readout. */}
        {!isMobile && !compare && scatterTasks.length > 0 && (
          <Customized
            component={
              <TaskDotsLayer
                tasks={scatterTasks}
                maxVal={yTop}
                colorFor={(t) => squadColor(t.squad)}
                hoveredId={hoveredId}
                onHover={setHover}
                onPick={(t) => onTaskClick?.(t)}
                animKey={animKey}
              />
            }
          />
        )}
        {/* Compare mode: two small, display-only sets — source year first (below),
            then the target year on top — each in its line's colour. No interaction. */}
        {!isMobile && compare && sourceDots.length > 0 && (
          <Customized
            component={
              <TaskDotsLayer
                tasks={sourceDots}
                maxVal={yTop}
                colorFor={() => compareColor}
                radius={DOT_R_COMPARE}
                interactive={false}
                animKey={`src-${animKey}`}
              />
            }
          />
        )}
        {!isMobile && compare && targetDots.length > 0 && (
          <Customized
            component={
              <TaskDotsLayer
                tasks={targetDots}
                maxVal={yTop}
                colorFor={() => WORKLOAD_LINE}
                radius={DOT_R_COMPARE}
                interactive={false}
                animKey={`tgt-${animKey}`}
              />
            }
          />
        )}
        {showNow && (
          <ReferenceLine
            x={nowFrac}
            stroke="var(--chart-axis-strong)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            label={{
              value: 'Now',
              position: 'top',
              fontSize: 10,
              fontWeight: 600,
              fill: 'var(--chart-axis-strong)',
            }}
          />
        )}
        {peaks.map((p, idx) => {
          const align = p.idx === 0 ? 'start' : p.idx === rows.length - 1 ? 'end' : 'middle'
          return (
            <ReferenceDot
              key={`peak-${p.idx}-${idx}`}
              x={p.x}
              y={p.value}
              // Invisible anchor: the marker circle is hidden (it read as another
              // task dot and confused viewers) but r is kept so the "Peak" label
              // still sits the same distance above the curve.
              r={5}
              fill="none"
              stroke="none"
              isFront
              ifOverflow="visible"
              label={(labelProps: any) => (
                <PeakLabel viewBox={labelProps?.viewBox} color={p.color} align={align} />
              )}
            />
          )
        })}
      </AreaChart>
    </ResponsiveContainer>
  )
}
