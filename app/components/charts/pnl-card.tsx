import type { ReactNode } from "react";

import {
  MAX_DRAWDOWN_PERCENT,
  computeDrawdown,
  computeSplit,
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
export function PnlCard({
  pnl,
  trades,
  action,
}: {
  pnl: Pnl;
  trades: number;
  /** Sits in the top-right corner — the risk the figures are computed at. */
  action?: ReactNode;
}) {
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
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-theme-sm text-gray-500 dark:text-gray-400">
            Net profit &amp; loss
          </p>
          <span className={`tnum text-theme-sm font-semibold ${tone}`}>
            {formatSignedPercent(pnl.netPercent)}
          </span>
        </div>
        {action}
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

      {/* No "1% risk = $50 per trade" line: the risk menu above already prints
          the amount against every option it offers. */}
      <p className="tnum mt-4 text-theme-xs text-gray-500 dark:text-gray-400">
        {trades === 0
          ? "No trades in this month"
          : `Across ${trades} ${trades === 1 ? "trade" : "trades"}`}
      </p>

      {/* A funded account asks a different question depending on the sign, so
          only one of these is ever on screen. */}
      {up ? (
        <SplitStrip net={pnl.net} />
      ) : (
        <DrawdownStrip net={pnl.net} accountSize={pnl.startingBalance} />
      )}
    </div>
  );
}

/** What a winning sheet is actually worth once the firm takes its cut. */
function SplitStrip({ net }: { net: number }) {
  const split = computeSplit(net);

  return (
    <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800">
      <p className="text-theme-xs font-medium uppercase tracking-[0.08em] text-gray-400">
        {split.traderPercent} / {100 - split.traderPercent} split
      </p>

      {/* Both sides drawn, in the colours of the two figures below — the bar is
          the split itself rather than a fill against an empty track. */}
      <div className="mt-3 flex h-2 overflow-hidden rounded-full">
        <div
          className="animate-grow-x bg-success-500"
          style={{ width: `${split.traderPercent}%` }}
          aria-hidden="true"
        />
        <div
          className="animate-grow-x bg-brand-500"
          style={{ width: `${100 - split.traderPercent}%` }}
          aria-hidden="true"
        />
      </div>

      {/* Each figure sits under the part of the bar it belongs to. The payout
          carries no label: it is the number the card exists to give you. */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="tnum rounded-full bg-success-50 px-2.5 py-0.5 text-theme-sm font-semibold text-success-700 dark:bg-success-500/15 dark:text-success-500">
          {formatMoney(split.trader)}
        </span>
        <span className="tnum rounded-full bg-brand-50 px-2.5 py-0.5 text-theme-xs font-semibold text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
          Firm {formatMoney(split.firm)}
        </span>
      </div>
    </div>
  );
}

/**
 * How much of the account's allowance a losing sheet has spent.
 *
 * Shown instead of the split, not beside it: there is nothing to divide on a
 * losing month, and what matters is how much room is left.
 */
function DrawdownStrip({ net, accountSize }: { net: number; accountSize: number }) {
  const drawdown = computeDrawdown(net, accountSize);

  return (
    <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800">
      {/* The rule and the allowance it works out to, the way the split strip
          opposite states its own terms. */}
      <p className="tnum text-theme-xs font-medium uppercase tracking-[0.08em] text-gray-400">
        {MAX_DRAWDOWN_PERCENT}% drawdown · {formatMoney(drawdown.limit)}
      </p>

      {/* Spent against remaining, in the colours of the two figures below. */}
      <div className="mt-3 flex h-2 overflow-hidden rounded-full">
        <div
          className="animate-grow-x bg-error-500"
          style={{ width: `${drawdown.usedPercent}%` }}
          aria-hidden="true"
        />
        <div
          className={`animate-grow-x ${drawdown.breached ? "bg-error-500" : "bg-brand-500"}`}
          style={{ width: `${100 - drawdown.usedPercent}%` }}
          aria-hidden="true"
        />
      </div>

      {/* Each figure under its own part of the bar. What is left is the number
          that matters, so it is the one carrying the weight. */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="tnum rounded-full bg-error-50 px-2.5 py-0.5 text-theme-xs font-semibold text-error-700 dark:bg-error-500/15 dark:text-error-500">
          {formatMoney(drawdown.used)} used
        </span>
        <span
          className={`tnum rounded-full px-2.5 py-0.5 text-theme-sm font-semibold ${
            drawdown.breached
              ? "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-500"
              : "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400"
          }`}
        >
          {drawdown.breached ? "Breached" : `${formatMoney(drawdown.remaining)} left`}
        </span>
      </div>
    </div>
  );
}
