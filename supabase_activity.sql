-- ============================================================
--  RESTLOG — Activity tables migration
--  Run this in: Supabase → SQL Editor → New query
--  (The original supabase_setup.sql must already be applied)
-- ============================================================

-- Daily step counts (one row per user per day)
create table activity_days (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade not null,
  date       date not null,
  steps      integer,
  created_at timestamptz default now(),
  unique(user_id, date)
);

-- Individual workout sessions (multiple per day)
create table workouts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade not null,
  date       date not null,
  type       text not null,
  duration   integer not null,   -- minutes
  intensity  smallint,           -- 1–10
  created_at timestamptz default now()
);

alter table activity_days enable row level security;
alter table workouts       enable row level security;

create policy "activity_days: own data" on activity_days for all using (auth.uid() = user_id);
create policy "workouts: own data"      on workouts       for all using (auth.uid() = user_id);
