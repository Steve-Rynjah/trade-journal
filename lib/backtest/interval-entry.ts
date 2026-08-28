/**
 * Typing an interval straight onto the chart.
 *
 * TradingView's quickest gesture: start typing a number over the chart and a
 * box appears, `15` means fifteen minutes, `1H` means an hour, Enter applies it.
 * This parses what was typed the same way.
 *
 * The parse is deliberately wider than what this chart can show. Someone typing
 * `30` should be told "30 minutes — not available here", not left staring at a
 * box that ignores them; so `label` describes any sane interval and
 * `timeframe` is null unless it is one of the four folds that actually exist.
 */

import { TIMEFRAME_SECONDS, TIMEFRAMES, type Timeframe } from "./candles";

export type IntervalMatch = {
  /** What was typed, in words — `15 minutes`. Null when it is not an interval. */
  label: string | null;
  /** The timeframe to switch to, or null when this chart has no such fold. */
  timeframe: Timeframe | null;
};

/** Minutes to the timeframe that shows them, for the four this app folds. */
const BY_MINUTES = new Map<number, Timeframe>(
  TIMEFRAMES.map((tf) => [TIMEFRAME_SECONDS[tf] / 60, tf]),
);

/** The unit suffixes TradingView accepts, and what one of each is in minutes. */
const UNITS: Record<string, { minutes: number; name: string }> = {
  "": { minutes: 1, name: "minute" },
  H: { minutes: 60, name: "hour" },
  D: { minutes: 60 * 24, name: "day" },
  W: { minutes: 60 * 24 * 7, name: "week" },
  M: { minutes: 60 * 24 * 30, name: "month" },
};

export function parseInterval(text: string): IntervalMatch {
  const cleaned = text.trim().toUpperCase().replace(/\s+/g, "");
  const match = /^(\d+)([HDWM]?)$/.exec(cleaned);
  if (!match) return { label: null, timeframe: null };

  const count = Number(match[1]);
  if (count <= 0) return { label: null, timeframe: null };

  const unit = UNITS[match[2]];
  const label = `${count} ${unit.name}${count === 1 ? "" : "s"}`;

  // Only whole minutes can name a fold, and only days-and-up overflow past
  // what the four timeframes cover — both fall out of the lookup returning
  // nothing, so there is no separate range check to keep in step.
  return { label, timeframe: BY_MINUTES.get(count * unit.minutes) ?? null };
}

/** The intervals that can actually be switched to, for the dialog's hint. */
export const AVAILABLE_INTERVALS = TIMEFRAMES.map((tf) => {
  const minutes = TIMEFRAME_SECONDS[tf] / 60;
  return minutes < 60 ? String(minutes) : `${minutes / 60}H`;
}).join(", ");
