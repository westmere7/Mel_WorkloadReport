import type { Finding } from './findings'

// ─────────────────────────────────────────────────────────────────────────────
// Advisor · the built-in analyst
//
// Composes a full written briefing from the findings WITHOUT a model — this is
// what readers get when Gemini is unavailable, over quota, or its draft failed
// the audit. It has to stand on its own, not read like an error state.
//
// Correct by construction: every figure is interpolated straight from `facts`,
// so nothing here can be wrong about the data — the trade against the model is
// range of expression, not accuracy. The UI labels which author produced the
// text; this file's job is to make the difference small.
//
// Deterministic on purpose: the phrasing is chosen by a seed derived from the
// findings themselves. Same data → same words (stable under caching, and two
// people reading the same numbers see the same briefing); different data →
// different sentence shapes, so consecutive months don't read like a form
// letter with the numbers swapped.
// ─────────────────────────────────────────────────────────────────────────────

/** FNV-1a over the findings — the phrasing seed. Same data, same prose. */
function seedOf(findings: Finding[]): number {
  const src = findings.map((f) => `${f.id}:${Object.values(f.facts).join(',')}`).join('|')
  let h = 0x811c9dc5
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Small deterministic PRNG (mulberry32) — good enough to pick sentence variants. */
function mulberry32(seed: number): () => number {
  let a = seed || 1
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Direction words for a signed-percent fact like "+33%" or "−2.0%".
 *
 * The digits are kept verbatim; only the sign becomes a verb, which is what lets
 * "effort moved +33%" read as "effort rose 33%" without touching the figure.
 */
function change(tok: string | undefined): { up: boolean; mag: string } | null {
  if (!tok || tok === 'new' || tok === '0%') return null
  const up = !tok.startsWith('−') && !tok.startsWith('-')
  return { up, mag: tok.replace(/^[+\-−]/, '') }
}

type PickFn = <T>(variants: T[]) => T

interface Ctx {
  /** facts of a finding by id, or null when the rule didn't fire. */
  f: (id: string) => Record<string, string> | null
  pick: PickFn
}

// ── sentence renderers ────────────────────────────────────────────────────────
// Each returns finished sentences. `lead` opens the briefing; `later` continues a
// paragraph that is already under way (so it carries the connective). Variants are
// alternatives, not templates-with-blanks: whole sentence shapes differ.

function divergence(ctx: Ctx, asLead: boolean): string | null {
  const d = ctx.f('volume-effort-divergence')
  if (!d) return null
  const eff = change(d.effortChange)
  const vol = change(d.assetsChange)
  if (!eff || !vol) return null
  const prev = d.previousYear
  const rec = d.recentYear
  const heavier = eff.up && (!vol.up || parseFloat(eff.mag) > parseFloat(vol.mag))
  const volWord = vol.up ? `grew ${vol.mag}` : `slipped ${vol.mag}`
  const effWord = eff.up ? `rose ${eff.mag}` : `fell ${eff.mag}`

  // The partial-year disclosure lives in the claim; read its presence rather than
  // re-deriving the clipping logic here.
  const partial = /still running/.test(d._claim ?? '')

  if (heavier) {
    const main = asLead
      ? ctx.pick([
          `The clearest movement in the record is that the work itself has grown heavier: between ${prev} and ${rec}, effort ${effWord} while output ${volWord}, lifting the average deliverable from ${d.hoursPerAssetBefore} to ${d.hoursPerAssetNow}.`,
          `The team is putting in more to get the same out. Effort is up ${eff.mag} on ${prev} while output ${volWord}, and the average item now takes ${d.hoursPerAssetNow} against ${d.hoursPerAssetBefore} a year earlier.`,
          `${rec} is costing more hours than ${prev} did — effort ${effWord} against output that ${volWord} — so each deliverable now averages ${d.hoursPerAssetNow}, up from ${d.hoursPerAssetBefore}.`,
        ])
      : ctx.pick([
          `Underneath the totals, the work has also grown heavier per item: effort ${effWord} on ${prev} while output ${volWord}, moving the average deliverable from ${d.hoursPerAssetBefore} to ${d.hoursPerAssetNow}.`,
          `Year on year the load per deliverable is rising too — effort ${effWord} against output that ${volWord}, taking the average item from ${d.hoursPerAssetBefore} to ${d.hoursPerAssetNow}.`,
        ])
    return partial ? `${main} ${samePeriod(ctx, rec)}` : main
  }
  const main = asLead
    ? ctx.pick([
        `The record's clearest movement is in the team's favour: output ${volWord} on ${prev} while effort ${effWord}, bringing the average deliverable down from ${d.hoursPerAssetBefore} to ${d.hoursPerAssetNow}.`,
        `The work is getting lighter per item — output ${volWord} while effort ${effWord}, and the average deliverable now takes ${d.hoursPerAssetNow} against ${d.hoursPerAssetBefore} in ${prev}.`,
      ])
    : ctx.pick([
        `Encouragingly, the work per item is easing: output ${volWord} while effort ${effWord}, with the average deliverable down from ${d.hoursPerAssetBefore} to ${d.hoursPerAssetNow}.`,
      ])
  return partial ? `${main} ${samePeriod(ctx, rec)}` : main
}

function samePeriod(ctx: Ctx, recentYear: string): string {
  return ctx.pick([
    `The comparison covers the same months of each year, as ${recentYear} is still in progress.`,
    `Both years are measured over the same months, since ${recentYear} isn't finished yet.`,
  ])
}

function heavyType(ctx: Ctx, asLead: boolean): string | null {
  const d = ctx.f('heavy-asset-type')
  if (!d) return null
  return asLead
    ? ctx.pick([
        `${d.typeName} dominates the team's time out of all proportion to its volume: ${d.typeEffortShare} of the hours for ${d.typeVolumeShare} of the output — ${d.typeHours} in total.`,
        `The single biggest call on the team's time is ${d.typeName}, which takes ${d.typeEffortShare} of the hours while delivering just ${d.typeVolumeShare} of the assets.`,
        `One format is quietly setting the workload: ${d.typeName} accounts for ${d.typeEffortShare} of all estimated hours (${d.typeHours}) against ${d.typeVolumeShare} of output.`,
      ])
    : ctx.pick([
        `Much of that weight sits with ${d.typeName}, which absorbs ${d.typeEffortShare} of the hours for just ${d.typeVolumeShare} of the output.`,
        `${d.typeName} is the main driver here — ${d.typeEffortShare} of the team's time against ${d.typeVolumeShare} of its output, some ${d.typeHours}.`,
        `The imbalance is concentrated in ${d.typeName}: ${d.typeVolumeShare} of the deliverables, ${d.typeEffortShare} of the hours.`,
      ])
}

function peak(ctx: Ctx, asLead: boolean): string | null {
  const d = ctx.f('peak-concentration')
  if (!d) return null
  const seasonal = !!d.yearsCovered
  const monthPhrase = seasonal ? `${d.peakMonth} is reliably the heaviest month` : `${d.peakMonth} is the heaviest month`
  return asLead
    ? ctx.pick([
        `The year does not spread its demands evenly: ${monthPhrase}, carrying ${d.peakShare} of the work where an even split across ${d.activeMonths} active months would give ${d.evenShare}.`,
        `${monthPhrase.charAt(0).toUpperCase()}${monthPhrase.slice(1)} on record, taking ${d.peakShare} of everything produced — well above the ${d.evenShare} an even year would put there.`,
      ])
    : ctx.pick([
        `The load is also strongly seasonal — ${d.peakMonth} alone carries ${d.peakShare} of it, against the ${d.evenShare} an even spread across ${d.activeMonths} active months would give.`,
        `Timing compounds this: ${monthPhrase}, at ${d.peakShare} of the total where an even share would be ${d.evenShare}.`,
        `${d.peakMonth} stands well clear of the other months at ${d.peakShare} of the work — an even year would put ${d.evenShare} there.`,
      ])
}

function ramp(ctx: Ctx): string | null {
  const d = ctx.f('ramp-steepness')
  if (!d) return null
  return ctx.pick([
    `And the climb is abrupt rather than gradual: workload multiplies ${d.rampMultiple} between ${d.rampFrom} and ${d.rampTo}.`,
    `The pressure arrives quickly too — a ${d.rampMultiple} jump from ${d.rampFrom} into ${d.rampTo} — leaving little room to absorb it as it builds.`,
    `Steepest of all is the ramp itself, ${d.rampMultiple} from ${d.rampFrom} to ${d.rampTo}.`,
  ])
}

function squad(ctx: Ctx): string | null {
  const d = ctx.f('squad-concentration')
  if (!d) return null
  return ctx.pick([
    `Demand is concentrated as well: ${d.squadName} accounts for ${d.squadAssetShare} of all assets (${d.squadAssets}), averaging ${d.squadPerBrief} per brief where other stakeholders average ${d.othersPerBrief}.`,
    `On the demand side, ${d.squadName} drives ${d.squadAssetShare} of the output — ${d.squadAssets} assets, at ${d.squadPerBrief} per brief against ${d.othersPerBrief} elsewhere.`,
  ])
}

function mixShift(ctx: Ctx): string | null {
  const d = ctx.f('mix-shift')
  if (!d) return null
  const up = d.shareChange?.startsWith('+')
  return up
    ? ctx.pick([
        `The mix is moving underneath this: ${d.shiftType} has grown from ${d.shareBefore} of output in ${d.previousYear} to ${d.shareNow} (${d.shareChange}).`,
        `${d.shiftType} is claiming a bigger slice of the mix than it did — ${d.shareNow} now against ${d.shareBefore} in ${d.previousYear}.`,
      ])
    : ctx.pick([
        `The mix has shifted noticeably: ${d.shiftType} has fallen from ${d.shareBefore} of output in ${d.previousYear} to ${d.shareNow} — ${d.shareChange}.`,
        `${d.shiftType} is receding from the mix, down from ${d.shareBefore} in ${d.previousYear} to ${d.shareNow}.`,
      ])
}

function sizeMismatch(ctx: Ctx): string | null {
  const d = ctx.f('size-effort-mismatch')
  if (!d) return null
  return ctx.pick([
    `Small tasks flatter the count, contributing ${d.smallVolumeShare} of the output but only ${d.smallEffortShare} of the actual work — while ${d.heaviestSize} tasks alone absorb ${d.heaviestSizeEffortShare} of the hours.`,
    `Counting items also overstates the small stuff: XS and S work is ${d.smallVolumeShare} of output but ${d.smallEffortShare} of the effort, with ${d.heaviestSize} tasks carrying ${d.heaviestSizeEffortShare} of the hours.`,
  ])
}

function overrun(ctx: Ctx): string | null {
  const d = ctx.f('turnaround-overrun')
  if (!d) return null
  return ctx.pick([
    `Delivery timing shows some strain as well — ${d.overrunCount} of ${d.measuredCount} dated tasks (${d.overrunShare}) ran past the turnaround their size implies.`,
    `Turnarounds are worth a look too: ${d.overrunShare} of dated tasks (${d.overrunCount} of ${d.measuredCount}) finished later than their declared size suggests they should.`,
  ])
}

function totalsContext(ctx: Ctx): string | null {
  const d = ctx.f('scope-totals')
  if (!d) return null
  const span = d.firstYear && d.lastYear ? ` between ${d.firstYear} and ${d.lastYear}` : ''
  const effortBit = d.effort ? `, an estimated ${d.effort} of work` : ''
  return ctx.pick([
    `That reading comes from the full record: ${d.assets} assets across ${d.tasks} tasks and ${d.campaigns} campaigns${span}${effortBit}.`,
    `Behind it sit ${d.tasks} tasks and ${d.assets} assets across ${d.campaigns} campaigns${span}${effortBit}.`,
    `The base is everything on record${span} — ${d.assets} assets, ${d.tasks} tasks, ${d.campaigns} campaigns${effortBit}.`,
  ])
}

function caveat(ctx: Ctx): string | null {
  const d = ctx.f('coverage-gap')
  if (!d) return null
  return ctx.pick([
    `One caveat on the hours: ${d.unratedCount} asset types with real volume (${d.unratedTypes}) have no output rate yet, so their work counts as zero and true effort runs somewhat higher than stated.`,
    `The effort figures are floors rather than totals — ${d.unratedCount} types including ${d.unratedTypes} carry volume but no output rate, so their hours aren't counted.`,
  ])
}

/** Closing implication, keyed to whichever finding led the briefing. */
function implication(ctx: Ctx, leadId: string): string {
  const p = ctx.f('peak-concentration')
  const peakClause = p ? ctx.pick([
    ` and booking capacity ahead of the ${p.peakMonth} peak`,
    ` — with cover arranged before ${p.peakMonth} —`,
  ]) : ''
  switch (leadId) {
    case 'volume-effort-divergence':
      return ctx.pick([
        `For planning, the practical consequence is that raw asset counts now undersell the load: the same volume costs more hours than it used to. Scoping against effort${peakClause} will track reality more closely than counting deliverables.`,
        `The planning takeaway is to stop reading output as workload — the hours behind each item are moving independently of the count. Effort-based scoping${peakClause} is the safer anchor.`,
      ])
    case 'heavy-asset-type': {
      const d = ctx.f('heavy-asset-type')
      return ctx.pick([
        `The practical lever is ${d?.typeName ?? 'that format'}: scoping it early and separately${peakClause} would relieve most of the pressure the totals describe.`,
        `Planning-wise, ${d?.typeName ?? 'that format'} deserves its own line in any capacity conversation${peakClause} — treating it like the rest of the mix is what makes the totals mislead.`,
      ])
    }
    case 'peak-concentration':
      return ctx.pick([
        `The useful part is that this peak is predictable: bringing work forward or arranging cover ahead of ${p?.peakMonth ?? 'the peak'} is the clearest lever the record offers.`,
        `Since the cycle repeats, the planning move is straightforward — protect capacity going into ${p?.peakMonth ?? 'the peak'} rather than absorbing it as a surprise.`,
      ])
    default:
      return ctx.pick([
        `Taken together, these point the same way: plan on where the hours actually go${peakClause}, not on how many items ship.`,
        `The common thread for planning is to weight decisions by effort rather than by item count${peakClause}.`,
      ])
  }
}

// ── assembly ──────────────────────────────────────────────────────────────────

/**
 * A complete briefing from the findings alone.
 *
 * Shape mirrors what the model is briefed to write — open on the most consequential
 * finding, connect the supporting ones, close on what it means for planning, carry
 * the caveat honestly — so the two authors are interchangeable in the UI.
 */
export function composeNarration(findings: Finding[]): string {
  if (!findings.length) return ''
  const rng = mulberry32(seedOf(findings))
  const pick: PickFn = (variants) => variants[Math.floor(rng() * variants.length) % variants.length]
  const byId = new Map(findings.map((f) => [f.id, { ...f.facts, _claim: f.claim }]))
  const ctx: Ctx = { f: (id) => byId.get(id) ?? null, pick }

  // Lead: the strongest finding that has a lead voice. Sorted order is severity-desc.
  const leadOrder = ['volume-effort-divergence', 'heavy-asset-type', 'peak-concentration']
  const leadId = leadOrder.find((id) => byId.has(id)) ?? findings[0].id

  const leadSentence =
    leadId === 'volume-effort-divergence'
      ? divergence(ctx, true)
      : leadId === 'heavy-asset-type'
        ? heavyType(ctx, true)
        : leadId === 'peak-concentration'
          ? peak(ctx, true)
          : `${findings[0].claim}`
  const p1 = [leadSentence, totalsContext(ctx)].filter(Boolean).join(' ')

  // Support: everything else with a voice, strongest first, capped so the middle
  // paragraph stays a paragraph. The renderers return null for absent findings.
  const supports = [
    leadId !== 'heavy-asset-type' ? heavyType(ctx, false) : null,
    leadId !== 'volume-effort-divergence' ? divergence(ctx, false) : null,
    leadId !== 'peak-concentration' ? peak(ctx, false) : null,
    ramp(ctx),
    squad(ctx),
    mixShift(ctx),
    sizeMismatch(ctx),
    overrun(ctx),
  ].filter((x): x is string => !!x)
  const p2 = supports.slice(0, 3).join(' ')

  const p3 = [implication(ctx, leadId), caveat(ctx)].filter(Boolean).join(' ')

  return [p1, p2, p3].filter((p) => p.trim()).join('\n\n')
}
