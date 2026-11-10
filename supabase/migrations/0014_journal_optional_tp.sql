-- A journal entry may have no take profit — entered as "-" in the TP cell and
-- stored as null. The levels check then only holds the stop to the right side
-- of the entry, and the target too when there is one.
--
-- The ratio stops being computed from the prices: it is the planned R:R, typed
-- as two legs, so nothing here changes for it.

alter table public.journal_entries
  alter column take_profit drop not null;

alter table public.journal_entries
  drop constraint if exists journal_entries_levels_make_sense;

alter table public.journal_entries
  add constraint journal_entries_levels_make_sense check (
    (direction = 'LONG'  and stop_loss < entry_price
       and (take_profit is null or take_profit > entry_price)) or
    (direction = 'SHORT' and stop_loss > entry_price
       and (take_profit is null or take_profit < entry_price))
  );
