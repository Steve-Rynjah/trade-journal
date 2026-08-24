import "server-only";

import { createClient } from "./supabase/server";
import { SCREENSHOT_BUCKET, SIGNED_URL_TTL_SECONDS } from "./supabase/config";
import { rowToTrade, type TradeRow, type TradeWithScreenshot } from "./types";

/**
 * Every trade, newest first, each losing trade carrying a freshly signed
 * screenshot URL.
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
  const paths = trades
    .map((trade) => trade.screenshotPath)
    .filter((path): path is string => Boolean(path));

  if (paths.length === 0) {
    return trades.map((trade) => ({ ...trade, screenshotUrl: null }));
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
    screenshotUrl: trade.screenshotPath
      ? (urlByPath.get(trade.screenshotPath) ?? null)
      : null,
  }));
}
