-- Setups, and more than one chart per trade.
--
-- `setups` is the row's chip tags — which of the named setups the trade was
-- taken from. Several can apply at once, so it is an array, and the check keeps
-- it to the fixed list the journal offers (an empty array is "none picked").
--
-- `screenshot_paths` replaces the single `screenshot_path`: one chart rarely
-- shows both the HTF context and the entry. Existing charts are carried over
-- before the old column goes, so nothing already attached is lost.

alter table public.trades
  add column if not exists setups text[] not null default '{}';

alter table public.trades
  drop constraint if exists trades_setups_known;

alter table public.trades
  add constraint trades_setups_known check (
    setups <@ array[
      'Asia Sweep',
      'Asia Support',
      'Asia Resistance',
      'Equal Highs',
      'Equal Lows',
      'Nearest $ HTF',
      'London Continuation',
      'Asia Range',
      'Asia Trend'
    ]::text[]
  );

alter table public.trades
  add column if not exists screenshot_paths text[] not null default '{}';

update public.trades
   set screenshot_paths = array[screenshot_path]
 where screenshot_path is not null
   and cardinality(screenshot_paths) = 0;

alter table public.trades
  drop column if exists screenshot_path;
