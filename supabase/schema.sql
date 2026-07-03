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
