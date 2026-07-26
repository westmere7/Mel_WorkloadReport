import { Card, CardHeader } from './ui/Card'
import { PanelInfo } from './PanelInfo'
import { AnimatedNumber } from './ui/AnimatedNumber'
import { TrendDelta } from './ui/TrendDelta'
import { SIZE_COLORS, SIZE_SHORT } from '../constants'
import { formatHours } from '../lib/effort'
import { cx } from '../lib/format'
import type { NamedCount } from '../lib/analytics'

/** Shared comparison context for the effort-mode header panels. */
export interface CompareCtx {
  on: boolean
  activeYear: number
  srcYear: number
  /** "Match range" is on — both years measured to the same day. */
  ytd: boolean
  /** Day-month label of today, e.g. "26 Jul". */
  todayDM: string
}

/**
 * Volume (assets + tasks) folded into ONE compact panel. Shown in place of the
 * two hero stat cards while the dashboard is in Effort mode: the counts stay
 * available and exact, just no longer the headline — effort is.
 */
export function VolumeCompactCard({
  assets,
  tasks,
  srcAssets,
  srcTasks,
  bySize,
  srcBySize,
  cmp,
}: {
  assets: number
  tasks: number
  srcAssets: number
  srcTasks: number
  /** Assets per task size — the volume counterpart of Effort's breakdown. */
  bySize: NamedCount[]
  srcBySize: NamedCount[]
  cmp: CompareCtx
}) {
  /**
   * Two figures side by side, each with its unit and a prominent animated delta
   * underneath. Sized off the card width — this panel is given a wider grid column
   * than Effort precisely because it carries two numbers instead of one.
   */
  const stat = (value: number, prev: number, unit: string) => (
    // Equal halves with centred content: the figures scale to fill their own half,
    // and the divider between them lands exactly midway between the two.
    <div className="flex min-w-0 flex-1 flex-col text-center">
      {/* cq units resolve against the card's CONTENT box and each figure gets half
          of it, so ~17cqw is the ceiling for a 5-glyph number. The max is
          deliberately high — cqw should be what limits the size, not the clamp. */}
      <span className={cx(FIGURE_ROW, 'justify-center')}>
        <span className="font-display block text-[clamp(2.25rem,17cqw,12rem)] font-bold leading-[0.8] tracking-tighter text-rmit-navy dark:text-ink">
          <AnimatedNumber value={value} />
        </span>
      </span>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-x-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">{unit}</span>
        {cmp.on && (
          <TrendDelta
            size="prominent"
            current={value}
            previous={prev}
            title={`${cmp.srcYear}: ${prev.toLocaleString()} → ${cmp.activeYear}: ${value.toLocaleString()}`}
          />
        )}
      </div>
    </div>
  )

  return (
    // `inline-size`, deliberately NOT `size`: container-type:size implies
    // `contain: size`, which makes the card ignore its own content when sizing — so
    // a short grid row clipped the task-size bars instead of growing. Width-based
    // cq units only, and the card can push its row taller again.
    <Card className="flex h-full flex-col gap-2 [container-type:inline-size]">
      <CardHeader
        title="Volume"
        subtitle={
          cmp.on
            ? `${cmp.activeYear} over ${cmp.srcYear}${cmp.ytd ? ` — to ${cmp.todayDM}` : ''}`
            : 'What was produced, counted'
        }
        action={<PanelInfo panel="volume" />}
        className={HEADER_BOX}
      />
      <div className="flex items-stretch gap-4">
        {stat(assets, srcAssets, 'assets')}
        {/* Short rule beside the figures, not a full-height divider — it only needs
            to separate the two, not stripe the whole card. */}
        <span className="mt-2 h-16 w-px shrink-0 bg-line" aria-hidden="true" />
        {stat(tasks, srcTasks, 'tasks')}
      </div>
      {/* Same breakdown as the Effort panel, but by asset COUNT — put side by side
          they show where the volume sits versus where the work actually is. */}
      <div className="mt-6">
        <SizeBreakdown
          data={bySize}
          srcData={srcBySize}
          cmp={cmp}
          label="Assets by task size"
          fmt={(v) => `${Math.round(v).toLocaleString()} assets`}
        />
      </div>
    </Card>
  )
}

/** How many of the leading asset types to list before collapsing the rest. */
const TOP_TYPES = 3

// Volume and Effort sit side by side, so their big FIGURES must land on the same
// horizontal line. Centring each block in its own card can't do that, and a header
// min-height isn't enough either: Effort's card is narrower, so its subtitle wraps
// to two lines and pushes everything below it down. Hence a FIXED header box (tall
// enough for two subtitle lines, clamped so it can never be three) followed by a
// fixed-height figure row that bottom-aligns the glyphs. Captions below keep their
// own natural spacing.
const HEADER_BOX = 'h-[3.75rem] [&_p]:line-clamp-2'
const FIGURE_ROW = 'flex h-[5.5rem] items-end'

/**
 * One task-size distribution bar. `fmt` renders a segment's value for the tooltip.
 * `muted` marks the comparison baseline — it fades the fills but keeps the SAME
 * height, so the two years read as directly comparable rather than one looking
 * like a lesser version of the other.
 */
function SizeBar({
  data,
  total,
  muted,
  label,
  inlineLabel,
  fmt,
}: {
  data: NamedCount[]
  total: number
  muted?: boolean
  label?: string
  /** Put the label to the LEFT of the bar instead of above it — for short labels
   *  like a year, where stacking would waste a row per bar. */
  inlineLabel?: boolean
  fmt: (value: number) => string
}) {
  if (total <= 0) return null
  const bar = (
    <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-subtle">
        {data.map((d) =>
          d.value > 0 ? (
            <span
              key={d.name}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{
                width: `${(d.value / total) * 100}%`,
                backgroundColor: SIZE_COLORS[d.name as keyof typeof SIZE_COLORS],
                opacity: muted ? 0.55 : 1,
              }}
              title={`${SIZE_SHORT[d.name as keyof typeof SIZE_SHORT]}: ${fmt(d.value)} (${Math.round(
                (d.value / total) * 100,
              )}%)`}
            />
          ) : null,
        )}
    </div>
  )
  if (inlineLabel && label) {
    return (
      <div className="flex items-center gap-2">
        <span className="w-8 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-faint">{label}</span>
        <div className="min-w-0 flex-1">{bar}</div>
      </div>
    )
  }
  return (
    <div className="space-y-1">
      {label && <span className="text-[10px] font-semibold uppercase tracking-wide text-faint">{label}</span>}
      {bar}
    </div>
  )
}

/**
 * Task-size distribution: the bar (plus a thinner baseline-year bar when
 * comparing) and a share legend. Shared by both header panels so Volume and Effort
 * are read the same way — same colours, same order — and the difference between
 * "where the assets are" and "where the work is" is directly comparable.
 */
function SizeBreakdown({
  data,
  srcData,
  cmp,
  label,
  fmt,
}: {
  data: NamedCount[]
  srcData: NamedCount[]
  cmp: CompareCtx
  label: string
  fmt: (value: number) => string
}) {
  const total = data.reduce((a, d) => a + d.value, 0)
  const srcTotal = srcData.reduce((a, d) => a + d.value, 0)
  if (total <= 0) return null
  // Only the sizes carrying something, biggest share first.
  const legend = [...data].filter((d) => d.value > 0).sort((a, b) => b.value - a.value)
  return (
    <div className="space-y-1.5">
      <SizeBar
        data={data}
        total={total}
        label={cmp.on ? String(cmp.activeYear) : label}
        inlineLabel={cmp.on}
        fmt={fmt}
      />
      {cmp.on && srcTotal > 0 && (
        <SizeBar data={srcData} total={srcTotal} muted label={String(cmp.srcYear)} inlineLabel fmt={fmt} />
      )}
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {legend.map((d) => (
          <li key={d.name} className="flex items-center gap-1.5 text-[10px] font-medium text-muted">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: SIZE_COLORS[d.name as keyof typeof SIZE_COLORS] }}
            />
            {d.name}
            <span className="text-faint">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The Effort headline for the dashboard's Effort mode: total weighted effort as
 * the dominant figure, then how that effort is spread across task sizes — the two
 * things asset counts can't show. Everything here is derived from the recorded
 * output rates at render time; no stored total is affected.
 */
export function EffortSummaryCard({
  hours,
  srcHours,
  assets,
  srcAssets,
  byType,
  cmp,
  onExplain,
}: {
  hours: number
  srcHours: number
  /** Asset count in scope — for the hours-per-asset intensity figure. */
  assets: number
  srcAssets: number
  /** Hours per asset type, biggest first (see effortByAssetType). */
  byType: NamedCount[]
  cmp: CompareCtx
  /** Opens the "what is effort" explainer. */
  onExplain?: () => void
}) {
  // Hours per asset — the figure that actually separates effort from volume: it
  // says whether the month's mix was heavy or light, which a count can't.
  const perAsset = assets > 0 ? hours / assets : 0
  const srcPerAsset = srcAssets > 0 ? srcHours / srcAssets : 0

  return (
    // `inline-size`, deliberately NOT `size`: container-type:size implies
    // `contain: size`, which makes the card ignore its own content when sizing — so
    // a short grid row clipped the task-size bars instead of growing. Width-based
    // cq units only, and the card can push its row taller again.
    <Card className="flex h-full flex-col gap-2 [container-type:inline-size]">
      <CardHeader
        title="Effort"
        subtitle={
          cmp.on
            ? `Weighted by output rate — ${cmp.activeYear} over ${cmp.srcYear}${
                cmp.ytd ? ` (to ${cmp.todayDM})` : ''
              }`
            : 'How much work that actually was, weighted by output rate'
        }
        className={HEADER_BOX}
        action={
          onExplain && (
            <button
              type="button"
              onClick={onExplain}
              title="What does Effort mean?"
              aria-label="What does Effort mean?"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line text-[10px] font-bold text-muted transition hover:border-faint hover:text-ink"
            >
              ?
            </button>
          )
        }
      />

      {/* The hours total is the headline, so it gets the card's whole width; the
          intensity figure sits under it as supporting detail. */}
      <div className="flex min-w-0 flex-col">
        <div className={cx(FIGURE_ROW, 'min-w-0 gap-1')}>
          <span className="font-display text-[clamp(2rem,24cqw,10rem)] font-bold leading-[0.8] tracking-tighter text-rmit-navy dark:text-ink">
            <AnimatedNumber value={Math.round(hours)} />
          </span>
          <span className="pb-0.5 text-[clamp(1.125rem,7cqw,2.5rem)] font-semibold leading-none text-muted">h</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {cmp.on && (
            <TrendDelta
              size="prominent"
              current={hours}
              previous={srcHours}
              title={`${cmp.srcYear}: ${formatHours(srcHours)} → ${cmp.activeYear}: ${formatHours(hours)}`}
            />
          )}
          {/* Intensity: the heaviness of the mix, which volume alone can't show. */}
          <span className="text-[11px] font-medium text-muted">
            {Math.round(perAsset * 10) / 10} h per asset
            {cmp.on && srcPerAsset > 0 && (
              <span className="text-faint">
                {' '}
                · {Math.round(srcPerAsset * 10) / 10} h in {cmp.srcYear}
              </span>
            )}
          </span>
        </div>
      </div>

      {/* The heaviest deliverable types by hours. The task-size split lives on the
          Volume panel; this is the view only effort can give — a type can be a
          sliver of the output and a big slice of the work. */}
      {byType.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-faint">
            Top {Math.min(TOP_TYPES, byType.length)} time consumers
            {byType.length > TOP_TYPES && (
              // The three shares don't sum to 100%, so name what's left out.
              <span className="normal-case">
                {' '}
                (remaining {Math.round((byType.slice(TOP_TYPES).reduce((a, d) => a + d.value, 0) / hours) * 100)}%
                hidden)
              </span>
            )}
          </span>
          <ol className="space-y-1">
            {byType.slice(0, TOP_TYPES).map((d, i) => (
              <li key={d.name} className="flex items-center gap-2" title={`${d.name}: ${formatHours(d.value)}`}>
                <span className="w-3 shrink-0 text-[10px] font-bold text-faint">{i + 1}</span>
                {/* Asset-type names run long ("Brochure (under 8 Pages)"), so give
                    the label the room and let the bar take what's left. */}
                <span className="w-36 shrink-0 truncate text-[11px] font-medium text-ink">{d.name}</span>
                <span className="h-1.5 min-w-[2.5rem] flex-1 overflow-hidden rounded-full bg-subtle">
                  <span
                    className="block h-full rounded-full bg-accent-plum"
                    style={{ width: `${(d.value / byType[0].value) * 100}%`, minWidth: '2px' }}
                  />
                </span>
                <span className="w-8 shrink-0 text-right text-[10px] font-semibold text-muted">
                  {Math.round((d.value / hours) * 100)}%
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Card>
  )
}
