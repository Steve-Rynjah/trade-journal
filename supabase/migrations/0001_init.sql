-- Forex Trade Journal — initial schema
-- Run in: Supabase Dashboard → SQL Editor, or `supabase db push`.

-- ---------------------------------------------------------------------------
-- 1. Trades table
-- ---------------------------------------------------------------------------
create table if not exists public.trades (
  id              uuid primary key default gen_random_uuid(),
  trade_date      date        not null,
  bias            text        not null check (bias in ('BULLISH', 'BEARISH')),
  direction       text        not null check (direction in ('LONG', 'SHORT')),
  rr              numeric(6,2) not null,
  result          text        not null check (result in ('WIN', 'LOSE', 'BREAKEVEN')),
  remarks         text,
  -- Storage object path inside the `trade-screenshots` bucket.
  -- Deliberately constrained: screenshots are only kept for losing trades.
  screenshot_path text,
  created_at      timestamptz not null default now(),

  -- Forex week is Monday–Friday (ISO day-of-week 1..5).
  constraint trades_weekday_only
    check (extract(isodow from trade_date) between 1 and 5),

  constraint trades_screenshot_losing_only
    check (screenshot_path is null or result = 'LOSE')
);

create index if not exists trades_trade_date_idx on public.trades (trade_date desc);

-- ---------------------------------------------------------------------------
-- 2. Data API exposure
--
-- Since 2026-04-28 new tables in `public` are NOT automatically exposed to the
-- Data (REST) API, so the API roles need an explicit grant. Without this the
-- table exists but every PostgREST request 404s.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.trades to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
--
-- This journal ships with NO login: the browser talks to Supabase with the
-- publishable key, so `anon` must be allowed to read and write. That means
-- anyone who learns your deployed URL can read and edit your trades.
--
-- Keep the app local, or see the AUTH block at the bottom of this file to lock
-- it to a single signed-in user.
-- ---------------------------------------------------------------------------
alter table public.trades enable row level security;

drop policy if exists "open journal: read"   on public.trades;
drop policy if exists "open journal: insert" on public.trades;
drop policy if exists "open journal: update" on public.trades;
drop policy if exists "open journal: delete" on public.trades;

create policy "open journal: read"
  on public.trades for select
  to anon, authenticated
  using (true);

create policy "open journal: insert"
  on public.trades for insert
  to anon, authenticated
  with check (true);

create policy "open journal: update"
  on public.trades for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "open journal: delete"
  on public.trades for delete
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 4. Storage bucket for losing-trade screenshots
--
-- Private bucket. The app never links to objects directly; the server mints
-- short-lived signed URLs instead.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'trade-screenshots',
  'trade-screenshots',
  false,
  5242880, -- 5 MB, comfortable for a chart screenshot on the free tier
  array['image/png', 'image/jpeg', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public             = excluded.public;

drop policy if exists "screenshots: read"   on storage.objects;
drop policy if exists "screenshots: insert" on storage.objects;
drop policy if exists "screenshots: update" on storage.objects;
drop policy if exists "screenshots: delete" on storage.objects;

-- SELECT is required both to view and to sign URLs.
create policy "screenshots: read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'trade-screenshots');

create policy "screenshots: insert"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'trade-screenshots');

-- INSERT + SELECT + UPDATE together are what make `upsert: true` work.
create policy "screenshots: update"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'trade-screenshots')
  with check (bucket_id = 'trade-screenshots');

create policy "screenshots: delete"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'trade-screenshots');

-- ---------------------------------------------------------------------------
-- 5. OPTIONAL — lock the journal to a single signed-in user
--
-- To switch the journal from open to private:
--   a) turn on an auth provider in the dashboard,
--   b) run the statements below,
--   c) add a login page to the app.
--
--   alter table public.trades
--     add column user_id uuid not null default auth.uid()
--       references auth.users (id) on delete cascade;
--
--   create index trades_user_id_idx on public.trades (user_id);
--
--   drop policy "open journal: read"   on public.trades;
--   drop policy "open journal: insert" on public.trades;
--   drop policy "open journal: update" on public.trades;
--   drop policy "open journal: delete" on public.trades;
--
--   revoke all on public.trades from anon;
--
--   create policy "own trades: read" on public.trades for select
--     to authenticated using ((select auth.uid()) = user_id);
--
--   create policy "own trades: insert" on public.trades for insert
--     to authenticated with check ((select auth.uid()) = user_id);
--
--   -- Both USING and WITH CHECK: without WITH CHECK a row could be reassigned
--   -- to another user_id.
--   create policy "own trades: update" on public.trades for update
--     to authenticated
--     using ((select auth.uid()) = user_id)
--     with check ((select auth.uid()) = user_id);
--
--   create policy "own trades: delete" on public.trades for delete
--     to authenticated using ((select auth.uid()) = user_id);
--
--   -- Screenshots are then stored under `<user_id>/<file>` and scoped with:
--   --   using (bucket_id = 'trade-screenshots'
--   --          and (storage.foldername(name))[1] = (select auth.uid())::text)
