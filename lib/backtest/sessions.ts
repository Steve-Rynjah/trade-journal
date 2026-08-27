/**
 * A saved run through history.
 *
 * The session is what makes the Backtest tab worth reopening: it remembers the
 * bar you had replayed up to, so the chart comes back where you left it.
 */

import type { Timeframe } from "./candles";
import type { Drawing } from "./drawings";

export type BacktestSession = {
  id: string;
  symbol: string;
  /** Seconds since the epoch — the same unit the candles use. */
  startTime: number;
  cursorTime: number;
  timeframe: Timeframe;
  /** How much time one replay step advances. */
  stepSeconds: number;
  balance: number;
  drawings: Drawing[];
  updatedAt: string;
};

/**
 * The window the packed candle file covers.
 *
 * Kept here so the date picker can refuse a day with no candles behind it
 * rather than opening an empty chart. Widen this after re-running the ingest
 * script with a longer range.
 */
export const DATA_FIRST_DAY = "2025-01-02";
export const DATA_LAST_DAY = "2026-08-26";

/** Replay step choices. The 5-minute floor is the resolution of the data. */
export const STEP_CHOICES = [
  { seconds: 300, label: "5m" },
  { seconds: 900, label: "15m" },
  { seconds: 1_800, label: "30m" },
  { seconds: 3_600, label: "1h" },
  { seconds: 14_400, label: "4h" },
  { seconds: 86_400, label: "1d" },
] as const;

export const DEFAULT_BALANCE = 5_000;

/** Whole days between two instants, for the "N days" badge on a session card. */
export function daysBetween(fromSeconds: number, toSeconds: number): number {
  return Math.max(0, Math.floor((toSeconds - fromSeconds) / 86_400));
}

/** `2/1/26` — compact, and unambiguous next to the day count beside it. */
export function shortDate(seconds: number): string {
  const d = new Date(seconds * 1000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${String(d.getUTCFullYear()).slice(2)}`;
}
