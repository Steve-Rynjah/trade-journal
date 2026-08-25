import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/app/components/shell/app-shell";
import { currentUser } from "@/lib/auth";
import { loadTrades } from "@/lib/page-data";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { LOGIN_PATH } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

/**
 * The signed-in half of the app: both tabs, the sidebar, and the journal read
 * that feeds them.
 *
 * The proxy already turns signed-out visitors away, but it is one matcher edit
 * from not running. Checking here too costs a single verified token read and
 * means the data fetch below can never happen for a stranger.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  // With no project keys there is nobody to be signed in as, and nothing to
  // sign in to — the shell renders its own setup instructions instead.
  const user = isSupabaseConfigured ? await currentUser() : null;
  if (isSupabaseConfigured && !user) redirect(LOGIN_PATH);

  // Read here rather than in each page: the layout is preserved across
  // navigation, so moving between the tabs costs no server round trip.
  const result = await loadTrades();

  return (
    <AppShell result={result} email={user?.email}>
      {children}
    </AppShell>
  );
}
