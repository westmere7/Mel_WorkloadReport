import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Card, CardHeader } from './ui/Card'
import { TrendDelta } from './ui/TrendDelta'
import { PanelExpand } from './PanelExpand'
import { PanelInfo } from './PanelInfo'
import { CHART_COLORS_DARK, CHART_COLORS_LIGHT, withFallback } from '../constants'
import { assetsByType, countByMulti } from '../lib/analytics'
import { applyChartGroups, expandChartSelection } from '../lib/chartGroups'
import { effortByAssetType, formatHours } from '../lib/effort'
import { cx } from '../lib/format'
import { useScrollFade } from '../lib/useScrollFade'
import { useTheme } from '../lib/theme'
import type { AppSettings, ChartGroup, Task } from '../types'

/**
 * The dashboard's "Mix" panel: ONE half donut with a 3-way switch — Assets
 * (deliverables by type), Work types (tasks by work type) and Effort (hours by asset
 * type, from the output rates) — and the items listed to its side, left-aligned and
 * scrolling when they don't fit. Replaced the separate Asset mix + Work type mix
 * donuts (v0.14.0; chosen on the /lab/mix demo page — option M).
 *
 * Grouping follows the dashboard's chart groups: Assets and Effort use the asset
 * groups + the Asset-mix Group switch, Work types the work-type groups + its own
 * switch (`groupAssetMix` / `groupWorkTypeMix` prefs). The switch and the groups
 * gear for the CURRENT view come in through `controls`.
 */

export type MixView = 'assets' | 'types' | 'effort'
const VIEWS: [MixView, string][] = [
  ['assets', 'Assets'],
  ['types', 'Work types'],
  ['effort', 'Effort'],
]
/** Past this many items the smallest fold into one grey "Other" (the list scrolls; this keeps the donut's slices readable). */
const MAX_ITEMS = 16

interface Item {
  name: string
  value: number
  color: string
  /** Short context line — the "what this means" for the current view. */
  detail: string
  /** True for the folded "Other (n)" — not clickable (it spans several items). */
  folded?: boolean
}

interface Built {
  items: Item[]
  total: number
  unit: string
  fmt: (v: number) => string
}

/** The items for one view (exported for the /lab/mix demos). */
export function buildMix(view: MixView, tasks: Task[], settings: AppSettings, palette: string[], assetGroups: ChartGroup[], typeGroups: ChartGroup[]): Built {
  const assetList = withFallback(settings.assetTypes)
  const typeList = withFallback(settings.types)
  // Colour follows the item (its place in the Settings list, or its group's colour),
  // never its rank — so switching year or filter never repaints anything.
  const colorFor = (row: { name: string; color?: string }, list: string[]) => {
    if (row.color) return row.color
    const i = list.indexOf(row.name)
    return i < 0 ? 'var(--chart-axis)' : palette[i % palette.length]
  }
  const pct = (v: number, total: number) => (total ? Math.round((v / total) * 100) : 0)
  const fold = (rows: Item[]): Item[] => {
    if (rows.length <= MAX_ITEMS) return rows
    const rest = rows.slice(MAX_ITEMS - 1)
    return [
      ...rows.slice(0, MAX_ITEMS - 1),
      {
        name: `Other (${rest.length})`,
        value: rest.reduce((a, r) => a + r.value, 0),
        color: 'var(--chart-axis)',
        detail: rest.map((r) => r.name).join(', '),
        folded: true,
      },
    ]
  }
  const byValue = (a: Item, b: Item) => b.value - a.value

  if (view === 'assets') {
    const rows = applyChartGroups(assetsByType(tasks, assetList), assetGroups)
    const total = rows.reduce((a, r) => a + r.value, 0)
    const items = rows
      .map((r) => {
        const members = expandChartSelection(assetGroups, r.name)
        const n = tasks.filter((t) => members.some((m) => (Number(t.assetBreakdown[m]) || 0) > 0)).length
        return { name: r.name, value: r.value, color: colorFor(r, assetList), detail: `${pct(r.value, total)}% · ${n} task${n === 1 ? '' : 's'}` }
      })
      .sort(byValue)
    return { items: fold(items), total, unit: 'assets', fmt: (v) => Math.round(v).toLocaleString() }
  }

  if (view === 'types') {
    const rows = applyChartGroups(countByMulti(tasks, 'types'), typeGroups)
    const items = rows
      .map((r) => {
        const members = expandChartSelection(typeGroups, r.name)
        const assets = tasks.filter((t) => t.types.some((ty) => members.includes(ty))).reduce((a, t) => a + (t.assetTotal || 0), 0)
        return {
          name: r.name,
          value: r.value,
          color: colorFor(r, typeList),
          detail: `${pct(r.value, tasks.length)}% of tasks · ${assets.toLocaleString()} assets`,
        }
      })
      .sort(byValue)
    // A task with several work types counts once per type — the bar is tags, not tasks.
    const tags = items.reduce((a, s) => a + s.value, 0)
    return { items: fold(items), total: tags, unit: 'work-type tags', fmt: (v) => Math.round(v).toLocaleString() }
  }

  const rates = settings.assetRates ?? {}
  const hours = applyChartGroups(effortByAssetType(tasks, rates), assetGroups)
  const counts = new Map(applyChartGroups(assetsByType(tasks, assetList), assetGroups).map((r) => [r.name, r.value]))
  const total = hours.reduce((a, r) => a + r.value, 0)
  const items = hours
    .map((r) => {
      const n = counts.get(r.name) ?? 0
      return {
        name: r.name,
        value: r.value,
        color: colorFor(r, assetList),
        detail: `${pct(r.value, total)}% · ${n ? formatHours(r.value / n) : '—'} per asset`,
      }
    })
    .sort(byValue)
  return { items: fold(items), total, unit: 'hours', fmt: (v) => formatHours(v).replace(' h', '') }
}

/** Dark or white text for a slice fill. CSS-variable fills (the grey "Other") get white. */
function inkOn(color: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color)
  if (!m) return '#fff'
  const n = parseInt(m[1], 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#1a1a2e' : '#fff'
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** Tween a name→share map towards `target` (easeOutCubic) so slices grow/shrink on a switch. */
function useTween(target: Record<string, number>, ms = 650) {
  const [cur, setCur] = useState(target)
  const curRef = useRef(target)
  const key = JSON.stringify(target)
  useEffect(() => {
    if (prefersReducedMotion()) {
      curRef.current = target
      setCur(target)
      return
    }
    const from = { ...curRef.current }
    const t0 = performance.now()
    let raf = 0
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms)
      const e = 1 - (1 - k) ** 3
      const next: Record<string, number> = {}
      for (const n of Object.keys(target)) next[n] = (from[n] ?? 0) + (target[n] - (from[n] ?? 0)) * e
      curRef.current = next
      setCur(next)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ms])
  return cur
}

// ── Half-donut geometry (θ clockwise from 12 o'clock; the arc runs −90° → +90°) ──
const CX = 200
const CY = 196
const R = 180
const IR = 114
const pt = (r: number, th: number) => [CX + r * Math.sin(th), CY - r * Math.cos(th)] as const
function wedge(r0: number, r1: number, a0: number, a1: number) {
  const [x0, y0] = pt(r1, a0)
  const [x1, y1] = pt(r1, a1)
  const [x2, y2] = pt(r0, a1)
  const [x3, y3] = pt(r0, a0)
  const large = a1 - a0 > Math.PI ? 1 : 0
  return `M${x0},${y0} A${r1},${r1} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 ${large} 0 ${x3},${y3} Z`
}
function arcs<T extends { name: string }>(items: T[], share: Record<string, number>) {
  let a = -Math.PI / 2
  return items.map((it) => {
    const a0 = a
    a += (share[it.name] ?? 0) * Math.PI
    return { it, a0, a1: a }
  })
}

const SUBTITLE: Record<MixView, string> = {
  assets: 'Deliverables by type',
  types: 'Tasks by work type — a task with several types counts in each',
  effort: 'Hours by asset type, from the output rates',
}
const INFO: Record<MixView, 'assetMix' | 'workTypeMix' | 'effortMix'> = {
  assets: 'assetMix',
  types: 'workTypeMix',
  effort: 'effortMix',
}

export function MixPanel({
  tasks,
  sourceTasks,
  compare,
  settings,
  assetGroups,
  typeGroups,
  emptyMessage,
  onSelect,
  controls,
  className,
}: {
  tasks: Task[]
  /** Baseline-year tasks — only read in compare mode. */
  sourceTasks: Task[]
  compare: { on: boolean; activeYear: number; srcYear: number }
  settings: AppSettings
  /** The groups ACTIVE for each dimension (empty when that panel's Group switch is off). */
  assetGroups: ChartGroup[]
  typeGroups: ChartGroup[]
  emptyMessage?: string
  /** Click-through: the view and the item's member names (a group expands to its items). */
  onSelect: (view: MixView, members: string[]) => void
  /** The Group switch + groups gear for the current view. */
  controls: (view: MixView) => ReactNode
  className?: string
}) {
  const dark = useTheme().theme === 'dark'
  const palette = dark ? CHART_COLORS_DARK : CHART_COLORS_LIGHT
  const [view, setView] = useState<MixView>('assets')
  const [hover, setHover] = useState<string | null>(null)
  const listRef = useScrollFade<HTMLUListElement>()
  const data = useMemo(
    () => buildMix(view, tasks, settings, palette, assetGroups, typeGroups),
    [view, tasks, settings, palette, assetGroups, typeGroups],
  )
  const src = useMemo(
    () => (compare.on ? buildMix(view, sourceTasks, settings, palette, assetGroups, typeGroups) : null),
    [compare.on, view, sourceTasks, settings, palette, assetGroups, typeGroups],
  )
  const srcByName = useMemo(() => new Map((src?.items ?? []).map((i) => [i.name, i.value])), [src])

  const sum = data.items.reduce((a, s) => a + s.value, 0) || 1
  const rows = data.items.map((s) => ({ ...s, share: s.value / sum }))
  const share = useTween(useMemo(() => Object.fromEntries(rows.map((r) => [r.name, r.share])), [rows]))
  const srcSum = (src?.items ?? []).reduce((a, s) => a + s.value, 0) || 1
  const srcShare = useMemo(
    () => Object.fromEntries((src?.items ?? []).map((r) => [r.name, r.value / srcSum])),
    [src, srcSum],
  )
  const active = rows.find((r) => r.name === hover) ?? null
  const groupsFor = view === 'types' ? typeGroups : assetGroups
  const select = (r: Item) => {
    if (!r.folded) onSelect(view, expandChartSelection(groupsFor, r.name))
  }
  const dim = (name: string) => (active && active.name !== name ? 0.3 : 1)

  return (
    <Card className={cx('flex min-h-0 flex-col gap-3', className)}>
      <CardHeader
        title="Mix"
        className="shrink-0"
        subtitle={compare.on ? `${SUBTITLE[view]} — ${compare.activeYear} over ${compare.srcYear}` : SUBTITLE[view]}
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* View tabs — same look as the Squads demand chart's dimension tabs. */}
            <div className="inline-flex items-center gap-0.5 rounded-lg bg-subtle p-0.5" role="group" aria-label="What the chart measures">
              {VIEWS.map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    setView(v)
                    setHover(null)
                  }}
                  aria-pressed={view === v}
                  className={cx(
                    'rounded-md px-2 py-0.5 text-[11px] font-semibold transition',
                    view === v ? 'bg-rmit-navy text-white dark:bg-navy-300' : 'text-muted hover:text-ink',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="panel-action h-4 w-px shrink-0 bg-line" aria-hidden="true" />
            {controls(view)}
            <PanelExpand />
            <PanelInfo panel={INFO[view]} />
          </div>
        }
      />

      {rows.length === 0 && (
        <p className="flex flex-1 items-center justify-center text-center text-sm text-muted">
          {view === 'effort' && !Object.keys(settings.assetRates ?? {}).length
            ? 'Set output rates in Settings → Timing & effort to see effort.'
            : emptyMessage ?? 'Nothing recorded in this view yet.'}
        </p>
      )}
      {/* Half donut on the left, the items listed to its side (left-aligned, scrolling
          when they don't fit). Kept mounted even when empty so the scroll-fade hook
          has its element from the first render. */}
      <div className={cx('grid min-h-0 flex-1 items-stretch gap-4 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]', rows.length === 0 && 'hidden')}>
        {/* Sized to the cell in BOTH directions ("meet"), so it never runs past the card —
            width-only sizing overflowed when the card was shown full screen. Anchored to the
            RIGHT of its cell (xMax) so that on wide screens, where height is the limit, the
            spare width sits at the card edge instead of opening a gap before the list. */}
        <svg viewBox="-22 -26 444 230" preserveAspectRatio="xMaxYMid meet" className="h-full min-h-0 w-full" role="img" aria-label={`${data.unit} by item`}>
          {/* A percentage scale round the outside: fine ticks every 5%, longer ones and
              labels at the quarters. Purely a reading aid — the slices carry the data. */}
          {Array.from({ length: 21 }, (_, i) => {
            const th = -Math.PI / 2 + (i / 20) * Math.PI
            const major = i % 5 === 0
            const [x0, y0] = pt(R + 11, th)
            const [x1, y1] = pt(R + (major ? 17 : 14), th)
            const [lx, ly] = pt(R + 24, th)
            return (
              <g key={`tick-${i}`}>
                <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--chart-axis)" strokeOpacity={major ? 0.7 : 0.35} strokeWidth={major ? 1.2 : 0.8} />
                {major && i > 0 && i < 20 && (
                  <text x={lx} y={ly + 3} textAnchor="middle" fontSize={8.5} fill="var(--chart-axis)">{i * 5}%</text>
                )}
              </g>
            )
          })}
          <path d={`M${CX - R - 11},${CY} A${R + 11},${R + 11} 0 0 1 ${CX + R + 11},${CY}`} fill="none" stroke="var(--chart-axis)" strokeOpacity={0.25} strokeWidth={0.8} />
          {/* Inner hairline echoing the ring. */}
          <path d={`M${CX - IR + 7},${CY} A${IR - 7},${IR - 7} 0 0 1 ${CX + IR - 7},${CY}`} fill="none" stroke="var(--chart-axis)" strokeOpacity={0.3} strokeWidth={0.8} strokeDasharray="2 3" />
          {/* Compare: the baseline year as a thin faded ring just outside the donut. */}
          {src &&
            arcs(src.items, srcShare).map(({ it, a0, a1 }) =>
              a1 - a0 > 0.0005 ? (
                <path key={`src-${it.name}`} d={wedge(R + 3, R + 8, a0, a1)} fill={it.color} opacity={0.45 * dim(it.name)}>
                  <title>{`${compare.srcYear} · ${it.name}: ${src.fmt(it.value)}`}</title>
                </path>
              ) : null,
            )}
          {arcs(rows, share).map(({ it, a0, a1 }) => {
            if (a1 - a0 <= 0.0005) return null
            const mid = (a0 + a1) / 2
            // The hovered slice lifts outward a touch.
            const lift = active?.name === it.name ? 6 : 0
            const [dx, dy] = [lift * Math.sin(mid), -lift * Math.cos(mid)]
            const [lx, ly] = pt((R + IR) / 2, mid)
            return (
              <g key={it.name} transform={`translate(${dx} ${dy})`} className="transition-transform duration-200">
                <path
                  d={wedge(IR, R, a0, a1)}
                  fill={it.color}
                  stroke="var(--card)"
                  strokeWidth={2}
                  opacity={dim(it.name)}
                  className={cx('transition-opacity', !it.folded && 'cursor-pointer')}
                  onMouseEnter={() => setHover(it.name)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => select(it)}
                >
                  <title>{`${it.name}: ${data.fmt(it.value)} ${data.unit} (${Math.round(it.share * 100)}%)`}</title>
                </path>
                {/* % inside slices with room for it. */}
                {it.share >= 0.07 && (
                  <text x={lx} y={ly + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={inkOn(it.color)} opacity={dim(it.name)} className="pointer-events-none tabular-nums">
                    {Math.round(it.share * 100)}%
                  </text>
                )}
              </g>
            )
          })}
          <text x={CX} y={CY - 34} textAnchor="middle" fontSize={34} fontWeight={700} fill="var(--ink)" className="tabular-nums">
            {data.fmt(active ? active.value : data.total)}
          </text>
          <text x={CX} y={CY - 12} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="var(--muted)" letterSpacing={0.6}>
            {(active ? `${active.name.length > 22 ? `${active.name.slice(0, 21)}…` : active.name} · ${Math.round(active.share * 100)}%` : data.unit).toUpperCase()}
          </text>
        </svg>

        {/* `safe center`: centred when it fits, top-aligned (so fully scrollable) when it doesn't. */}
        <ul ref={listRef} className="flex min-h-0 flex-col gap-1 overflow-y-auto pr-1 [justify-content:safe_center]">
          {rows.map((r) => (
            <li
              key={r.name}
              onMouseEnter={() => setHover(r.name)}
              onMouseLeave={() => setHover(null)}
              onClick={() => select(r)}
              title={r.folded ? r.detail : `${r.detail} — click to see these tasks`}
              className={cx(
                // Each row a very faint box (half-strength --subtle) so the list reads line by line.
                'flex min-w-0 shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition',
                !r.folded && 'cursor-pointer',
                active?.name === r.name
                  ? 'bg-subtle'
                  : cx('bg-[color-mix(in_srgb,var(--subtle)_55%,transparent)] hover:bg-subtle', active && 'opacity-40'),
              )}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{r.name}</span>
              {/* Wide screens: the full detail ("24% of tasks · 2,080 assets") fills the line;
                  narrower ones fall back to just the share. */}
              <span className="hidden min-w-0 truncate text-xs tabular-nums text-muted 2xl:inline">{r.detail}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted 2xl:hidden">{Math.round(r.share * 100)}%</span>
              {src && !r.folded && (
                <TrendDelta
                  size="sm"
                  current={r.value}
                  previous={srcByName.get(r.name) ?? 0}
                  title={`${compare.srcYear}: ${src.fmt(srcByName.get(r.name) ?? 0)} → ${compare.activeYear}: ${data.fmt(r.value)}`}
                />
              )}
              <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-ink">{data.fmt(r.value)}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}
