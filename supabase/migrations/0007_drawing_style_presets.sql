-- Per-tool style presets, alongside the existing multi-drawing sets.
--
-- Two different things now live in this table, told apart by `kind`:
--   kind is null  → a set of drawings, applied onto the chart as shapes
--   kind is set   → a saved look for one tool, applied to the *next* shape drawn
--
-- The second is what makes repeat marking quick: pick the Rectangle tool, choose
-- "FVG", and every rectangle after it arrives already styled.

alter table public.backtest_drawing_sets
  add column if not exists kind text;

-- Names only have to be unique within their own flavour, so a preset called
-- "SUPPORT" and a set called "SUPPORT" can coexist without shadowing.
alter table public.backtest_drawing_sets
  drop constraint if exists backtest_drawing_sets_unique_name;

create unique index if not exists backtest_drawing_sets_unique_name
  on public.backtest_drawing_sets (user_id, symbol, coalesce(kind, ''), name);
