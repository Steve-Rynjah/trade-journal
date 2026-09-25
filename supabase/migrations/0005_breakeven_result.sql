-- BREAKEVEN returns, as `BE`.
--
-- A trade closed out for neither a win nor a loss. It counts toward the sheet's
-- total but not its win rate, and moves the P&L by nothing.

alter table public.trades
  drop constraint if exists trades_result_check;

alter table public.trades
  add constraint trades_result_check check (result in ('WIN', 'LOSE', 'BE'));
