-- Saved drawing sets for the Backtest tab.
--
-- The point of the feature: mark up support and resistance once, name it, and
-- drop it back onto the chart next session instead of redrawing it. A set is
-- just a bag of drawings, stored as JSON — the shapes are anchored in
-- time/price, so one set is valid on every timeframe.
--
-- Candles are deliberately NOT here. They live in a packed file the app ships,
-- because they never change and a backtest has to replay identically; only the
-- things you author belong in the database.

create table if not exists public.backtest_drawing_sets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid()
             references auth.users (id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 60),
  symbol     text not null default 'EURUSD',
  -- The timeframe it was drawn on. Kept for display only: a set is never
  -- restricted to it, because a level drawn on 1h matters just as much on 5m.
  timeframe  text not null default '1h',
  -- Shape of each element is owned by lib/backtest/drawings.ts. Validated there
  -- rather than here so adding a tool does not need a migration.
  drawings   jsonb not null default '[]'::jsonb
             check (jsonb_typeof(drawings) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One name per user per symbol, so "Daily S/R" always means one thing and
  -- saving again updates it instead of quietly making a second copy.
  constraint backtest_drawing_sets_unique_name unique (user_id, symbol, name)
);

create index if not exists backtest_drawing_sets_owner_idx
  on public.backtest_drawing_sets (user_id, symbol, updated_at desc);

-- ---------------------------------------------------------------------------
-- Data API exposure
--
-- Since 2026-04-28 a new table in `public` is not automatically exposed to
-- PostgREST, so without this grant the table exists but every request 404s.
-- `anon` is left out on purpose: migration 0004 made the login a real boundary.
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.backtest_drawing_sets to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Same shape as `trades`: the role check is authentication, the ownership
-- predicate is authorisation, and UPDATE carries WITH CHECK too so a set cannot
-- be handed to another user_id on the way past.
-- ---------------------------------------------------------------------------
alter table public.backtest_drawing_sets enable row level security;

drop policy if exists "own drawing sets: read"   on public.backtest_drawing_sets;
drop policy if exists "own drawing sets: insert" on public.backtest_drawing_sets;
drop policy if exists "own drawing sets: update" on public.backtest_drawing_sets;
drop policy if exists "own drawing sets: delete" on public.backtest_drawing_sets;

create policy "own drawing sets: read"
  on public.backtest_drawing_sets for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "own drawing sets: insert"
  on public.backtest_drawing_sets for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "own drawing sets: update"
  on public.backtest_drawing_sets for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own drawing sets: delete"
  on public.backtest_drawing_sets for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Keep `updated_at` honest: the sets list is ordered by it.
create or replace function public.touch_backtest_drawing_sets()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists backtest_drawing_sets_touch on public.backtest_drawing_sets;

create trigger backtest_drawing_sets_touch
  before update on public.backtest_drawing_sets
  for each row execute function public.touch_backtest_drawing_sets();
