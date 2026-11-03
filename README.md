# GCMC Dashboard

An internal web app for the **RMIT GCMC design team** (Melbourne + Vietnam) to record, browse and
visualise the team's workload. Built with **React + Vite + TypeScript + Tailwind**, RMIT-branded
(`#E61E2A` red / `#000054` navy), backed by **Supabase** — or, with no Supabase configured, a
**local** browser-storage mode that works offline with seeded sample data.

> **Working on the code?** Read [`KNOWLEDGEBASE.md`](./KNOWLEDGEBASE.md) first — it is the
> architecture record: data model, Supabase migrations, per-feature design decisions and gotchas.

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173  (or double-click launch.bat on Windows)
```

```bash
npm run build      # type-checks (tsc) + bundles to dist/
npm run preview    # serve the built app locally
```

There are no unit tests for the app itself; `npm run lint` (`tsc --noEmit`) is the main safety
net, and UI changes are verified against the running dev server with Playwright. The
`monday-workload` Edge Function has tests: `node --test scripts/monday-workload.test.mjs`.

---

## What's in it

| Page | What it does |
| --- | --- |
| **Dashboard** (`/`) | Workload across the year in **effort hours** (each asset weighted by its type's output rate), Volume + Effort headline panels, by-squad rankings, asset & work-type mixes, campaign and stakeholder-demand charts. Scoped by a **function filter** (Vietnam Design / Melbourne Design / Production / Contents) and a **span filter** (total / year / half), with a year-over-year **Compare** mode. Any card opens full screen. |
| **Task List** (`/tasks`) | Search, multi-select filters, sortable columns, paginated; row opens the task (editable when signed in, read-only otherwise). **Import & Backup** for CSV. |
| **Calendar** (`/calendar`) | A year as 12 month heatmaps of the work active each day, with VIC / Vietnam public holidays, RMIT closures and team holidays. |
| **Help** (`/help`) | The in-app manual. |
| **Settings** (`/settings`, sign-in) | Editable groups (squads, campaigns, work & asset types, people, functions), output rates, holidays, monday.com boards, dashboard display options, year snapshots, version & what's new. |
| **monday Assets tab** (`/embed/item`) | Chrome-free page embedded in monday.com items: a task's asset lines (people, status, due dates), live and shared, kept in step with the task's counts. |

**Sign-in** (header, top right) gates editing only; everything else is open to anyone with the
URL. It is a UX gate, not real security — see the security note below.

### A task

- **Code + name** — `[26.0629.A] Name` = booked 29 Jun 2026, task "A" that day (legacy
  `VN25-1802-A` codes are read too). The code fills the start date and half.
- **Squad** (requesting stakeholder), **campaign**, **T-shirt size** (XS–XL, drives the default end
  date), **people in charge**, **timeline**, **note**, up to 10 **demo images**.
- **Workload by function** — each GCMC function records its own work types, asset counts and
  optional timeline; the task's top-level figures are the combined roll-up.
- Optional **monday.com** auto-fill and link.

---

## Supabase

The app auto-detects Supabase env vars: **present → cloud DB, absent → local mode**.

1. Create a project at [supabase.com](https://supabase.com).
2. In the Supabase **SQL Editor**, run [`supabase/schema.sql`](./supabase/schema.sql). It is
   idempotent — **re-run it whenever it changes** (new columns, tables, buckets, policies).
3. Copy `.env.example` → `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   (Supabase → Project Settings → API). Restart `npm run dev`.
4. Optional monday.com integration: deploy the Edge Functions in `supabase/functions/`
   (`monday-search`, `monday-workload`) with their `MONDAY_*` secrets, then set
   `VITE_MONDAY_LOOKUP=1` / `VITE_MONDAY_WORKLOAD=1`. The monday token never reaches the browser.
   See `KNOWLEDGEBASE.md` §18 and `supabase/functions/monday-workload/README.md`.

`.github/workflows/supabase-keepalive.yml` pings the database daily so a free-tier project
isn't paused for inactivity (needs `SUPABASE_URL` / `SUPABASE_ANON_KEY` repo secrets).

Production deploys to **Vercel** from `main` (`vercel.json`: Vite + SPA rewrite). Set the same
`VITE_*` variables there.

> **Security note:** `schema.sql` grants the anon key full access (open RLS), and the sign-in
> checks password hashes in the browser. That's acceptable for an internal tool behind a private
> URL, not for public exposure — tighten RLS / move to Supabase Auth first.

---

## Project structure

```
src/
  pages/             Dashboard, TaskList, Calendar, Help, Settings, MondayItemView
  components/        Layout, Sidebar, TaskForm, charts, modals, ui/ primitives
  data/              repository (interface) + local/supabase implementations + store (React context)
  lib/               domain logic: taskCode, analytics, effort, functionData, assetLines,
                     calendar, holidays, csv, snapshot, monday, auth, theme, changelog
  constants.ts       defaults (squads, campaigns, types, sizes, functions, palette)
  types.ts           Task / AppSettings domain types
supabase/
  schema.sql         database schema + RLS + storage buckets (idempotent)
  functions/         monday-search, monday-workload Edge Functions (Deno)
scripts/             Help screenshot capture, monday-workload tests
public/help/         screenshots used by the Help page
```

The **`Repository` interface** (`src/data/repository.ts`) is the seam: the whole UI talks to it,
and `store.tsx` picks the local or Supabase implementation at startup.

**Releasing:** bump `version` in `package.json` and prepend an entry to
`src/lib/changelogData.ts` (shown in Settings → Version and the in-app update notice).
