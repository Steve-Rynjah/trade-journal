"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { signOut } from "@/app/auth-actions";
import { SetupNotice } from "../setup-notice";
import { AppData } from "./app-data";
import { ThemeToggle } from "./theme-toggle";
import type { LoadResult } from "@/lib/page-data";

const NAV = [
  {
    href: "/",
    label: "Home",
    hint: "Log trades",
    icon: (
      <>
        <rect x="3.2" y="3.2" width="7" height="7" rx="2" />
        <rect x="13.8" y="3.2" width="7" height="7" rx="2" />
        <rect x="3.2" y="13.8" width="7" height="7" rx="2" />
        <rect x="13.8" y="13.8" width="7" height="7" rx="2" />
      </>
    ),
  },
  {
    href: "/analytics",
    label: "Analytics",
    hint: "Win / lose split",
    icon: (
      <>
        <rect x="3.2" y="12" width="4.4" height="8.8" rx="1.6" />
        <rect x="9.8" y="7" width="4.4" height="13.8" rx="1.6" />
        <rect x="16.4" y="3.2" width="4.4" height="17.6" rx="1.6" />
      </>
    ),
  },
] as const;

export function AppShell({
  result,
  email,
  children,
}: {
  result: LoadResult;
  /** Absent only before Supabase is configured, when there is nobody to name. */
  email?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  // Two states because the sidebar means different things at the two sizes: a
  // drawer over the page on mobile, a column beside it on desktop.
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  function toggleSidebar() {
    // Read the width at click time — no state to keep in sync, and nothing that
    // can disagree with the CSS between the server render and hydration.
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setCollapsed((value) => !value);
    } else {
      setMenuOpen((value) => !value);
    }
  }

  const current = NAV.find((item) => item.href === pathname) ?? NAV[0];

  return (
    <div className="min-h-screen">
      {/* Backdrop — mobile only, since the sidebar is permanent from lg up. */}
      {menuOpen ? (
        <button
          type="button"
          aria-label="Close the menu"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-40 bg-gray-900/40 lg:hidden"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[290px] flex-col border-r border-gray-200 bg-white px-5 py-6 transition-transform duration-300 dark:border-gray-800 dark:bg-gray-dark ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "lg:-translate-x-full" : "lg:translate-x-0"}`}
      >
        <Link href="/" className="flex items-center gap-3 px-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true">
              <rect x="4" y="12" width="3.6" height="8" rx="1.2" />
              <rect x="10.2" y="7.5" width="3.6" height="12.5" rx="1.2" />
              <rect x="16.4" y="4" width="3.6" height="16" rx="1.2" />
            </svg>
          </span>
          <span className="text-xl font-bold text-gray-900 dark:text-white">
            Trade Journal
          </span>
        </Link>

        <p className="mt-8 px-3 text-theme-xs font-medium uppercase tracking-[0.12em] text-gray-400">
          Menu
        </p>

        <nav className="mt-3">
          <ul className="flex flex-col gap-1">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    // A tap on a nav item must not leave the drawer over the page.
                    onClick={() => setMenuOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-theme-sm font-medium transition-colors ${
                      active
                        ? "bg-brand-50 text-brand-500 dark:bg-brand-500/12 dark:text-brand-400"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
                    }`}
                  >
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                      className={active ? "" : "text-gray-400"}
                    >
                      {item.icon}
                    </svg>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <div
        className={`transition-[margin] duration-300 ${
          collapsed ? "lg:ml-0" : "lg:ml-[290px]"
        }`}
      >
        <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-dark/95">
          <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label="Toggle the menu"
                aria-expanded={menuOpen || !collapsed}
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/5"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M4 6.5h16M4 12h16M4 17.5h16"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>

              <div>
                <h1 className="text-theme-xl font-semibold text-gray-900 dark:text-white">
                  {current.label}
                </h1>
                <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                  {current.hint}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <ThemeToggle />
              {email ? <Account email={email} /> : null}
            </div>
          </div>
        </header>

        {/* Keyed on the route so each tab fades in rather than snapping.
            One entrance on the whole page, deliberately: animating each row
            separately gives every row its own stacking context, and the period
            dropdowns then open behind the card beneath them. */}
        <main key={pathname} className="animate-rise p-4 sm:p-6">
          {result.ok ? (
            <AppData trades={result.trades}>{children}</AppData>
          ) : (
            <SetupNotice {...result.notice} />
          )}
        </main>
      </div>
    </div>
  );
}

/**
 * Who is signed in, and the way out.
 *
 * A plain form rather than a click handler: `signOut` is a Server Action, so the
 * post-and-redirect works with no JavaScript at all — which is exactly what you
 * want from the control people reach for when something is already wrong.
 */
function Account({ email }: { email: string }) {
  const initial = email.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="flex items-center gap-2 rounded-full border border-gray-200 py-1 pl-1 pr-1 sm:pl-1.5 sm:pr-2 dark:border-gray-800">
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-theme-sm font-semibold text-brand-500 dark:bg-brand-500/15 dark:text-brand-400"
      >
        {initial}
      </span>

      {/* The address is confirmation, not navigation — it goes first when the
          header runs out of room. */}
      <span className="hidden max-w-[12rem] truncate text-theme-sm text-gray-600 lg:block dark:text-gray-400">
        {email}
      </span>

      <form action={signOut}>
        <button
          type="submit"
          aria-label={`Sign out of ${email}`}
          title="Sign out"
          className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-error-50 hover:text-error-600 dark:text-gray-400 dark:hover:bg-error-500/15 dark:hover:text-error-400"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M14.5 4.5H18a2 2 0 012 2v11a2 2 0 01-2 2h-3.5"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M10 8.2L6 12l4 3.8M6.4 12H15"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </form>
    </div>
  );
}
