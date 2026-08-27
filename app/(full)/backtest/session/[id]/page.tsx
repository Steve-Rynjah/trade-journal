import { notFound, redirect } from "next/navigation";

import { loadSession, loadSets } from "@/app/backtest-actions";
import { Backtest } from "@/app/components/backtest/backtest";
import { currentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { LOGIN_PATH } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

/**
 * One session's chart, filling the window.
 *
 * Outside the `(app)` group on purpose: a chart wants the whole screen, and the
 * shell's sidebar, header and padding would all be taking room from it. The way
 * back is the close button in the corner.
 */
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = isSupabaseConfigured ? await currentUser() : null;
  if (isSupabaseConfigured && !user) redirect(LOGIN_PATH);

  // Next 16 hands route params over as a promise.
  const { id } = await params;

  const [session, sets] = await Promise.all([loadSession(id), loadSets()]);
  if (!session.ok) notFound();

  return <Backtest session={session.session} sets={sets} />;
}
