import {
  formatMoney,
  formatSignedMoney,
  formatSignedPercent,
  type Pnl,
} from "@/lib/stats";

/**
 * What the month would have returned on the chosen account size.
 *
 * The headline is the balance you would end on; the badge is the move that got
 * you there, so the same card answers both "where am I" and "what did I make".
 */
export function PnlCard({ pnl, trades }: { pnl: Pnl; trades: number }) {
  const flat = pnl.net === 0;
  const up = pnl.net > 0;

  const tone = flat
    ? "text-gray-800 dark:text-white/90"
    : up
      ? "text-success-600 dark:text-success-500"
      : "text-error-600 dark:text-error-500";

  const badgeTone = flat
    ? "bg-gray-100 text-gray-700 dark:bg-white/8 dark:text-gray-300"
    : up
      ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500"
      : "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-500";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-theme-sm text-gray-500 dark:text-gray-400">
          Net profit &amp; loss
        </p>
        <span className={`tnum text-theme-sm font-semibold ${tone}`}>
          {formatSignedPercent(pnl.netPercent)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <p className={`tnum text-title-sm font-bold ${tone}`}>
          {formatMoney(pnl.endingBalance)}
        </p>
        <span
          className={`tnum rounded-full px-2.5 py-0.5 text-theme-xs font-semibold ${badgeTone}`}
        >
          {formatSignedMoney(pnl.net)}
        </span>
      </div>

      <p className="tnum mt-4 text-theme-xs text-gray-500 dark:text-gray-400">
        From {formatMoney(pnl.startingBalance)} · 1% risk ={" "}
        {formatMoney(pnl.riskPerTrade)} per trade
      </p>
      <p className="tnum mt-1 text-theme-xs text-gray-500 dark:text-gray-400">
        {trades === 0
          ? "No trades in this month"
          : `Across ${trades} ${trades === 1 ? "trade" : "trades"}`}
      </p>
    </div>
  );
}
