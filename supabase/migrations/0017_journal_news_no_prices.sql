-- The Journal drops Entry, SL and TP and gains a News column: was there
-- high-impact news around the trade, YES or NO.
--
-- The three price columns are left in place but made optional, so the levels
-- already typed are not destroyed — the app no longer reads or writes them.
-- Drop them by hand once you are sure nothing is wanted from them:
--   alter table public.journal_entries
--     drop column entry_price, drop column stop_loss, drop column take_profit;
--
-- Nothing the analytics read changes: they use only result, direction and ratio.

alter table public.journal_entries
  drop constraint if exists journal_entries_levels_make_sense;

alter table public.journal_entries
  alter column entry_price drop not null,
  alter column stop_loss   drop not null;

-- Existing entries had no News answer; they land on NO.
alter table public.journal_entries
  add column if not exists news text not null default 'NO';

alter table public.journal_entries
  drop constraint if exists journal_entries_news_values;

alter table public.journal_entries
  add constraint journal_entries_news_values check (news in ('YES', 'NO'));
