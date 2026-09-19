/**
 * Everything about a sheet that can be counted rather than judged.
 *
 * The model is never asked to do arithmetic: every number it quotes is computed
 * here first and handed to it as fact. That is what keeps a report precise —
 * a language model asked to count wins from a list will eventually miscount,
 * and one miscounted figure makes the whole page untrustworthy.
 */

import { rewardLegOf } from "@/lib/stats";
import { WEEKDAYS, dayNameOf, type Trade } from "@/lib/types";

/** What one trade returned, in units of the risk taken. */
export function rOf(trade: Trade): number {
  return trade.result === "WIN" ? rewardLegOf(trade.ratio) : -1;
}

export type Cohort = {
  label: string;
  trades: number;
  wins: number;
  losses: number;
  /** 0–100. Zero trades reads as 0 rather than NaN. */
  winRate: number;
  /** Summed R — the honest measure, since a 1:3 win is not a 1:1 win. */
  netR: number;
};

function cohort(label: string, trades: Trade[]): Cohort {
  const wins = trades.filter((trade) => trade.result === "WIN").length;
  return {
    label,
    trades: trades.length,
    wins,
    losses: trades.length - wins,
    winRate: trades.length === 0 ? 0 : round((wins / trades.length) * 100),
    netR: round(trades.reduce((total, trade) => total + rOf(trade), 0)),
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Oldest first — the order they were actually taken in. */
function chronological(trades: Trade[]): Trade[] {
  return [...trades].sort((a, b) =>
    a.tradeDate === b.tradeDate
      ? a.createdAt.localeCompare(b.createdAt)
      : a.tradeDate.localeCompare(b.tradeDate),
  );
}

export type Streaks = {
  longestWin: number;
  longestLoss: number;
  /** Positive while winning, negative while losing — how the sheet ended. */
  current: number;
};

function streaksOf(ordered: Trade[]): Streaks {
  let longestWin = 0;
  let longestLoss = 0;
  let run = 0;

  for (const trade of ordered) {
    const won = trade.result === "WIN";
    run = won ? Math.max(1, run + 1) : Math.min(-1, run - 1);
    if (run > longestWin) longestWin = run;
    if (-run > longestLoss) longestLoss = -run;
  }

  return { longestWin, longestLoss, current: run };
}

export type DayFacts = {
  date: string;
  weekday: string;
  trades: number;
  wins: number;
  netR: number;
};

function byDay(ordered: Trade[]): DayFacts[] {
  const days = new Map<string, Trade[]>();
  for (const trade of ordered) {
    const existing = days.get(trade.tradeDate);
    if (existing) existing.push(trade);
    else days.set(trade.tradeDate, [trade]);
  }

  return [...days].map(([date, dayTrades]) => ({
    date,
    weekday: dayNameOf(date),
    trades: dayTrades.length,
    wins: dayTrades.filter((trade) => trade.result === "WIN").length,
    netR: round(dayTrades.reduce((total, trade) => total + rOf(trade), 0)),
  }));
}

/**
 * Trades taken on the same day, after a loss on that day.
 *
 * The closest thing the journal can see to revenge trading: it has dates but no
 * clock, so "after" means later in the day's insertion order. Reported as a
 * count and a record rather than as an accusation — the model is told what the
 * number means and left to decide whether this sheet shows the habit.
 */
export type AfterLoss = {
  taken: number;
  wins: number;
  netR: number;
};

function afterLossOf(ordered: Trade[]): AfterLoss {
  const followUps: Trade[] = [];
  let lostToday = false;
  let day = "";

  for (const trade of ordered) {
    if (trade.tradeDate !== day) {
      day = trade.tradeDate;
      lostToday = false;
    }
    if (lostToday) followUps.push(trade);
    if (trade.result === "LOSE") lostToday = true;
  }

  return {
    taken: followUps.length,
    wins: followUps.filter((trade) => trade.result === "WIN").length,
    netR: round(followUps.reduce((total, trade) => total + rOf(trade), 0)),
  };
}

export type SheetFacts = {
  overall: Cohort;
  /** R across the sheet, per trade — the expectancy of this run. */
  expectancyR: number;
  bestTradeR: number;
  worstTradeR: number;
  byDirection: Cohort[];
  byBias: Cohort[];
  /** Bias and direction agreeing (bullish + long) against fighting each other. */
  byAlignment: Cohort[];
  byWeekday: Cohort[];
  byRatio: Cohort[];
  streaks: Streaks;
  days: DayFacts[];
  daysTraded: number;
  busiestDay: DayFacts | null;
  afterLoss: AfterLoss;
  /** How much of the sheet was actually journalled, which the advice depends on. */
  withRemarks: number;
  withScreenshot: number;
};

const ALIGNED = "Bias and direction agree";
const AGAINST = "Direction fights the bias";

function alignmentOf(trade: Trade): string {
  const agrees =
    (trade.bias === "BULLISH" && trade.direction === "LONG") ||
    (trade.bias === "BEARISH" && trade.direction === "SHORT");
  return agrees ? ALIGNED : AGAINST;
}

/** Monday first, however the month happened to start. */
function inWeekOrder(rows: Cohort[]): Cohort[] {
  const order = new Map<string, number>(WEEKDAYS.map((day, index) => [day, index]));
  return [...rows].sort(
    (a, b) => (order.get(a.label) ?? 99) - (order.get(b.label) ?? 99),
  );
}

/** Only the weekdays and ratios that actually occur — empty rows teach nothing. */
function groupBy(trades: Trade[], key: (trade: Trade) => string): Cohort[] {
  const groups = new Map<string, Trade[]>();
  for (const trade of trades) {
    const name = key(trade);
    const existing = groups.get(name);
    if (existing) existing.push(trade);
    else groups.set(name, [trade]);
  }
  return [...groups].map(([name, group]) => cohort(name, group));
}

export function sheetFacts(trades: Trade[]): SheetFacts {
  const ordered = chronological(trades);
  const rs = ordered.map(rOf);
  const days = byDay(ordered);

  return {
    overall: cohort("Whole sheet", ordered),
    expectancyR:
      ordered.length === 0
        ? 0
        : round(rs.reduce((total, r) => total + r, 0) / ordered.length),
    bestTradeR: rs.length === 0 ? 0 : round(Math.max(...rs)),
    worstTradeR: rs.length === 0 ? 0 : round(Math.min(...rs)),
    byDirection: groupBy(ordered, (trade) => trade.direction),
    byBias: groupBy(ordered, (trade) => trade.bias),
    byAlignment: groupBy(ordered, alignmentOf),
    byWeekday: inWeekOrder(groupBy(ordered, (trade) => dayNameOf(trade.tradeDate))),
    byRatio: groupBy(ordered, (trade) => trade.ratio),
    streaks: streaksOf(ordered),
    days,
    daysTraded: days.length,
    busiestDay:
      days.length === 0
        ? null
        : days.reduce((most, day) => (day.trades > most.trades ? day : most)),
    afterLoss: afterLossOf(ordered),
    withRemarks: ordered.filter((trade) => (trade.remarks ?? "").trim() !== "").length,
    withScreenshot: ordered.filter((trade) => trade.screenshotPath !== null).length,
  };
}

/** The rows themselves, in the order taken, small enough to send whole. */
export function tradeLines(trades: Trade[]): string[] {
  return chronological(trades).map((trade, index) => {
    const remarks = (trade.remarks ?? "").trim();
    return [
      `${index + 1}.`,
      trade.tradeDate,
      `(${dayNameOf(trade.tradeDate)})`,
      trade.direction,
      `bias ${trade.bias}`,
      `RR ${trade.ratio}`,
      trade.result,
      `${rOf(trade) > 0 ? "+" : ""}${rOf(trade)}R`,
      remarks === "" ? "no note" : `note: ${remarks}`,
    ].join(" ");
  });
}
