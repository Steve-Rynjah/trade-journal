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
