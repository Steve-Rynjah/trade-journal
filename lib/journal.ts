/**
 * The Journal tab: trades actually taken on a live account.
 *
 * Separate from the backtest `Trade` on purpose — no version sheets, no 25-row
 * ceiling, no fixed 1 : 2. The ratio is the planned R:R, typed as two legs.
 */
import type { Bias, Direction, Screenshot, TradeResult } from "./types";

/**
 * At most this many charts per entry — HTF context, entry, management, exit.
 * Six at the 5 MB cap is what the 32 MB Server Action body limit allows.
 */
export const MAX_JOURNAL_CHARTS = 6;
export const MAX_JOURNAL_LENGTH = 10000;

export type JournalEntry = {
  id: string;
  /** ISO `YYYY-MM-DD`. Always a weekday. */
  tradeDate: string;
  /** Which version sheet of the month, 1–5. */
  version: number;
  bias: Bias;
  direction: Direction;
  /** Was there high-impact news around the trade. */
  news: News;
  /** The planned R:R as typed, `1 : 2`. Both legs are the journal's own. */
  ratio: string;
  result: TradeResult;
  journal: string | null;
  screenshotPaths: string[];
  createdAt: string;
};

export type JournalEntryWithCharts = JournalEntry & { screenshots: Screenshot[] };

export type JournalRow = {
  id: string;
  trade_date: string;
  version: number | null;
  bias: Bias;
  direction: Direction;
  news: News | null;
  ratio: string;
  result: TradeResult;
  journal: string | null;
  screenshot_paths: string[] | null;
  created_at: string;
};

export function rowToEntry(row: JournalRow): JournalEntry {
  return {
    id: row.id,
    tradeDate: row.trade_date,
    version: row.version ?? 1,
    bias: row.bias,
    direction: row.direction,
    news: row.news ?? "NO",
    ratio: row.ratio,
    result: row.result,
    journal: row.journal,
    screenshotPaths: row.screenshot_paths ?? [],
    createdAt: row.created_at,
  };
}

/** The News column: was there high-impact news around the trade. */
export const NEWS_OPTIONS = ["YES", "NO"] as const;
export type News = (typeof NEWS_OPTIONS)[number];
