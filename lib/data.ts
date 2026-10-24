import "server-only";

import { createClient } from "./supabase/server";
import { SCREENSHOT_BUCKET, SIGNED_URL_TTL_SECONDS } from "./supabase/config";
import {
  monthBounds,
  rowToTrade,
  type Trade,
  type TradeRow,
  type TradeWithScreenshot,
} from "./types";

/**
 * Every trade, newest first, each chart carrying a freshly signed URL.
 *
 * The bucket is private, so URLs are minted per render rather than stored. They
 * expire an hour later, which is well past the life of a page view.
 */
export async function getTrades(): Promise<TradeWithScreenshot[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("trades")
    .select("*")
    .order("trade_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Could not load trades: ${error.message}`);
  }

  const trades = (data as TradeRow[]).map(rowToTrade);
  const paths = trades.flatMap((trade) => trade.screenshotPaths);

  if (paths.length === 0) {
    return trades.map((trade) => ({ ...trade, screenshots: [] }));
  }

  const { data: signed } = await supabase.storage
    .from(SCREENSHOT_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  // createSignedUrls reports per-object failures inline rather than throwing, so
  // a single missing file degrades to "no screenshot" instead of a broken page.
  const urlByPath = new Map<string, string>();
  for (const entry of signed ?? []) {
    if (entry.path && entry.signedUrl && !entry.error) {
      urlByPath.set(entry.path, entry.signedUrl);
    }
  }

  return trades.map((trade) => ({
    ...trade,
    screenshots: trade.screenshotPaths.flatMap((path) => {
      const url = urlByPath.get(path);
      return url ? [{ path, url }] : [];
    }),
  }));
}

/**
 * One sheet's trades, oldest first — the order they were taken in.
 *
 * A separate read from `getTrades` rather than a filter over it: this one feeds
 * the AI report, which needs no screenshots, and signing a URL per row for a
 * page that never shows an image is work for nothing.
 */
export async function getSheetTrades(
  month: number,
  year: number,
  version: number,
): Promise<Trade[]> {
  const supabase = await createClient();
  const { start, end } = monthBounds(month, year);

  const { data, error } = await supabase
    .from("trades")
    .select("*")
    .eq("version", version)
    .gte("trade_date", start)
    .lte("trade_date", end)
    .order("trade_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Could not load trades: ${error.message}`);
  }

  return (data as TradeRow[]).map(rowToTrade);
}
