export const BIASES = ["BULLISH", "BEARISH"] as const;
export const DIRECTIONS = ["LONG", "SHORT"] as const;
export const RESULTS = ["WIN", "LOSE"] as const;

export type Bias = (typeof BIASES)[number];
export type Direction = (typeof DIRECTIONS)[number];
export type TradeResult = (typeof RESULTS)[number];

/** What a fresh row starts with — the ratio taken most often. */
export const DEFAULT_RATIO = "1 : 2";
export const MAX_RATIO_LENGTH = 32;

export type Trade = {
  id: string;
  /** ISO `YYYY-MM-DD`. Always a weekday. */
  tradeDate: string;
  /**
   * Which sheet of the month this trade belongs to.
   *
   * A month can be backtested more than once; each run is its own sheet, so
   * `August 2026 v2` is a separate 25-row page from `August 2026 v1`.
   */
  version: number;
  bias: Bias;
  direction: Direction;
  /** Free text, exactly as typed: `1 : 2`, `1 : 1.5`, anything. */
  ratio: string;
  result: TradeResult;
  remarks: string | null;
  /** Object path in the screenshots bucket. Only ever set on a LOSE. */
  screenshotPath: string | null;
  createdAt: string;
};

/** A trade plus a freshly minted signed URL for its screenshot. */
export type TradeWithScreenshot = Trade & { screenshotUrl: string | null };

export type TradeRow = {
  id: string;
  trade_date: string;
  version: number;
  bias: Bias;
  direction: Direction;
  ratio: string | null;
  result: TradeResult;
  remarks: string | null;
  screenshot_path: string | null;
  created_at: string;
};

export function rowToTrade(row: TradeRow): Trade {
  return {
    id: row.id,
    tradeDate: row.trade_date,
    version: row.version,
    bias: row.bias,
    direction: row.direction,
    ratio: row.ratio ?? DEFAULT_RATIO,
    result: row.result,
    remarks: row.remarks,
    screenshotPath: row.screenshot_path,
    createdAt: row.created_at,
  };
}

/* ---------------------------------------------------------------------------
   Dates
   The forex week is Monday–Friday, so the Day column only ever offers those
   five and the date is kept in step with whichever one is chosen.
   --------------------------------------------------------------------------- */

export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/**
 * Day name for an ISO date string.
 *
 * Parsed as UTC on purpose — `new Date("2026-08-24")` is already UTC midnight,
 * so reading it back with local getters can slide the date a day backwards for
 * anyone west of Greenwich.
 */
export function dayNameOf(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return DAY_NAMES[date.getUTCDay()];
}

export function isWeekday(isoDate: string): boolean {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return day >= 1 && day <= 5;
}

export function isValidDate(isoDate: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(isoDate);
}

/**
 * Move a date onto another weekday without leaving its week, so picking
 * "Thursday" from the Day column shifts the date rather than contradicting it.
 */
export function withWeekday(isoDate: string, day: Weekday): string {
  if (!isValidDate(isoDate)) return isoDate;
  const date = new Date(`${isoDate}T00:00:00Z`);
  const target = WEEKDAYS.indexOf(day) + 1;
  date.setUTCDate(date.getUTCDate() + (target - date.getUTCDay()));
  return date.toISOString().slice(0, 10);
}

/* ---------------------------------------------------------------------------
   Months
   A sheet *is* a month, so every date the sheet accepts has to fall inside it.
   These are what keep the two from drifting apart.
   --------------------------------------------------------------------------- */

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** First and last day of a month, as the ISO strings a date input wants. */
export function monthBounds(month: number, year: number): {
  start: string;
  end: string;
} {
  // Day 0 of the next month is the last day of this one.
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${year}-${pad(month)}-01`,
    end: `${year}-${pad(month)}-${pad(last)}`,
  };
}

export function isInMonth(isoDate: string, month: number, year: number): boolean {
  return isValidDate(isoDate) && isoDate.slice(0, 7) === `${year}-${pad(month)}`;
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function step(isoDate: string, days: number): string {
  const cursor = new Date(`${isoDate}T00:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return iso(cursor);
}

/**
 * The date an untouched row shows: a weekday inside the given month — today
 * when that month is this one, otherwise the last weekday of it.
 *
 * Guaranteed to be in month, both ways. Walking back from the last day can only
 * land earlier, and walking forward from the 1st covers a month that opens on a
 * weekend, where walking back would leave for the month before.
 */
export function defaultDateInMonth(month: number, year: number): string {
  const { start, end } = monthBounds(month, year);
  const today = iso(new Date());

  let cursor = today >= start && today <= end ? today : end;
  while (cursor >= start && !isWeekday(cursor)) cursor = step(cursor, -1);
  if (cursor >= start) return cursor;

  cursor = start;
  while (cursor <= end && !isWeekday(cursor)) cursor = step(cursor, 1);
  return cursor;
}

/**
 * Pick a weekday without leaving the month.
 *
 * `withWeekday` alone stays inside the *week*, which is not the same thing: the
 * week holding 31 August also holds 4 September, so choosing "Friday" from the
 * last row of the month would quietly file the trade under the next one. When
 * the shift lands outside, step back a week — the same weekday, still in month.
 */
export function withWeekdayInMonth(
  isoDate: string,
  day: Weekday,
  month: number,
  year: number,
): string {
  const shifted = withWeekday(isoDate, day);
  if (isInMonth(shifted, month, year)) return shifted;

  const date = new Date(`${shifted}T00:00:00Z`);
  const { start } = monthBounds(month, year);
  // One week either way is always enough: the miss is at most a few days.
  date.setUTCDate(date.getUTCDate() + (shifted < start ? 7 : -7));

  const nudged = date.toISOString().slice(0, 10);
  return isInMonth(nudged, month, year) ? nudged : shifted;
}

/* ---------------------------------------------------------------------------
   Ratio
   Stored as one string (`1 : 2`), typed as two numbers. The colon is furniture,
   never something the journal has to key in.
   --------------------------------------------------------------------------- */

export function parseRatio(ratio: string): { risk: string; reward: string } {
  const [risk = "", reward = ""] = ratio.split(":");
  return { risk: risk.trim(), reward: reward.trim() };
}

/** Empty when either leg is missing, so the server rejects a half-typed ratio. */
export function composeRatio(risk: string, reward: string): string {
  const left = risk.trim();
  const right = reward.trim();
  if (left === "" || right === "") return "";
  return `${left} : ${right}`;
}

/** Digits and at most one decimal point — what a ratio leg can contain. */
export function sanitiseRatioLeg(value: string): string {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  return rest.length === 0 ? whole : `${whole}.${rest.join("")}`;
}

/** `2026-01-02` → `2 - Jan - 2026`, the date format used in the sheet. */
export function formatTradeDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  const month = date.toLocaleDateString("en-GB", {
    month: "short",
    timeZone: "UTC",
  });
  return `${date.getUTCDate()} - ${month} - ${date.getUTCFullYear()}`;
}
