/**
 * The Session Indicator — Asian, London and New York ranges.
 *
 * A port of the "FXN - Asian Session Range" Pine study. Nothing here executes
 * Pine; the script was read as a specification and the arithmetic redone
 * against this app's candles.
 *
 * Two things are worth knowing before changing anything:
 *
 * 1. Session hours are entered as New York wall-clock time, and each session
 *    says whether it follows US daylight saving. London and New York do, so
 *    they move an hour against UTC between March and November; Tokyo does not
 *    observe DST at all, so the Asian range stays where it is all year. The
 *    original Pine script ignored this entirely — its `tickerExchangeOffset`
 *    hack is a fixed offset — which is why its boxes drift for half the year.
 * 2. The shaded region is not a rectangle. It follows the *running* high and
 *    low as the session forms, which is why it has a staircase edge — that is
 *    the `fill()` of two live plots in the original, and it is the part that
 *    makes the indicator readable while a session is still open.
 */

import { TIMEFRAME_SECONDS, type Candle, type Timeframe } from "./candles";

/** Minutes east of UTC for New York in winter (EST) and summer (EDT). */
const EST_OFFSET_MINUTES = -300;
const EDT_OFFSET_MINUTES = -240;

const DAY_SECONDS = 86_400;

/** EURUSD moves in points of 0.00001; a pip is ten of them. */
const PIP = 0.0001;

/**
 * Where the forex day rolls over, in EST minutes past midnight.
 *
 * 17:00 New York is the standard daily close, and it is what the original uses
 * for its previous-day and weekly levels. Getting this wrong does not shift the
 * lines a little — it puts yesterday's high on the wrong side of the evening.
 */
const DAY_ROLL_MINUTES = 17 * 60;

export type SessionKey = "asian" | "london" | "newYork";

export const SESSION_KEYS: readonly SessionKey[] = ["asian", "london", "newYork"] as const;

export const SESSION_LABEL: Record<SessionKey, string> = {
  asian: "Asian",
  london: "London",
  newYork: "New York",
};

/** The single letter each range is tagged with, as in `A = 7.5`. */
export const SESSION_TAG: Record<SessionKey, string> = {
  asian: "A",
  london: "L",
  newYork: "N",
};

export type LineStyleName = "solid" | "dashed" | "dotted";
export type TextSize = "tiny" | "small" | "normal" | "large";

export type SessionConfig = {
  show: boolean;
  /** The `A = 7.5` pip label when the session closes. */
  showRange: boolean;
  /** All four are New York wall-clock times. */
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  /**
   * Whether these hours move with US daylight saving.
   *
   * On for London and New York, whose sessions are defined against the New York
   * clock and so shift an hour against UTC from March to November. Off for the
   * Asian range: Japan keeps no daylight saving, so Tokyo opens at the same
   * real instant all year and only *looks* like it moved if this is on.
   */
  followsDst: boolean;

  border: string;
  boxWidth: number;
  boxStyle: LineStyleName;
  /** High / low / mid lines, which are thicker than the box by default. */
  lineWidth: number;
  lineStyle: LineStyleName;
  midColor: string;
  midStyle: LineStyleName;
  fill: string;
  fillOpacity: number;
  textColor: string;
  textSize: TextSize;
};

export type LevelConfig = {
  show: boolean;
  color: string;
  width: number;
  style: LineStyleName;
  showLabel: boolean;
};

export type SessionSettings = {
  enabled: boolean;
  sessions: Record<SessionKey, SessionConfig>;
  /**
   * How far the Asian high / low / mid carry past the session, in EST.
   *
   * Only the Asian range gets these: they are the levels London and New York
   * are traded against, which is the whole point of the study.
   */
  extendHour: number;
  extendMinute: number;

  showAdr: boolean;
  /** Days back from the last candle that still get an ADR reading. */
  adrDays: number;
  /** How many daily bars the average is taken over. */
  adrLength: number;

  previousDay: LevelConfig & { showRange: boolean };
  lastWeek: LevelConfig;
  thisWeek: LevelConfig;
};

export const DEFAULT_SESSION_SETTINGS: SessionSettings = {
  enabled: true,
  sessions: {
    asian: {
      show: true,
      showRange: true,
      startHour: 20,
      startMinute: 0,
      endHour: 2,
      endMinute: 0,
      followsDst: false,
      border: "#2962ff",
      boxWidth: 1,
      boxStyle: "solid",
      lineWidth: 2,
      lineStyle: "dotted",
      midColor: "#ff9800",
      midStyle: "dotted",
      fill: "#2962ff",
      fillOpacity: 0.1,
      textColor: "#2962ff",
      textSize: "normal",
    },
    london: {
      show: true,
      showRange: true,
      startHour: 3,
      startMinute: 0,
      endHour: 7,
      endMinute: 0,
      followsDst: true,
      border: "#089981",
      boxWidth: 1,
      boxStyle: "solid",
      lineWidth: 2,
      lineStyle: "dotted",
      midColor: "#089981",
      midStyle: "dotted",
      fill: "#089981",
      fillOpacity: 0.1,
      textColor: "#089981",
      textSize: "normal",
    },
    newYork: {
      show: true,
      showRange: true,
      startHour: 8,
      startMinute: 0,
      endHour: 12,
      endMinute: 0,
      followsDst: true,
      border: "#b2b5be",
      boxWidth: 1,
      boxStyle: "solid",
      lineWidth: 2,
      lineStyle: "dotted",
      midColor: "#b2b5be",
      midStyle: "dotted",
      fill: "#b2b5be",
      fillOpacity: 0.1,
      textColor: "#b2b5be",
      textSize: "normal",
    },
  },
  extendHour: 11,
  extendMinute: 30,

  showAdr: true,
  adrDays: 1,
  adrLength: 21,

  previousDay: {
    show: true,
    color: "#ffeb3b",
    width: 1,
    style: "dashed",
    showLabel: false,
    showRange: false,
  },
  lastWeek: { show: true, color: "#ff9800", width: 1, style: "dashed", showLabel: true },
  thisWeek: { show: false, color: "#808000", width: 1, style: "dashed", showLabel: false },
};

/** One session on one day, with everything the renderer needs to paint it. */
export type SessionRange = {
  key: SessionKey;
  /** Nominal window, in real UTC epoch seconds. */
  start: number;
  end: number;
  high: number;
  low: number;
  mid: number;
  /** Range in pips, to one decimal — the number on the `A = 7.5` label. */
  pips: number;
  /**
   * The running high and low after each candle in the window.
   *
   * This is the staircase the shaded region traces. One entry per candle, so it
   * costs a little memory and saves recomputing the fold on every frame.
   */
  steps: { time: number; high: number; low: number }[];
  /** True once the window has closed, so a forming range can be drawn faintly. */
  complete: boolean;
};

/** A horizontal level that spans one forex day. */
export type LevelLine = {
  start: number;
  end: number;
  price: number;
  label: string;
};

export type SessionData = {
  ranges: SessionRange[];
  /** Asian high / low / mid, carried out to the extend time. */
  extensions: { start: number; end: number; high: number; low: number; mid: number }[];
  previousDay: LevelLine[];
  lastWeek: LevelLine[];
  thisWeek: LevelLine[];
  /** Average daily range in pips, keyed by the forex day it applies to. */
  adr: Map<number, number>;
};

/** Date of the `nth` given weekday in a month. `weekday` is 0 for Sunday. */
function nthWeekday(year: number, month: number, weekday: number, nth: number): number {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  return 1 + ((weekday - first + 7) % 7) + (nth - 1) * 7;
}

/**
 * US daylight saving, cached per year.
 *
 * Starts the second Sunday in March at 02:00 EST (07:00 UTC) and ends the first
 * Sunday in November at 02:00 EDT (06:00 UTC). Both boundaries fall on a Sunday
 * morning, when the market is shut — so no candle ever lands inside the
 * ambiguous hour and the transition needs no special handling.
 */
const dstWindows = new Map<number, { start: number; end: number }>();

function dstWindow(year: number): { start: number; end: number } {
  let window = dstWindows.get(year);
  if (!window) {
    window = {
      start: Date.UTC(year, 2, nthWeekday(year, 2, 0, 2), 7) / 1000,
      end: Date.UTC(year, 10, nthWeekday(year, 10, 0, 1), 6) / 1000,
    };
    dstWindows.set(year, window);
  }
  return window;
}

function isUsDst(time: number): boolean {
  const year = new Date(time * 1000).getUTCFullYear();
  const { start, end } = dstWindow(year);
  return time >= start && time < end;
}

/** Minutes east of UTC for a session's clock at a given instant. */
function offsetAt(time: number, followsDst: boolean): number {
  return followsDst && isUsDst(time) ? EDT_OFFSET_MINUTES : EST_OFFSET_MINUTES;
}

/**
 * Epoch seconds for a wall-clock time in the session zone, on a given day.
 *
 * The offset depends on the answer, so it is guessed at standard time first and
 * then re-read. The guess can only be an hour out, and only within an hour of a
 * transition — which is a Sunday dawn, with no candles in it.
 */
function estMoment(
  dayIndex: number,
  hour: number,
  minute: number,
  followsDst: boolean,
): number {
  const minutes = hour * 60 + minute;
  const guess = dayIndex * DAY_SECONDS + (minutes - EST_OFFSET_MINUTES) * 60;
  return dayIndex * DAY_SECONDS + (minutes - offsetAt(guess, followsDst)) * 60;
}

/** Which session-zone day a real instant falls in, and how far into it. */
function estParts(time: number, followsDst: boolean): { day: number; minutes: number } {
  const local = time + offsetAt(time, followsDst) * 60;
  const day = Math.floor(local / DAY_SECONDS);
  return { day, minutes: (local - day * DAY_SECONDS) / 60 };
}

/**
 * Which forex day an instant belongs to — the 17:00 New York roll, not midnight.
 *
 * Returned as the day index the session *opened* on, so Sunday evening and
 * Monday morning share one number. The roll follows DST, because the daily
 * close is a wall-clock time in New York like everything else here.
 */
function forexDay(time: number): number {
  const { day, minutes } = estParts(time, true);
  return minutes >= DAY_ROLL_MINUTES ? day : day - 1;
}

/** A session's window as minutes past local midnight. */
function windowOf(config: SessionConfig): { start: number; end: number; wraps: boolean } {
  const start = config.startHour * 60 + config.startMinute;
  const end = config.endHour * 60 + config.endMinute;
  // 20:00 to 02:00 runs past midnight; 03:00 to 07:00 does not.
  return { start, end, wraps: end <= start };
}

function insideWindow(minutes: number, w: { start: number; end: number; wraps: boolean }): boolean {
  return w.wraps ? minutes >= w.start || minutes < w.end : minutes >= w.start && minutes < w.end;
}

/**
 * How far ahead "skip to the next session" will look, in 5-minute bars.
 *
 * Eight days. The longest gap between two same-name sessions is a weekend, so
 * anything further out means the data has run out rather than that the search
 * needs more room — and without a cap this walks the rest of the array every
 * time the replay nears the end.
 */
const SKIP_SEARCH_BARS = (8 * 24 * 60) / 5;

/**
 * Index of the candle that opens the next `config` session after `fromIndex`.
 *
 * Takes the *5-minute base array*, because that is what the replay cursor
 * indexes. Walks the candles rather than computing the next start time and
 * seeking to it: a nominal start can land in the middle of a weekend, and
 * seeking to it would drop the replay on Sunday's open instead of on the
 * session the person asked for. Stepping over real candles cannot do that.
 *
 * Starting *inside* a session skips the rest of it — asking for "the next
 * London" while London is on screen means the one tomorrow, not this one.
 */
export function nextSessionIndex(
  base: Candle[],
  fromIndex: number,
  config: SessionConfig,
): number | null {
  if (fromIndex < 0 || fromIndex >= base.length) return null;

  const w = windowOf(config);
  const inside = (i: number) =>
    insideWindow(estParts(base[i].time, config.followsDst).minutes, w);

  let was = inside(fromIndex);
  const limit = Math.min(base.length, fromIndex + 1 + SKIP_SEARCH_BARS);

  for (let i = fromIndex + 1; i < limit; i++) {
    const now = inside(i);
    if (now && !was) return i;
    was = now;
  }

  return null;
}

/** Folds candles into forex days (17:00 EST to 17:00 EST). */
function dailyBars(candles: Candle[]): { day: number; high: number; low: number }[] {
  const bars: { day: number; high: number; low: number }[] = [];
  let current: { day: number; high: number; low: number } | null = null;

  for (const candle of candles) {
    const day = forexDay(candle.time);
    if (!current || current.day !== day) {
      if (current) bars.push(current);
      current = { day, high: candle.high, low: candle.low };
      continue;
    }
    if (candle.high > current.high) current.high = candle.high;
    if (candle.low < current.low) current.low = candle.low;
  }

  if (current) bars.push(current);
  return bars;
}

/**
 * Folds candles into forex weeks, opening Sunday 17:00 EST.
 *
 * The epoch fell on a Thursday, so the day index is rotated by four to put a
 * week boundary where the market actually opens. Off-by-one here does not look
 * broken, it just quietly reports the wrong week's high.
 */
function weekOf(day: number): number {
  return Math.floor((day + 4) / 7);
}

function weeklyBars(candles: Candle[]): { week: number; high: number; low: number }[] {
  const bars: { week: number; high: number; low: number }[] = [];
  let current: { week: number; high: number; low: number } | null = null;

  for (const candle of candles) {
    const week = weekOf(forexDay(candle.time));
    if (!current || current.week !== week) {
      if (current) bars.push(current);
      current = { week, high: candle.high, low: candle.low };
      continue;
    }
    if (candle.high > current.high) current.high = candle.high;
    if (candle.low < current.low) current.low = candle.low;
  }

  if (current) bars.push(current);
  return bars;
}

const toPips = (span: number) => Math.round((span / PIP) * 10) / 10;

/**
 * Whether the indicator draws at all on this timeframe.
 *
 * The original hides itself above the hour — a session box on a 4h chart spans
 * one or two candles and says nothing. Same rule, expressed against the four
 * timeframes this app offers.
 */
export function drawsOn(timeframe: Timeframe): boolean {
  return TIMEFRAME_SECONDS[timeframe] <= 3_600;
}

/**
 * Everything the indicator draws, computed once for a set of candles.
 *
 * Walks the candle array a handful of times rather than once per session, which
 * is still linear and very much cheaper than the per-frame alternative. The
 * result is memoised by the caller against the candles and the settings.
 */
export function computeSessions(
  candles: Candle[],
  settings: SessionSettings,
  timeframe: Timeframe,
): SessionData {
  const empty: SessionData = {
    ranges: [],
    extensions: [],
    previousDay: [],
    lastWeek: [],
    thisWeek: [],
    adr: new Map(),
  };

  if (!settings.enabled || candles.length === 0 || !drawsOn(timeframe)) return empty;

  const ranges: SessionRange[] = [];
  const extensions: SessionData["extensions"] = [];
  const lastTime = candles[candles.length - 1].time;

  for (const key of SESSION_KEYS) {
    const config = settings.sessions[key];
    if (!config.show) continue;

    const w = windowOf(config);

    /** Session-zone day the window opened on, to the range being built. */
    const open = new Map<number, SessionRange>();

    for (const candle of candles) {
      const { day, minutes } = estParts(candle.time, config.followsDst);
      if (!insideWindow(minutes, w)) continue;

      // After midnight on a wrapping session, the candle belongs to the window
      // that opened the evening before.
      const openedOn = w.wraps && minutes < w.end ? day - 1 : day;

      let range = open.get(openedOn);
      if (!range) {
        const start = estMoment(openedOn, config.startHour, config.startMinute, config.followsDst);
        const end = estMoment(
          openedOn + (w.wraps ? 1 : 0),
          config.endHour,
          config.endMinute,
          config.followsDst,
        );
        range = {
          key,
          start,
          end,
          high: candle.high,
          low: candle.low,
          mid: 0,
          pips: 0,
          steps: [],
          complete: false,
        };
        open.set(openedOn, range);
        ranges.push(range);
      }

      if (candle.high > range.high) range.high = candle.high;
      if (candle.low < range.low) range.low = candle.low;
      range.steps.push({ time: candle.time, high: range.high, low: range.low });
    }

    for (const range of open.values()) {
      range.mid = (range.high + range.low) / 2;
      range.pips = toPips(range.high - range.low);
      range.complete = lastTime >= range.end;

      // The Asian range is the one London and New York get traded against, so
      // only it carries its levels forward.
      if (key === "asian") {
        const openedOn = estParts(range.start, config.followsDst).day;
        const endsAfterMidnight = range.end > estMoment(openedOn + 1, 0, 0, config.followsDst);
        extensions.push({
          start: range.end,
          end: estMoment(
            openedOn + (endsAfterMidnight ? 1 : 0),
            settings.extendHour,
            settings.extendMinute,
            config.followsDst,
          ),
          high: range.high,
          low: range.low,
          mid: range.mid,
        });
      }
    }
  }

  ranges.sort((a, b) => a.start - b.start);

  // ---- daily and weekly levels --------------------------------------------
  const daily = dailyBars(candles);

  const previousDay: LevelLine[] = [];
  const lastWeek: LevelLine[] = [];
  const thisWeek: LevelLine[] = [];
  const adr = new Map<number, number>();

  const lastDay = daily.length > 0 ? daily[daily.length - 1].day : 0;

  for (let i = 0; i < daily.length; i++) {
    const bar = daily[i];
    const start = estMoment(bar.day, 17, 0, true);
    const end = estMoment(bar.day + 1, 17, 0, true);

    if (settings.previousDay.show && i > 0) {
      const yesterday = daily[i - 1];
      const span = settings.previousDay.showRange ? ` (${toPips(yesterday.high - yesterday.low)})` : "";
      previousDay.push({ start, end, price: yesterday.high, label: `YH${span}` });
      previousDay.push({ start, end, price: yesterday.low, label: "YL" });
    }

    // Only the most recent days carry an ADR reading, as in the original —
    // a number on every session of a two-year backtest is noise.
    if (settings.showAdr && bar.day > lastDay - settings.adrDays && i >= settings.adrLength) {
      let total = 0;
      for (let back = 1; back <= settings.adrLength; back++) {
        total += daily[i - back].high - daily[i - back].low;
      }
      adr.set(bar.day, Math.round(toPips(total / settings.adrLength)));
    }
  }

  const weekly = weeklyBars(candles);
  const weekPosition = new Map(weekly.map((bar, i) => [bar.week, i]));

  for (const bar of daily) {
    const start = estMoment(bar.day, 17, 0, true);
    const end = estMoment(bar.day + 1, 17, 0, true);
    const at = weekPosition.get(weekOf(bar.day));
    if (at === undefined) continue;

    if (settings.lastWeek.show && at > 0) {
      lastWeek.push({ start, end, price: weekly[at - 1].high, label: "PWH" });
      lastWeek.push({ start, end, price: weekly[at - 1].low, label: "PWL" });
    }
    if (settings.thisWeek.show) {
      thisWeek.push({ start, end, price: weekly[at].high, label: "WH" });
      thisWeek.push({ start, end, price: weekly[at].low, label: "WL" });
    }
  }

  return { ranges, extensions, previousDay, lastWeek, thisWeek, adr };
}

/**
 * The same data as it stood when `cutoff` was the newest candle.
 *
 * Replay is the reason this exists. Folding the sessions is a linear pass over
 * every candle, far too slow to redo on each tick, so the fold runs once
 * against the whole series and the result is trimmed here instead. A range that
 * had not opened yet disappears; one that was still forming is rebuilt from the
 * steps that had actually printed — which is exactly the half-drawn box a
 * trader would have been looking at, and never a bar of lookahead.
 */
export function clampSessions(data: SessionData, cutoff: number): SessionData {
  const ranges: SessionRange[] = [];

  for (const range of data.ranges) {
    if (range.start > cutoff) continue;
    if (range.end <= cutoff) {
      ranges.push(range);
      continue;
    }

    const steps = range.steps.filter((step) => step.time <= cutoff);
    if (steps.length === 0) continue;

    const last = steps[steps.length - 1];
    ranges.push({
      ...range,
      steps,
      high: last.high,
      low: last.low,
      mid: (last.high + last.low) / 2,
      pips: toPips(last.high - last.low),
      complete: false,
    });
  }

  const trim = (lines: LevelLine[]) =>
    lines
      .filter((line) => line.start <= cutoff)
      .map((line) => (line.end <= cutoff ? line : { ...line, end: cutoff }));

  return {
    ranges,
    extensions: data.extensions
      .filter((extension) => extension.start <= cutoff)
      .map((extension) =>
        extension.end <= cutoff ? extension : { ...extension, end: cutoff },
      ),
    previousDay: trim(data.previousDay),
    lastWeek: trim(data.lastWeek),
    thisWeek: trim(data.thisWeek),
    adr: data.adr,
  };
}

/** The forex day an instant belongs to, for looking an ADR reading up. */
export function adrDayOf(time: number): number {
  return forexDay(time);
}

/** Canvas dash pattern for a style name, at a given line width. */
export function dashFor(style: LineStyleName, width: number): number[] {
  if (style === "dashed") return [width * 4, width * 3];
  if (style === "dotted") return [width, width * 2];
  return [];
}

export const TEXT_PX: Record<TextSize, number> = {
  tiny: 9,
  small: 11,
  normal: 13,
  large: 16,
};

const STORAGE_KEY = "backtest.session-indicator";

/**
 * Reads the saved indicator settings.
 *
 * Merged one level deep per session so a build that adds a field does not wipe
 * what someone had configured, and guarded throughout because a private window
 * makes localStorage throw rather than return null.
 */
export function loadSessionSettings(): SessionSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SESSION_SETTINGS;
    const saved = JSON.parse(raw) as Partial<SessionSettings>;
    const sessions = { ...DEFAULT_SESSION_SETTINGS.sessions };
    for (const key of SESSION_KEYS) {
      sessions[key] = { ...sessions[key], ...saved.sessions?.[key] };
    }
    return {
      ...DEFAULT_SESSION_SETTINGS,
      ...saved,
      sessions,
      previousDay: { ...DEFAULT_SESSION_SETTINGS.previousDay, ...saved.previousDay },
      lastWeek: { ...DEFAULT_SESSION_SETTINGS.lastWeek, ...saved.lastWeek },
      thisWeek: { ...DEFAULT_SESSION_SETTINGS.thisWeek, ...saved.thisWeek },
    };
  } catch {
    return DEFAULT_SESSION_SETTINGS;
  }
}

export function saveSessionSettings(settings: SessionSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // A preference that cannot be stored is not worth failing a render over.
  }
}
