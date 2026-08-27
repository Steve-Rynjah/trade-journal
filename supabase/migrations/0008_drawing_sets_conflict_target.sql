-- Make saving a set or a style work again.
--
-- Migration 0007 gave this table a unique *expression* index over
-- `coalesce(kind, '')`. Postgres will not match a column-list ON CONFLICT
-- target against an expression index, so every upsert failed with
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" — which is what the save button was reporting.
--
-- The fix is to stop expressing the null-means-a-shape-set idea in the index
-- and put it in the column instead: '' is the shape-set flavour, anything else
-- names the tool a style belongs to. That allows an ordinary unique constraint,
-- which ON CONFLICT can name.

update public.backtest_drawing_sets set kind = '' where kind is null;

alter table public.backtest_drawing_sets
  alter column kind set default '',
  alter column kind set not null;

drop index if exists public.backtest_drawing_sets_unique_name;

alter table public.backtest_drawing_sets
  drop constraint if exists backtest_drawing_sets_unique_name;

alter table public.backtest_drawing_sets
  add constraint backtest_drawing_sets_unique_name
  unique (user_id, symbol, kind, name);
