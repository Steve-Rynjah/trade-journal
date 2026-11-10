-- Prices keep the digits they were typed with.
--
-- numeric(12,5) pads every value to five places, and the JSON number PostgREST
-- returns drops trailing zeros on the way out — so `1.12450` came back as
-- `1.1245`. Unconstrained numeric keeps each value's own scale (`1.12450` stays
-- five places, `2350.5` stays one), and the app reads the columns back as text.

alter table public.journal_entries
  alter column entry_price type numeric,
  alter column stop_loss   type numeric,
  alter column take_profit type numeric;

alter table public.journal_entries
  drop constraint if exists journal_entries_price_length;

-- The old precision limit, restated as a length so a paste cannot store a
-- hundred digits.
alter table public.journal_entries
  add constraint journal_entries_price_length check (
    char_length(entry_price::text) <= 20 and
    char_length(stop_loss::text) <= 20 and
    (take_profit is null or char_length(take_profit::text) <= 20)
  );
