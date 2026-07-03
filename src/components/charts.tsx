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
import type { Task } from '../types'
import { CHART_COLORS_DARK, CHART_COLORS_LIGHT } from '../constants'
import { useTheme } from '../lib/theme'
import { TrendDelta } from './ui/TrendDelta'
import { cx } from '../lib/format'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'

/** A comparison-mode baseline series: the source-year data + labels for both years. */
export interface CompareSeries {
  data: NamedCount[]
  /** Source-year label, e.g. "2025". */
  label: string
  /** Target-year label, e.g. "2026". */
  currentLabel: string
}

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
 */
export function RankedBars({
  data,
  minPoints = 2,
  emptyMessage,
  onSelect,
}: {
  data: NamedCount[]
  minPoints?: number
  emptyMessage?: string
  /** Clicking a row calls this with the row name (e.g. to open the filtered task list). */
  onSelect?: (name: string) => void
}) {
  const colors = useChartColors()
  if (data.length < minPoints) return <NotEnough message={emptyMessage} height={180} />
  const max = data.reduce((m, d) => Math.max(m, d.value), 0) || 1
  const clickable = Boolean(onSelect)
  return (
    <div className="flex flex-col gap-2">
      {data.map((d, i) => (
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
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-subtle">
            <div
              className="h-full rounded-full transition-[width]"
              style={{ width: `${(d.value / max) * 100}%`, background: colors[i % colors.length] }}
            />
          </div>
          <span className="w-7 shrink-0 text-right font-semibold tabular-nums text-muted">{d.value}</span>
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

const COL_W = 6 // task-column width in px
const COL_STAGGER_MS = 700 // total left→right entry-animation spread

/**
 * Thin, faint columns — one per task — under the workload line, scaled on the
 * SAME y-axis as the line (a 300-asset task reaches 300, not an arbitrary
 * fraction). Rendered via <Customized>, which injects the plot `offset`. A
 * transparent hit layer follows the pointer and snaps a dashed cursor +
 * highlight to the nearest column. Columns rise from the baseline left→right
 * once on mount — this component's type is stable, so hover re-renders update
 * in place and never replay the animation.
 */
function TaskColumnsLayer({
  offset,
  tasks = [],
  maxVal = 0,
  hoveredId,
  onHover,
  onPick,
}: {
  offset?: { left: number; top: number; width: number; height: number }
  tasks?: Task[]
  maxVal?: number
  hoveredId?: string | null
  onHover?: (task: Task | null) => void
  onPick?: (task: Task) => void
}) {
  if (!offset || !tasks.length || maxVal <= 0) return null
  const { left, top, width, height: plotH } = offset
  // Ideal centre from the start day, sorted L→R, then a single pass nudges any
  // that would overlap a bit apart so clustered tasks stay legible.
  const cols = tasks
    .map((t) => {
      const [y, mo, day] = (t.startDate as string).split('-').map(Number)
      if (!y || !mo) return null
      const doy = new Date(y, mo - 1, day || 1).getTime() - new Date(y, 0, 1).getTime()
      const frac = Math.min(1, Math.max(0, doy / 86400000 / 366))
      return { t, x: left + frac * width }
    })
    .filter((c): c is { t: Task; x: number } => c !== null)
    .sort((a, b) => a.x - b.x)
  const minX = left + COL_W / 2
  const maxX = left + width - COL_W / 2
  // Centre-to-centre spacing: prefer a comfortable gap, but shrink it so every
  // column fits between the edges. Without this, an over-full year overflows
  // and the surplus piles onto one edge — where columns can't be told apart.
  const GAP = Math.min(COL_W + 2, cols.length > 1 ? (maxX - minX) / (cols.length - 1) : COL_W + 2)
  // Pass 1 (L→R): push any overlapping column to the right of its neighbour.
  let prev = -Infinity
  for (const c of cols) {
    if (c.x < prev + GAP) c.x = prev + GAP
    prev = c.x
  }
  // Pass 2 (R→L): pull columns that overran the right edge back in, dragging
  // their left neighbours along — so a year-end cluster fans out leftward
  // instead of piling onto the edge (where only one stays selectable).
  let next = maxX + GAP
  for (let i = cols.length - 1; i >= 0; i--) {
    const cap = Math.min(maxX, next - GAP)
    if (cols[i].x > cap) cols[i].x = cap
    next = cols[i].x
  }
  const placed = cols.map((c) => ({ t: c.t, cx: Math.max(minX, Math.min(maxX, c.x)) }))
  const hovered = placed.find((c) => c.t.id === hoveredId) ?? null

  const nearest = (clientX: number, box: DOMRect) => {
    const mx = left + (clientX - box.left)
    let best = placed[0]
    let bestD = Infinity
    for (const c of placed) {
      const d = Math.abs(c.cx - mx)
      if (d < bestD) {
        bestD = d
        best = c
      }
    }
    return best
  }

  return (
    <g>
      {placed.map(({ t, cx: center }) => {
        const h = ((t.assetTotal || 0) / maxVal) * plotH
        if (h <= 0) return null
        const isHot = t.id === hoveredId
        const delay = Math.round(((center - left) / Math.max(1, width)) * COL_STAGGER_MS)
        return (
          <rect
            key={t.id}
            x={center - COL_W / 2}
            y={top + plotH - h}
            width={COL_W}
            height={h}
            rx={2}
            className={cx(
              'workload-col transition-[fill,opacity]',
              isHot ? 'fill-[#E61E2A] opacity-90' : 'fill-[var(--chart-axis)] opacity-25',
            )}
            style={{ animationDelay: `${delay}ms` }}
          />
        )
      })}
      {hovered && (
        <line
          x1={hovered.cx}
          x2={hovered.cx}
          y1={top}
          y2={top + plotH}
          stroke="#E61E2A"
          strokeWidth={1}
          strokeDasharray="4 4"
          pointerEvents="none"
        />
      )}
      {/* Transparent hit layer: follows the pointer and snaps to the nearest column. */}
      <rect
        x={left}
        y={top}
        width={width}
        height={plotH}
        fill="transparent"
        className="cursor-pointer"
        onMouseMove={(e) => {
          const c = nearest(e.clientX, e.currentTarget.getBoundingClientRect())
          if (c && c.t.id !== hoveredId) onHover?.(c.t)
        }}
        onMouseLeave={() => onHover?.(null)}
        onClick={(e) => {
          const c = nearest(e.clientX, e.currentTarget.getBoundingClientRect())
          if (c) onPick?.(c.t)
        }}
      />
    </g>
  )
}

// The workload chart shares ONE x-scale across the line, the month ticks and the
// task columns: day-of-year as a 0–1 fraction (matching TaskColumnsLayer's /366).
// Month labels and each month's aggregate value sit at that month's mid-point, so
// a task's column lines up with where its start date actually falls in the year.
const MONTH_MID_FRAC = Array.from({ length: 12 }, (_, m) =>
  (new Date(2025, m, 15).getTime() - new Date(2025, 0, 1).getTime()) / 86400000 / 366,
)
const nearestMonthIndex = (frac: number) => {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < MONTH_MID_FRAC.length; i++) {
    const d = Math.abs(MONTH_MID_FRAC[i] - frac)
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
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // Act on hover: highlight the column, snap the dashed cursor, update readout.
  const setHover = (t: Task | null) => {
    setHoveredId(t?.id ?? null)
    onHoverTask?.(t)
  }

  // One column per task (disabled in compare mode); the cycle order is sorted by
  // start day so the idle tour runs Jan→Dec.
  const scatterTasks = compare ? [] : (tasks ?? []).filter((t) => t.startDate && (t.assetTotal || 0) > 0)
  const cycleTasks = useMemo(
    () =>
      [...scatterTasks].sort((a, b) =>
        (a.startDate ?? '') < (b.startDate ?? '') ? -1 : (a.startDate ?? '') > (b.startDate ?? '') ? 1 : 0,
      ),
    [scatterTasks], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // Idle auto-tour: after 10s with no input (mouse/keyboard/scroll/touch), walk
  // the columns Jan→Dec→Jan, ~1.5s each, each step behaving like a hover. Any
  // input cancels it and restarts the idle countdown. Latest inputs are read via
  // a ref so the effect can mount once and never tear down mid-cycle.
  const cycleRef = useRef({ tasks: cycleTasks, enabled: false, setHover })
  useEffect(() => {
    cycleRef.current = { tasks: cycleTasks, enabled: !compare && cycleTasks.length > 1, setHover }
  })
  useEffect(() => {
    let idleTimer: number | undefined
    let stepTimer: number | undefined
    let cycling = false
    let idx = 0
    let dir = 1

    const stopCycle = () => {
      if (stepTimer) {
        clearInterval(stepTimer)
        stepTimer = undefined
      }
      if (cycling) {
        cycling = false
        cycleRef.current.setHover(null)
      }
    }
    const startCycle = () => {
      if (!cycleRef.current.enabled) return
      cycling = true
      idx = 0
      dir = 1
      const step = () => {
        const { tasks: list, enabled, setHover: hover } = cycleRef.current
        if (!enabled || list.length === 0) {
          stopCycle()
          return
        }
        hover(list[Math.min(idx, list.length - 1)])
        idx += dir
        if (idx >= list.length - 1) {
          idx = list.length - 1
          dir = -1
        } else if (idx <= 0) {
          idx = 0
          dir = 1
        }
      }
      step() // show the first immediately, then advance every 1.5s
      stepTimer = window.setInterval(step, 1500)
    }
    const resetIdle = () => {
      stopCycle()
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = window.setTimeout(startCycle, 10000)
    }

    const events = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'touchmove', 'scroll']
    events.forEach((e) => window.addEventListener(e, resetIdle, { passive: true }))
    resetIdle()
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetIdle))
      if (idleTimer) clearTimeout(idleTimer)
      if (stepTimer) clearInterval(stepTimer)
    }
  }, [])

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
  // Flat end-caps at the year's edges (Jan 1 / Dec 31) so the area/line spans the
  // full plot width even though the monthly points sit at month mid-points. The
  // caps repeat the first/last month's value and are flagged `anchor` so they
  // draw no dot. Compare mode inherits them via `prev`.
  const first = rows[0]
  const last = rows[rows.length - 1]
  const areaRows =
    first && last
      ? [{ ...first, x: 0, anchor: true }, ...rows, { ...last, x: 1, anchor: true }]
      : rows
  const compareColor = colors[1]

  // Peak of each series — marked with a dot on the curve in the series's own
  // colour. In compare mode the target and source lines each get their own dot.
  const peakOf = (getVal: (r: any) => number) => {
    let best = 0
    for (let i = 1; i < rows.length; i++) if (getVal(rows[i]) > getVal(rows[best])) best = i
    const value = getVal(rows[best])
    return value > 0 ? { value, x: rows[best].x, idx: best } : null
  }
  const peaks: Array<{ value: number; color: string; x: number; idx: number }> = []
  const targetPeak = peakOf((r) => Number(r.value) || 0)
  if (targetPeak) peaks.push({ ...targetPeak, color: WORKLOAD_LINE })
  if (compare) {
    const sourcePeak = peakOf((r) => Number(r.prev) || 0)
    if (sourcePeak) peaks.push({ ...sourcePeak, color: compareColor })
  }

  // Scale the y-axis to a clean round top just above the tallest point (target
  // or source peak), so gridlines stay uniform and the peak sits below the top
  // rather than on a stray top line. `yTop` also scales the task columns so
  // they line up with the axis.
  const peakMax = peaks.reduce((m, p) => Math.max(m, p.value), 0)
  const { top: yTop, ticks: yTicks } = niceScale(peakMax)

  const showNow = nowMonth != null && nowMonth >= 0 && nowMonth < data.length
  const nowFrac = showNow ? (MONTH_MID_FRAC[nowMonth as number] ?? 0) : 0

  // With the flat end-caps the line spans the full plot width, so the stroke
  // gradient's 0–1 objectBoundingBox maps directly onto the day-of-year fraction:
  // the red→grey "Now" switch sits at nowFrac.
  const nowOffset = showNow ? `${nowFrac * 100}%` : '0%'
  const FUTURE_GREY = 'var(--chart-axis-strong)'

  // Colour each dot: red up to and including "Now", grey afterward.
  const renderDot = (props: { cx?: number; cy?: number; index?: number; payload?: any }) => {
    const { cx, cy, index = 0, payload } = props
    // Skip the flat end-caps — dots only mark real months.
    if (cx == null || cy == null || payload?.anchor) return <g key={`dot-${index}`} />
    const isFuture = showNow && Number(payload?.monthIndex) > (nowMonth as number)
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

  // Signature of the current dataset — changes on year / span / compare / ytd
  // switches but NOT on hover. Keying the areas by it remounts them so recharts
  // replays its left-to-right reveal, matching the task columns' L→R entrance.
  const animKey = [
    compare ? 'cmp' : 'one',
    rows.map((r) => r.value).join(','),
    rows.map((r) => (r as { prev?: number }).prev ?? 0).join(','),
  ].join('|')

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
          {/* Line colour: red before "Now", grey after (hard switch at the offset) */}
          {showNow && (
            <linearGradient id="workloadStroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset={nowOffset} stopColor="#E61E2A" />
              <stop offset={nowOffset} stopColor={FUTURE_GREY} />
            </linearGradient>
          )}
        </defs>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis
          type="number"
          dataKey="x"
          domain={[0, 1]}
          ticks={MONTH_MID_FRAC}
          tickFormatter={(v) => rows[nearestMonthIndex(v)]?.name ?? ''}
          tick={AXIS}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={AXIS}
          axisLine={false}
          tickLine={false}
          width={32}
          domain={peakMax > 0 ? [0, yTop] : undefined}
          ticks={peakMax > 0 ? yTicks : undefined}
        />
        {compare && (
          <Legend
            content={(props) => {
              const { payload } = props
              if (!payload) return null
              return (
                <ul className="flex items-center justify-center gap-4 text-xs font-semibold mt-2">
                  {payload.map((entry: any, index: number) => {
                    const isTarget = entry.dataKey === 'value'
                    const color = isTarget ? '#E61E2A' : compareColor
                    return (
                      <li key={`item-${index}`} className="flex items-center gap-1.5" style={{ color }}>
                        <span className="inline-block w-3.5 h-0.5 rounded-full" style={{ backgroundColor: color }} />
                        <span>{entry.value}</span>
                      </li>
                    )
                  })}
                </ul>
              )
            }}
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
          stroke={showNow ? 'url(#workloadStroke)' : '#E61E2A'}
          strokeWidth={3}
          fill="url(#workloadFill)"
          dot={renderDot}
          activeDot={{ r: 5 }}
          isAnimationActive
          animationDuration={900}
          animationEasing="ease-out"
        />
        {scatterTasks.length > 0 && (
          <Customized
            component={
              <TaskColumnsLayer
                tasks={scatterTasks}
                maxVal={yTop}
                hoveredId={hoveredId}
                onHover={setHover}
                onPick={(t) => onTaskClick?.(t)}
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
              r={5}
              fill={p.color}
              stroke="var(--card)"
              strokeWidth={2}
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
