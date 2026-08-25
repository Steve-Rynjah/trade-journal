"use client";

import { useActionState, useState } from "react";

import { signIn } from "@/app/auth-actions";
import { EMPTY_FORM_STATE } from "@/lib/form-state";

const FIELD =
  "w-full rounded-lg border bg-white py-3 pl-11 pr-4 text-theme-sm text-gray-800 transition-colors placeholder:text-gray-400 focus:border-brand-300 focus:outline-none dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-gray-500";

const FIELD_OK =
  "border-gray-300 hover:border-gray-400 dark:border-gray-700 dark:hover:border-gray-600";

const FIELD_BAD =
  "border-error-300 bg-error-25 dark:border-error-500/40 dark:bg-error-500/5";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signIn, EMPTY_FORM_STATE);
  const [visible, setVisible] = useState(false);

  const emailError = state.fieldErrors?.email;
  const passwordError = state.fieldErrors?.password;

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-5" noValidate>
      <input type="hidden" name="next" value={next} />

      {/* Field-level messages sit under their own input, so the banner is only
          for what has no field to belong to — a rejected credential. */}
      {state.status === "error" && !state.fieldErrors ? (
        <p
          role="alert"
          className="flex items-start gap-2.5 rounded-lg bg-error-50 px-4 py-3 text-theme-sm text-error-600 dark:bg-error-500/12 dark:text-error-400"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className="mt-0.5 shrink-0"
          >
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
            <path
              d="M12 7.5v5.5M12 16.3v.2"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
            />
          </svg>
          {state.message}
        </p>
      ) : null}

      <label className="block">
        <span className="mb-1.5 block text-theme-sm font-medium text-gray-700 dark:text-gray-300">
          Email
        </span>
        <span className="relative block">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect
                x="2.8"
                y="5"
                width="18.4"
                height="14"
                rx="3"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <path
                d="M3.5 7.5l7.6 5.2a1.6 1.6 0 001.8 0l7.6-5.2"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            autoFocus
            placeholder="you@example.com"
            aria-invalid={Boolean(emailError)}
            className={`${FIELD} ${emailError ? FIELD_BAD : FIELD_OK}`}
          />
        </span>
        {emailError ? (
          <span className="mt-1.5 block text-theme-xs text-error-600 dark:text-error-400">
            {emailError}
          </span>
        ) : null}
      </label>

      <label className="block">
        <span className="mb-1.5 block text-theme-sm font-medium text-gray-700 dark:text-gray-300">
          Password
        </span>
        <span className="relative block">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect
                x="4"
                y="10.2"
                width="16"
                height="10.5"
                rx="3"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <path
                d="M7.8 10.2V7.6a4.2 4.2 0 018.4 0v2.6"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <input
            type={visible ? "text" : "password"}
            name="password"
            autoComplete="current-password"
            placeholder="••••••••"
            aria-invalid={Boolean(passwordError)}
            className={`${FIELD} !pr-12 ${passwordError ? FIELD_BAD : FIELD_OK}`}
          />
          <button
            type="button"
            onClick={() => setVisible((shown) => !shown)}
            aria-label={visible ? "Hide the password" : "Show the password"}
            className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/10 dark:hover:text-gray-200"
          >
            {visible ? (
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M3 12s3.6-6 9-6 9 6 9 6-3.6 6-9 6-9-6-9-6z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.6" />
                <path
                  d="M4 20L20 4"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M3 12s3.6-6 9-6 9 6 9 6-3.6 6-9 6-9-6-9-6z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            )}
          </button>
        </span>
        {passwordError ? (
          <span className="mt-1.5 block text-theme-xs text-error-600 dark:text-error-400">
            {passwordError}
          </span>
        ) : null}
      </label>

      <button
        type="submit"
        disabled={pending}
        className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-3 text-theme-sm font-medium text-white shadow-theme-xs transition-colors hover:bg-brand-600 disabled:pointer-events-none disabled:opacity-60"
      >
        {pending ? (
          <>
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className="animate-spin"
            >
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="2.4"
                opacity="0.3"
              />
              <path
                d="M21 12a9 9 0 00-9-9"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </svg>
            Signing in…
          </>
        ) : (
          <>
            Sign in
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M4.5 12h14M13 6.5l5.5 5.5-5.5 5.5"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </>
        )}
      </button>
    </form>
  );
}
