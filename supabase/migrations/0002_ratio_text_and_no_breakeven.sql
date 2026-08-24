-- Ratio becomes free text, and BREAKEVEN retires.
--
-- The ratio column used to hold just the reward leg as a number, which meant the
-- risk leg was always assumed to be 1. It is now stored exactly as typed —
-- `1 : 2`, `1 : 1.5`, or anything else the journal wants to record — so nothing
-- computes on it any more.

alter table public.trades
  add column if not exists ratio text;

-- Backfill from the old numeric column, trimming `2.00` back down to `2`.
update public.trades
   set ratio = '1 : ' || trim(trailing '.' from trim(trailing '0' from rr::text))
 where ratio is null
   and rr is not null;

update public.trades set ratio = '1 : 2' where ratio is null;

alter table public.trades
  alter column ratio set not null,
  alter column ratio set default '1 : 2';

alter table public.trades
  drop constraint if exists trades_ratio_length;

alter table public.trades
  add constraint trades_ratio_length check (char_length(ratio) between 1 and 32);

-- `rr` is no longer written by the app. It is kept so the old values survive,
-- but it must stop being required.
alter table public.trades
  alter column rr drop not null;

-- The journal only records decided trades now.
alter table public.trades
  drop constraint if exists trades_result_check;

alter table public.trades
  add constraint trades_result_check check (result in ('WIN', 'LOSE'));
