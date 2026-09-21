"use server";

import { revalidatePath } from "next/cache";

import { currentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SCREENSHOT_BUCKET } from "@/lib/supabase/config";
import { isSheetVersion, versionLabel } from "@/lib/stats";

export type ResetResult =
  | { ok: true; version: number; trades: number; screenshots: number }
  | { ok: false; error: string };

/** The storage API takes removals in batches; a hundred keeps each request small. */
const PAGE = 100;

/**
 * Empties one version of the journal: every trade logged on that version's
 * sheets, whatever the month, and the screenshots attached to them.
 *
 * Backtest sessions and saved drawings are deliberately left alone — this is
 * the journal's reset, not the replay's. Screenshots are removed by the paths
 * the deleted rows point at rather than by listing the user's folder, so a
 * file belonging to another version is never touched.
 *
 * Scoped to the signed-in user by an explicit `user_id` filter rather than left
 * to RLS. Both hold, but saying whose data this is keeps the blast radius
 * visible in the code rather than only in a policy in another file.
 */
export async function resetVersion(version: number): Promise<ResetResult> {
  if (!isSheetVersion(version)) {
    return { ok: false, error: "That is not a version." };
  }

  const user = await currentUser();
  if (!user) {
    return { ok: false, error: "Your session has expired. Sign in again." };
  }

  const label = versionLabel(version);

  try {
    const supabase = await createClient();

    const { data: attached, error: readError } = await supabase
      .from("trades")
      .select("screenshot_path")
      .eq("user_id", user.id)
      .eq("version", version)
      .not("screenshot_path", "is", null);

    if (readError) {
      return { ok: false, error: `Could not read ${label} trades: ${readError.message}` };
    }

    // Files first: a row deleted before its file leaves an orphan nothing
    // points at, whereas the reverse is a broken screenshot for a moment.
    const paths = (attached ?? [])
      .map((row) => row.screenshot_path as string | null)
      .filter((path): path is string => Boolean(path));

    let screenshots = 0;
    for (let at = 0; at < paths.length; at += PAGE) {
      const { data, error } = await supabase.storage
        .from(SCREENSHOT_BUCKET)
        .remove(paths.slice(at, at + PAGE));
      if (error) {
        return { ok: false, error: `Could not clear screenshots: ${error.message}` };
      }
      screenshots += data?.length ?? 0;
    }

    const { data, error } = await supabase
      .from("trades")
      .delete()
      .eq("user_id", user.id)
      .eq("version", version)
      .select("id");

    if (error) {
      return { ok: false, error: `Could not clear ${label} trades: ${error.message}` };
    }

    // The trades read lives in the (app) layout, so the whole tree is stale.
    revalidatePath("/", "layout");

    return { ok: true, version, trades: data?.length ?? 0, screenshots };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
}
