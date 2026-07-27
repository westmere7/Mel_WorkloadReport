import {
  AlertTriangle,
  Bot,
  FileText,
  Layers,
  Loader2,
  PenLine,
  RefreshCw,
  Telescope,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import { Card, CardHeader } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { EvidenceChart } from '../components/advisor/EvidenceChart'
import { useAdvisor, type AdvisorState } from '../lib/advisor/useAdvisor'
import type { Finding } from '../lib/advisor/findings'
import { cx } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// Advisor page — the data first, then what it means.
//
// Layout follows that priority: headline totals, then one card per finding with
// its chart NEXT TO the claim (the chart is the evidence, not decoration), and
// the written briefing last as the synthesis. Everything above the briefing is
// computed by the app — AI is only ever involved in the briefing's wording, and
// the briefing says plainly which author wrote it.
// ─────────────────────────────────────────────────────────────────────────────

/** Short overline per finding, so the cards scan as a set of topics. */
const TOPIC: Record<string, string> = {
  'volume-effort-divergence': 'Effort vs output',
  'heavy-asset-type': 'Heavy format',
  'peak-concentration': 'Seasonal peak',
  'ramp-steepness': 'The ramp',
  'size-effort-mismatch': 'Task sizes',
  'squad-concentration': 'Demand',
  'mix-shift': 'Mix shift',
  'turnaround-overrun': 'Turnarounds',
  'coverage-gap': 'Rate coverage',
}

/**
 * Which facts to show as chips, and what to call them. Keys not listed here are
 * already carried by the claim or the chart (names, months) and would be noise.
 */
const FACT_LABELS: Record<string, string> = {
  assetsChange: 'Assets vs prior yr',
  effortChange: 'Effort vs prior yr',
  assetsNow: 'Assets this yr',
  effortNow: 'Effort this yr',
  hoursPerAssetNow: 'Per asset now',
  hoursPerAssetBefore: 'Per asset before',
  typeEffortShare: 'Share of hours',
  typeVolumeShare: 'Share of output',
  typeHours: 'Est. hours',
  peakShare: 'Peak share',
  evenShare: 'Even share would be',
  rampMultiple: 'Climb',
  smallVolumeShare: 'Small tasks: output',
  smallEffortShare: 'Small tasks: work',
  heaviestSizeEffortShare: 'Heaviest size share',
  squadAssetShare: 'Share of assets',
  squadPerBrief: 'Assets per brief',
  othersPerBrief: 'Others per brief',
  shareBefore: 'Share before',
  shareNow: 'Share now',
  shareChange: 'Change',
  overrunShare: 'Ran over',
  measuredCount: 'Tasks measured',
  unratedCount: 'Types without a rate',
}

/** Severity dot — reads as "how loud this finding is" without a legend. */
const SEVERITY_DOT: Record<number, string> = {
  5: 'bg-rmit-red',
  4: 'bg-orange-500',
  3: 'bg-rmit-navy dark:bg-navy-300',
  2: 'bg-gray-400 dark:bg-gray-500',
  1: 'bg-gray-300 dark:bg-gray-600',
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false })}`
}

/** The headline totals strip, from the always-present scope-totals finding. */
function TotalsStrip({ totals }: { totals: Finding }) {
  const f = totals.facts
  const items: [string, string | undefined][] = [
    ['Years', f.firstYear && f.lastYear ? `${f.firstYear}–${f.lastYear}` : undefined],
    ['Assets', f.assets],
    ['Tasks', f.tasks],
    ['Campaigns', f.campaigns],
    ['Est. effort', f.effort],
    ['Per asset', f.hoursPerAsset],
  ]
  return (
    <Card className="bg-subtle">
      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
        {items
          .filter((i): i is [string, string] => !!i[1])
          .map(([label, value]) => (
            <div key={label} className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">{label}</p>
              <p className="mt-0.5 truncate text-xl font-bold tabular-nums text-ink" title={value}>
                {value}
              </p>
            </div>
          ))}
      </div>
    </Card>
  )
}

function FindingCard({ finding }: { finding: Finding }) {
  const chips = Object.entries(finding.facts).filter(([k]) => FACT_LABELS[k])
  return (
    <Card>
      <div className="grid gap-5 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:items-center">
        {/* Data first — the chart is the finding's evidence, not an illustration. */}
        <div className="min-w-0">
          {finding.evidence ? (
            <EvidenceChart evidence={finding.evidence} />
          ) : (
            <p className="text-xs text-faint">No chartable series for this finding.</p>
          )}
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-faint">
            <span className={cx('h-2 w-2 shrink-0 rounded-full', SEVERITY_DOT[finding.severity] ?? SEVERITY_DOT[1])} />
            {TOPIC[finding.id] ?? 'Finding'}
          </p>
          <h3 className="mt-1.5 text-sm font-semibold leading-relaxed text-ink">{finding.claim}</h3>
          {chips.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {chips.map(([k, v]) => (
                <span key={k} className="chip bg-subtle text-xs text-muted">
                  {FACT_LABELS[k]}&ensp;
                  <strong className="font-semibold tabular-nums text-ink">{v}</strong>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

/** The written synthesis — the only place AI is ever involved, clearly labelled. */
function BriefingCard({ advisor }: { advisor: AdvisorState }) {
  // Single hook instance lives in AdvisorPage — a second one here would load the
  // cache twice and hold its own disconnected generating/stale state.
  const { cached, stale, loading, generating, error, canGenerate, regenerate } = advisor

  const isModel = cached?.source === 'model'
  const regenLabel = cached ? 'Regenerate' : 'Generate briefing'

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            The briefing
            {cached &&
              (isModel ? (
                <Badge tone="teal" className="gap-1">
                  <Bot className="h-3 w-3" /> AI-written
                </Badge>
              ) : (
                <Badge tone="gold" className="gap-1">
                  <PenLine className="h-3 w-3" /> Written without AI
                </Badge>
              ))}
          </span>
        }
        subtitle="The findings above, tied into one read. Every figure comes from the computed findings either way."
        action={
          canGenerate ? (
            <button
              type="button"
              onClick={() => void regenerate()}
              disabled={generating}
              className="btn-outline h-9 shrink-0 px-3 text-sm disabled:cursor-default disabled:opacity-40"
            >
              {generating ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Writing…
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" /> {regenLabel}
                </span>
              )}
            </button>
          ) : undefined
        }
      />

      {stale && cached && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50/70 px-3 py-2 dark:border-amber-500/30 dark:bg-amber-500/10">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-300" />
          <p className="text-xs leading-relaxed text-amber-900 dark:text-amber-200">
            The data has changed since this was written. The charts and findings above are already
            current — {canGenerate ? 'regenerate to bring the text in line.' : 'an editor can regenerate the text.'}
          </p>
        </div>
      )}

      {error && (
        <p className="mb-3 rounded-lg border border-rmit-red/40 bg-brand-50 px-3 py-2 text-xs text-rmit-red dark:bg-brand-500/10">
          {error}
        </p>
      )}

      {loading ? (
        <div className="space-y-2" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-3.5 animate-pulse rounded bg-subtle" style={{ width: `${92 - i * 14}%` }} />
          ))}
        </div>
      ) : cached ? (
        <>
          <div className="space-y-3 text-sm leading-relaxed text-ink">
            {cached.text
              .split(/\n{2,}/)
              .filter(Boolean)
              .map((para, i) => (
                <p key={i}>{para}</p>
              ))}
          </div>
          <p className="mt-4 border-t border-line pt-3 text-xs text-faint">
            {isModel
              ? `Written by ${cached.model ?? 'the AI model'}, checked against the data — every figure was verified to match the findings.`
              : 'Composed by the app directly from the findings — the AI model was not used, so every figure is exact by construction.'}
            {' · '}Generated {formatWhen(cached.generatedAt)}
            {cached.generatedBy ? ` by ${cached.generatedBy}` : ''}
          </p>
        </>
      ) : (
        <p className="rounded-lg border border-dashed border-line px-3 py-4 text-sm text-muted">
          No briefing has been written yet.{' '}
          {canGenerate ? 'Generate one from the findings above.' : 'An editor can generate one from the findings above.'}
        </p>
      )}
    </Card>
  )
}

/**
 * Under-construction placeholder — this is what `/advisor` renders for now.
 * The finished report below is complete and still compiles; swap the two
 * exports back when it's ready to show.
 */
/** The teaser list — what the finished Advisor will actually do, in priority order. */
const COMING: { icon: LucideIcon; label: string; detail: string }[] = [
  {
    icon: Layers,
    label: 'Reads the whole record',
    detail: 'Every task, every year — not just whatever the dashboard is filtered to today.',
  },
  {
    icon: TrendingUp,
    label: 'Finds what actually moved',
    detail:
      'Where effort and output pull apart, which formats eat the hours, when the peaks land, which squads drive the demand.',
  },
  {
    icon: FileText,
    label: 'Writes the briefing',
    detail:
      'One plain-English read Alex can take straight into a resourcing conversation — every figure sitting next to the chart that proves it.',
  },
]

export function AdvisorPage() {
  return (
    <Card className="wip-card border-dashed">
      <div className="mx-auto max-w-xl px-2 py-10">
        {/* Header — icon, status, name, one-line pitch. */}
        <div className="flex flex-col items-center text-center">
          <span className="relative flex h-14 w-14 items-center justify-center">
            <span className="absolute inset-0 animate-pulse rounded-full bg-rmit-red/10" />
            <Telescope className="relative h-7 w-7 animate-gentle-bob text-rmit-red" />
          </span>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-faint">
            In development
            <span className="dot-1">.</span>
            <span className="dot-2">.</span>
            <span className="dot-3">.</span>
          </p>
          <h2 className="mt-1.5 text-xl font-bold text-ink">The Advisor</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            It reads the full task record and tells you what the years actually show — the patterns
            no single chart on the dashboard can hold on its own.
          </p>
        </div>

        {/* The teaser — hierarchy: label, then one row per capability. */}
        <div className="mt-8 border-t border-line pt-6">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">
            What it'll do
          </p>
          <ul className="mt-4 space-y-4">
            {COMING.map(({ icon: Icon, label, detail }) => (
              <li key={label} className="flex gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-subtle">
                  <Icon className="h-3.5 w-3.5 text-muted" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{label}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">{detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer — the joke, then an indeterminate bar. No percentage: it would be a
            number the page can't back up, which is rather the opposite of the point. */}
        <div className="mt-8 flex flex-col items-center gap-3 border-t border-line pt-6 text-center">
          <p className="text-xs text-faint">
            Danh is behind this panel right now, arguing with a chart. The chart is winning.
          </p>
          <div
            className="h-1 w-40 overflow-hidden rounded-full bg-subtle"
            role="progressbar"
            aria-label="Advisor development in progress"
          >
            <div className="h-full w-1/4 animate-wip-progress rounded-full bg-rmit-red/70" />
          </div>
        </div>
      </div>
    </Card>
  )
}

/** The finished report — hidden from the router while the panel is under works. */
export function AdvisorReport() {
  const advisor = useAdvisor()
  const { findings, scopeLabel } = advisor
  const totals = findings.find((f) => f.id === 'scope-totals')
  const cards = findings.filter((f) => f.id !== 'scope-totals')

  if (!findings.length) {
    return (
      <Card>
        <p className="py-6 text-center text-sm text-muted">
          Nothing to analyse yet — the advisor reads the task record, and there are no tasks.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      {totals && <TotalsStrip totals={totals} />}

      <div>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-ink">What the data shows</h2>
          <p className="text-xs text-faint">
            {scopeLabel} · computed by the app, not by AI
          </p>
        </div>
        <div className="space-y-4">
          {cards.map((f) => (
            <FindingCard key={f.id} finding={f} />
          ))}
        </div>
      </div>

      <BriefingCard advisor={advisor} />
    </div>
  )
}
