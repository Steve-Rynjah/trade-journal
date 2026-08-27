/**
 * Reading and reshaping the packed candle file.
 *
 * Only 5-minute candles are stored; 15m, 1h and 4h are folded up from them on
 * the fly. That is not just a size trick — replay needs a *partly formed* higher
 * timeframe candle (the 1h bar that is only 20 minutes old), which you can only
 * build if you still have the five-minute pieces it is made of.
 */

/** Bytes per packed candle — must match `scripts/ingest-eurusd.mjs`. */
const BAR_BYTES = 24;
/** Prices are whole points on disk: 1.15736 is stored as 115736. */
const POINT_SCALE = 100_000;
/** Int32 slots per candle, for the typed-array views below. */
const INTS_PER_BAR = BAR_BYTES / 4;

export type Timeframe = "5m" | "15m" | "1h" | "4h";

export const TIMEFRAMES: readonly Timeframe[] = ["5m", "15m", "1h", "4h"] as const;

export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  "5m": 300,
  "15m": 900,
  "1h": 3_600,
  "4h": 14_400,
};

/** Seconds since the epoch. Matches lightweight-charts' `UTCTimestamp`. */
export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

/**
 * A timeframe's candles plus the base-index each one starts at.
 *
 * `starts` is what makes replay cheap: given a position in the 5-minute array,
 * a binary search finds the containing candle without re-folding the series.
 */
export type Series = {
  timeframe: Timeframe;
  candles: Candle[];
  /** `starts[i]` is the index in the 5m array where `candles[i]` opens. */
  starts: Int32Array;
};

/**
 * Turns the packed file into 5-minute candles.
 *
 * The typed-array views assume little-endian, which every platform Next.js
 * builds for is, and which the writer in `scripts/ingest-eurusd.mjs` matches.
 */
export function decodeCandles(buffer: ArrayBuffer): Candle[] {
  if (buffer.byteLength % BAR_BYTES !== 0) {
    throw new Error(
      `Candle file is ${buffer.byteLength} bytes, not a multiple of ${BAR_BYTES} — it is truncated or from an older packer`,
    );
  }

  const ints = new Int32Array(buffer);
  const floats = new Float32Array(buffer);
  const count = buffer.byteLength / BAR_BYTES;
  const candles = new Array<Candle>(count);

  for (let i = 0; i < count; i++) {
    const slot = i * INTS_PER_BAR;
    candles[i] = {
      time: ints[slot],
      open: ints[slot + 1] / POINT_SCALE,
      high: ints[slot + 2] / POINT_SCALE,
      low: ints[slot + 3] / POINT_SCALE,
      close: ints[slot + 4] / POINT_SCALE,
      volume: floats[slot + 5],
    };
  }

  return candles;
}

/**
 * Folds 5-minute candles up into `timeframe`.
 *
 * Buckets are aligned to whole multiples of the timeframe from the epoch, so a
 * 4h candle always opens at 00:00, 04:00, 08:00 … UTC regardless of where the
 * data happens to start. Weekend gaps simply produce no bucket — the fold never
 * invents a candle for a period the market was shut.
 */
export function aggregate(base: Candle[], timeframe: Timeframe): Series {
  const span = TIMEFRAME_SECONDS[timeframe];

  if (timeframe === "5m") {
    const starts = new Int32Array(base.length);
    for (let i = 0; i < base.length; i++) starts[i] = i;
    return { timeframe, candles: base, starts };
  }

  const candles: Candle[] = [];
  // Same length as the output; trimmed once the fold knows how many there are.
  const starts = new Int32Array(base.length);
  let openTime = -1;
  let current: Candle | null = null;

  for (let i = 0; i < base.length; i++) {
    const bar = base[i];
    const bucket = Math.floor(bar.time / span) * span;

    if (current === null || bucket !== openTime) {
      if (current !== null) candles.push(current);
      starts[candles.length] = i;
      openTime = bucket;
      current = {
        time: bucket,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      };
      continue;
    }

    if (bar.high > current.high) current.high = bar.high;
    if (bar.low < current.low) current.low = bar.low;
    current.close = bar.close;
    current.volume += bar.volume;
  }

  if (current !== null) candles.push(current);

  return { timeframe, candles, starts: starts.slice(0, candles.length) };
}

/**
 * The series as it looked when the 5-minute candle at `cursor` had just closed.
 *
 * The final candle is rebuilt from its own 5-minute pieces so a higher timeframe
 * shows the same half-finished bar a trader would have been staring at, instead
 * of snapping between completed candles.
 */
export function sliceAt(series: Series, base: Candle[], cursor: number): Candle[] {
  if (cursor < 0) return [];

  const last = Math.min(cursor, base.length - 1);
  const index = candleIndexAt(series, last);
  const settled = series.candles.slice(0, index);

  const from = series.starts[index];
  let forming: Candle | null = null;

  for (let i = from; i <= last; i++) {
    const bar = base[i];
    if (forming === null) {
      forming = {
        time: series.candles[index].time,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      };
      continue;
    }
    if (bar.high > forming.high) forming.high = bar.high;
    if (bar.low < forming.low) forming.low = bar.low;
    forming.close = bar.close;
    forming.volume += bar.volume;
  }

  if (forming !== null) settled.push(forming);
  return settled;
}

/** Index of the candle in `series` that contains the 5-minute bar `baseIndex`. */
export function candleIndexAt(series: Series, baseIndex: number): number {
  const starts = series.starts;
  let low = 0;
  let high = starts.length - 1;

  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (starts[mid] <= baseIndex) low = mid;
    else high = mid - 1;
  }

  return low;
}
