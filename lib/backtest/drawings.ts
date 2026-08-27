/**
 * The drawing model, and the geometry the chart needs to paint and hit-test it.
 *
 * Every anchor is stored as `{ time, price }`, never as pixels. That is what
 * lets a support line drawn on the 1h chart sit at the same level on the 5m
 * chart, survive a zoom, and mean the same thing tomorrow. Pixels are derived
 * at paint time and thrown away.
 */

import type { Candle, Timeframe } from "./candles";
import { TIMEFRAME_SECONDS } from "./candles";

export type ToolKind =
  | "rectangle"
  | "trendline"
  | "horizontal-ray"
  | "vertical-line"
  | "long-position"
  | "short-position";

export type Anchor = { time: number; price: number };

export type Drawing = {
  id: string;
  kind: ToolKind;
  /**
   * Meaning depends on `kind`:
   * - rectangle / trendline: two opposite corners, or the two ends
   * - horizontal-ray: one origin; the ray runs right forever
   * - vertical-line: one origin; only `time` is read
   * - long/short-position: [entry, target, stop] — `time` of [0] and [1] give
   *   the box's left and right edges, [2] contributes only its price
   */
  points: Anchor[];
  /** Line / border colour. */
  color: string;
  lineWidth: number;

  // Every field below is optional so a set saved by an earlier build still
  // loads: the renderer falls back to the defaults rather than drawing nothing.

  /** Rectangle background. */
  fill?: string;
  showFill?: boolean;
  /** How solid the background sits over the candles. */
  fillOpacity?: number;
  /** The outline. Turning it off leaves a bare tinted block. */
  showBorder?: boolean;
  /** Rectangle and ray: carry on to the right edge of the chart. */
  extend?: boolean;
  /** Position boxes. */
  stopColor?: string;
  targetColor?: string;
  /** Position sizing, which is what turns a box into money on the labels. */
  accountSize?: number;
  riskPercent?: number;
  /** A note rendered in a gap in the middle of a trend line. */
  text?: string;

  /** Set when the drawing came from a saved set, so the UI can group them. */
  setId?: string;
  locked?: boolean;
};

export const DEFAULT_FILL_ALPHA = 0.15;
export const STOP_COLOR = "#f23645";
export const TARGET_COLOR = "#089981";
export const DEFAULT_ACCOUNT = 5_000;
export const DEFAULT_RISK_PERCENT = 1;

/** Reads a style field, falling back to what the tool looks like by default. */
export function styleOf(drawing: Drawing) {
  return {
    line: drawing.color,
    lineWidth: drawing.lineWidth,
    fill: drawing.fill ?? drawing.color,
    showFill: drawing.showFill ?? true,
    fillOpacity: drawing.fillOpacity ?? DEFAULT_FILL_ALPHA,
    showBorder: drawing.showBorder ?? true,
    extend: drawing.extend ?? false,
    stopColor: drawing.stopColor ?? STOP_COLOR,
    targetColor: drawing.targetColor ?? TARGET_COLOR,
    accountSize: drawing.accountSize ?? DEFAULT_ACCOUNT,
    riskPercent: drawing.riskPercent ?? DEFAULT_RISK_PERCENT,
  };
}

/** How many anchors a tool needs before it becomes a finished drawing. */
export const ANCHOR_COUNT: Record<ToolKind, number> = {
  rectangle: 2,
  trendline: 2,
  "horizontal-ray": 1,
  "vertical-line": 1,
  "long-position": 2,
  "short-position": 2,
};

export const TOOL_LABEL: Record<ToolKind, string> = {
  rectangle: "Rectangle",
  trendline: "Trend Line",
  "horizontal-ray": "Horizontal Ray",
  "vertical-line": "Vertical Line",
  "long-position": "Long Position",
  "short-position": "Short Position",
};

export const DEFAULT_COLOR = "#2962ff";

/** Neutral grey for a position's entry line — the mid tone of the picker's greys. */
export const ENTRY_LINE = "#787b86";

/**
 * How each tool looks before anyone touches it.
 *
 * A position's entry line is deliberately neutral grey: the green and red
 * belong to the target and the stop, and colouring the entry as well left three
 * competing signals across one small box. The width is a hairline for the same
 * reason — the fills carry the meaning, the line only marks where they meet.
 */
export const TOOL_DEFAULTS: Record<ToolKind, { color: string; lineWidth: number }> = {
  rectangle: { color: DEFAULT_COLOR, lineWidth: 2 },
  trendline: { color: DEFAULT_COLOR, lineWidth: 2 },
  "horizontal-ray": { color: DEFAULT_COLOR, lineWidth: 2 },
  "vertical-line": { color: DEFAULT_COLOR, lineWidth: 2 },
  "long-position": { color: ENTRY_LINE, lineWidth: 1 },
  "short-position": { color: ENTRY_LINE, lineWidth: 1 },
};

/**
 * Where a time sits on the chart's logical (index) axis, as a fraction.
 *
 * The chart can only turn a *candle's* time into an x coordinate, but drawings
 * live at arbitrary times — between two candles, or out past the last one. So
 * anchors are converted to a fractional index instead, which the time scale
 * will happily place anywhere, including beyond the data.
 */
export function timeToLogical(candles: Candle[], time: number, timeframe: Timeframe): number {
  if (candles.length === 0) return 0;

  const span = TIMEFRAME_SECONDS[timeframe];
  const first = candles[0].time;
  const last = candles[candles.length - 1].time;

  // Outside the data there are no candles to interpolate between, so step in
  // whole timeframe periods. Weekends make this approximate to the right of the
  // series, which is fine: nothing is anchored to a bar that does not exist.
  if (time <= first) return (time - first) / span;
  if (time >= last) return candles.length - 1 + (time - last) / span;

  let low = 0;
  let high = candles.length - 1;
  while (low < high - 1) {
    const mid = (low + high) >> 1;
    if (candles[mid].time <= time) low = mid;
    else high = mid;
  }

  const gap = candles[high].time - candles[low].time;
  return gap === 0 ? low : low + (time - candles[low].time) / gap;
}

/** The inverse of {@link timeToLogical}, for turning a click back into a time. */
export function logicalToTime(candles: Candle[], logical: number, timeframe: Timeframe): number {
  if (candles.length === 0) return 0;

  const span = TIMEFRAME_SECONDS[timeframe];
  if (logical <= 0) return candles[0].time + Math.round(logical * span);
  if (logical >= candles.length - 1) {
    return candles[candles.length - 1].time + Math.round((logical - (candles.length - 1)) * span);
  }

  const low = Math.floor(logical);
  const frac = logical - low;
  const a = candles[low].time;
  const b = candles[low + 1].time;
  return Math.round(a + (b - a) * frac);
}

/** Pixel positions an anchor resolves to, or null when it is off the scale. */
export type Screen = { x: number; y: number };

/** Distance from a point to the segment ab — the core of line hit-testing. */
export function distanceToSegment(p: Screen, a: Screen, b: Screen): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);

  // Project p onto ab, clamped to the segment rather than the infinite line.
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));

  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** True when the cursor is within `slop` pixels of the rectangle's outline. */
export function nearRectEdge(p: Screen, a: Screen, b: Screen, slop: number): boolean {
  const left = Math.min(a.x, b.x);
  const right = Math.max(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const bottom = Math.max(a.y, b.y);

  const insideX = p.x >= left - slop && p.x <= right + slop;
  const insideY = p.y >= top - slop && p.y <= bottom + slop;
  if (!insideX || !insideY) return false;

  const nearVertical = Math.abs(p.x - left) <= slop || Math.abs(p.x - right) <= slop;
  const nearHorizontal = Math.abs(p.y - top) <= slop || Math.abs(p.y - bottom) <= slop;
  return nearVertical || nearHorizontal;
}

/** True when the cursor is inside the rectangle, edges included. */
export function insideRect(p: Screen, a: Screen, b: Screen, slop = 0): boolean {
  return (
    p.x >= Math.min(a.x, b.x) - slop &&
    p.x <= Math.max(a.x, b.x) + slop &&
    p.y >= Math.min(a.y, b.y) - slop &&
    p.y <= Math.max(a.y, b.y) + slop
  );
}

/**
 * Everything the two position labels show.
 *
 * Quantity is derived the way a trader actually sizes: risk a fixed percentage
 * of the account across the distance to the stop. That makes the target amount
 * a real number rather than decoration, and it is why moving the stop changes
 * both labels at once.
 */
export type PositionStats = {
  /** Absolute price distance, e.g. 0.00070. */
  targetOffset: number;
  stopOffset: number;
  /** That distance as a percentage of the entry. */
  targetPercent: number;
  stopPercent: number;
  /** Pips — EURUSD moves in 0.0001. */
  targetPips: number;
  stopPips: number;
  targetAmount: number;
  stopAmount: number;
  quantity: number;
  ratio: number | null;
};

export function positionStats(drawing: Drawing): PositionStats | null {
  const [entry, target, stop] = drawing.points;
  if (!entry || !target || !stop) return null;

  const style = styleOf(drawing);
  const targetOffset = Math.abs(target.price - entry.price);
  const stopOffset = Math.abs(entry.price - stop.price);

  const riskAmount = (style.accountSize * style.riskPercent) / 100;
  // A stop on the entry has no distance to divide by; the position is not yet
  // a position, so the money columns stay at zero instead of becoming Infinity.
  const quantity = stopOffset < 1e-9 ? 0 : riskAmount / stopOffset;

  return {
    targetOffset,
    stopOffset,
    targetPercent: entry.price === 0 ? 0 : (targetOffset / entry.price) * 100,
    stopPercent: entry.price === 0 ? 0 : (stopOffset / entry.price) * 100,
    targetPips: targetOffset * 10_000,
    stopPips: stopOffset * 10_000,
    targetAmount: quantity * targetOffset,
    stopAmount: quantity * stopOffset,
    quantity,
    ratio: stopOffset < 1e-9 ? null : targetOffset / stopOffset,
  };
}

/** A fresh id that does not need a crypto polyfill on older Safari. */
export function newId(): string {
  return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The anchors a freshly-placed tool should get from a single click-drag.
 *
 * Positions are the odd one out. Dragging one out from a single point spends
 * the whole gesture at zero height, so every label reads 0.00000 and the ratio
 * is undefined — which is exactly what it used to do. Instead a position is
 * *placed*: the click fixes the entry and it arrives as a real 1:1 sized off
 * `risk`, ready to be adjusted by its handles.
 */
export function seedAnchors(kind: ToolKind, from: Anchor, to: Anchor, risk = 0): Anchor[] {
  if (kind === "horizontal-ray" || kind === "vertical-line") return [from];
  if (kind === "rectangle" || kind === "trendline") return [from, to];

  const long = kind === "long-position";
  const reward = risk;
  const width = Math.max(to.time - from.time, 0);

  return [
    from,
    { time: from.time + width, price: from.price + (long ? reward : -reward) },
    { time: from.time, price: from.price - (long ? risk : -risk) },
  ];
}

/**
 * Snaps a segment to the nearest quarter turn while shift is held.
 *
 * Twelve, three, six and nine o'clock only: a trend line drawn by eye is never
 * quite level, and "nearly horizontal" is a different claim from "horizontal".
 */
export function snapToQuarter(origin: Anchor, target: Anchor, pixels: { dx: number; dy: number }): Anchor {
  return Math.abs(pixels.dx) >= Math.abs(pixels.dy)
    ? { time: target.time, price: origin.price }
    : { time: origin.time, price: target.price };
}
