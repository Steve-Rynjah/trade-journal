-- Version sheets — the same month, backtested more than once.
--
-- A sheet is a (month, year, version) triple. Picking v2 for August 2026 opens a
-- second, empty August: same month on the calendar, a separate run of it. Each
-- sheet holds at most 25 trades.

alter table public.trades
  add column if not exists version smallint not null default 1;

alter table public.trades
  drop constraint if exists trades_version_range;

-- 20 runs of one month is already far past what anyone reviews; the ceiling is
-- here so a typo cannot mint sheet 4000.
alter table public.trades
  add constraint trades_version_range check (version between 1 and 20);

-- The sheet is what every read filters on, so it leads the index.
create index if not exists trades_sheet_idx
  on public.trades (version, trade_date desc);

-- ---------------------------------------------------------------------------
-- The 25-trade ceiling
--
-- Enforced here rather than only in the app: the limit is a property of a sheet,
-- and two tabs saving at once would each see 24 rows and both be let through.
--
-- SECURITY INVOKER (the default) on purpose — the count runs as the caller with
-- RLS applied, so it can only ever see the caller's own rows.
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
   where t.version = new.version
     and date_trunc('month', t.trade_date) = date_trunc('month', new.trade_date)
     -- On UPDATE the row is already in the table; it must not count against itself.
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

-- Only the three columns that can move a row between sheets need re-checking;
-- editing the remarks must not pay for a count.
create trigger trades_sheet_limit
  before insert or update of version, trade_date on public.trades
  for each row execute function public.enforce_sheet_limit();
