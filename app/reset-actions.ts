"use server";

import { revalidatePath } from "next/cache";

import { currentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SCREENSHOT_BUCKET } from "@/lib/supabase/config";

export type ResetResult =
  | { ok: true; trades: number; sessions: number; sets: number; screenshots: number }
  | { ok: false; error: string };

/**
 * Objects are stored under `<user_id>/<uuid>.<ext>`, so the whole of one
 * person's uploads is one folder listing. Asked for in pages because the API
 * caps a listing at a hundred objects and silently returns the first page.
 */
const PAGE = 100;

async function ownScreenshotPaths(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string[]> {
  const paths: string[] = [];

  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.storage
      .from(SCREENSHOT_BUCKET)
      .list(userId, { limit: PAGE, offset });

    // A listing that fails is not worth failing the reset over — the rows are
    // what the app reads, and an orphaned file shows up nowhere.
    if (error || !data || data.length === 0) break;

    for (const entry of data) paths.push(`${userId}/${entry.name}`);
    if (data.length < PAGE) break;
  }

  return paths;
}

/**
 * Empties the journal: every trade, every backtest session, every saved drawing
 * set and style preset, and every screenshot uploaded along the way.
 *
 * Scoped to the signed-in user by an explicit `user_id` filter rather than left
 * to RLS. Both hold, but PostgREST rejects an unfiltered DELETE outright, and
 * saying whose data this is keeps the blast radius visible in the code rather
 * than only in a policy in another file.
 */
export async function resetAllData(): Promise<ResetResult> {
  const user = await currentUser();
  if (!user) {
    return { ok: false, error: "Your session has expired. Sign in again." };
  }

  try {
    const supabase = await createClient();

    // Files first: a row deleted before its file is an orphan nothing points
    // at, whereas a file deleted before its row is a trade with a broken
    // screenshot for the fraction of a second before the row goes too.
    const paths = await ownScreenshotPaths(supabase, user.id);
    let screenshots = 0;
    // Removed a page at a time for the same reason they are listed that way:
    // one request per hundred objects, rather than one request of unknown size.
    for (let at = 0; at < paths.length; at += PAGE) {
      const { data, error } = await supabase.storage
        .from(SCREENSHOT_BUCKET)
        .remove(paths.slice(at, at + PAGE));
      if (error) {
        return { ok: false, error: `Could not clear screenshots: ${error.message}` };
      }
      screenshots += data?.length ?? 0;
    }

    const tables = [
      { name: "trades", label: "trades" },
      { name: "backtest_sessions", label: "backtest sessions" },
      { name: "backtest_drawing_sets", label: "saved drawings" },
    ] as const;

    const counts: number[] = [];
    for (const table of tables) {
      const { data, error } = await supabase
        .from(table.name)
        .delete()
        .eq("user_id", user.id)
        .select("id");

      if (error) {
        return { ok: false, error: `Could not clear ${table.label}: ${error.message}` };
      }
      counts.push(data?.length ?? 0);
    }

    // The trades read lives in the (app) layout, so the whole tree is stale.
    revalidatePath("/", "layout");

    return {
      ok: true,
      trades: counts[0],
      sessions: counts[1],
      sets: counts[2],
      screenshots,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
}
