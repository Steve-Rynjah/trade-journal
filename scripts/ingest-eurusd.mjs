/**
 * Downloads EURUSD 5-minute candles from Dukascopy and packs them into the
 * binary file the Backtest tab reads.
 *
 * Dukascopy is a bulk file feed, not a quote API: no account, no key, no rate
 * limit. That is the whole reason it was chosen — the app never calls it at
 * runtime, so a backtest replays identically no matter what any vendor does
 * later. Re-run this by hand when you want a wider window or fresher candles.
 *
 *   node scripts/ingest-eurusd.mjs [fromISO] [toISO]
 *   node scripts/ingest-eurusd.mjs 2025-01-01 2026-08-27
 */
import { getHistoricalRates } from "dukascopy-node";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Bytes per packed candle: int32 time + 4x int32 price + float32 volume. */
export const BAR_BYTES = 24;
/**
 * Prices are stored as whole "points" (1.15736 -> 115736) rather than floats.
 * EURUSD quotes to five decimals, so this is exact — a float32 would round the
 * last digit and quietly move levels a strategy is being judged against.
 */
export const POINT_SCALE = 100_000;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(root, "public/data/eurusd_m5.bin");

const from = new Date(process.argv[2] ?? "2025-01-01");
const to = new Date(process.argv[3] ?? new Date());

console.log(`EURUSD m5  ${from.toISOString().slice(0, 10)} -> ${to.toISOString().slice(0, 10)}`);

const started = Date.now();
const bars = await getHistoricalRates({
  instrument: "eurusd",
  dates: { from, to },
  timeframe: "m5",
  format: "json",
  // Bid, not mid: it is the side a long exits on, so levels drawn here line up
  // with what a real fill would have been.
  priceType: "bid",
});

if (bars.length === 0) throw new Error("Dukascopy returned no candles for that range");

const buf = Buffer.alloc(bars.length * BAR_BYTES);
let previous = 0;

bars.forEach((bar, i) => {
  // Guard the two things that would corrupt a replay silently rather than
  // loudly: bars arriving out of order, and a price that does not survive the
  // integer round trip.
  if (bar.timestamp <= previous && i > 0) {
    throw new Error(`Candle ${i} goes backwards in time (${bar.timestamp} after ${previous})`);
  }
  previous = bar.timestamp;

  const offset = i * BAR_BYTES;
  buf.writeInt32LE(Math.round(bar.timestamp / 1000), offset);

  [bar.open, bar.high, bar.low, bar.close].forEach((price, slot) => {
    const points = Math.round(price * POINT_SCALE);
    if (Math.abs(points / POINT_SCALE - price) > 1e-9) {
      throw new Error(`Candle ${i} price ${price} does not fit the point scale`);
    }
    buf.writeInt32LE(points, offset + 4 + slot * 4);
  });

  buf.writeFloatLE(bar.volume, offset + 20);
});

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, buf);

const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log(`${bars.length.toLocaleString()} candles -> ${(buf.length / 1048576).toFixed(2)} MB in ${seconds}s`);
console.log(`first ${new Date(bars[0].timestamp).toISOString()}`);
console.log(`last  ${new Date(bars.at(-1).timestamp).toISOString()}`);
console.log(OUT);
