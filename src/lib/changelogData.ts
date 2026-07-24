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
