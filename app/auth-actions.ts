"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import type { FormState } from "@/lib/form-state";
import { createClient } from "@/lib/supabase/server";
import { LOGIN_PATH, safeNextPath } from "@/lib/supabase/session";

/**
 * Sign in with an email and a password — the only way into the journal.
 *
 * There is no sign-up here on purpose: the account is created once in the
 * Supabase dashboard, and this form is the whole of the auth surface.
 */
export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? ""));

  const fieldErrors: Record<string, string> = {};
  if (email === "") fieldErrors.email = "Enter your email.";
  if (password === "") fieldErrors.password = "Enter your password.";

  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", message: "Fill in both fields.", fieldErrors };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      // Supabase answers a wrong email and a wrong password with the same
      // message, which is the point — neither confirms the other exists.
      return { status: "error", message: error.message };
    }
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not sign in.",
    };
  }

  // The layout reads the journal, and it was reading it as a signed-out visitor
  // a moment ago.
  revalidatePath("/", "layout");

  // Outside the try: redirect() works by throwing, and a catch would swallow it.
  redirect(next);
}

export async function signOut(): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Already signed out, or Supabase is unreachable — either way the cookies
    // are gone or unusable, and the redirect below is still the right ending.
  }

  revalidatePath("/", "layout");
  redirect(LOGIN_PATH);
}
