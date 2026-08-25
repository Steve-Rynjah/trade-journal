import { WEEKDAYS, dayNameOf, type Direction, type Trade, type Weekday } from "./types";

export type ResultSplit = {
  total: number;
  wins: number;
  losses: number;
  /** Share of trades that won, 0–100. */
  winRate: number;
};

export function splitResults(trades: Trade[]): ResultSplit {
  const wins = trades.filter((trade) => trade.result === "WIN").length;
  const losses = trades.filter((trade) => trade.result === "LOSE").length;

  return {
    total: trades.length,
    wins,
    losses,
    winRate: trades.length === 0 ? 0 : (wins / trades.length) * 100,
  };
}

/** How the LONG (or SHORT) trades on their own performed. */
export function splitByDirection(trades: Trade[], direction: Direction): ResultSplit {
  return splitResults(trades.filter((trade) => trade.direction === direction));
}

/* ---------------------------------------------------------------------------
   Month and year — chosen separately, and always a concrete pair so every view
   answers "how did I do in this month".
   --------------------------------------------------------------------------- */

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function monthOf(trade: Trade): number {
  return Number(trade.tradeDate.slice(5, 7));
}

export function yearOf(trade: Trade): number {
  return Number(trade.tradeDate.slice(0, 4));
}

/**
 * The last `back` years plus this one, newest first — and any year that already
 * holds trades, so an imported history is never unreachable.
 */
export function listYears(trades: Trade[], today = new Date(), back = 5): number[] {
  const current = today.getUTCFullYear();
  const years = new Set<number>();
  for (let offset = 0; offset <= back; offset += 1) years.add(current - offset);
  for (const trade of trades) years.add(yearOf(trade));
  return [...years].sort((a, b) => b - a);
}

/** Generic so callers keep their richer row type (e.g. with signed URLs). */
export function filterTrades<T extends Trade>(
  trades: T[],
  month: number,
  year: number,
): T[] {
  return trades.filter(
    (trade) => monthOf(trade) === month && yearOf(trade) === year,
  );
}

/* ---------------------------------------------------------------------------
   Version sheets

   The same month can be backtested more than once. Each run is a sheet — a
   (month, year, version) triple — and every view in the app is scoped to one,
   so `August 2026 v2` never shows a single row from `v1`.
   --------------------------------------------------------------------------- */

/** One sheet holds this many trades; the DB enforces it with a trigger too. */
export const MAX_TRADES_PER_SHEET = 25;

/**
 * The sheets every month offers — always these five, whether or not they hold
 * anything.
 *
 * Fixed rather than grown from the data: you decide to run August five times
 * before you have typed a single row, and a menu that reveals v2 only once v1
 * exists cannot be planned against.
 */
export const SHEET_VERSIONS = [1, 2, 3, 4, 5] as const;

export const FIRST_VERSION = SHEET_VERSIONS[0];
export const MAX_SHEET_VERSIONS = SHEET_VERSIONS[SHEET_VERSIONS.length - 1];

export function versionLabel(version: number): string {
  return `v${version}`;
}

export function isSheetVersion(version: number): boolean {
  return Number.isInteger(version) && version >= FIRST_VERSION && version <= MAX_SHEET_VERSIONS;
}

/** The trades on one sheet — the month, the year and the run, together. */
export function filterSheet<T extends Trade>(
  trades: T[],
  month: number,
  year: number,
  version: number,
): T[] {
  return filterTrades(trades, month, year).filter(
    (trade) => trade.version === version,
  );
}

/**
 * How many saved rows a page of the sheet shows.
 *
 * Six by default — enough of the week to read at a glance without the open row
 * at the top scrolling out of reach. The ceiling is a full sheet on one page.
 */
export const PAGE_SIZES = [6, 10, 15, MAX_TRADES_PER_SHEET] as const;
export const DEFAULT_PAGE_SIZE = 6;

/**
 * Every sheet of one version, whatever month it belongs to.
 *
 * `v1 Jan` and `v1 Aug` are the same run of the same strategy against different
 * months, so judging the run means reading them together — which is the one
 * question on Analytics that deliberately looks past the month on screen.
 */
export function filterVersion<T extends Trade>(trades: T[], version: number): T[] {
  return trades.filter((trade) => trade.version === version);
}

/** How many distinct months a set of trades spans. */
export function monthsCovered(trades: Trade[]): number {
  return new Set(trades.map((trade) => trade.tradeDate.slice(0, 7))).size;
}

/** How full a sheet is, and whether it will take another row. */
export function sheetCapacity(count: number): {
  used: number;
  limit: number;
  remaining: number;
  full: boolean;
} {
  return {
    used: count,
    limit: MAX_TRADES_PER_SHEET,
    remaining: Math.max(0, MAX_TRADES_PER_SHEET - count),
    full: count >= MAX_TRADES_PER_SHEET,
  };
}

/* ---------------------------------------------------------------------------
   The calendar grid
   --------------------------------------------------------------------------- */

export type CalendarCell<T extends Trade> = {
  /** ISO `YYYY-MM-DD`. */
  iso: string;
  dayOfMonth: number;
  /** False for the leading and trailing days borrowed from the neighbouring months. */
  inMonth: boolean;
  trades: T[];
};

function isoOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Six weeks of cells starting on a Monday, so the grid never changes height as
 * the month changes and the columns always line up under M T W T F S S.
 */
export function monthGrid<T extends Trade>(
  trades: T[],
  month: number,
  year: number,
): CalendarCell<T>[] {
  const byDay = new Map<string, T[]>();
  for (const trade of trades) {
    const existing = byDay.get(trade.tradeDate);
    if (existing) existing.push(trade);
    else byDay.set(trade.tradeDate, [trade]);
  }

  const first = new Date(Date.UTC(year, month - 1, 1));
  // getUTCDay() is Sunday-based; the grid starts on Monday.
  const lead = (first.getUTCDay() + 6) % 7;

  const cursor = new Date(first);
  cursor.setUTCDate(1 - lead);

  return Array.from({ length: 42 }, () => {
    const iso = isoOf(cursor);
    const cell: CalendarCell<T> = {
      iso,
      dayOfMonth: cursor.getUTCDate(),
      inMonth: cursor.getUTCMonth() === month - 1,
      trades: byDay.get(iso) ?? [],
    };
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    return cell;
  });
}

/* ---------------------------------------------------------------------------
   Profit and loss
   --------------------------------------------------------------------------- */

export const ACCOUNT_SIZES = [5000, 10000, 25000, 50000, 100000] as const;
export type AccountSize = (typeof ACCOUNT_SIZES)[number];

/**
 * How much of the starting balance rides on each trade, as a percentage.
 *
 * Chosen on Analytics rather than fixed, because the same month reads very
 * differently at 0.5% and at 2% — that spread is the point of having the
 * control.
 */
export const RISK_PERCENTS = [0.5, 1, 1.5, 2] as const;
export type RiskPercent = (typeof RISK_PERCENTS)[number];

export const DEFAULT_RISK_PERCENT: RiskPercent = 1;

/** `0.5` → `0.5%`, the way the risk is labelled everywhere it appears. */
export function formatRiskPercent(percent: number): string {
  return `${percent}%`;
}

export type Pnl = {
  startingBalance: number;
  endingBalance: number;
  /** Ending minus starting: positive on a profitable month. */
  net: number;
  /** `net` as a percentage of the starting balance. */
  netPercent: number;
  riskPerTrade: number;
  /** The risk the figures above were computed at. */
  riskPercent: number;
};

/**
 * What the sheet would have returned at a fixed risk per trade.
 *
 * Risk is a share of the *starting* balance rather than the running one, so the
 * figure is a straight read of the sheet's edge instead of a compounding curve —
 * two identical months always produce the same number.
 *
 * A win returns the reward leg of its ratio; a loss costs the risk.
 */
export function computePnl(
  trades: Trade[],
  accountSize: number,
  riskPercent: number = DEFAULT_RISK_PERCENT,
): Pnl {
  const riskPerTrade = accountSize * (riskPercent / 100);

  const net = trades.reduce((total, trade) => {
    if (trade.result === "WIN") {
      return total + riskPerTrade * rewardLegOf(trade.ratio);
    }
    return total - riskPerTrade;
  }, 0);

  return {
    startingBalance: accountSize,
    endingBalance: accountSize + net,
    net,
    netPercent: accountSize === 0 ? 0 : (net / accountSize) * 100,
    riskPerTrade,
    riskPercent,
  };
}

/* ---------------------------------------------------------------------------
   Prop firm terms

   A funded account is not simply "what did I make": a winning month is split
   with the firm, and a losing one eats into a drawdown allowance that ends the
   account when it runs out. Those are two different questions, so the card
   answers whichever one the month actually asked.
   --------------------------------------------------------------------------- */

/** The trader's side of the split. The firm keeps the rest. */
export const TRADER_SPLIT = 0.8;

/**
 * How far the account may fall before it is gone, as a share of its size.
 *
 * 10% is the common total-drawdown figure, and matches the worked example this
 * was specified with: a 5k account may lose $500. Change this one number to run
 * a stricter set of terms.
 */
export const MAX_DRAWDOWN_PERCENT = 10;

export type ProfitSplit = {
  /** What the trader takes home. */
  trader: number;
  /** What the firm keeps. */
  firm: number;
  /** The trader's share as a percentage, for the label. */
  traderPercent: number;
};

/** The 80/20 on a winning month. Meaningless on a losing one — see below. */
export function computeSplit(net: number): ProfitSplit {
  const profit = Math.max(0, net);
  const trader = profit * TRADER_SPLIT;
  return {
    trader,
    firm: profit - trader,
    traderPercent: Math.round(TRADER_SPLIT * 100),
  };
}

export type Drawdown = {
  /** The whole allowance, in dollars. */
  limit: number;
  /** How much of it this sheet has spent. */
  used: number;
  /** What is left before the account is gone. */
  remaining: number;
  /** `used` as a share of the limit, 0–100, for the meter. */
  usedPercent: number;
  /** The allowance has been spent: nothing is left. */
  breached: boolean;
};

/**
 * What is left of the drawdown allowance after a losing sheet.
 *
 * Only losses count against it — a profitable month spends none of it, so
 * `used` floors at zero rather than going negative and inventing headroom.
 */
export function computeDrawdown(net: number, accountSize: number): Drawdown {
  const limit = accountSize * (MAX_DRAWDOWN_PERCENT / 100);
  const used = Math.max(0, -net);
  const remaining = Math.max(0, limit - used);

  return {
    limit,
    used,
    remaining,
    usedPercent: limit === 0 ? 0 : Math.min(100, (used / limit) * 100),
    breached: used >= limit && limit > 0,
  };
}

/** `1 : 2.5` → `2.5`. Falls back to 1 so a malformed ratio never yields NaN. */
export function rewardLegOf(ratio: string): number {
  const reward = Number(ratio.split(":")[1]?.trim());
  return Number.isFinite(reward) && reward > 0 ? reward : 1;
}

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** `+$200` / `−$200`, with a true minus sign rather than a hyphen. */
export function formatSignedMoney(amount: number): string {
  const rounded = Math.round(amount);
  if (rounded === 0) return formatMoney(0);
  const sign = rounded > 0 ? "+" : "−";
  return `${sign}${formatMoney(Math.abs(rounded))}`;
}

/* ---------------------------------------------------------------------------
   Days
   --------------------------------------------------------------------------- */

export type DayVerdict = "winning" | "losing" | "even";

/**
 * How a single date closed. Same rule the calendar tints by, so the two never
 * disagree about what counts as a green day.
 */
export function verdictOf(trades: Trade[]): DayVerdict {
  const wins = trades.filter((trade) => trade.result === "WIN").length;
  const losses = trades.length - wins;
  if (wins > losses) return "winning";
  if (losses > wins) return "losing";
  return "even";
}

export type WeekdayDays = {
  day: Weekday;
  /** `Mon` — the row label. */
  short: string;
  winning: number;
  losing: number;
  traded: number;
  /** Winning days minus losing days: the weekday's standing, at a glance. */
  net: number;
};

/** Winning and losing days per weekday, Monday first. */
export function tradingDaysByWeekday(trades: Trade[]): WeekdayDays[] {
  const byDate = new Map<string, Trade[]>();
  for (const trade of trades) {
    const existing = byDate.get(trade.tradeDate);
    if (existing) existing.push(trade);
    else byDate.set(trade.tradeDate, [trade]);
  }

  const tally = new Map<string, { winning: number; losing: number; traded: number }>();
  for (const day of WEEKDAYS) tally.set(day, { winning: 0, losing: 0, traded: 0 });

  for (const [date, dayTrades] of byDate) {
    const bucket = tally.get(dayNameOf(date));
    if (!bucket) continue; // Weekend rows cannot exist, but never assume it.
    bucket.traded += 1;
    const verdict = verdictOf(dayTrades);
    if (verdict === "winning") bucket.winning += 1;
    else if (verdict === "losing") bucket.losing += 1;
  }

  return WEEKDAYS.map((day) => {
    const counts = tally.get(day)!;
    return {
      day,
      short: day.slice(0, 3),
      ...counts,
      net: counts.winning - counts.losing,
    };
  });
}

/** `+4.0%` / `−4.0%`, matching the money formatter's true minus sign. */
export function formatSignedPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return "0.0%";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(1)}%`;
}
