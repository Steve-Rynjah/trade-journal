import "server-only";

import { createClient } from "./supabase/server";

export type SessionUser = {
  id: string;
  email: string;
};

/**
 * Who is signed in, verified.
 *
 * `getClaims` checks the token's signature rather than trusting the cookie it
 * arrived in, so this is safe to gate data on. Returns null instead of throwing:
 * every caller has something better to show than a stack trace.
 */
export async function currentUser(): Promise<SessionUser | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;

  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : "",
  };
}
