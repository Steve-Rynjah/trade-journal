-- Version sheets for the Journal, the same v1–v5 the backtest sheets offer.
-- Existing entries land on v1. No per-sheet row limit: a live month takes as
-- many trades as it takes.

alter table public.journal_entries
  add column if not exists version smallint not null default 1;

alter table public.journal_entries
  drop constraint if exists journal_entries_version_range;

alter table public.journal_entries
  add constraint journal_entries_version_range check (version between 1 and 5);

drop index if exists public.journal_entries_owner_idx;
create index if not exists journal_entries_owner_idx
  on public.journal_entries (user_id, version, trade_date desc, created_at desc);
