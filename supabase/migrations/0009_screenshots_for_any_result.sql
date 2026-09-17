-- Charts stop being a losing-trade-only thing.
--
-- `trades_screenshot_losing_only` was written when a chart was only ever kept
-- to review a loss. Wins are worth reviewing too, so the journal now takes a
-- screenshot for any decided trade and the constraint has to go — otherwise
-- attaching one to a WIN is rejected by the database no matter what the UI
-- allows.

alter table public.trades
  drop constraint if exists trades_screenshot_losing_only;
