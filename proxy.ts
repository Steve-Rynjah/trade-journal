import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/session";

/**
 * Runs before every page: refreshes the Supabase session and bounces signed-out
 * visitors to /login.
 *
 * `proxy` rather than `middleware` — Next.js 16 renamed the convention; the old
 * filename still works but is deprecated.
 *
 * This is the front door, not the lock. Server Actions are POSTs to the route
 * that uses them, so a matcher change could quietly take one out of scope —
 * every action in app/actions.ts checks the session for itself as well.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Everything except the static assets. Without the exclusions the redirect
  // above would also catch the CSS and JS of the login page it redirects to.
  //
  // `data/` is the packed candle file the Backtest tab fetches. It has to be
  // out of scope for the same reason: a redirect here does not fail loudly, it
  // hands the chart an HTML login page where it expected candles. Market data
  // downloaded from a free public feed, so there is nothing here to protect.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|data/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};
