-- ============================================================
--  RESTLOG — Supabase database setup
--  Run this entire file in: Supabase → SQL Editor → New query
-- ============================================================

-- Sleep entries
create table entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade not null,
  date         date not null,
  bed_time     text not null,
  wake_time    text not null,
  hours_slept  numeric(4,1) not null,
  quality      smallint,
  energy       smallint,
  timing_score smallint,
  relaxed      boolean default false,
  created_at   timestamptz default now(),
  unique(user_id, date)
);

-- Holidays / days off
create table holidays (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade not null,
  start_date date not null,
  end_date   date not null,
  label      text not null default 'Day off',
  created_at timestamptz default now()
);

-- Backups
create table backups (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade not null,
  label      text not null,
  snapshot   text not null,
  created_at timestamptz default now()
);

-- Row level security — users can only see their own data
alter table entries  enable row level security;
alter table holidays enable row level security;
alter table backups  enable row level security;

create policy "entries: own data"  on entries  for all using (auth.uid() = user_id);
create policy "holidays: own data" on holidays for all using (auth.uid() = user_id);
create policy "backups: own data"  on backups  for all using (auth.uid() = user_id);
