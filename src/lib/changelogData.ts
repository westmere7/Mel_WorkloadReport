/**
 * Changelog DATA — pure, dependency-free so it can be imported both by the app
 * (via lib/changelog.ts) and by vite.config.ts, which embeds it into the
 * `version.json` the update-check polls (see UpdateNotice).
 *
 * To cut a release: bump `version` in package.json, then PREPEND a new entry
 * here (newest first). Keep the top entry's `version` equal to package.json.
 */

export type ChangeKind = 'new' | 'improved' | 'fixed'

export interface ReleaseNote {
  kind: ChangeKind
  text: string
}

export interface Release {
  version: string
  /** ISO date (yyyy-mm-dd). Omitted for the initial release. */
  date?: string
  /** Optional short headline. */
  title?: string
  notes: ReleaseNote[]
}

/** Newest first. The first entry should match APP_VERSION. */
export const CHANGELOG: Release[] = [
  {
    version: '0.14.0',
    date: '2026-11-12',
    title: 'One Mix panel',
    notes: [
      {
        kind: 'improved',
        text: 'Asset mix and Work type mix are now one Mix panel with a switch: Assets, Work types — and a new Effort reading, which shows where the hours went rather than how many things were made. A half donut shows the split against a percentage scale, with every item listed beside it; click a slice or an item to see its tasks. Grouping, Compare and full screen work as before.',
      },
      {
        kind: 'new',
        text: 'Squads demand distribution has an Effort tab: each work type weighted by the hours behind it, not the asset count — so a squad whose briefs are slow to make shows its real pull on the team.',
      },
    ],
  },
  {
    version: '0.13.0',
    date: '2026-11-09',
    title: 'Your squad, everywhere',
    notes: [
      {
        kind: 'new',
        text: 'The Squad filter is now on the Task List and the Calendar too, and it follows you: pick DOM on the dashboard and the Task List and Calendar open on DOM as well. A squad’s link (…?squad=INTON) works on all three pages.',
      },
      {
        kind: 'improved',
        text: 'On the Task List, the Squad dropdown in the header and the squad filter in the list are the same filter — pick several squads in the list and the header shows how many.',
      },
    ],
  },
  {
    version: '0.12.0',
    date: '2026-11-09',
    title: 'Your squad’s view',
    notes: [
      {
        kind: 'new',
        text: 'A squad filter on the dashboard, next to All GCMC. Pick DOM, INTON or any other squad and every panel shows only that squad’s work — year, half and Compare included. The choice is part of the page address, so each squad can bookmark its own view, or be sent a link that opens straight into it.',
      },
      {
        kind: 'new',
        text: 'With a squad selected, the demand panel becomes that squad’s share of demand — given the wider part of the bottom row: for every asset or work type it asked for, how much of all GCMC’s output of that type was theirs. Hover a column for the actual numbers. Tasks by squad and Assets by squad stack into one column and show the squad against all other squads combined.',
      },
      {
        kind: 'improved',
        text: 'Clicking a number on the dashboard now opens the matching tasks in a large pop-up over the dashboard instead of leaving it. Close it and you are exactly where you were — same filters, same year, same scroll. “Open in Task List” at the top still takes you to the full page.',
      },
      {
        kind: 'improved',
        text: 'The dashboard’s filters are labelled (Function, Squad), the Total / By year / By half switch looks like the three-way choice it is, and the workload chart has a faint grid so a peak or a task can be read against its month.',
      },
      {
        kind: 'new',
        text: 'Click the RMIT logo for About: what the dashboard is for, which version is running, where its data lives and whether it is updating live.',
      },
      {
        kind: 'fixed',
        text: 'On very wide screens (1440p, 4K) the big Volume and Effort numbers grew into the panel titles above them. They now stop at a size that fits; full screen still shows them larger.',
      },
    ],
  },
  {
    version: '0.11.0',
    date: '2026-11-03',
    title: 'GCMC Dashboard',
    notes: [
      {
        kind: 'improved',
        text: 'The app is now called the GCMC Dashboard. Same address, same data — only the name in the sidebar, the header and the browser tab changed.',
      },
      {
        kind: 'improved',
        text: 'The dashboard always reads in Effort. The Assets / Effort switch is gone: the workload chart is in hours and the headline is the Volume and Effort pair, for everyone. Asset counts are still right there in the Volume panel, the task list and every export, which keep counting each asset as one.',
      },
      {
        kind: 'new',
        text: 'Calendar — a whole year as twelve month grids, each day coloured by the work running on it, with Victorian and Vietnamese public holidays and the RMIT closure marked. Hover a day to see its tasks, hover a task to see its span. Team holidays can be added in Settings → Holidays & closures.',
      },
      {
        kind: 'new',
        text: 'Any dashboard card can open full screen — hover it and use the control beside the “?”. It stays live, and some panels show more when they have the room.',
      },
      {
        kind: 'new',
        text: 'An Assets tab for monday.com items: a task’s deliverables as lines, each with its people in charge, status and due date, shared and live for everyone looking at it. Its totals always match the task’s counts on the dashboard.',
      },
      {
        kind: 'improved',
        text: 'Removed Showcase and Advisor. Showcase links no longer open and land on the dashboard instead; task demo images are unaffected.',
      },
    ],
  },
  {
    version: '0.10.0',
    date: '2026-07-27',
    title: 'Effort by default',
    notes: [
      {
        kind: 'improved',
        text: 'The dashboard now opens in Effort mode. “Workload across the year” reads in hours from the start, rather than counting a banner and a video as the same job — the Assets / Effort switch still flips it back at any time, and the choice is remembered per browser. Nothing stored or exported changed: those still count every asset as one.',
      },
      {
        kind: 'improved',
        text: 'Output rates now sit at the top of Settings → Timing & effort in their own panel with a red “Edit rates” button — they’re what Effort mode reads, so they’re the setting worth filling in. Turnaround per task size moves below.',
      },
      {
        kind: 'new',
        text: 'Output rates now keep an edit log. Every save records who changed which rate and what it was before — “Statics: 12 per 1 day → 8 per 1 day” — and so do the two indirect routes: renaming an asset type carries its rate to the new name, and removing one drops the rate entirely. Open it with “History” at the bottom of the rates window; the most recent 100 changes are kept. Because a rate re-scales every hours figure on the dashboard, this is the only place the old numbers survive, which is what lets a total that moved be explained.',
      },
      {
        kind: 'fixed',
        text: 'Settings list rows (squads, campaigns, work and asset types, people, functions, snapshots) were meant to sit on a faint tint but were rendering completely see-through, so they read as bare outlines — and hovering one faded it further, as if it had been disabled. Rows now carry that tint, and hovering lifts them instead.',
      },
      {
        kind: 'improved',
        text: 'Asset mix and Work type mix keep their full-size donut. Long category names were quietly squeezing the ring; the legend is now capped at half the panel, and a name too long for it fades at the tail and scrolls when you hover its row.',
      },
      {
        kind: 'improved',
        text: 'Long task names no longer just get cut off. In the task list they fade out at the tail and gently scroll to reveal the rest when you hover the row, then glide back when you move away. The edit-log title does the same — and it no longer runs past the edge of the window.',
      },
      {
        kind: 'new',
        text: '“Hide unused” switches on each function’s Work type(s) and Assets lists, so editing a task shows just the work types it uses and the assets with a number against them instead of the whole catalogue. They start on when you open an existing task and off when you register a new one, where everything still needs to be pickable. Purely a view: nothing is deselected, and what each function offers is still set in Settings → Functions.',
      },
      {
        kind: 'new',
        text: 'The task list has quick column switches — Code, Types, People and Half can each be turned off from the top of the table, and everything you switch off becomes room for the task name. The choice is remembered in your browser only, so it never changes anyone else’s view. The Actions column is gone too: the edit log and Delete both live inside a task’s edit window, and the width reads better spent on the name.',
      },
      {
        kind: 'new',
        text: 'Advisor — a new page in the sidebar, currently a preview of what’s coming. It will read the whole task record at once and write up what the years actually show: where effort and output pull apart, which formats eat the hours, when the peaks land.',
      },
    ],
  },
  {
    version: '0.9.0',
    date: '2026-07-26',
    title: 'Effort goes live',
    notes: [
      {
        kind: 'improved',
        text: 'Effort mode is no longer experimental — it’s an official way to read the dashboard, and the “Experimental” tags are gone from the switch, the Effort panel, the explainer and the output-rates editor. The rates editor now says what the rates actually drive instead of “nothing uses these yet”. Nothing about how it works changed: exports and stored totals still count every asset as one.',
      },
      {
        kind: 'improved',
        text: '“Tasks by person” has been removed from the dashboard, along with its show/hide toggle in Settings — the mix panels now always sit two-up, which gives “Workload across the year” the wider layout permanently. Per-person numbers are still tracked: filter the task list by person, export them in the CSV, or see “Busiest people” in a Showcase.',
      },
      {
        kind: 'improved',
        text: 'The Help guide is now laid out like documentation: three tabs (The dashboard · Recording work · Settings & more), an “on this page” contents panel that follows your scrolling, and links between sections that jump you straight to the right tab. It also gained close-ups of the monday.com auto-fill, the per-function workload tabs and the task list.',
      },
    ],
  },
  {
    version: '0.8.0',
    date: '2026-07-26',
    title: 'Effort-weighted workload',
    notes: [
      {
        kind: 'new',
        text: 'The dashboard can now be read as EFFORT instead of asset count — an Assets / Effort switch beside the function filter, with a “?” explaining it and letting you edit the rates on the spot. Effort weights each deliverable by how long its asset type takes, re-draws the workload chart in hours, and swaps the hero cards for a compact Volume panel plus an Effort panel (total hours, hours per asset, top 3 time consumers). It changes only how the dashboard reads, and only for you: every export and stored total still counts each asset as one.',
      },
      {
        kind: 'new',
        text: 'Help & user guide — a full in-app manual (sidebar, just above Showcase) covering recording work, every dashboard panel with real screenshots, Effort mode, comparing years, the task list, settings, the Showcase and how data is stored. Every dashboard panel also gained its own “?” with a plain-language explanation and a worked example.',
      },
      {
        kind: 'new',
        text: 'Output rates — record roughly how many of each asset type the team finishes, and in how long: “300 per 1 day”, “1 per 2 weeks”, per hour, day or week. Set them in Settings → Timing & effort → “Set rates”. Each row draws a heat-mapped bar to scale, so the gap between a photo edit and a publication is visible as you type, with a one-off “Sort by effort” button (rows never re-rank mid-edit). These rates are what the Effort view weighs each deliverable by',
      },
    ],
  },
  {
    version: '0.7.0',
    date: '2026-07-24',
    title: 'Chart groups & task edit logs',
    notes: [
      {
        kind: 'new',
        text: 'Chart groups — bundle asset / work types into named, coloured groups so the dashboard mix and demand charts stay readable. Configure them in a drag-and-drop pop-up (gear on each panel; drafts commit on Save), synced across devices. Grouped slices carry a small stack icon, click through to exactly their tasks, and each panel has its own local Group switch to flip back to the full individual view.',
      },
      {
        kind: 'new',
        text: 'Per-task edit log — every create and edit is recorded with its time, author and what changed. Open it from the small history icon next to a task’s delete button; the log is removed together with the task.',
      },
      {
        kind: 'improved',
        text: 'The mix panels adapt to their width: a ranked donut when there’s room, a 100% stacked bar in narrow columns — no more truncated legends. Both are ranked largest-first.',
      },
      {
        kind: 'improved',
        text: 'An off function tab in the task form can be switched on right from its prompt, and the monday-ID fields in Settings → People got tidier (wider, clear button inside the field).',
      },
    ],
  },
  {
    version: '0.6.1',
    date: '2026-07-24',
    title: 'Update prompt polish',
    notes: [
      {
        kind: 'improved',
        text: 'The “update available” prompt now opens as a centered dialog over a dimmed, blurred backdrop so it clearly takes focus until you refresh or dismiss it.',
      },
    ],
  },
  {
    version: '0.6.0',
    date: '2026-07-24',
    title: 'Update notifications',
    notes: [
      {
        kind: 'new',
        text: 'The app now tells you when a newer version is live — a small panel appears over whatever you’re doing, with the changelog (collapsed) and a refresh button. Nothing reloads until you choose to.',
      },
    ],
  },
  {
    version: '0.5.0',
    date: '2026-07-24',
    title: 'Drafts, stars & group merging',
    notes: [
      {
        kind: 'new',
        text: 'Draft tasks — if registering fails validation, you can save the task as a draft with just its name. Drafts show faded in the task list (with a drafts-only filter) and stay out of every dashboard number until completed.',
      },
      {
        kind: 'new',
        text: 'Star tasks from the task-panel header and filter the task list to starred only — a quick personal marker.',
      },
      {
        kind: 'new',
        text: 'Merge groups in Settings — click any squad, campaign, type or person to rename it or migrate all of its tasks into another item. Deleting a used item now asks where its tasks should go (defaults to “Others”).',
      },
      {
        kind: 'improved',
        text: 'The task form went two-column on desktop: a big full-width name field up top, compact detail groups on the left and the function workload panel on the right. Function tabs can be viewed while off (with a turn-on prompt), connect seamlessly to their panel, and only auto-enable when a matching person is newly added.',
      },
      {
        kind: 'improved',
        text: 'Function colours are more vibrant and always readable; red is reserved for the app itself. The dashboard function filter is single-select — hold Ctrl (⌘ on Mac) to pick several — and clicking a donut segment opens the task list scoped to exactly those tasks.',
      },
      {
        kind: 'improved',
        text: 'Task-list search tolerates any word order, and backups / snapshots / CSV round-trips carry the new per-function, draft and star data.',
      },
    ],
  },
  {
    version: '0.4.0',
    date: '2026-07-22',
    title: 'Auto-select keywords & quick edits',
    notes: [
      {
        kind: 'new',
        text: 'Squad & Campaign items can carry auto-select keywords (the tag button in Settings): when a new task’s name contains one, that squad/campaign is picked for you automatically. Your manual choice always wins.',
      },
      {
        kind: 'new',
        text: 'On a function tab you can “+ Add” a work or asset type on the spot — pick one that tab doesn’t offer yet, or type a brand-new name to create it. New types are saved to Settings automatically, no detour needed.',
      },
      {
        kind: 'improved',
        text: 'monday.com auto-fill is much faster — each board is fetched in a single request, all boards in parallel, with a short cache so repeat searches are near-instant.',
      },
      {
        kind: 'improved',
        text: 'Removing anything from a Settings list now always asks first — even items no task uses.',
      },
      {
        kind: 'improved',
        text: 'Clearing a task’s name also clears its code, a work/asset picker has a one-tap “Clear”, and long Settings lists fade at the bottom while there’s more to scroll.',
      },
    ],
  },
  {
    version: '0.3.0',
    date: '2026-07-21',
    title: 'Workload by function',
    notes: [
      {
        kind: 'new',
        text: 'GCMC functions — Vietnam Design, Melbourne Design, Production and Contents each record their own work types, asset counts and optional timeline on a task, via colour-coded tabs in the task form. All tasks recorded before this release belong to Vietnam Design.',
      },
      {
        kind: 'new',
        text: 'Settings → Functions: add, rename, colour and remove functions, and tick exactly which work / asset types each function’s tab offers. Newly added types stay off every tab until you opt a function in — renaming or removing a type updates those tabs automatically. Work types and asset types now share one “Types” card.',
      },
      {
        kind: 'new',
        text: 'The master timeline auto-extends (highlighted) when a function’s timeline reaches outside it, and registering a task code that already exists is blocked with a jump to the existing task.',
      },
      {
        kind: 'new',
        text: 'Dashboard function filter — an "All GCMC" dropdown in the top bar isolates one or more functions (shared tasks count only their slice of the assets); the static year and Live badges made way for it.',
      },
      {
        kind: 'improved',
        text: 'Demo images moved next to the form’s footer actions. monday.com auto-fill still prefills the task-level name, code, timeline, size and people.',
      },
    ],
  },
  {
    version: '0.2.0',
    date: '2026-07-20',
    title: 'Showreel & monday.com',
    notes: [
      {
        kind: 'new',
        text: 'Find on monday.com — a lookup button in the New Task dialog prefills an item’s name, code, timeline dates and T-shirt size from the demand-tracker board.',
      },
      {
        kind: 'improved',
        text: 'Showreel rebuilt to the 2025 RMIT brand storyboard: per-scene red / navy / white panels, bold kinetic single-stat beats, a cycling top-3 spotlight, and workload lines that draw in — all seeded for variety.',
      },
      {
        kind: 'improved',
        text: 'Dashboard comparison: same-period “match range”, per-squad year-over-year % deltas, and a left-to-right workload-line draw.',
      },
      {
        kind: 'improved',
        text: 'Kiosk-ready: “today”-relative views (match range, the “Now” marker, current-year default) refresh on their own at midnight — no manual reload.',
      },
      {
        kind: 'fixed',
        text: 'The Showreel builder and player are hidden on mobile and disabled in the mobile tab bar.',
      },
    ],
  },
  {
    version: '0.1.0',
    title: 'Initial release',
    notes: [
      { kind: 'new', text: 'Workload dashboard — hero stats, charts, and the squads demand distribution.' },
      { kind: 'new', text: 'Task list with search, multi-select filters, sorting, and CSV import / backup.' },
      { kind: 'new', text: 'Editable settings groups, per-task demo images, and year snapshots (freeze / restore).' },
      { kind: 'new', text: 'Animated Showcase mode and a sign-in gate (browse for all, edit for signed-in users).' },
    ],
  },
]
