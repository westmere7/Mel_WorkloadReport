-- ════════════════════════════════════════════════════════════════
-- RMIT Workload Report — Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL → New query).
-- ════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── Tasks ───────────────────────────────────────────────────────
create table if not exists public.tasks (
  id              uuid primary key default gen_random_uuid(),
  squad           text not null,
  campaign        text not null,
  code            text not null default '',
  name            text not null,
  types           text[] not null default '{}',
  asset_total     integer not null default 0,
  asset_breakdown jsonb not null default
                    '{"image":0,"video":0,"publication":0,"html5":0,"gif":0}'::jsonb,
  people          text[] not null default '{}',
  start_date      date,
  end_date        date,
  half            text not null default 'H1' check (half in ('H1', 'H2')),
  size            text not null default 'M' check (size in ('XS', 'S', 'M', 'L', 'XL')),
  note            text not null default '',
  images          jsonb not null default '[]'::jsonb,
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Add the `size` column to pre-existing tables (idempotent).
alter table public.tasks
  add column if not exists size text not null default 'M'
  check (size in ('XS', 'S', 'M', 'L', 'XL'));

-- Add the `note` column to pre-existing tables (idempotent).
alter table public.tasks
  add column if not exists note text not null default '';

-- Add the `created_by` column to pre-existing tables (idempotent). Nullable —
-- tasks created before this migration have no recorded creator.
alter table public.tasks
  add column if not exists created_by text;

-- Add the `images` column to pre-existing tables (idempotent). JSON array of
-- { id, url, w, h } — the images themselves live in Supabase Storage.
alter table public.tasks
  add column if not exists images jsonb not null default '[]'::jsonb;

-- Per-function workload slices (idempotent). Map of function name →
-- { types, assetBreakdown, assetTotal, timelineOn, startDate, endDate }.
-- NULL = legacy task recorded before functions existed (treated as belonging
-- entirely to Vietnam Design; upgraded lazily when next edited). The task's
-- top-level types/asset_breakdown/asset_total/dates stay the COMBINED roll-up.
alter table public.tasks
  add column if not exists function_data jsonb;

create index if not exists tasks_created_at_idx on public.tasks (created_at desc);
create index if not exists tasks_squad_idx      on public.tasks (squad);
create index if not exists tasks_campaign_idx   on public.tasks (campaign);
create index if not exists tasks_half_idx        on public.tasks (half);

-- ── Settings (single row holding the editable lists) ────────────
create table if not exists public.settings (
  id         text primary key default 'app',
  squads     text[] not null default
                array['INTON','DOM','Student Recruitment','BPX','RMIT VN','Alumni','Agent Management'],
  campaigns  text[] not null default '{}',
  types      text[] not null default '{}',
  people     text[] not null default '{}',
  asset_types text[] not null default
                array['Image','Video','Publication','HTML5 ad','GIF / Motion'],
  size_durations jsonb not null default
                '{"XS":7,"S":28,"M":42,"L":56,"XL":182}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Add the `asset_types` column to pre-existing tables (idempotent).
alter table public.settings
  add column if not exists asset_types text[] not null default
    array['Image','Video','Publication','HTML5 ad','GIF / Motion'];

-- Add the `squads` column to pre-existing tables (idempotent).
alter table public.settings
  add column if not exists squads text[] not null default
    array['INTON','DOM','Student Recruitment','BPX','RMIT VN','Alumni','Agent Management'];

-- Add the `size_durations` column to pre-existing tables (idempotent). Days each
-- task size adds to the start date when auto-filling the end date.
alter table public.settings
  add column if not exists size_durations jsonb not null default
    '{"XS":7,"S":28,"M":42,"L":56,"XL":182}'::jsonb;

-- Governance toggle: when false, group items in use by ≥1 task can't be removed.
alter table public.settings
  add column if not exists allow_remove_used boolean not null default false;

-- Map of person NAME → monday.com user id, for auto-filling "Persons in charge".
alter table public.settings
  add column if not exists people_monday jsonb not null default '{}'::jsonb;

-- monday.com board ids the New Task auto-fill searches (all at once). The mapped
-- columns are the same across these boards, so only the board id differs.
alter table public.settings
  add column if not exists monday_boards jsonb not null default '["1967557512","5026397227"]'::jsonb;

-- Optional friendly names per board id: { "<board id>": "<name>" }. Label only —
-- the auto-fill still searches by board id.
alter table public.settings
  add column if not exists monday_board_names jsonb not null default '{}'::jsonb;

-- Squad/Campaign auto-select keywords: { "<name>": ["keyword", …] }. When a task
-- name contains any of a squad/campaign's keywords, the task form auto-selects it.
alter table public.settings
  add column if not exists squad_keywords jsonb not null default '{}'::jsonb;
alter table public.settings
  add column if not exists campaign_keywords jsonb not null default '{}'::jsonb;

-- GCMC functions that record workload (task-form tabs). Array of
-- { name, color, workTypes, assetTypes }; order = tab order. The type lists are
-- INCLUSIONS (only listed types appear on that tab); the seed offers the full
-- default master lists. Newly added master types are NOT auto-added — the app
-- opts each function in. Legacy rows storing hiddenWorkTypes/hiddenAssetTypes
-- (exclusion model) are migrated to inclusion on read by normalizeFunctions().
alter table public.settings
  add column if not exists functions jsonb not null default '[
    {"name":"Vietnam Design","color":"red","workTypes":["Concept development","Video editing","Graphic design (static)","Digital display","Publication","Motion graphic","Tiktok"],"assetTypes":["Image","Video","Publication","HTML5 ad","GIF / Motion"]},
    {"name":"Melbourne Design","color":"teal","workTypes":["Concept development","Video editing","Graphic design (static)","Digital display","Publication","Motion graphic","Tiktok"],"assetTypes":["Image","Video","Publication","HTML5 ad","GIF / Motion"]},
    {"name":"Production","color":"gold","workTypes":["Concept development","Video editing","Graphic design (static)","Digital display","Publication","Motion graphic","Tiktok"],"assetTypes":["Image","Video","Publication","HTML5 ad","GIF / Motion"]},
    {"name":"Contents","color":"green","workTypes":["Concept development","Video editing","Graphic design (static)","Digital display","Publication","Motion graphic","Tiktok"],"assetTypes":["Image","Video","Publication","HTML5 ad","GIF / Motion"]}
  ]'::jsonb;

insert into public.settings (id, campaigns, types, people)
values (
  'app',
  array['BAU','SEM1','SEM2','SEM3','China Roadshow','ISC Roadshow',
        'SEA Roadshow','Open Day','VTAC','Change of Preference','Always On'],
  array['Concept development','Video editing','Graphic design (static)',
        'Digital display','Publication','Motion graphic','Tiktok'],
  array['Truc','Tuyet','Danh','Eden','Duc','Trinh','Tran']
)
on conflict (id) do nothing;

-- ── App users (sign-in that unlocks editing) ────────────────────
-- Anyone with the URL can browse; signing in unlocks editing. Passwords
-- are stored as SHA-256 hashes and verified client-side, so this is a
-- lightweight UX gate, NOT hard security — the anon key still has full
-- table access (see the RLS note below).
create table if not exists public.app_users (
  username      text primary key,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

-- Default account: admin / gcmc2026. Change the password with e.g.
--   update public.app_users
--     set password_hash = encode(digest('new-password', 'sha256'), 'hex')
--     where username = 'admin';
-- Add more users the same way with an insert.
insert into public.app_users (username, password_hash)
values ('admin', '6f054b199406396d5fb19af352c7968a4494a4cfb73f218eae0b7095bd39dfad')
on conflict (username) do nothing;

alter table public.app_users enable row level security;
drop policy if exists "anon can read app_users" on public.app_users;
create policy "anon can read app_users" on public.app_users
  for select using (true);
-- Allows the in-app "Account" settings to change a username/password. The
-- client verifies the current password first; this is a UX gate, not a wall.
drop policy if exists "anon can update app_users" on public.app_users;
create policy "anon can update app_users" on public.app_users
  for update using (true) with check (true);

-- ── Row Level Security ──────────────────────────────────────────
-- The sign-in above is a client-side gate only. The policies below grant
-- the public anon key full read/write access — fine for an internal tool
-- behind a private URL, but TIGHTEN THESE (or add Supabase Auth) before
-- exposing the app publicly.
alter table public.tasks    enable row level security;
alter table public.settings enable row level security;

drop policy if exists "anon full access to tasks" on public.tasks;
create policy "anon full access to tasks" on public.tasks
  for all using (true) with check (true);

drop policy if exists "anon full access to settings" on public.settings;
create policy "anon full access to settings" on public.settings
  for all using (true) with check (true);

-- ── Realtime ────────────────────────────────────────────────────
-- Broadcast task changes to all connected clients so the dashboard and
-- task list update live. Idempotent: only adds the table if not already
-- in Supabase's realtime publication.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
end $$;

-- Also broadcast settings changes (editable lists + size durations) so the
-- dashboard/task form update live across clients. Idempotent.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'settings'
  ) then
    alter publication supabase_realtime add table public.settings;
  end if;
end $$;

-- ── Storage: task images ────────────────────────────────────────
-- A PUBLIC bucket for task images. Images are compressed to WebP client-side
-- and stored under an unguessable UUID filename ("<uuid>.webp"). Public read
-- means the URLs embed directly (used by the task list, details, and the
-- future Showcase mode). The anon key can upload/delete (consistent with the
-- app's open RLS above) — tighten with the rest before exposing publicly.
insert into storage.buckets (id, name, public)
values ('task-images', 'task-images', true)
on conflict (id) do nothing;

drop policy if exists "anon read task-images" on storage.objects;
create policy "anon read task-images" on storage.objects
  for select using (bucket_id = 'task-images');

drop policy if exists "anon upload task-images" on storage.objects;
create policy "anon upload task-images" on storage.objects
  for insert with check (bucket_id = 'task-images');

drop policy if exists "anon delete task-images" on storage.objects;
create policy "anon delete task-images" on storage.objects
  for delete using (bucket_id = 'task-images');

-- ── Year snapshots ──────────────────────────────────────────────
-- Frozen archives of the full workload state. The heavy JSON payload (incl.
-- base64 demo images) lives in the PRIVATE `snapshots` Storage bucket below;
-- this table holds only lightweight metadata for the Settings list.
create table if not exists public.snapshots (
  id           uuid primary key default gen_random_uuid(),
  year         integer not null,
  name         text not null default '',
  comment      text not null default '',
  created_by   text,
  task_count   integer not null default 0,
  image_count  integer not null default 0,
  bytes        bigint not null default 0,
  app_version  text,
  storage_path text not null,
  created_at   timestamptz not null default now()
);
create index if not exists snapshots_created_at_idx on public.snapshots (created_at desc);

-- Years a snapshot is tagged with (empty [] = "all years"); the single `year`
-- column above stays as the representative year for older rows + sorting.
alter table public.snapshots
  add column if not exists years jsonb not null default '[]'::jsonb;

alter table public.snapshots enable row level security;
drop policy if exists "anon full access to snapshots" on public.snapshots;
create policy "anon full access to snapshots" on public.snapshots
  for all using (true) with check (true);

-- ── Storage: snapshots (PRIVATE) ────────────────────────────────
-- Not public: the snapshot JSON is a full data export, so it's fetched via the
-- API (.download()) with the anon key + the select policy below rather than a
-- guessable public URL. Anon can read/write/delete (consistent with the app's
-- open RLS) — tighten before exposing publicly.
insert into storage.buckets (id, name, public)
values ('snapshots', 'snapshots', false)
on conflict (id) do nothing;

drop policy if exists "anon read snapshots" on storage.objects;
create policy "anon read snapshots" on storage.objects
  for select using (bucket_id = 'snapshots');

drop policy if exists "anon upload snapshots" on storage.objects;
create policy "anon upload snapshots" on storage.objects
  for insert with check (bucket_id = 'snapshots');

drop policy if exists "anon update snapshots" on storage.objects;
create policy "anon update snapshots" on storage.objects
  for update using (bucket_id = 'snapshots') with check (bucket_id = 'snapshots');

drop policy if exists "anon delete snapshots" on storage.objects;
create policy "anon delete snapshots" on storage.objects
  for delete using (bucket_id = 'snapshots');

-- ── Showcases (shareable animated year-in-review links) ─────────
-- The full self-contained ShowcaseConfig lives inline as jsonb (small — tens
-- of KB; images are referenced by their public task-images URLs, not embedded).
-- `expires_at` is enforced lazily client-side: the viewer shows "expired" and
-- the wizard's list purges expired rows. null = keep forever. Anon read is
-- required — showcase links are public by design.
create table if not exists public.showcases (
  id          uuid primary key default gen_random_uuid(),
  title       text not null default '',
  year        integer not null,
  created_by  text,
  task_count  integer not null default 0,
  bytes       integer not null default 0,
  expires_at  timestamptz,
  config      jsonb not null,
  created_at  timestamptz not null default now()
);
create index if not exists showcases_created_at_idx on public.showcases (created_at desc);

alter table public.showcases enable row level security;
drop policy if exists "anon full access to showcases" on public.showcases;
create policy "anon full access to showcases" on public.showcases
  for all using (true) with check (true);
