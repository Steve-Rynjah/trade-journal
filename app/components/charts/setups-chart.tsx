import type { SetupScore } from "@/lib/stats";

/**
 * How the Asia setups are treating you: +1 for every tagged trade that won,
 * −1 for every one that lost, break evens nothing.
 *
 * Drawn exactly like Trading days — bars scaled against the strongest setup,
 * blue when it is paying and red when it is not — so the two cards read the
 * same way side by side.
 */
export function SetupsChart({ rows }: { rows: SetupScore[] }) {
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.net)));
  const wins = rows.reduce((sum, row) => sum + row.wins, 0);
  const losses = rows.reduce((sum, row) => sum + row.losses, 0);
  const traded = rows.reduce((sum, row) => sum + row.traded, 0);

  return (
    <div className="px-5 pb-5">
      <ul className="flex flex-col gap-3">
        {rows.map((row) => {
          const up = row.net > 0;
          const down = row.net < 0;
          const detail = `${row.setup}: ${row.wins} won, ${row.losses} lost, ${row.traded} tagged`;

          return (
            <li key={row.setup} className="flex items-center gap-3" title={detail}>
              <span className="w-[5.5rem] shrink-0 text-right text-theme-sm text-gray-500 dark:text-gray-400">
                {row.setup}
              </span>

              <span className="relative h-6 flex-1 rounded-md bg-gray-100 dark:bg-white/[0.04]">
                {row.net !== 0 ? (
                  <span
                    className={`animate-grow-x absolute inset-y-0 left-0 rounded-r-md transition-[width] duration-500 ${
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
                {/* True minus sign, to match the Trading days card. */}
                {up ? `+${row.net}` : down ? `−${Math.abs(row.net)}` : row.net}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="tnum mt-5 border-t border-gray-100 pt-4 text-theme-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
        {traded === 0
          ? "No Asia setups tagged this month"
          : `${wins} won · ${losses} lost · ${traded} tagged`}
      </p>
    </div>
  );
}
