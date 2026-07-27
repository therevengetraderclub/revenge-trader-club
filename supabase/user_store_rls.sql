-- ═══════════════════════════════════════════════════════════════
-- RTC · user_store row-level security
--
-- WHY THIS MATTERS: every user's entire journal — trades, check-ins,
-- goals, journal entries — lives in this one table. Without RLS, any
-- logged-in member could read and delete every other member's rows.
-- This is the single most important piece of SQL in the project.
--
-- Run this in Supabase → SQL Editor → New query → Run.
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════

-- 1. The table (created if it doesn't already exist)
create table if not exists public.user_store (
  user_id uuid not null references auth.users(id) on delete cascade,
  key     text not null,
  value   text,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- 2. Turn the lock on
alter table public.user_store enable row level security;

-- 3. Each member may touch ONLY their own rows.
--    Dropped first so re-running this file is safe.
drop policy if exists "own rows select" on public.user_store;
drop policy if exists "own rows insert" on public.user_store;
drop policy if exists "own rows update" on public.user_store;
drop policy if exists "own rows delete" on public.user_store;

create policy "own rows select" on public.user_store
  for select to authenticated using (auth.uid() = user_id);

create policy "own rows insert" on public.user_store
  for insert to authenticated with check (auth.uid() = user_id);

create policy "own rows update" on public.user_store
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own rows delete" on public.user_store
  for delete to authenticated using (auth.uid() = user_id);

-- 4. Verify. After running, this should list rls_enabled = true and 4 policies.
-- select relrowsecurity as rls_enabled from pg_class where relname = 'user_store';
-- select policyname, cmd from pg_policies where tablename = 'user_store';
