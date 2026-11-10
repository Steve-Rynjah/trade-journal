-- The Journal tab: trades actually taken, not backtested.
--
-- Kept apart from `trades` on purpose. That table is the backtest sheet — runs
-- of a month, 25 rows a sheet, a fixed 1 : 2 — and none of those rules belong to
-- a live account. A real trade has real prices, so entry, stop and target are
-- stored, and the ratio is worked out from them.

create table if not exists public.journal_entries (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid()
                   references auth.users (id) on delete cascade,
  trade_date       date not null,
  bias             text not null check (bias in ('BULLISH', 'BEARISH')),
  direction        text not null check (direction in ('LONG', 'SHORT')),
  -- Five decimals covers every major pair; twelve digits covers gold and indices.
  entry_price      numeric(12,5) not null check (entry_price > 0),
  stop_loss        numeric(12,5) not null check (stop_loss > 0),
  take_profit      numeric(12,5) not null check (take_profit > 0),
  -- `1 : 2.35`, computed by the app from the three prices and stored as shown.
  ratio            text not null check (char_length(ratio) between 1 and 32),
  result           text not null check (result in ('WIN', 'LOSE', 'BE')),
  journal          text check (journal is null or char_length(journal) <= 10000),
  -- Object paths in the `trade-screenshots` bucket, under `<user_id>/journal/`.
  screenshot_paths text[] not null default '{}',
  created_at       timestamptz not null default now(),

  constraint journal_entries_weekday_only
    check (extract(isodow from trade_date) between 1 and 5),

  -- The stop sits on the losing side of the entry and the target on the
  -- winning side; anything else is a typo, not a trade.
  constraint journal_entries_levels_make_sense check (
    (direction = 'LONG'  and stop_loss < entry_price and take_profit > entry_price) or
    (direction = 'SHORT' and stop_loss > entry_price and take_profit < entry_price)
  )
);

create index if not exists journal_entries_owner_idx
  on public.journal_entries (user_id, trade_date desc, created_at desc);

-- Since 2026-04-28 a new table in `public` is not automatically exposed to
-- PostgREST. `anon` is left out: migration 0004 made the login a real boundary.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.journal_entries to authenticated;

alter table public.journal_entries enable row level security;

drop policy if exists "own journal: read"   on public.journal_entries;
drop policy if exists "own journal: insert" on public.journal_entries;
drop policy if exists "own journal: update" on public.journal_entries;
drop policy if exists "own journal: delete" on public.journal_entries;

create policy "own journal: read"
  on public.journal_entries for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "own journal: insert"
  on public.journal_entries for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "own journal: update"
  on public.journal_entries for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own journal: delete"
  on public.journal_entries for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Charts reuse the existing bucket and its policies: those check only the first
-- path segment against auth.uid(), and `<user_id>/journal/<file>` still has the
-- owner there.
