"use client";

import { MONTHS, monthGrid } from "@/lib/stats";
import { formatTradeDate, type TradeWithScreenshot } from "@/lib/types";
import { biasLabel } from "../ui";

const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"] as const;

/**
 * The chosen month, day by day. A day that closed green is tinted green, one
 * that closed red is tinted red — with a dot per trade so a day holding both is
 * still readable, and the count spelled out in the cell's tooltip.
 */
export function TradeCalendar({
  trades,
  month,
  year,
}: {
  trades: TradeWithScreenshot[];
  month: number;
  year: number;
}) {
  const cells = monthGrid(trades, month, year);

  return (
    <div className="px-5 pb-5">
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {WEEKDAY_INITIALS.map((initial, index) => (
          <div
            key={`${initial}-${index}`}
            className="pb-1 text-center text-theme-xs font-semibold text-gray-500 dark:text-gray-400"
          >
            {initial}
          </div>
        ))}

        {cells.map((cell) => {
          const wins = cell.trades.filter((trade) => trade.result === "WIN").length;
          const losses = cell.trades.length - wins;

          let tint =
            "bg-gray-50 text-gray-500 dark:bg-white/[0.03] dark:text-gray-400";
          if (!cell.inMonth) {
            tint =
              "border border-dashed border-gray-200 text-gray-300 dark:border-gray-800 dark:text-gray-700";
          } else if (wins > losses) {
            tint =
              "bg-success-50 text-success-700 dark:bg-success-500/12 dark:text-success-500";
          } else if (losses > wins) {
            tint = "bg-error-50 text-error-700 dark:bg-error-500/12 dark:text-error-500";
          } else if (cell.trades.length > 0) {
            // An even day: neither colour earns the cell, the dots tell the story.
            tint =
              "bg-gray-100 text-gray-700 dark:bg-white/[0.07] dark:text-gray-300";
          }

          // Hovering a day names the trades it holds, not the date it already
          // shows: `BULL - LONG`, one line per trade.
          const hoverLabel = cell.trades
            .map((trade) => `${biasLabel(trade.bias)} - ${trade.direction}`)
            .join("\n");

          return (
            <div
              key={cell.iso}
              title={hoverLabel || undefined}
              aria-label={
                cell.trades.length === 0
                  ? `${formatTradeDate(cell.iso)} — no trades`
                  : `${formatTradeDate(cell.iso)} — ${wins} won, ${losses} lost`
              }
              className={`flex min-h-16 flex-col rounded-xl p-2 transition-colors sm:min-h-20 ${tint}`}
            >
              <span className="tnum text-theme-sm font-medium leading-none">
                {cell.dayOfMonth}
              </span>

              {cell.trades.length > 0 ? (
                <span className="mt-auto flex flex-wrap items-center gap-1 pt-1.5">
                  {cell.trades.slice(0, 4).map((trade) => (
                    <span
                      key={trade.id}
                      className={`h-1.5 w-1.5 rounded-full ${
                        trade.result === "WIN" ? "bg-success-500" : "bg-error-500"
                      }`}
                    />
                  ))}
                  {cell.trades.length > 4 ? (
                    <span className="tnum text-[10px] leading-none opacity-70">
                      +{cell.trades.length - 4}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      <ul className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        {[
          { label: "Winning day", className: "bg-success-500" },
          { label: "Losing day", className: "bg-error-500" },
        ].map((entry) => (
          <li key={entry.label} className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${entry.className}`}
              aria-hidden="true"
            />
            <span className="text-theme-sm text-gray-700 dark:text-gray-300">
              {entry.label}
            </span>
          </li>
        ))}
        <li className="text-theme-xs text-gray-500 dark:text-gray-400">
          {MONTHS[month - 1]} {year}
        </li>
      </ul>
    </div>
  );
}
