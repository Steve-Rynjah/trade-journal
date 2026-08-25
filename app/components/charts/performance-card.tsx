"use client";

import { formatSignedPercent, type ResultSplit } from "@/lib/stats";
import { WinLoseDonut } from "./win-lose-donut";

/** A count that is meant to be read across the room, not squinted at. */
function Tally({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "win" | "lose";
}) {
  const tones = {
    win: "bg-brand-50 text-brand-500 dark:bg-brand-500/12 dark:text-brand-400",
    lose: "bg-error-50 text-error-600 dark:bg-error-500/12 dark:text-error-400",
  } as const;

  return (
    <div className={`rounded-xl px-3.5 py-2.5 ${tones[tone]}`}>
      <p className="tnum text-title-sm font-bold leading-none">{value}</p>
      <p className="mt-1.5 text-theme-xs font-medium uppercase tracking-[0.08em] opacity-70">
        {label}
      </p>
    </div>
  );
}

/**
 * How a whole version has done — every month it has been run against, together.
 *
 * Two measures, kept visibly apart. The donut is the **win rate**: how often the
 * run was right. The headline beside it is the **return**, which carries a sign,
 * because a run can be right more often than not and still lose money — and only
 * one of the two numbers can ever be negative.
 */
export function PerformanceCard({
  label,
  hint,
  netPercent,
  split,
  months,
}: {
  label: string;
  /** What the figure covers — the run, and how much of the record it spans. */
  hint?: string;
  /** Net return as a percentage of the account. Negative on a losing run. */
  netPercent: number;
  split: ResultSplit;
  /** Distinct months the run covers, for the footer. */
  months: number;
}) {
  const empty = split.total === 0;
  const up = netPercent > 0;
  const flat = netPercent === 0;

  const tone =
    empty || flat
      ? "text-gray-800 dark:text-white/90"
      : up
        ? "text-success-600 dark:text-success-500"
        : "text-error-600 dark:text-error-500";

  return (
    <div className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div>
        <p className="text-theme-sm text-gray-500 dark:text-gray-400">{label}</p>
        {hint ? (
          <p className="mt-0.5 text-theme-xs text-gray-400 dark:text-gray-500">{hint}</p>
        ) : null}
      </div>

      {/* The donut and the figures share the width; `flex-1` on the right column
          is what lets the numbers grow into the space instead of huddling. */}
      <div className="mt-4 flex flex-1 flex-wrap items-center gap-x-6 gap-y-5">
        <div className="flex flex-col items-center">
          {/* No legend: the two tallies below name the colours, in the colours. */}
          <WinLoseDonut split={split} size={148} legend={false} precision={1} />
          <p className="mt-1 text-theme-xs font-medium uppercase tracking-[0.08em] text-gray-400">
            Win rate
          </p>
        </div>

        <div className="min-w-[9rem] flex-1">
          <p className="text-theme-xs font-medium uppercase tracking-[0.08em] text-gray-400">
            Net return
          </p>
          <p
            className={`tnum mt-1 text-title-md font-bold leading-none ${
              empty ? "text-gray-300 dark:text-gray-600" : tone
            }`}
          >
            {empty ? "—" : formatSignedPercent(netPercent)}
          </p>

          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <Tally value={split.wins} label="Won" tone="win" />
            <Tally value={split.losses} label="Lost" tone="lose" />
          </div>
        </div>
      </div>

      <p className="tnum mt-5 border-t border-gray-100 pt-3.5 text-theme-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
        {empty ? (
          "Nothing logged yet"
        ) : (
          <>
            <span className="font-semibold text-gray-800 dark:text-white/90">
              {split.total}
            </span>{" "}
            taken across{" "}
            <span className="font-semibold text-gray-800 dark:text-white/90">
              {months}
            </span>{" "}
            {months === 1 ? "month" : "months"}
          </>
        )}
      </p>
    </div>
  );
}
