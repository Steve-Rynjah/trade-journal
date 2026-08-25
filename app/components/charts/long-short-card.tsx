import {
  computePnl,
  formatSignedMoney,
  splitByDirection,
  type ResultSplit,
} from "@/lib/stats";
import type { Trade } from "@/lib/types";

const LONG = "#465fff";
const SHORT = "#f04438";

type Side = {
  label: "Long" | "Short";
  color: string;
  split: ResultSplit;
  pnl: number;
  share: number;
};

/**
 * The month's two directions side by side: how the trades were split, how each
 * side performed, and what each one was worth.
 */
export function LongShortCard({
  trades,
  accountSize,
  riskPercent,
}: {
  trades: Trade[];
  accountSize: number;
  riskPercent: number;
}) {
  const longTrades = trades.filter((trade) => trade.direction === "LONG");
  const shortTrades = trades.filter((trade) => trade.direction === "SHORT");
  const total = trades.length;

  const sides: Side[] = [
    {
      label: "Long",
      color: LONG,
      split: splitByDirection(trades, "LONG"),
      pnl: computePnl(longTrades, accountSize, riskPercent).net,
      // With nothing logged the bar splits evenly rather than collapsing.
      share: total === 0 ? 50 : (longTrades.length / total) * 100,
    },
    {
      label: "Short",
      color: SHORT,
      split: splitByDirection(trades, "SHORT"),
      pnl: computePnl(shortTrades, accountSize, riskPercent).net,
      share: total === 0 ? 50 : (shortTrades.length / total) * 100,
    },
  ];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center gap-2.5">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 8.5h13m0 0l-3.5-3.5M17 8.5L13.5 12M20 15.5H7m0 0l3.5-3.5M7 15.5L10.5 19"
            stroke={LONG}
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Long vs Short
        </h2>
      </div>
      <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
        Performance by trade direction
      </p>

      {/* Share of the month's trades, as one split bar. */}
      <div
        className="mt-5 flex h-3 w-full overflow-hidden rounded-full"
        role="img"
        aria-label={`Trade split: ${sides[0].share.toFixed(0)}% long, ${sides[1].share.toFixed(0)}% short`}
      >
        {sides.map((side) => (
          <span
            key={side.label}
            className="animate-grow-x h-full transition-[width] duration-500"
            style={{ width: `${side.share}%`, background: side.color }}
          />
        ))}
      </div>

      <ul className="mt-5 divide-y divide-gray-200 rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
        {sides.map((side) => (
          <li
            key={side.label}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5"
          >
            <span className="flex items-center gap-2.5">
              <span
                className="h-3 w-3 rounded-sm"
                style={{ background: side.color }}
                aria-hidden="true"
              />
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                {side.label === "Long" ? (
                  <>
                    <path
                      d="M4 16l5-5.5 3.5 3L20 6"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M15.5 6H20v4.5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </>
                ) : (
                  <>
                    <path
                      d="M4 8l5 5.5 3.5-3L20 18"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M15.5 18H20v-4.5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </>
                )}
              </svg>
              <span className="text-theme-sm font-bold text-gray-900 dark:text-white">
                {side.label}
              </span>
            </span>

            <span className="tnum text-theme-sm text-gray-500 dark:text-gray-400">
              {side.split.total} {side.split.total === 1 ? "trade" : "trades"} ·{" "}
              {side.split.winRate.toFixed(1)}% won
            </span>

            <span className="tnum text-theme-sm font-bold text-brand-500 dark:text-brand-400">
              {formatSignedMoney(side.pnl)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
