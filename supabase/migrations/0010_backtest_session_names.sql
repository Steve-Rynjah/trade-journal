-- Sessions get a name.
--
-- Once there are a few runs on the same symbol, dates alone stop telling them
-- apart. Nullable so existing sessions keep working; the UI falls back to the
-- symbol when a session has no name.

alter table public.backtest_sessions
  add column if not exists name text
  check (name is null or char_length(name) <= 80);
