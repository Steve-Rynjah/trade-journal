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

/** Every trade risks the same 1% of the starting balance. */
export const RISK_FRACTION = 0.01;

export type Pnl = {
  startingBalance: number;
  endingBalance: number;
  /** Ending minus starting: positive on a profitable month. */
  net: number;
  /** `net` as a percentage of the starting balance. */
  netPercent: number;
  riskPerTrade: number;
};

/**
 * What the month would have returned at a fixed 1% risk per trade.
 *
 * Risk is 1% of the *starting* balance rather than the running one, so the
 * figure is a straight read of the month's edge instead of a compounding curve —
 * two identical months always produce the same number.
 *
 * A win returns the reward leg of its ratio; a loss costs the 1%.
 */
export function computePnl(trades: Trade[], accountSize: number): Pnl {
  const riskPerTrade = accountSize * RISK_FRACTION;

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
