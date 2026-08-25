-- Close the journal: every trade belongs to a signed-in user.
--
-- Until now the browser talked to Supabase as `anon` and the policies let anon
-- read and write everything — anyone who reached the URL owned the journal. This
-- migration swaps that for ownership-scoped policies and revokes `anon`
-- outright, so the login page in front of the app is a real boundary rather
-- than a screen you can navigate around.
--
-- Run this on an EMPTY `trades` table (or backfill `user_id` first): the column
-- lands NOT NULL and existing rows have no owner to inherit.

-- ---------------------------------------------------------------------------
-- 1. Ownership
--
-- The default is what lets the app insert without naming the user: PostgREST
-- runs the statement as the caller, so `auth.uid()` is already their id.
-- ---------------------------------------------------------------------------
alter table public.trades
  add column if not exists user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade;

create index if not exists trades_user_id_idx on public.trades (user_id);

-- The sheet index is only useful per owner now.
drop index if exists public.trades_sheet_idx;
create index if not exists trades_sheet_idx
  on public.trades (user_id, version, trade_date desc);

-- ---------------------------------------------------------------------------
-- 2. Row Level Security
--
-- `to authenticated` on its own is authentication without authorisation — it
-- checks the role, not the row. The ownership predicate is what actually scopes
-- the data, and UPDATE carries WITH CHECK as well as USING so a row cannot be
-- reassigned to somebody else's user_id.
-- ---------------------------------------------------------------------------
revoke all on public.trades from anon;

drop policy if exists "open journal: read"   on public.trades;
drop policy if exists "open journal: insert" on public.trades;
drop policy if exists "open journal: update" on public.trades;
drop policy if exists "open journal: delete" on public.trades;

drop policy if exists "own trades: read"   on public.trades;
drop policy if exists "own trades: insert" on public.trades;
drop policy if exists "own trades: update" on public.trades;
drop policy if exists "own trades: delete" on public.trades;

create policy "own trades: read"
  on public.trades for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "own trades: insert"
  on public.trades for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "own trades: update"
  on public.trades for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own trades: delete"
  on public.trades for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 3. The 25-trade ceiling, per owner
--
-- RLS already limits what the count can see, but saying `user_id` out loud means
-- the sheet limit stays right even if the function is ever run from a context
-- that bypasses RLS.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_sheet_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  existing integer;
begin
  select count(*)
    into existing
    from public.trades as t
   where t.user_id = new.user_id
     and t.version = new.version
     and date_trunc('month', t.trade_date) = date_trunc('month', new.trade_date)
     and t.id is distinct from new.id;

  if existing >= 25 then
    raise exception
      'Sheet v% for % already holds 25 trades.',
      new.version, to_char(new.trade_date, 'Mon YYYY')
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trades_sheet_limit on public.trades;

create trigger trades_sheet_limit
  before insert or update of version, trade_date, user_id on public.trades
  for each row execute function public.enforce_sheet_limit();

-- ---------------------------------------------------------------------------
-- 4. Screenshots
--
-- Objects are stored under `<user_id>/<uuid>.<ext>`, so the first path segment
-- is the owner and the policies can read it straight off the name.
--
-- All three of INSERT, SELECT and UPDATE are needed for `upsert: true` to work;
-- SELECT is also what makes signing a URL possible.
-- ---------------------------------------------------------------------------
drop policy if exists "screenshots: read"   on storage.objects;
drop policy if exists "screenshots: insert" on storage.objects;
drop policy if exists "screenshots: update" on storage.objects;
drop policy if exists "screenshots: delete" on storage.objects;

create policy "screenshots: read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'trade-screenshots'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "screenshots: insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'trade-screenshots'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "screenshots: update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'trade-screenshots'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'trade-screenshots'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "screenshots: delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'trade-screenshots'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
