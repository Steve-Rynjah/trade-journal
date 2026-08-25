import type { Metadata } from "next";

import { ThemeToggle } from "@/app/components/shell/theme-toggle";
import { safeNextPath } from "@/lib/supabase/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in · Trade Journal",
  description: "Open the journal.",
};

export const dynamic = "force-dynamic";

export default async function LoginPage(props: PageProps<"/login">) {
  const params = await props.searchParams;
  const requested = params.next;
  const next = safeNextPath(Array.isArray(requested) ? requested[0] : requested);

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* ------------------------------------------------------------------
          Left: the form. It is the whole page below lg — the panel opposite is
          decoration, and decoration is the first thing a phone should drop.
          ------------------------------------------------------------------ */}
      <div className="relative flex flex-col justify-center bg-white px-6 py-12 sm:px-12 lg:px-16 dark:bg-gray-900">
        <div className="absolute right-6 top-6 sm:right-10 sm:top-10">
          <ThemeToggle />
        </div>

        <div className="animate-rise mx-auto w-full max-w-sm">
          <h1 className="text-title-sm font-bold text-gray-900 dark:text-white">
            Sign in
          </h1>
          <p className="mt-2 text-theme-sm text-gray-500 dark:text-gray-400">
            Enter your email and password to open the journal.
          </p>

          <LoginForm next={next} />
        </div>
      </div>

      {/* ------------------------------------------------------------------
          Right: the brand panel. Flat colour and one thought — nothing to read
          past on the way to the form. Hidden below lg.
          ------------------------------------------------------------------ */}
      <div className="hidden bg-brand-500 lg:flex lg:flex-col lg:justify-center lg:px-16">
        <p className="text-theme-xl font-medium text-white/75">
          Welcome to Trade Journal
        </p>

        <h2 className="mt-3 text-title-md font-bold leading-tight text-white">
          Let&rsquo;s go!
        </h2>

        <p className="mt-5 max-w-md text-theme-xl leading-8 text-white/85">
          Keep working hard every day. Log the wins, sit with the losses, and one
          day the results will pay off.
        </p>
      </div>
    </main>
  );
}
