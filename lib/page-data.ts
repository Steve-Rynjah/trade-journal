import "server-only";

import { getTrades } from "./data";
import { SUPABASE_URL, isSupabaseConfigured } from "./supabase/config";
import type { TradeWithScreenshot } from "./types";

export type NoticeProps = {
  title: string;
  message: string;
  steps: string[];
  action?: { href: string; label: string };
};

/** `https://<ref>.supabase.co` → the SQL editor for that project. */
function sqlEditorUrl(): string | null {
  const ref = SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\./)?.[1];
  return ref ? `https://supabase.com/dashboard/project/${ref}/sql/new` : null;
}

export type LoadResult =
  | { ok: true; trades: TradeWithScreenshot[] }
  | { ok: false; notice: NoticeProps };

/**
 * The journal read, plus the setup guidance for the two ways it can fail before
 * there is anything to show. Shared so Home and Analytics behave identically.
 */
export async function loadTrades(): Promise<LoadResult> {
  if (!isSupabaseConfigured) {
    return {
      ok: false,
      notice: {
        title: "Connect Supabase to get started",
        message: "No project URL or publishable key found.",
        steps: [
          "Copy .env.local.example to .env.local — Next.js does not read the .example file",
          "Fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY from Project Settings → API",
          "Restart the dev server",
        ],
      },
    };
  }

  try {
    return { ok: true, trades: await getTrades() };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    // PGRST205 is PostgREST's "table not in the schema cache" — almost always
    // the migration simply has not been run yet.
    const missingTable = message.includes("trades");
    const editor = sqlEditorUrl();

    return {
      ok: false,
      notice: {
        title: missingTable
          ? "Almost there — the trades table does not exist yet"
          : "Supabase is configured, but the query failed",
        message,
        steps: [
          "Open the SQL Editor for this project",
          "Run supabase/migrations/0001_init.sql, then 0002_ratio_text_and_no_breakeven.sql",
          "Reload this page",
        ],
        action: editor ? { href: editor, label: "Open the SQL Editor" } : undefined,
      },
    };
  }
}
