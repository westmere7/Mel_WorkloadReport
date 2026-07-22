/**
 * App version + changelog — surfaced in Settings → Version.
 *
 * `APP_VERSION` mirrors package.json (injected at build as `__APP_VERSION__`),
 * so it's the single source of truth shown in the sidebar footer too.
 *
 * To cut a release: bump `version` in package.json, then PREPEND a new entry to
 * CHANGELOG (newest first). Keep the top entry's `version` equal to package.json
 * so the card marks it "Latest".
 */

export const APP_VERSION: string = __APP_VERSION__

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
        kind: 'improved',
        text: 'Removing anything from a Settings list now always asks first — even items no task uses.',
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
