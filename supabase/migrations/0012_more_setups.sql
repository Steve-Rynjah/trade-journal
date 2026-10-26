-- Three more setups: flips of a level (support turned resistance and back) and
-- the Asia N-pattern. The check is rebuilt with the full list.

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
      'Asia Trend',
      'Support >> Resistance',
      'Resistance >> Support',
      'Asia N-Pattern'
    ]::text[]
  );
