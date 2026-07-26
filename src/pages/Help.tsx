import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { BookOpen, Lightbulb } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { ImageLightbox } from '../components/ui/ImageLightbox'
import { cx } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// The in-app manual, laid out like documentation rather than a scroll of text:
// three part TABS across the top, a sticky scroll-spy table of contents beside
// the content, anchored subsections, and inline cross-links between sections
// (switching tabs when the target lives in another part).
//
// Screenshots live in public/help/ and are captured from live data by
// scripts/capture-help.mjs — re-run it after a visual redesign.
// ─────────────────────────────────────────────────────────────────────────────

interface TocSection {
  id: string
  n: string
  label: string
  /** Anchored subsections, shown indented in the TOC. */
  subs?: [id: string, label: string][]
}
interface Part {
  id: string
  label: string
  sections: TocSection[]
}

// The dashboard leads: it's what most readers open the guide for. The intro sits
// above it in the same part, and how-to-record follows.
const PARTS: Part[] = [
  {
    id: 'dashboard',
    label: 'The dashboard',
    sections: [
      { id: 'what', n: '01', label: 'What this app is' },
      {
        id: 'reading',
        n: '02',
        label: 'Reading the dashboard',
        subs: [
          ['dash-scope', 'Scope controls'],
          ['dash-stats', 'Headline stats'],
          ['dash-workload', 'Across the year'],
          ['dash-panels', 'Campaigns, mixes & demand'],
        ],
      },
      { id: 'effort', n: '03', label: 'Effort mode', subs: [['effort-rates', 'The rates behind it']] },
      { id: 'compare', n: '04', label: 'Comparing years' },
    ],
  },
  {
    id: 'recording',
    label: 'Recording work',
    sections: [
      {
        id: 'record',
        n: '05',
        label: 'Recording work',
        subs: [
          ['record-monday', 'monday.com auto-fill'],
          ['record-functions', 'Function tabs'],
          ['record-form', 'The rest of the form'],
        ],
      },
      { id: 'tasks', n: '06', label: 'The task list' },
    ],
  },
  {
    id: 'daytoday',
    label: 'Settings & more',
    sections: [
      { id: 'settings', n: '07', label: 'Settings' },
      { id: 'showcase', n: '08', label: 'Showcase' },
      { id: 'data', n: '09', label: 'Your data' },
    ],
  },
]

/** anchor id → the part that renders it, for cross-links and #hash deep links. */
const ANCHOR_PART: Record<string, string> = {}
for (const p of PARTS)
  for (const s of p.sections) {
    ANCHOR_PART[s.id] = p.id
    for (const [subId] of s.subs ?? []) ANCHOR_PART[subId] = p.id
  }

export function HelpPage() {
  const [part, setPart] = useState<string>(() => ANCHOR_PART[location.hash.slice(1)] ?? 'dashboard')
  const [zoom, setZoom] = useState<string | null>(null)
  // The anchor the reader is currently at — highlights the TOC (scroll spy).
  const [active, setActive] = useState<string | null>(null)

  /** Jump to an anchor, switching part tabs first when it lives elsewhere. */
  const goTo = (id: string) => {
    const target = ANCHOR_PART[id]
    if (target && target !== part) setPart(target)
    history.replaceState(null, '', `#${id}`)
    // After a tab switch the node doesn't exist until the next paint.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })),
    )
  }

  // Honour a #hash deep link on first mount.
  useEffect(() => {
    const id = location.hash.slice(1)
    if (id && ANCHOR_PART[id]) goTo(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Scroll spy: watch every [data-toc] heading of the active part.
  useEffect(() => {
    const headings = [...document.querySelectorAll('[data-toc]')]
    if (!headings.length) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id)
      },
      { rootMargin: '-15% 0px -70% 0px' },
    )
    headings.forEach((h) => io.observe(h))
    return () => io.disconnect()
  }, [part])

  const activePart = useMemo(() => PARTS.find((p) => p.id === part) ?? PARTS[0], [part])

  // ── Building blocks that need page state ──────────────────────────────────
  const Shot = ({ src, caption }: { src: string; caption: string }) => (
    <figure className="my-4">
      <button
        type="button"
        onClick={() => setZoom(`/help/${src}.png`)}
        title="Click to enlarge"
        className="block w-full overflow-hidden rounded-xl border border-line shadow-soft transition hover:border-faint"
      >
        <img src={`/help/${src}.png`} alt={caption} className="block w-full" loading="lazy" />
      </button>
      <figcaption className="mt-2 text-center text-[11px] text-faint">{caption}</figcaption>
    </figure>
  )

  /** Inline cross-reference to another section/subsection — the docs' hyperlinks. */
  const XRef = ({ to, children }: { to: string; children: ReactNode }) => (
    <button
      type="button"
      onClick={() => goTo(to)}
      className="font-semibold text-rmit-red underline decoration-rmit-red/40 underline-offset-2 transition hover:decoration-rmit-red"
    >
      {children}
    </button>
  )

  return (
    <div className="mx-auto max-w-5xl pb-16">
      {/* ── Hero: title + part tabs ─────────────────────────────────────── */}
      <Card className="!p-6 sm:!p-8">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rmit-red/10">
            <BookOpen className="h-6 w-6 text-rmit-red" />
          </span>
          {/* Everything shares one text column so the label, title, intro and tab
              strip line up on a single left edge past the icon. */}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-faint">User guide</p>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-ink">How the Workload Report works</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              Everything the app does and how to get value out of it. For a quick answer about one dashboard
              panel, the <HelpQ /> on the panel itself is faster — this is the full tour.
            </p>
            <div className="mt-5 inline-flex flex-wrap items-center gap-1 rounded-xl bg-subtle p-1">
              {PARTS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPart(p.id)
                    history.replaceState(null, '', `#${p.sections[0].id}`)
                    window.scrollTo({ top: 0 })
                  }}
                  aria-pressed={part === p.id}
                  className={cx(
                    'rounded-lg px-4 py-1.5 text-sm font-semibold transition',
                    part === p.id
                      ? 'bg-rmit-navy text-white shadow-soft dark:bg-navy-300'
                      : 'text-muted hover:text-ink',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* ── Content + sticky TOC ────────────────────────────────────────── */}
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_13rem]">
        <div className="min-w-0 space-y-6">
          {part === 'dashboard' && (
            <>
              <Section id="what" n="01" title="What this app is">
                <P>
                  The Workload Report is GCMC&rsquo;s single record of creative work: every task the team is
                  briefed on, every deliverable that comes out of it, who asked for it, who did it, and when.
                  From that one record it produces the{' '}
                  <XRef to="reading">dashboard</XRef>, <XRef to="compare">year-over-year comparisons</XRef>,
                  CSV exports and animated <XRef to="showcase">showcases</XRef>.
                </P>
                <Ul
                  items={[
                    <>
                      <B>Prove workload</B> — show stakeholders what was produced, for whom and when, with
                      numbers that reconcile against the <XRef to="tasks">task list</XRef>.
                    </>,
                    <>
                      <B>Plan capacity</B> — see where the year&rsquo;s peaks land on the{' '}
                      <XRef to="dash-workload">workload chart</XRef>, and use last year&rsquo;s curve to
                      anticipate this year&rsquo;s.
                    </>,
                    <>
                      <B>Compare fairly</B> — <XRef to="effort">Effort mode</XRef> weighs each deliverable by
                      how long its type takes, so quick, high-volume work stops overshadowing slow, heavy work.
                    </>,
                    <>
                      <B>Report without slides</B> — the <XRef to="showcase">Showcase</XRef> turns a
                      period&rsquo;s data into a shareable animated presentation.
                    </>,
                  ]}
                />
                <Tip>
                  Anyone with the link can <B>browse</B> everything. <B>Signing in</B> (top right) unlocks
                  editing — creating tasks, changing <XRef to="settings">settings</XRef>, building showcases.
                </Tip>
              </Section>

              <Section id="reading" n="02" title="Reading the dashboard">
                <P>
                  The dashboard is the whole record aggregated into one screen. Every panel has a <HelpQ />{' '}
                  button with a plain-language explanation and a worked example, and nearly every number is
                  clickable — it opens the <XRef to="tasks">task list</XRef> filtered to exactly the tasks it
                  was counted from.
                </P>
                <Shot src="dashboard-overview" caption="The dashboard — every panel scoped by the controls in the header" />

                <H3 id="dash-scope">Scope: what you&rsquo;re looking at</H3>
                <P>Three header controls set the scope for every panel at once:</P>
                <Ul
                  items={[
                    <>
                      <B>Function filter</B> (All GCMC) — isolate one or more functions. Shared tasks count
                      only the selected functions&rsquo; <XRef to="record-functions">recorded slice</XRef>,
                      not the whole task.
                    </>,
                    <>
                      <B>Assets / Effort switch</B> — how workload is measured (see{' '}
                      <XRef to="effort">03 · Effort mode</XRef>). Appears once output rates exist.
                    </>,
                    <>
                      <B>Span filter</B> — Total (all time), By year, or By half — plus Compare (see{' '}
                      <XRef to="compare">04 · Comparing years</XRef>).
                    </>,
                  ]}
                />
                <Shot src="header-scope" caption="The scope controls — function filter, measurement switch and its explainer" />

                <H3 id="dash-stats">Headline stats & by-squad rankings</H3>
                <P>
                  Total deliverables and tasks for the scope, beside the two ranked squad panels.
                  Tasks-by-squad counts <B>bookings</B> (how often a squad comes to you); assets-by-squad
                  counts <B>deliverables</B> (how much you make for them). Together they separate the
                  many-small-briefs squads from the few-big-jobs ones.
                </P>
                <Shot src="dashboard-stats" caption="Headline counts with the two by-squad rankings" />

                <H3 id="dash-workload">Workload & tasks across the year</H3>
                <P>
                  The shape of the year: a line totalling each month&rsquo;s work, and one dot per task on its
                  start day — the taller the dot, the bigger the job. Hover a dot for details, click to open
                  the task, Shift&nbsp;+&nbsp;scroll to cycle dots stacked on the same day. &ldquo;Peak&rdquo;
                  marks the busiest month.
                </P>
                <Shot src="dashboard-workload" caption="A line per month, a dot per task — the panel for retrospectives and planning" />
                <Tip>
                  Use this panel for retrospectives (where the pressure actually landed), projection (last
                  year&rsquo;s curve forecasts this year&rsquo;s — see{' '}
                  <XRef to="compare">Comparing years</XRef>) and finding the troughs where leave and process
                  work fit.
                </Tip>

                <H3 id="dash-panels">Campaigns, mixes and demand</H3>
                <P>
                  <B>Asset count by campaign</B> shows which campaigns actually consume output — the ongoing
                  catch-alls (BAU, Always On, Others) can be excluded so real campaigns stay readable.
                </P>
                <Shot src="dashboard-campaign" caption="Deliverables per campaign, catch-all campaigns excluded" />
                <P>
                  The two <B>mix panels</B> show what kind of work the team is doing: deliverables by asset
                  type, and tasks by work type. Related types can be bundled into named <B>chart groups</B>{' '}
                  (the gear icon) so the donuts stay readable; each panel has its own Group toggle to flip
                  back to the individual view.
                </P>
                <Shot src="dashboard-mixes" caption="Asset mix and work type mix — what the output is made of" />
                <P>
                  <B>Squads demand distribution</B> shows, for each type, the share coming from each
                  stakeholder group. Columns total 100% — composition, not volume — so it answers &ldquo;who
                  drives this kind of work?&rdquo;.
                </P>
                <Shot src="dashboard-demand" caption="Share of each type across Domestic, INTON and other stakeholders" />
              </Section>

              <Section id="effort" n="03" title="Effort mode" badge="Experimental">
                <P>
                  Counting assets flatters whoever makes the quickest ones: 300 photo edits and 10 banners
                  read as a 30:1 difference in output even when the banners took longer. Effort mode fixes the
                  comparison by weighing every deliverable by its <B>output rate</B> — roughly how many of
                  that asset type the team finishes in how long (&ldquo;300 statics per day&rdquo;, &ldquo;1
                  guide per 2 weeks&rdquo;).
                </P>
                <P>
                  Flip the <XRef to="dash-scope">header switch</XRef> to <B>Effort</B> and the dashboard
                  re-reads itself in hours. The two hero cards become a compact <B>Volume</B> panel (the
                  counts, kept honest) and an <B>Effort</B> panel — total weighted hours, hours per asset, and
                  the top 3 asset types consuming the team&rsquo;s time.
                </P>
                <Shot src="effort-panels" caption="Effort mode — Volume demoted to one panel, Effort as the headline" />
                <P>
                  The <XRef to="dash-workload">workload chart</XRef> switches to hours too. Its scale is
                  deliberately unlabelled — the rates are hand-set estimates, so the <B>shape</B> is the
                  story, not the exact height.
                </P>
                <Shot src="effort-workload" caption="The workload line in Effort mode — weighted hours, unlabelled scale" />

                <H3 id="effort-rates">The rates behind it</H3>
                <P>
                  Rates live in <XRef to="settings">Settings → Timing &amp; effort</XRef>, and the <HelpQ />{' '}
                  beside the switch opens an explainer that links straight into the editor. Each asset type
                  gets one rate — &ldquo;N assets per N hours / days / weeks&rdquo; — with a live,
                  heat-coloured comparison so a typo stands out immediately.
                </P>
                <Shot src="effort-explainer" caption="The explainer behind the “?” — what each measure means, side by side" />
                <Shot src="rates-editor" caption="The output-rates editor — one rate per asset type, compared to scale as you type" />
                <Tip>
                  Three things to trust: Effort changes <B>only how the dashboard reads</B> — no stored number
                  or export is touched. The switch is <B>per browser</B>, so your view never changes a
                  colleague&rsquo;s. And unrated asset types count as zero and are flagged, never silently
                  guessed.
                </Tip>
              </Section>

              <Section id="compare" n="04" title="Comparing years">
                <P>
                  <B>Compare</B> (top right) measures a target year against a baseline. Every panel gains
                  animated deltas, split bars or a faded baseline series, and the{' '}
                  <XRef to="dash-workload">workload chart</XRef> draws both years on one axis. It combines
                  with <XRef to="effort">Effort mode</XRef> — hours against hours.
                </P>
                <Shot src="compare-panels" caption="Compare in Effort view — deltas on every figure, both years' size bars" />
                <Shot src="compare-workload" caption="Two years on one chart — this year solid, the baseline behind it" />
                <Tip>
                  <B>Match range</B> is the honesty switch: it clips both years to the same span (January →
                  today) so a half-finished year isn&rsquo;t judged against a full one. Leave it on unless you
                  specifically want full-year totals.
                </Tip>
              </Section>
            </>
          )}

          {part === 'recording' && (
            <>
              <Section id="record" n="05" title="Recording work">
                <P>
                  Everything starts with a task — one brief, booked once. <B>New Task</B> lives in the sidebar
                  and at the top of every page.
                </P>

                <H3 id="record-monday">Name it — or let monday.com fill it in</H3>
                <P>
                  Type a name, or paste a <B>[code] Name</B> straight from a booking. With the auto-fill
                  toggle on, the form searches the mapped monday.com boards as you type and pulls the
                  timeline, size and people from the matching item — the task keeps a link back to it. The
                  boards it searches are set in <XRef to="settings">Settings</XRef>.
                </P>
                <Shot
                  src="task-form-monday"
                  caption="The task code & name field, with the monday.com auto-fill toggle on the right"
                />

                <H3 id="record-functions">Record each function&rsquo;s slice</H3>
                <P>
                  Work is recorded per GCMC function — each enabled tab holds that team&rsquo;s work types,
                  asset counts and optional own timeline. A shared task credits every function with exactly
                  its slice (which is what makes the dashboard&rsquo;s{' '}
                  <XRef to="dash-scope">function filter</XRef> honest), and assigning a person can switch
                  their function&rsquo;s tab on automatically.
                </P>
                <Shot
                  src="task-form-functions"
                  caption="One tab per function — work types, asset counts and a per-function timeline"
                />

                <H3 id="record-form">The rest of the form</H3>
                <Ul
                  items={[
                    <>
                      <B>Squad & campaign</B> — who&rsquo;s asking, and under which campaign. Both can
                      auto-select from keywords in the task name.
                    </>,
                    <>
                      <B>Size (XS–XL)</B> — how big the job is; auto-fills the end date from the turnarounds
                      in <XRef to="settings">Settings → Timing &amp; effort</XRef>.
                    </>,
                    <>
                      <B>Images & history</B> — up to 10 attachments per task, plus an automatic log of who
                      changed what, when.
                    </>,
                    <>
                      <B>Drafts</B> — save with just a name and finish later. Drafts show faded in the{' '}
                      <XRef to="tasks">task list</XRef> and count for nothing on the dashboard until
                      completed.
                    </>,
                  ]}
                />
                <Shot
                  src="task-form"
                  caption="The full New Task form — identity and details on the left, per-function workload on the right"
                />
              </Section>

              <Section id="tasks" n="06" title="The task list">
                <P>The raw record behind every chart, one row per task.</P>
                <Shot src="task-list" caption="The task list — filters across the top, one row per booking" />
                <Ul
                  items={[
                    <>
                      <B>Filter and search</B> by squad, campaign, work type, asset type, person, function,
                      year and free text. Clicking a number on the{' '}
                      <XRef to="reading">dashboard</XRef> lands here with the matching filters pre-applied.
                    </>,
                    <>
                      <B>Open any task</B> for its full breakdown, images, monday link and edit history —
                      editors can edit or delete from the same view.
                    </>,
                    <>
                      <B>Star tasks</B> as a personal marker for quick filtering. Stars are yours, not shared.
                    </>,
                    <>
                      <B>Export & import CSV</B> — a spreadsheet-ready backup with one column per asset type
                      plus the per-function data. Imports can merge or replace; round-trips are lossless
                      except for images.
                    </>,
                  ]}
                />
              </Section>
            </>
          )}

          {part === 'daytoday' && (
            <>

              <Section id="settings" n="07" title="Settings" signIn>
                <P>
                  Settings hold the reference lists everything else is built on, plus the app&rsquo;s
                  behaviour. Renames flow through every task automatically; removing an item reassigns its
                  tasks to &ldquo;Others&rdquo;.
                </P>
                <Ul
                  items={[
                    <>
                      <B>Groups</B> — squads, campaigns, work types, asset types and people. Squads and
                      campaigns can carry keywords that auto-select them when a task name matches.
                    </>,
                    <>
                      <B>Functions</B> — the GCMC teams behind the{' '}
                      <XRef to="record-functions">task-form tabs</XRef>: each gets a colour, its own pick of
                      types, and auto-enable people.
                    </>,
                    <>
                      <B>Timing & effort</B> — turnaround days per task size, and the{' '}
                      <XRef to="effort-rates">output rates</XRef> behind Effort mode.
                    </>,
                    <>
                      <B>monday.com boards</B> — which boards the{' '}
                      <XRef to="record-monday">auto-fill</XRef> searches, and the person ↔ monday account
                      mapping.
                    </>,
                    <>
                      <B>Dashboard</B> — per-browser display preferences, and the shared chart display groups.
                    </>,
                    <>
                      <B>Snapshots</B> — freeze a year&rsquo;s data as a downloadable archive; restore or
                      import it later.
                    </>,
                  ]}
                />
              </Section>

              <Section id="showcase" n="08" title="Showcase" signIn>
                <P>
                  The Showcase (bottom of the sidebar) turns a period&rsquo;s workload into an animated,
                  presentable story. A guided wizard picks the span, stats, top projects and style, and
                  produces a full-screen presentation to play in meetings or share by link — viewers
                  don&rsquo;t need to sign in.
                </P>
              </Section>

              <Section id="data" n="09" title="Your data">
                <Ul
                  items={[
                    <>
                      <B>Shared and live</B> — tasks, settings and showcases live in the team database; an
                      edit on one machine appears for everyone. Task images live in shared storage.
                    </>,
                    <>
                      <B>Personal stays personal</B> — theme, dashboard display toggles, the{' '}
                      <XRef to="effort">Assets/Effort switch</XRef> and stars are stored in your browser only.
                    </>,
                    <>
                      <B>Backups</B> — <XRef to="tasks">CSV export</XRef> covers the tasks; year snapshots
                      capture data and images together. Both restore through the app.
                    </>,
                    <>
                      <B>Derived, not destructive</B> — the dashboard never writes. Every chart, comparison
                      and effort figure is computed on the fly from the task record; changing a rate or a
                      chart group re-reads history, it never edits it.
                    </>,
                  ]}
                />
              </Section>
            </>
          )}
        </div>

        {/* ── Sticky TOC (desktop) ─────────────────────────────────────── */}
        <nav className="sticky top-6 hidden lg:block" aria-label="On this page">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-faint">On this page</p>
          <ul className="space-y-0.5 border-l border-line">
            {activePart.sections.map((s) => (
              <li key={s.id}>
                <TocLink id={s.id} active={active} onGo={goTo} className="font-semibold">
                  <span className="mr-1.5 font-mono text-[10px] text-rmit-red">{s.n}</span>
                  {s.label}
                </TocLink>
                {s.subs && (
                  <ul>
                    {s.subs.map(([id, label]) => (
                      <li key={id}>
                        <TocLink id={id} active={active} onGo={goTo} className="pl-6 text-muted">
                          {label}
                        </TocLink>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {zoom && <ImageLightbox src={zoom} onClose={() => setZoom(null)} />}
    </div>
  )
}

// ── Local building blocks (no page state needed) ─────────────────────────────

function TocLink({
  id,
  active,
  onGo,
  className,
  children,
}: {
  id: string
  active: string | null
  onGo: (id: string) => void
  className?: string
  children: ReactNode
}) {
  const isActive = active === id
  return (
    <button
      type="button"
      onClick={() => onGo(id)}
      className={cx(
        '-ml-px block w-full border-l-2 py-1 pl-3 text-left text-xs leading-snug transition',
        isActive
          ? 'border-rmit-red text-ink'
          : 'border-transparent text-muted hover:border-faint hover:text-ink',
        className,
      )}
    >
      {children}
    </button>
  )
}

function Section({
  id,
  n,
  title,
  badge,
  signIn,
  children,
}: {
  id: string
  n: string
  title: string
  badge?: string
  signIn?: boolean
  children: ReactNode
}) {
  return (
    <Card className="!p-6 sm:!p-8">
      <section aria-label={title}>
        {/* scroll-mt clears the sticky app header when the TOC jumps here. */}
        <h2
          id={id}
          data-toc
          className="flex scroll-mt-24 flex-wrap items-center gap-2.5 text-xl font-bold tracking-tight text-ink"
        >
          <span className="font-mono text-sm font-bold text-rmit-red">{n}</span>
          {title}
          {badge && (
            <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-[10px] font-semibold text-purple-700 dark:bg-purple-500/15 dark:text-purple-300">
              {badge}
            </span>
          )}
          {signIn && (
            <span className="rounded-full bg-subtle px-2.5 py-0.5 text-[10px] font-semibold text-muted">
              Sign-in required
            </span>
          )}
        </h2>
        <div className="mt-3">{children}</div>
      </section>
    </Card>
  )
}

const P = ({ children }: { children: ReactNode }) => (
  <p className="mt-2.5 text-sm leading-relaxed text-muted">{children}</p>
)

const B = ({ children }: { children: ReactNode }) => (
  <strong className="font-semibold text-ink">{children}</strong>
)

/** Anchored sub-heading with a red tick, echoing the app's field labels. */
const H3 = ({ id, children }: { id: string; children: ReactNode }) => (
  <h3 id={id} data-toc className="mt-7 flex scroll-mt-24 items-center gap-2 text-sm font-bold text-ink">
    <span className="h-3.5 w-1 shrink-0 rounded-full bg-rmit-red" aria-hidden="true" />
    {children}
  </h3>
)

function Ul({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-3 space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-muted">
          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-faint" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

/** Callout for the one thing worth remembering in a section. */
function Tip({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 flex gap-2.5 rounded-xl bg-subtle px-4 py-3">
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-accent-gold" />
      <p className="text-xs leading-relaxed text-muted">{children}</p>
    </div>
  )
}

/** The little "?" glyph, drawn inline so prose can reference the panel help buttons. */
function HelpQ() {
  return (
    <span
      aria-label="question mark button"
      className="mx-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-line align-text-bottom text-[9px] font-bold text-muted"
    >
      ?
    </span>
  )
}
