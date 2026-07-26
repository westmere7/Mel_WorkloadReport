import { useState } from 'react'
import { Modal } from './ui/Modal'

/**
 * Per-panel help: a small "?" in a card's header that opens a plain-language
 * explanation of what the panel measures, what it means for the team, and a worked
 * example using the kind of numbers this report actually carries.
 *
 * Copy lives here rather than in each page so the explanations stay consistent and
 * are edited in one place.
 */
/**
 * A section's body: a paragraph, a labelled point (rendered as a bullet with a
 * bold lead-in), or a sequence of either. Labelled points keep the longer
 * explanations scannable instead of turning into a wall of prose.
 */
type Para = string | { lead: string; text: string }
type Body = Para | Para[]

export interface PanelExplainer {
  title: string
  /** What the panel shows, mechanically. */
  what: Body
  /** Why a team lead should care — how to act on it. */
  meaning: Body
  /** Concrete worked example(s). */
  example: Body
  /** Optional caveat: what the panel does NOT tell you. */
  caveat?: Body
}

export const PANEL_INFO: Record<string, PanelExplainer> = {
  volume: {
    title: 'Volume',
    what: 'Two counts for the current scope: total assets (every deliverable, each counted as one) and total tasks (the jobs those deliverables were booked under). The bar underneath splits the assets across task sizes, XS to XL.',
    meaning: 'This is the honest measure of throughput — how many things GCMC delivered, and how many bookings it took. It is exact and you can reconcile it against the task list at any time, which makes it the number to quote when someone asks "how much did we ship?".',
    example: 'A month showing 1,796 assets across 93 tasks means roughly 19 deliverables per booking. If next month shows 1,800 assets across 40 tasks, the team is producing the same volume from far fewer, larger jobs — a real change in how work arrives, invisible in the asset count alone.',
    caveat: 'It treats a photo edit and a 12-page publication as equal. A quiet-looking month can be the hardest one.',
  },
  effort: {
    title: 'Effort',
    what: [
      'Three things, from the top down:',
      {
        lead: 'The big number.',
        text: 'Total hours of work in view. Each asset counts for however long one of its type takes to make — those times are the output rates in Settings → Timing & effort — and they are all added up.',
      },
      {
        lead: 'Hours per asset.',
        text: 'What one deliverable cost on average. A high number means the period was full of heavy work; a low one means it was mostly quick jobs.',
      },
      {
        lead: 'Top 3 time consumers.',
        text: 'Which asset types ate the most of those hours, and what share each took.',
      },
    ],
    meaning: [
      {
        lead: 'It answers a different question.',
        text: 'Volume tells you how many things the team made. Effort tells you how much work that was. The two can point opposite ways, and this is the one to bring to a resourcing conversation.',
      },
      {
        lead: 'It compares teams fairly.',
        text: 'Counting assets rewards whoever makes the quickest ones. Weighing by time means a team producing a few slow deliverables no longer looks unproductive.',
      },
    ],
    example:
      'Production makes 300 photo edits in a day. Design makes 1 guide in 2 weeks. By count, Production did 300 times more. By time, the photo edits came to about 30 hours and the guide about 80 — so the guide was the bigger job.',
    caveat:
      'The times are estimates someone typed in, not tracked hours. Use this to compare one period against another, not to bill. Asset types with no rate set count as zero.',
  },
  tasksBySquad: {
    title: 'Tasks by squad',
    what: 'How many task bookings each requesting team (squad) raised in the current scope, ranked highest first.',
    meaning: 'Shows who is generating demand on GCMC. Because it counts bookings rather than deliverables, it reflects how often a squad comes to you — useful for planning intake, briefing capacity and who to involve in forward-planning conversations.',
    example: 'DOM raising 40 tasks against INTON\'s 29 means DOM approaches the team more often. Read it beside "Assets by squad": many tasks with few assets each means lots of small, separate briefs — a process cost that never shows up in deliverable counts.',
  },
  assetsBySquad: {
    title: 'Assets by squad',
    what: 'Total deliverables produced for each requesting team in the current scope, ranked highest first.',
    meaning: 'Shows where GCMC\'s output actually goes. Paired with "Tasks by squad" it tells you whether a squad\'s demand comes as a few large jobs or many small ones, which is usually the difference between a plannable pipeline and constant interruption.',
    example: 'DOM at 1,315 assets from 40 tasks averages 33 deliverables per brief. INTON at 283 from 29 tasks averages 10. Same team, two very different working patterns — and two different conversations about lead times.',
  },
  workload: {
    title: 'Workload across the year',
    what: [
      'The chart has two layers: a line for each month, and a dot for each task.',
      {
        lead: 'The line.',
        text: 'Every month gets one point. It adds up all the work that started in that month. In the normal view that is the number of assets. Switch to Effort and the same line becomes hours of work instead.',
      },
      {
        lead: 'The dots.',
        text: 'Each dot is a single task, sitting on the day it started. The taller the dot, the bigger that job. Hover over one to see which task it is, or click to open it. If several tasks started on the same day their dots stack, so hold Shift and scroll to step through them.',
      },
      {
        lead: 'The labels.',
        text: '"Peak" marks the busiest month of the year. In Compare mode this year is drawn over last year, each in its own colour, so you can read both at once.',
      },
    ],
    meaning: [
      {
        lead: 'Looking back.',
        text: 'Two years can produce the same number of assets and feel nothing alike. One was steady all year; the other arrived in two spikes. A total cannot tell you which happened. This chart can.',
      },
      {
        lead: 'Looking forward.',
        text: 'GCMC\'s work follows the academic calendar, so it repeats. Put last year\'s line next to this one and you have a rough forecast: if the climb started in February last year, expect it again. Turn on Compare, and switch Match range on so a part-finished year is not measured against a full one.',
      },
      {
        lead: 'Peak cycles.',
        text: 'How high a peak goes tells you how much capacity you need at the busiest point. How wide it is tells you how long the team has to hold that pace. The quiet stretches in between are the only realistic windows for leave, training and template work.',
      },
    ],
    example: [
      {
        lead: 'Retrospective.',
        text: 'May\'s asset count looks ordinary, but the Effort line spikes. The team shipped its usual number of items and every one of them was much heavier than normal.',
      },
      {
        lead: 'Projection.',
        text: 'This year has run above last year every month since February. If that holds, May\'s peak will be higher than the one the team already found hard — which is an argument for extra help in March, while there is still time to arrange it.',
      },
    ],
    caveat:
      'Work is counted in the month it started, not the month it was delivered. A big job beginning in late June sits entirely in June, even if most of it is done in July.',
  },
  campaign: {
    title: 'Asset count by campaign',
    what: 'Total deliverables produced per campaign in the current scope. Ongoing and catch-all campaigns (BAU, Always On, Others) can be excluded in Settings → Dashboard so the one-off campaigns stay readable.',
    meaning: 'Shows which campaigns actually consume GCMC output, as opposed to which ones get the most attention in planning. Useful evidence when a campaign\'s real cost needs to be weighed against its billing or priority.',
    example: 'DOM Open Day at 340 assets against SEM 2 at 210 means Open Day drew roughly 60% more deliverables. If both were resourced as equal-sized campaigns, that gap is worth raising before the next round of planning.',
  },
  assetMix: {
    title: 'Asset mix',
    what: 'The share of deliverables by asset type across the current scope. Related types can be bundled into one named slice via chart groups (the gear icon).',
    meaning: 'Shows what kind of work GCMC is really doing. A drift in the mix — more video, fewer statics — changes what skills, software and lead times the team needs, usually well before anyone asks for a headcount change.',
    example: 'Statics and Display ads at 30% each means 60% of output is flat artwork. If Videos climb from 15% to 30% next half, that is a skills and turnaround shift, not just a different-looking chart.',
  },
  workTypeMix: {
    title: 'Work type mix',
    what: 'How many tasks involved each type of work. A task tagged with several work types is counted once under each, so the total exceeds the task count.',
    meaning: 'Shows the kinds of craft the team is being asked for, rather than the deliverables that come out. It is the best signal of where the team\'s time and training should go, and of work that is being requested but not really resourced.',
    example: 'Graphic design on 99 tasks and Video editing on 139 means video is now involved in more jobs than static design. If GCMC is still staffed as a design-first team, that is the gap to close.',
    caveat: 'This counts tasks, not deliverables — a task with one video counts the same as one with fifty.',
  },
  demand: {
    title: 'Squads demand distribution',
    what: 'For each work type or asset type, the share coming from each stakeholder group — Domestic, INTON, and everyone else. Every column totals 100%, so it shows composition rather than volume.',
    meaning: 'Shows who drives each kind of work. When one group dominates a type, that type\'s scheduling and turnaround are effectively theirs to influence, which matters when two groups both want the same capacity in the same week.',
    example: 'If Publication is 90% INTON while Digital display is 80% Domestic, then a clash between an INTON publication deadline and a Domestic display campaign is a conflict between two different teams\' priorities — and one that recurs every cycle.',
    caveat: 'Shares only. A column can be 100% one group and still be a tiny slice of GCMC\'s work.',
  },
}

/**
 * The "?" button for a card header, plus the dialog it opens. Give it a key from
 * `PANEL_INFO`; it owns its own open state so a panel only needs one line.
 */
export function PanelInfo({ panel }: { panel: keyof typeof PANEL_INFO }) {
  const [open, setOpen] = useState(false)
  const info = PANEL_INFO[panel]
  if (!info) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`What does "${info.title}" mean?`}
        aria-label={`What does "${info.title}" mean?`}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line text-[10px] font-bold text-muted transition hover:border-faint hover:text-ink"
      >
        ?
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        widthClass="max-w-2xl"
        title={info.title}
        footer={
          <button type="button" className="btn-navy" onClick={() => setOpen(false)}>
            Got it
          </button>
        }
      >
        <div className="space-y-4">
          <Section label="What this shows" body={info.what} />
          <Section label="What it means for the team" body={info.meaning} />
          <Section label="For example" body={info.example} />
          {info.caveat && <Section label="Keep in mind" body={info.caveat} />}
        </div>
      </Modal>
    </>
  )
}

function Section({ label, body }: { label: string; body: Body }) {
  const paras = Array.isArray(body) ? body : [body]
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-faint">{label}</p>
      <div className="mt-1.5 space-y-1.5">
        {paras.map((p, i) =>
          typeof p === 'string' ? (
            <p key={i} className="text-xs leading-relaxed text-muted">
              {p}
            </p>
          ) : (
            <p key={i} className="flex gap-2 text-xs leading-relaxed text-muted">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-faint" aria-hidden="true" />
              <span>
                <strong className="font-semibold text-ink">{p.lead}</strong> {p.text}
              </span>
            </p>
          ),
        )}
      </div>
    </div>
  )
}
