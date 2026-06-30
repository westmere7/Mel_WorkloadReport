# RMIT Workload Report

An internal web app for the **RMIT Melbourne Design Team** to register, browse and visualise
the team's workload. Built with **React + Vite + TypeScript + Tailwind**, RMIT-branded
(`#E61E2A` red / `#000054` navy), with a swappable data layer that runs **fully local by
default** and connects to **Supabase** whenever you're ready.

---

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173. The app starts in **Local mode** — tasks are stored in your
browser and pre-seeded with sample data, so everything works immediately and offline.

To create a production build:

```bash
npm run build      # type-checks + bundles to dist/
npm run preview    # serve the built app locally
```

---

## Sections

| Section        | What it does                                                                       |
| -------------- | ---------------------------------------------------------------------------------- |
| **Dashboard**  | Stat cards + charts: tasks by campaign, asset mix, workload per person, squad split, H1/H2. Filter by half. |
| **New Task**   | Register a task. Smart task-code helpers (`[26.0629.A]` ⇄ date, auto-suggest next code, auto-derive Half). |
| **Task List**  | Excel-style table — search, filter (squad/campaign/person/half), sort, edit, delete, **export CSV**. |
| **Settings**   | Add/remove **Campaigns, Work types, People**. Squads are a fixed, locked list. Shows the active backend. |

### Task model

- **Squad** — requesting stakeholder team (fixed list: INTON, DOM, Student Recruitment, BPX, RMIT VN, Alumni, Agent Management, Others)
- **Campaign** — extensible (BAU, SEM1–3, roadshows, Open Day, VTAC, Change of Preference, Always On, …)
- **Task code + name** — `[26.0629.A]` = booked 29 Jun 2026, task “A” that day + the task name
- **Work type(s)** — multi-select, editable
- **Asset count** — total + breakdown (Image / Video / Publication / HTML5 ad / GIF·Motion)
- **Person(s) in charge** — multi-select, editable
- **Timeline** — start date (can be derived from the code) + optional end date
- **Half** — H1 / H2 (auto-derived from start date, overridable)

---

## Switching to Supabase

The app auto-detects Supabase env vars: **present → cloud DB, absent → local**. No code changes.

1. Create a project at [supabase.com](https://supabase.com).
2. In the Supabase **SQL Editor**, run [`supabase/schema.sql`](./supabase/schema.sql).
3. Copy `.env.example` → `.env` and fill in:
   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY
   ```
   (Find these in Supabase → Project Settings → API.)
4. Restart `npm run dev`. The top bar will switch from **Local** to **Supabase**.

> **Security note:** there's no login yet (per setup), so `schema.sql` grants the public
> anon key full access. That's fine for an internal tool behind a private URL. Before
> exposing it publicly, tighten the RLS policies or add Supabase Auth.

---

## Project structure

```
src/
  components/        Sidebar, Layout, TaskForm, charts, ui/ (Card, Badge, Modal, MultiSelect, StatCard)
  pages/             Dashboard, TaskInput, TaskList, Settings
  data/              repository (interface) + localRepository + supabaseRepository + store (React context)
  lib/               taskCode, analytics, csv, format, supabaseClient
  constants.ts       Squads, default campaigns/types/people, chart palette
  types.ts           Task / AppSettings domain types
supabase/schema.sql  Database schema + seed + RLS
```

The **`Repository` interface** (`src/data/repository.ts`) is the seam: the whole UI talks to
it, and `store.tsx` picks `LocalRepository` or `SupabaseRepository` at startup. Adding a new
backend later means implementing one interface.
