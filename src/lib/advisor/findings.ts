import type { AssetRates, Size, Task } from '../../types'
import {
  assetsBySquad,
  assetsByType,
  countByField,
  summarize,
  valueByMonth,
  valueBySize,
} from '../analytics'
import { effortByAssetType, formatHours, taskEffortHours, unratedTypesWithVolume } from '../effort'

// ─────────────────────────────────────────────────────────────────────────────
// Advisor · findings engine
//
// Every claim the advisor can make is computed HERE, in TypeScript, from the
// already-scoped task set. The narrator (an LLM, phase 2) receives these findings
// and may only phrase them — it never computes, and every number it is allowed to
// print is present as a pre-formatted string in `facts`.
//
// That split is the whole safety model: prose varies, findings don't. A finding
// returns `null` when it doesn't fire, so a quiet period yields a short honest
// report instead of padding.
//
// Deliberately aggregate-only: no task names, no person names, no campaign codes.
// Nothing here identifies an individual, which is what makes it safe to send to a
// third-party model.
// ─────────────────────────────────────────────────────────────────────────────

/** How an evidence value should be formatted and labelled. */
export type EvidenceUnit = 'assets' | 'hours' | 'percent' | 'tasks'

/**
 * The series behind a finding, for the Advisor page to chart NEXT TO the claim.
 *
 * Raw numbers, unlike `facts` — safe because evidence never leaves the browser:
 * `narrate()` strips findings to `{id, severity, claim, facts}` before anything is
 * sent upstream, and the Edge Function's aggregate guard would reject numeric
 * values anyway. Three shapes cover every rule:
 *
 *  - `months`  a year curve (Jan-Dec), with the months the claim is about marked
 *  - `bars`    one value per category; `signed` centres the axis for +/- values
 *  - `pairs`   the same categories measured two ways (before/after, output/effort)
 */
export type Evidence =
  | { kind: 'months'; unit: EvidenceUnit; points: { name: string; value: number }[]; highlight: string[] }
  | { kind: 'bars'; unit: EvidenceUnit; rows: { name: string; value: number; accent?: boolean }[]; signed?: boolean }
  | {
      kind: 'pairs'
      unit: EvidenceUnit
      beforeLabel: string
      afterLabel: string
      rows: { name: string; before: number; after: number }[]
    }

export interface Finding {
  /** Stable id — the narrator cites it, so the UI can trace prose back to data. */
  id: string
  /** 1–5. The narrator is told to lead with the highest and may skip the lowest. */
  severity: number
  /** Neutral one-line statement of the finding. The narrator rewrites this. */
  claim: string
  /**
   * Pre-formatted values the narrator may quote. Strings, never numbers, so the
   * model copies rather than derives — and so the validation gate can whitelist
   * exactly these tokens.
   */
  facts: Record<string, string>
  /** Chartable series behind the claim. Client-side only — never sent upstream. */
  evidence?: Evidence
}

export interface AdvisorInput {
  /**
   * Every non-draft task the advisor may analyse.
   *
   * Deliberately NOT scoped to the dashboard's current year, function filter or
   * Assets/Effort toggle. The advisor is a standing read of the whole record, so
   * its conclusions don't move because someone changed what they were looking at.
   */
  tasks: Task[]
  /**
   * Like-for-like year pair for the rules that talk about change.
   *
   * `tasks` spans everything, so "grew" and "shifted" have nothing to be measured
   * against there. Those rules compare the latest year holding data with the one
   * before it instead. Absent when there's only a single year on record.
   */
  yoy?: {
    recent: Task[]
    previous: Task[]
    /** Bare years, e.g. "2026" / "2025" — kept as separate atomic facts on purpose. */
    recentYear: string
    previousYear: string
    /**
     * True when the recent year is still running and BOTH years were clipped to the
     * same day-of-year. Without that alignment a part-finished year reads as a
     * collapse in output; with it, the claims must say what they compared.
     */
    partial: boolean
  }
  rates: AssetRates
  /** Master asset-type list, for share-of-mix rules. */
  assetTypes: string[]
  /** Turnaround days per size, for the lead-time rule. */
  sizeDurations: Record<Size, number>
  /** Human label for what was analysed, e.g. "2024-2026 · all GCMC · effort-weighted". */
  scopeLabel: string
  /**
   * Weight by effort instead of counting assets. True whenever any output rate is
   * set — NOT tied to the dashboard's toggle, since the advisor always reads the
   * best available measure.
   */
  useEffort: boolean
  /**
   * What `tasks` actually spans. `years` drives seasonal wording; the two year
   * strings are separate so the numeric gate whitelists each one and the narrator
   * may write "since 2024" without tripping it.
   */
  coverage?: { years: number; firstYear: string; lastYear: string }
}

// ── small formatting helpers (kept local: display-only, advisor-specific) ─────

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '0%')
const signedPct = (now: number, before: number) => {
  if (before <= 0) return now > 0 ? 'new' : '0%'
  const d = ((now - before) / before) * 100
  const mag = Math.abs(d) < 10 ? Math.abs(d).toFixed(1) : String(Math.round(Math.abs(d)))
  return `${d >= 0 ? '+' : '−'}${mag}%`
}
const round1 = (n: number) => String(Math.round(n * 10) / 10)
/** Same rounding signedPct applies, as a number — keeps chart labels equal to facts. */
const roundLikePct = (n: number) => (Math.abs(n) < 10 ? Math.round(n * 10) / 10 : Math.round(n))
const sum = (rows: { value: number }[]) => rows.reduce((a, r) => a + r.value, 0)
/** Days between two ISO dates, or null when either is missing. */
/**
 * Disclosure for a year-over-year claim built from an unfinished year. The two sides
 * were clipped to the same day-of-year, which is the honest comparison — but the
 * reader would otherwise assume two complete years.
 */
const samePeriodNote = (partial: boolean) =>
  partial ? ' Comparing the same months of each year, since this year is still running.' : ''

const daysBetween = (a: string | null, b: string | null) =>
  a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) : null

// ─── rules ───────────────────────────────────────────────────────────────────
// Each takes the input and returns a Finding or null. Add rules here; the
// narrator needs no changes.

/** Volume and effort moving in opposite directions — the headline effort insight. */
function volumeEffortDivergence({ yoy, rates }: AdvisorInput): Finding | null {
  if (!yoy?.recent.length || !yoy.previous.length) return null
  const now = summarize(yoy.recent)
  const before = summarize(yoy.previous)
  const nowH = yoy.recent.reduce((a, t) => a + taskEffortHours(t, rates), 0)
  const beforeH = yoy.previous.reduce((a, t) => a + taskEffortHours(t, rates), 0)
  if (nowH <= 0 || beforeH <= 0) return null

  const volD = ((now.totalAssets - before.totalAssets) / before.totalAssets) * 100
  const effD = ((nowH - beforeH) / beforeH) * 100
  // Only interesting when they diverge: opposite signs, or a >15pt gap.
  const diverges = Math.sign(volD) !== Math.sign(effD) || Math.abs(effD - volD) > 15
  if (!diverges) return null

  const nowPer = nowH / Math.max(1, now.totalAssets)
  const beforePer = beforeH / Math.max(1, before.totalAssets)
  return {
    id: 'volume-effort-divergence',
    severity: 5,
    claim:
      (effD > volD
        ? 'Effort grew faster than output — the work got heavier per deliverable.'
        : 'Output grew faster than effort — the work got lighter per deliverable.') + samePeriodNote(yoy.partial),
    facts: {
      // Years stay separate: the numeric gate whitelists whole fact strings, so a
      // combined "2026 vs 2025" would leave each bare year looking invented.
      recentYear: yoy.recentYear,
      previousYear: yoy.previousYear,
      assetsChange: signedPct(now.totalAssets, before.totalAssets),
      effortChange: signedPct(nowH, beforeH),
      assetsNow: now.totalAssets.toLocaleString(),
      effortNow: formatHours(nowH),
      hoursPerAssetNow: `${round1(nowPer)} h`,
      hoursPerAssetBefore: `${round1(beforePer)} h`,
    },
    evidence: {
      kind: 'bars',
      unit: 'percent',
      signed: true,
      rows: [
        { name: `Assets vs ${yoy.previousYear}`, value: roundLikePct(volD) },
        { name: `Effort vs ${yoy.previousYear}`, value: roundLikePct(effD), accent: true },
      ],
    },
  }
}

/** How much of the period's work sits in its single busiest month. */
function peakConcentration({ tasks, rates, useEffort, coverage }: AdvisorInput): Finding | null {
  const value = useEffort ? (t: Task) => taskEffortHours(t, rates) : (t: Task) => t.assetTotal || 0
  const months = valueByMonth(tasks, value)
  const total = sum(months)
  if (total <= 0) return null
  const peak = months.reduce((m, d) => (d.value > m.value ? d : m))
  const active = months.filter((d) => d.value > 0).length
  if (active < 3) return null
  const share = peak.value / total
  // An even year would put ~1/active in each month; flag a real concentration.
  if (share < Math.max(0.2, 1.6 / active)) return null
  return {
    id: 'peak-concentration',
    severity: 4,
    // Months are bucketed by month-of-year across the WHOLE record, so with more
    // than one year on file this is a statement about the annual cycle — word it
    // that way or the reader hears "one particular February".
    claim:
      (coverage?.years ?? 1) > 1
        ? `${peak.name} is consistently the busiest month of the year and carries a disproportionate share of the work.`
        : `${peak.name} is the busiest month and carries a disproportionate share of the year.`,
    facts: {
      peakMonth: peak.name,
      peakShare: pct(peak.value, total),
      activeMonths: String(active),
      evenShare: pct(1, active),
      ...(coverage && coverage.years > 1 ? { yearsCovered: String(coverage.years) } : {}),
    },
    evidence: { kind: 'months', unit: useEffort ? 'hours' : 'assets', points: months, highlight: [peak.name] },
  }
}

/** The steepest month-to-month climb — how fast the ramp arrives. */
function rampSteepness({ tasks, rates, useEffort }: AdvisorInput): Finding | null {
  const value = useEffort ? (t: Task) => taskEffortHours(t, rates) : (t: Task) => t.assetTotal || 0
  const months = valueByMonth(tasks, value)
  let best = { from: '', to: '', mult: 0 }
  for (let i = 1; i < months.length; i++) {
    const a = months[i - 1].value
    const b = months[i].value
    if (a <= 0 || b <= a) continue
    const mult = b / a
    if (mult > best.mult) best = { from: months[i - 1].name, to: months[i].name, mult }
  }
  if (best.mult < 2) return null
  return {
    id: 'ramp-steepness',
    severity: 3,
    claim: `Workload climbs sharply from ${best.from} into ${best.to}.`,
    facts: { rampFrom: best.from, rampTo: best.to, rampMultiple: `${round1(best.mult)}×` },
    evidence: {
      kind: 'months',
      unit: useEffort ? 'hours' : 'assets',
      points: months,
      highlight: [best.from, best.to],
    },
  }
}

/** Small tasks taking a bigger share of the count than of the work (or vice versa). */
function sizeEffortMismatch({ tasks, rates }: AdvisorInput): Finding | null {
  const byVol = valueBySize(tasks, (t) => t.assetTotal || 0)
  const byEff = valueBySize(tasks, (t) => taskEffortHours(t, rates))
  const vTotal = sum(byVol)
  const eTotal = sum(byEff)
  if (vTotal <= 0 || eTotal <= 0) return null
  const light: Size[] = ['XS', 'S']
  const lightVol = byVol.filter((d) => light.includes(d.name as Size)).reduce((a, d) => a + d.value, 0)
  const lightEff = byEff.filter((d) => light.includes(d.name as Size)).reduce((a, d) => a + d.value, 0)
  const volShare = lightVol / vTotal
  const effShare = lightEff / eTotal
  if (volShare < 0.05 || volShare - effShare < 0.04) return null
  return {
    id: 'size-effort-mismatch',
    severity: 3,
    claim: 'Small tasks account for more of the output than of the actual work.',
    facts: {
      smallVolumeShare: pct(lightVol, vTotal),
      smallEffortShare: pct(lightEff, eTotal),
      heaviestSize: byEff.reduce((m, d) => (d.value > m.value ? d : m)).name,
      heaviestSizeEffortShare: pct(byEff.reduce((m, d) => (d.value > m.value ? d : m)).value, eTotal),
    },
    evidence: {
      kind: 'pairs',
      unit: 'percent',
      beforeLabel: 'share of output',
      afterLabel: 'share of the work',
      rows: byVol
        .map((d) => ({
          name: d.name,
          before: Math.round((d.value / vTotal) * 100),
          after: Math.round(((byEff.find((e) => e.name === d.name)?.value ?? 0) / eTotal) * 100),
        }))
        .filter((r) => r.before > 0 || r.after > 0),
    },
  }
}

/** One asset type quietly eating the team's time relative to its volume. */
function heavyAssetType({ tasks, rates, assetTypes }: AdvisorInput): Finding | null {
  const byEff = effortByAssetType(tasks, rates)
  if (!byEff.length) return null
  const eTotal = sum(byEff)
  const top = byEff[0]
  if (eTotal <= 0 || top.value / eTotal < 0.25) return null
  const vol = assetsByType(tasks, assetTypes)
  const vTotal = sum(vol)
  const topVol = vol.find((d) => d.name === top.name)?.value ?? 0
  return {
    id: 'heavy-asset-type',
    severity: 4,
    claim: `${top.name} consumes far more of the team's time than its share of output suggests.`,
    facts: {
      typeName: top.name,
      typeEffortShare: pct(top.value, eTotal),
      typeVolumeShare: pct(topVol, vTotal),
      typeHours: formatHours(top.value),
    },
    evidence: {
      kind: 'pairs',
      unit: 'percent',
      beforeLabel: 'share of output',
      afterLabel: 'share of hours',
      // Top time consumers, the subject first — the gap between its bars IS the finding.
      rows: byEff.slice(0, 4).map((d) => ({
        name: d.name,
        before: Math.round(((vol.find((v) => v.name === d.name)?.value ?? 0) / Math.max(1, vTotal)) * 100),
        after: Math.round((d.value / eTotal) * 100),
      })),
    },
  }
}

/** Demand concentrated in one requesting squad. */
function squadConcentration({ tasks }: AdvisorInput): Finding | null {
  const byAssets = assetsBySquad(tasks)
  const byTasks = countByField(tasks, 'squad')
  const aTotal = sum(byAssets)
  if (byAssets.length < 2 || aTotal <= 0) return null
  const top = byAssets[0]
  if (top.value / aTotal < 0.4) return null
  const topTasks = byTasks.find((d) => d.name === top.name)?.value ?? 0
  const others = byTasks.filter((d) => d.name !== top.name)
  const otherAssets = aTotal - top.value
  const otherTasks = sum(others)
  return {
    id: 'squad-concentration',
    severity: 3,
    claim: `${top.name} drives most of the output in this scope.`,
    facts: {
      squadName: top.name,
      squadAssetShare: pct(top.value, aTotal),
      squadAssets: top.value.toLocaleString(),
      squadPerBrief: topTasks > 0 ? round1(top.value / topTasks) : '0',
      othersPerBrief: otherTasks > 0 ? round1(otherAssets / otherTasks) : '0',
    },
    evidence: {
      kind: 'bars',
      unit: 'assets',
      rows: byAssets.slice(0, 6).map((d) => ({ name: d.name, value: d.value, accent: d.name === top.name })),
    },
  }
}

/** An asset type whose share of the mix moved materially against the baseline. */
function mixShift({ yoy, assetTypes }: AdvisorInput): Finding | null {
  if (!yoy?.recent.length || !yoy.previous.length) return null
  const now = assetsByType(yoy.recent, assetTypes)
  const before = assetsByType(yoy.previous, assetTypes)
  const nTotal = sum(now)
  const bTotal = sum(before)
  if (nTotal <= 0 || bTotal <= 0) return null
  let best: { name: string; nowShare: number; beforeShare: number; delta: number } | null = null
  for (const row of now) {
    const nowShare = row.value / nTotal
    const beforeShare = (before.find((d) => d.name === row.name)?.value ?? 0) / bTotal
    const delta = nowShare - beforeShare
    if (!best || Math.abs(delta) > Math.abs(best.delta)) best = { name: row.name, nowShare, beforeShare, delta }
  }
  if (!best || Math.abs(best.delta) < 0.08) return null
  return {
    id: 'mix-shift',
    severity: 3,
    claim:
      best.delta > 0
        ? `${best.name} makes up a noticeably bigger share of the mix than the year before.${samePeriodNote(yoy.partial)}`
        : `${best.name} has dropped as a share of the mix since the year before.${samePeriodNote(yoy.partial)}`,
    facts: {
      shiftType: best.name,
      recentYear: yoy.recentYear,
      previousYear: yoy.previousYear,
      shareNow: `${Math.round(best.nowShare * 100)}%`,
      shareBefore: `${Math.round(best.beforeShare * 100)}%`,
      shareChange: `${best.delta > 0 ? '+' : '−'}${Math.abs(Math.round(best.delta * 100))} points`,
    },
    evidence: {
      kind: 'pairs',
      unit: 'percent',
      beforeLabel: yoy.previousYear,
      afterLabel: yoy.recentYear,
      // The biggest movers, the headline shift first.
      rows: now
        .map((row) => ({
          name: row.name,
          before: Math.round(((before.find((d) => d.name === row.name)?.value ?? 0) / bTotal) * 100),
          after: Math.round((row.value / nTotal) * 100),
        }))
        .sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before))
        .slice(0, 4),
    },
  }
}

/** Tasks running past the turnaround their declared size implies. */
function turnaroundOverrun({ tasks, sizeDurations }: AdvisorInput): Finding | null {
  let over = 0
  let measured = 0
  for (const t of tasks) {
    const days = daysBetween(t.startDate, t.endDate)
    if (days === null || days < 0) continue
    measured++
    if (days > (sizeDurations[t.size] ?? 0)) over++
  }
  if (measured < 8 || over / measured < 0.25) return null
  return {
    id: 'turnaround-overrun',
    severity: 2,
    claim: 'A sizeable share of tasks ran longer than the turnaround their size implies.',
    facts: {
      overrunShare: pct(over, measured),
      overrunCount: String(over),
      measuredCount: String(measured),
    },
    evidence: {
      kind: 'bars',
      unit: 'tasks',
      rows: [
        { name: 'Within turnaround', value: measured - over },
        { name: 'Ran over', value: over, accent: true },
      ],
    },
  }
}

/** Effort is understated because some asset types carry volume but no rate. */
function coverageGap({ tasks, rates }: AdvisorInput): Finding | null {
  const unrated = unratedTypesWithVolume(tasks, rates)
  if (!unrated.length) return null
  const volumes = assetsByType(tasks, unrated).sort((a, b) => b.value - a.value)
  return {
    id: 'coverage-gap',
    severity: 2,
    claim: 'Some asset types with real volume have no output rate, so effort is understated.',
    facts: {
      unratedCount: String(unrated.length),
      unratedTypes: unrated.slice(0, 4).join(', '),
    },
    evidence: {
      kind: 'bars',
      unit: 'assets',
      rows: volumes.slice(0, 5).map((d) => ({ name: d.name, value: d.value })),
    },
  }
}

/** Always present: the baseline the narrator should anchor its opening on. */
function scopeTotals({ tasks, rates, useEffort, coverage }: AdvisorInput): Finding | null {
  const s = summarize(tasks)
  if (!s.totalTasks) return null
  const hours = tasks.reduce((a, t) => a + taskEffortHours(t, rates), 0)
  return {
    id: 'scope-totals',
    severity: 1,
    claim: 'Headline totals across everything on record.',
    facts: {
      ...(coverage && coverage.years > 1
        ? {
            yearsCovered: String(coverage.years),
            firstYear: coverage.firstYear,
            lastYear: coverage.lastYear,
          }
        : {}),
      assets: s.totalAssets.toLocaleString(),
      tasks: String(s.totalTasks),
      campaigns: String(s.totalCampaigns),
      ...(hours > 0
        ? { effort: formatHours(hours), hoursPerAsset: `${round1(hours / Math.max(1, s.totalAssets))} h` }
        : {}),
      measure: useEffort ? 'effort (weighted hours)' : 'assets (counted)',
    },
  }
}

const RULES: ((input: AdvisorInput) => Finding | null)[] = [
  volumeEffortDivergence,
  heavyAssetType,
  peakConcentration,
  rampSteepness,
  sizeEffortMismatch,
  squadConcentration,
  mixShift,
  turnaroundOverrun,
  coverageGap,
  scopeTotals,
]

/**
 * Run every rule over the scoped data, strongest first.
 *
 * Returns MORE findings than the narrator should mention: being handed a surplus
 * is what forces it to select and connect them, which is the difference between
 * authored prose and one-sentence-per-fact filler.
 */
export function buildFindings(input: AdvisorInput): Finding[] {
  return RULES.map((rule) => rule(input))
    .filter((f): f is Finding => f !== null)
    .sort((a, b) => b.severity - a.severity)
}

/**
 * Every number the narrator is allowed to print, for phase 2's validation gate:
 * any numeric token in the model's output that isn't in here is a hallucination.
 */
export function allowedTokens(findings: Finding[]): Set<string> {
  const out = new Set<string>()
  for (const f of findings) for (const v of Object.values(f.facts)) out.add(v)
  return out
}
