import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { SUPABASE_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

/**
 * Server-side Supabase client.
 *
 * The journal ships without a login, so there is no session to read today. The
 * cookie plumbing is here anyway because it is what makes adding auth later a
 * one-file change rather than a rewrite.
 */
export async function createClient() {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase is not configured. Copy .env.local.example to .env.local and fill in your project URL and publishable key.",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Safe to ignore: any session refresh is handled in a Server Action.
        }
      },
    },
  });
}
