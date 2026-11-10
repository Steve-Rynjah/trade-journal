import "server-only";

import { createClient } from "./supabase/server";
import { SCREENSHOT_BUCKET, SIGNED_URL_TTL_SECONDS } from "./supabase/config";
import { rowToEntry, type JournalEntryWithCharts, type JournalRow } from "./journal";

/**
 * Every column, plus the three prices again as text. Read as numbers they come
 * back through JSON, which drops trailing zeros; as text they keep every digit
 * the column stored.
 */
const JOURNAL_SELECT =
  "*, entry_text:entry_price::text, stop_loss_text:stop_loss::text, take_profit_text:take_profit::text";

export type JournalLoad =
  | { ok: true; entries: JournalEntryWithCharts[] }
  | { ok: false; error: string };

/**
 * Every journal entry, newest first, each chart with a freshly signed URL.
 *
 * Read by the Journal page itself rather than the (app) layout: the backtest
 * tabs never show these, so signing their charts on every navigation would be
 * work for nothing.
 */
export async function getJournalEntries(): Promise<JournalLoad> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("journal_entries")
      .select(JOURNAL_SELECT)
      .order("trade_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      const missing = error.code === "PGRST205" || error.message.includes("journal_entries");
      return {
        ok: false,
        error: missing
          ? "The journal table does not exist yet — run supabase/migrations/0013_journal_entries.sql."
          : `Could not load the journal: ${error.message}`,
      };
    }

    const entries = (data as unknown as JournalRow[]).map(rowToEntry);
    const paths = entries.flatMap((entry) => entry.screenshotPaths);

    const urlByPath = new Map<string, string>();
    if (paths.length > 0) {
      const { data: signed } = await supabase.storage
        .from(SCREENSHOT_BUCKET)
        .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
      for (const item of signed ?? []) {
        if (item.path && item.signedUrl && !item.error) urlByPath.set(item.path, item.signedUrl);
      }
    }

    return {
      ok: true,
      entries: entries.map((entry) => ({
        ...entry,
        screenshots: entry.screenshotPaths.flatMap((path) => {
          const url = urlByPath.get(path);
          return url ? [{ path, url }] : [];
        }),
      })),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not load the journal.",
    };
  }
}
