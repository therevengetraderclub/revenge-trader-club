-- ============================================================
-- The Revenge Trader Club — database schema + row-level security
-- Run in Supabase -> SQL Editor -> New query -> Run.
-- Safe to re-run (uses "if not exists" / "create or replace").
--
-- Model: core tables (accounts, trades, checkins, goals, pnl_logs,
-- letters). Each row has queryable columns PLUS a `data` jsonb
-- catch-all, so nothing the app stores is lost.
--
-- Security: RLS on every table; each row owned by user_id; a user
-- can only touch rows where user_id = auth.uid(). Enforced by the DB.
-- ============================================================

-- ---------- 1. PROFILES ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  prefs       jsonb not null default '{}'::jsonb,
  stripe_customer_id  text,
  subscription_status text,
  plan                text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name',''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 2. ACCOUNTS ----------
create table if not exists public.accounts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null default '',
  style       text,
  balance     numeric not null default 0,
  sort_order  int not null default 0,
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- 3. TRADES ----------
create table if not exists public.trades (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  ticker      text,
  direction   text,
  entry       numeric,
  outcome     text,
  pnl         numeric,
  score       int,
  mood        text,
  tags        text[] not null default '{}',
  notes       text,
  screenshots jsonb not null default '[]'::jsonb,
  data        jsonb not null default '{}'::jsonb,
  traded_at   timestamptz,
  created_at  timestamptz not null default now()
);

-- ---------- 4. CHECK-INS ----------
create table if not exists public.checkins (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.accounts(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  checkin_date date not null default current_date,
  mood         text,
  sleep        text,
  data         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

-- ---------- 5. GOALS ----------
create table if not exists public.goals (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  amount      numeric,
  days        int,
  daily       numeric,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- ---------- 6. P&L LOGS ----------
create table if not exists public.pnl_logs (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  log_date    date not null,
  amount      numeric not null default 0,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- ---------- 7. LETTERS ----------
create table if not exists public.letters (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  month       text not null,
  body        text,
  sealed      boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ---------- INDEXES ----------
create index if not exists idx_accounts_user   on public.accounts(user_id);
create index if not exists idx_trades_account  on public.trades(account_id);
create index if not exists idx_trades_user     on public.trades(user_id);
create index if not exists idx_checkins_account on public.checkins(account_id);
create index if not exists idx_goals_account   on public.goals(account_id);
create index if not exists idx_pnl_account     on public.pnl_logs(account_id);
create index if not exists idx_letters_account on public.letters(account_id);

-- ---------- ROW-LEVEL SECURITY ----------
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.trades   enable row level security;
alter table public.checkins enable row level security;
alter table public.goals    enable row level security;
alter table public.pnl_logs enable row level security;
alter table public.letters  enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

do $$
declare t text;
begin
  foreach t in array array['accounts','trades','checkins','goals','pnl_logs','letters']
  loop
    execute format('drop policy if exists "owner all" on public.%I;', t);
    execute format('create policy "owner all" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id);', t);
  end loop;
end $$;
