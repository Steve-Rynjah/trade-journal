export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/**
 * `PUBLISHABLE` is Supabase's current name for the browser-safe key; `ANON` is
 * the legacy name for the same thing. Accept either so an older .env keeps working.
 */
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

export const SCREENSHOT_BUCKET = "trade-screenshots";

/** Signed screenshot URLs are short-lived; the page re-mints them on each render. */
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);
