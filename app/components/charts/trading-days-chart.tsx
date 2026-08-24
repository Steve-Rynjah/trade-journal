import type { WeekdayDays } from "@/lib/stats";

/**
 * How each weekday actually treats you: winning days minus losing days.
 *
 * Bars are scaled by magnitude against the busiest weekday, so a month of
 * Mon 4 / Tue 3 / Wed 2 reads as a real ranking rather than three full bars.
 * Blue is a weekday you finish ahead on, red one to think twice about.
 *
 * A day counts as winning when more of its trades won than lost — the same rule
 * that tints the calendar, so the two panels never disagree.
 */
export function TradingDaysChart({ rows }: { rows: WeekdayDays[] }) {
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.net)));
  const winning = rows.reduce((sum, row) => sum + row.winning, 0);
  const losing = rows.reduce((sum, row) => sum + row.losing, 0);
  const traded = rows.reduce((sum, row) => sum + row.traded, 0);

  return (
    <div className="px-5 pb-5">
      <ul className="flex flex-col gap-3">
        {rows.map((row) => {
          const up = row.net > 0;
          const down = row.net < 0;
          const detail = `${row.short}: ${row.winning} winning, ${row.losing} losing, ${row.traded} traded`;

          return (
            <li key={row.day} className="flex items-center gap-3" title={detail}>
              <span className="w-9 shrink-0 text-right text-theme-sm text-gray-500 dark:text-gray-400">
                {row.short}
              </span>

              {/* The track is the axis; the bar grows from it, rounded only at
                  the data end. */}
              <span className="relative h-6 flex-1 rounded-md bg-gray-100 dark:bg-white/[0.04]">
                {row.net !== 0 ? (
                  <span
                    className={`absolute inset-y-0 left-0 rounded-r-md transition-[width] duration-500 ${
                      up ? "bg-brand-500" : "bg-error-500"
                    }`}
                    style={{ width: `${(Math.abs(row.net) / max) * 100}%` }}
                  />
                ) : null}
              </span>

              <span
                className={`tnum w-8 shrink-0 text-right text-theme-sm font-semibold ${
                  up
                    ? "text-brand-500 dark:text-brand-400"
                    : down
                      ? "text-error-600 dark:text-error-500"
                      : "text-gray-300 dark:text-gray-600"
                }`}
              >
                {/* True minus sign, to match the money and percent cards. */}
                {up ? `+${row.net}` : down ? `−${Math.abs(row.net)}` : row.net}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="tnum mt-5 border-t border-gray-100 pt-4 text-theme-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
        {traded === 0
          ? "No trading days this month"
          : `${winning} winning · ${losing} losing · ${traded} traded`}
      </p>
    </div>
  );
}
