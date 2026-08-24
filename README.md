# Trade Journal

A forex trading journal with two tabs:

- **Home** — the sheet. Type a trade straight across the open row at the top
  and hit **Save** (or press Enter in any cell); the pencil on a saved row turns
  it back into the same inputs in place. Separate **Month** and **Year**
  dropdowns pick what the sheet shows — always a concrete pair, with the last
  six years offered — and the count beside them is the number of trades in that
  month.
- **Analytics** — the same Month / Year filter plus an account size, then how
  that month went: net P&L in dollars and percent; the win / lose donut beside a
  long-vs-short breakdown; and trading days by weekday beside a calendar with
  winning days in green and losing days in red.

  **Overall performance** is the exception — it reads *every* trade on record,
  not the selected month, since the month's own split is already the donut
  beside it.

  A day counts as *winning* when more of its trades won than lost — one rule,
  shared by the calendar tint and the weekday chart, so the two never disagree.
  The weekday bars show winning days minus losing days, scaled against the
  busiest weekday: green where you finish ahead, red where you don't.

The month and year selection is shared by both tabs, and the journal is read
once in the root layout — so switching tabs is instant, with no refetch.

Built with Next.js 16 (App Router), Tailwind CSS v4, and Supabase for storage.
The fonts (Outfit), brand blue and grey ramp are the
[TailAdmin](https://nextjs-demo.tailadmin.com/) tokens.

## Columns

| Column | Notes |
| --- | --- |
| Day | Monday–Friday dropdown; picking a day moves the date inside its week |
| Date | Monday–Friday only; the DB rejects weekends |
| Bias | `BULLISH` / `BEARISH`, shown as `BULL` / `BEAR` |
| Direction | `LONG` / `SHORT` |
| Ratio | Risk is always `1` and is printed, not typed; only the reward leg is entered |
| Result | `WIN` / `LOSE` |
| Remarks | Free text; the input grows and the row gets taller as you type |
| Chart | Screenshot, **losing trades only** (enforced by a DB constraint); the upload button only appears once the result is `LOSE` |

Rows read top-down in date order. Bullish / Long / Win read green throughout,
Bearish / Short / Lose read red — in the badges and in the dropdowns themselves.

**P&L** assumes a fixed **1% of the starting balance** risked on every trade, at
the account size chosen on Analytics (5k–100k, 5k by default). A win returns its
reward leg, a loss costs the 1% — so four 1:1 wins on 5k read `$5,200`, and four
losses read `$4,800`. Risk is taken off the starting balance rather than the
running one, so two identical months always produce the same figure.

## Setup

**1. Create the schema.** Open the Supabase dashboard → SQL Editor and run
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) followed
by
[`0002_ratio_text_and_no_breakeven.sql`](supabase/migrations/0002_ratio_text_and_no_breakeven.sql).
The first
creates the `trades` table, the private `trade-screenshots` bucket, and the
policies for both.

**2. Add your keys.**

```bash
cp .env.local.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
from Project Settings → API.

**3. Run it.**

```bash
npm install
npm run dev
```

If either step is incomplete the app says so on screen, with the specific fix,
rather than failing blankly.

## Security: this journal has no login

The browser talks to Supabase with the publishable key, so the RLS policies have
to allow the `anon` role to read and write. **Anyone who can reach the URL can
read and edit your trades and open your screenshots.** That is fine on
`localhost`; it is not fine on a public deploy.

To lock it to a single account, follow the commented `AUTH` block at the bottom
of the migration — it adds `user_id`, swaps in ownership-scoped policies, and
revokes `anon`. You then need a login page.

## Notes

- **Screenshots** live in a private bucket. The server mints a signed URL per
  render (1 hour) rather than storing public links, and deletes the object when
  the trade is deleted or stops being a loss.
- **The donut is always drawn at full geometry.** The entrance is a CSS
  transform, not an animated arc sweep, so the chart is never blank before
  hydration or if the frame loop stalls.
- **Outcome colours** (`#2ee0a6` / `#ff3b5c` / `#6d8aab`) were checked against
  the `#00002a` surface for colourblind separation — the worst adjacent pair is
  ΔE 12.7 under protanopia. Every outcome also carries a glyph and a word, so
  nothing depends on colour alone.
- **New tables are not exposed to the Data API by default** (a Supabase change
  from April 2026), which is why the migration has explicit `GRANT`s. Without
  them the table exists but every request 404s.
