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
  /**
   * Prices exactly as typed — `1.12450` keeps its last zero. Text, not number:
   * a JS number cannot remember how many decimals it was written with.
   */
  entry: string;
  stopLoss: string;
  /** Null when the trade was taken without a target — shown as `-`. */
  takeProfit: string | null;
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
  // Selected as `::text` aliases — see JOURNAL_SELECT in journal-data.ts. The
  // raw numeric columns arrive as JSON numbers, which lose trailing zeros.
  entry_text: string;
  stop_loss_text: string;
  take_profit_text: string | null;
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
    entry: row.entry_text,
    stopLoss: row.stop_loss_text,
    takeProfit: row.take_profit_text,
    ratio: row.ratio,
    result: row.result,
    journal: row.journal,
    screenshotPaths: row.screenshot_paths ?? [],
    createdAt: row.created_at,
  };
}

/* ---------------------------------------------------------------------------
   Prices
   --------------------------------------------------------------------------- */

/** Digits and at most one decimal point — what a price can contain. */
export function sanitisePrice(value: string): string {
  const cleaned = value.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  return rest.length === 0 ? whole : `${whole}.${rest.join("")}`;
}

/** What the TP cell holds when the trade had no target. */
export const NO_TP = "-";

/** A price, or the lone `-` that means "no take profit". */
export function sanitiseTakeProfit(value: string): string {
  return value.includes(NO_TP) ? NO_TP : sanitisePrice(value);
}

/** A positive finite number, or null for anything blank or half-typed. */
export function parsePrice(value: string): number | null {
  if (value.trim() === "" || value.trim() === ".") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * Why a set of levels cannot be a trade, or null when it can.
 *
 * A long risks below the entry and aims above it; a short is the mirror. The
 * database holds the same rule, so this is about saying it before Save.
 */
export function levelsProblem(
  direction: Direction | "",
  entry: number | null,
  stopLoss: number | null,
  takeProfit: number | null,
): string | null {
  if (entry === null || stopLoss === null || direction === "") return null;
  // No target is a valid trade; only a target on the wrong side is a typo.
  if (direction === "LONG") {
    if (stopLoss >= entry) return "On a long, the SL sits below the entry.";
    if (takeProfit !== null && takeProfit <= entry) return "On a long, the TP sits above the entry.";
  } else {
    if (stopLoss <= entry) return "On a short, the SL sits above the entry.";
    if (takeProfit !== null && takeProfit >= entry) return "On a short, the TP sits below the entry.";
  }
  return null;
}

/**
 * A typed price, tidied for storage without touching its digits: `.5` → `0.5`,
 * `1.12450` stays `1.12450`. Assumes it already passed `parsePrice`.
 */
export function normalisePrice(value: string): string {
  const trimmed = value.trim().replace(/\.$/, "");
  return trimmed.startsWith(".") ? `0${trimmed}` : trimmed;
}
