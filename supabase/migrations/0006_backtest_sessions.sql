-- Backtest sessions: one saved run through history.
--
-- A session is the thing you come back to. It remembers where you had replayed
-- up to, so reopening it puts the chart exactly where you left it rather than
-- at the start again — which is the whole reason to have sessions at all.
--
-- `cursor_time` is the saved position and the only column that moves during
-- normal use. It is a timestamp rather than a bar index on purpose: an index
-- only means something relative to one timeframe, and the chart can be switched
-- between 5m and 4h while the session is open.

create table if not exists public.backtest_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid()
               references auth.users (id) on delete cascade,
  symbol       text not null default 'EURUSD',
  -- Where the replay was started from, and how far it has been taken.
  start_time   timestamptz not null,
  cursor_time  timestamptz not null,
  -- Chart timeframe, and how much time one replay step advances.
  timeframe    text not null default '4h',
  step_seconds integer not null default 3600 check (step_seconds > 0),
  balance      numeric(14,2) not null default 5000,
  -- Markup belongs to the session: levels drawn during a run are part of it.
  drawings     jsonb not null default '[]'::jsonb
               check (jsonb_typeof(drawings) = 'array'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint backtest_sessions_cursor_not_before_start
    check (cursor_time >= start_time)
);

create index if not exists backtest_sessions_owner_idx
  on public.backtest_sessions (user_id, updated_at desc);

-- Since 2026-04-28 a new table in `public` is not automatically exposed to
-- PostgREST. `anon` is left out: migration 0004 made the login a real boundary.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.backtest_sessions to authenticated;

alter table public.backtest_sessions enable row level security;

drop policy if exists "own sessions: read"   on public.backtest_sessions;
drop policy if exists "own sessions: insert" on public.backtest_sessions;
drop policy if exists "own sessions: update" on public.backtest_sessions;
drop policy if exists "own sessions: delete" on public.backtest_sessions;

create policy "own sessions: read"
  on public.backtest_sessions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "own sessions: insert"
  on public.backtest_sessions for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "own sessions: update"
  on public.backtest_sessions for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own sessions: delete"
  on public.backtest_sessions for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop trigger if exists backtest_sessions_touch on public.backtest_sessions;

create trigger backtest_sessions_touch
  before update on public.backtest_sessions
  for each row execute function public.touch_backtest_drawing_sets();
