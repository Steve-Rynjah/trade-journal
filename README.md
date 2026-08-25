# Trade Journal

A forex trading journal with two tabs:

- **Home** — the sheet. Type a trade straight across the open row at the top
  and hit **Save** (or press Enter in any cell); the pencil on a saved row turns
  it back into the same inputs in place. A **version sheet**, **Month** and
  **Year** pick what the table shows — always a concrete trio — and the count
  beside them is how full that sheet is, out of 25.
- **Analytics** — the same sheet filter plus an account size, then how
  that sheet went: net P&L in dollars and percent; the win / lose donut beside a
  long-vs-short breakdown; and trading days by weekday beside a calendar with
  winning days in green and losing days in red.

  **v1 performance** is the exception — it reads the whole *run*: every `v1`
  sheet, Jan and Feb and August together, because they are one pass at the
  strategy against different months. It carries two measures, kept visibly
  apart: a compact donut for the **win rate** (`58.3%`), and beside it the net
  **return**, which takes a sign — a run can be right more often than not and
  still lose money, and only the return can ever read `−4.0%`. Everything else
  on the page answers for the one sheet on screen.

  A day counts as *winning* when more of its trades won than lost — one rule,
  shared by the calendar tint and the weekday chart, so the two never disagree.
  The weekday bars show winning days minus losing days, scaled against the
  busiest weekday: green where you finish ahead, red where you don't.

The sheet selection is shared by both tabs, and the journal is read once in the
`(app)` layout — so switching tabs is instant, with no refetch.

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

## Version sheets

The same month can be backtested more than once. Each run is a **sheet** — a
(month, year, version) triple — picked from the leftmost dropdown as `v1`, `v2`,
`v3` and so on, and every view in the app is scoped to one. `August 2026 v2`
never shows a row from `v1`.

- A sheet holds **25 trades**. The count above the table reads `12 / 25`; at 25
  Save turns off and a banner points at the next sheet.
- Every month offers the same five sheets, **v1–v5**, whether or not they hold
  anything. A sheet that holds trades carries its own fill beside it (`8/25`);
  an untouched one says nothing.
- **The sheet pages at six rows.** The bar under the table carries the rows-per-page
  control (6 / 10 / 15 / 25), which rows you are looking at, and a button per
  page — a full sheet at the smallest page size is only five pages, so there is
  never an ellipsis to reason about. The open row stays pinned above the table on
  every page, and saving a trade returns you to page one, where the newest row is.
- **The date is bound to the sheet.** A sheet *is* a month, so the Date cell
  carries `min`/`max` for that month, the Day dropdown can only land inside it,
  and an untouched row already reads as a date in it. Save refuses anything
  outside, and says which month it wanted — without that, a date typed for
  another month saved happily and then vanished, since the table only ever
  shows its own.
- Analytics scopes to the sheet too: two runs of August are two different
  answers to "how did August go", and averaging them would answer neither.

The 25-row ceiling is a **database trigger**, not just a disabled button — two
tabs saving at once would each see 24 rows and both be let through. The trigger
rejects the 26th with a message written for a person, and the app shows it
as-is.

**P&L** risks a fixed share of the starting balance on every trade, at the
account size chosen on Analytics (5k–100k, 5k by default). The share is picked
in the corner of the **Net profit & loss** card — **0.5% / 1% / 1.5% / 2%**, 1%
by default — and every money figure on the page follows it, the long-vs-short
breakdown included.

A win returns its reward leg, a loss costs the risk. So four 1:1 wins on 5k read
`$5,200` at 1% and `$5,400` at 2%; four losses read `$4,800` and `$4,600`. Risk
is taken off the starting balance rather than the running one, so two identical
months always produce the same figure.

## Prop firm terms

A funded account asks a different question depending on the sign of the month,
so the P&L card answers whichever one applies — never both.

- **Up: the 80 / 20 split.** `+$650` reads `$520` in green beside `Firm $130` in
  blue, each sitting under its own part of a two-tone bar. The payout carries no
  label — it is the number the card exists to give you.
- **Down: the drawdown left.** The allowance is **10% of the account**, so a 5k
  account may lose `$500`. Lose `$200` and the strip reads `10% drawdown · $500`
  over a bar split `$200 used` in red against `$300 left` in blue. Spend all of
  it and the bar goes fully red and the figure reads **Breached**.

Both strips are built the same way: the terms stated once at the top, a two-tone
bar, and the two figures sitting under the parts of the bar they describe.

A winning month spends none of the allowance and a losing one has nothing to
divide, so neither figure can go negative. `TRADER_SPLIT` and
`MAX_DRAWDOWN_PERCENT` in [`lib/stats.ts`](lib/stats.ts) are the two numbers to
change for a different set of terms.

## Setup

**1. Create the schema.** Open the Supabase dashboard → SQL Editor and run the
files in [`supabase/migrations`](supabase/migrations) **in order**:

| File | What it adds |
| --- | --- |
| `0001_init.sql` | the `trades` table, the private `trade-screenshots` bucket, and the policies for both |
| `0002_ratio_text_and_no_breakeven.sql` | ratio becomes free text; `BREAKEVEN` retires |
| `0003_sheet_versions.sql` | the `version` column and the 25-per-sheet trigger |
| `0004_single_user_auth.sql` | `user_id`, ownership-scoped policies, and the revoking of `anon` |

`0004` expects an empty `trades` table — the column lands `NOT NULL` and
existing rows have no owner to inherit. Backfill `user_id` first if you already
have data.

**2. Add your keys.**

```bash
cp .env.local.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
from Project Settings → API.

**3. Create the account.** There is no sign-up screen — the one account is made
in the dashboard, under **Authentication → Users → Add user**. Tick *Auto
confirm user*, or the password will not work until the email is confirmed. The
same screen is where the password is changed later.

**4. Run it.**

```bash
npm install
npm run dev
```

If either step is incomplete the app says so on screen, with the specific fix,
rather than failing blankly.

## Sign in

Email and password, no OTP step, no sign-up: the account is created once in the
Supabase dashboard and `/login` is the whole of the auth surface.

What actually holds the door shut is the database, not the screen:

- `anon` has been **revoked** on `trades`. The publishable key alone cannot read
  or write a row — the policies scope every statement to
  `auth.uid() = user_id`, and `UPDATE` carries `WITH CHECK` as well as `USING`
  so a row cannot be reassigned to another owner.
- Screenshots live under `<user_id>/<uuid>.<ext>` in a private bucket, and the
  storage policies read the owner off that first path segment.
- [`proxy.ts`](proxy.ts) refreshes the session and redirects signed-out visitors
  to `/login`, keeping the path they asked for in `?next=` so a deep link
  survives the detour. Only same-site paths are followed back.
- Every Server Action in [`app/actions.ts`](app/actions.ts) re-checks the
  session for itself. A Server Action is a POST to whatever route used it, so
  one edit to the proxy's matcher could quietly take it out of scope — the
  actions do not trust the door.

Sessions are verified with `getClaims()` rather than `getSession()`: a session
read straight out of a cookie is the claim, not the proof.

> **Note:** `proxy.ts` is Next.js 16's name for what used to be `middleware.ts`.
> The old filename still works but is deprecated.

## Notes

- **Screenshots** live in a private bucket. The server mints a signed URL per
  render (1 hour) rather than storing public links, and deletes the object when
  the trade is deleted or stops being a loss.
- **The donut is always drawn at full geometry.** The entrance is a CSS
  transform, not an animated arc sweep, so the chart is never blank before
  hydration or if the frame loop stalls. Every bar follows the same rule: they
  grow with `scaleX`, never from a zero width, and `animation-fill-mode: both`
  plus the reduced-motion override means the end state is reached even when the
  animation never runs.
- **Switching tabs re-runs the entrance.** `<main>` is keyed on the route, so a
  tab re-mounts and its animation restarts — **one** entrance, on the whole
  page. Animating each row separately was tried and reverted: a row with its own
  animation is its own stacking context, and the period dropdowns then open
  behind the card beneath them. The calendar is safe to stagger because its
  cells contain no popovers; it goes a week at a time, since 42 separate delays
  would take most of a second to finish.
- **The theme wipes rather than snaps.** The toggle uses the View Transitions
  API to reveal the new theme as a circle growing out of the button that was
  pressed, with the radius reaching the furthest corner of the viewport. Firefox
  has no View Transitions and reduced-motion users do not want a full-page wipe:
  both get the instant swap, and the icon still spins as it changes.
- **Outcome colours** (`#2ee0a6` / `#ff3b5c` / `#6d8aab`) were checked against
  the `#00002a` surface for colourblind separation — the worst adjacent pair is
  ΔE 12.7 under protanopia. Every outcome also carries a glyph and a word, so
  nothing depends on colour alone.
- **New tables are not exposed to the Data API by default** (a Supabase change
  from April 2026), which is why the migration has explicit `GRANT`s. Without
  them the table exists but every request 404s.
- **The login page is a two-panel split**: the form on the left, and on the
  right a flat brand-blue panel carrying one line of encouragement. The panel is
  `hidden lg:flex`, because decoration is the first thing a phone should drop.
