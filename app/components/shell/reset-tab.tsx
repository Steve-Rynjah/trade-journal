"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { resetVersion, type ResetResult } from "@/app/reset-actions";
import { SelectMenu, type MenuOption } from "@/app/components/select-menu";
import { SHEET_VERSIONS, versionLabel } from "@/lib/stats";
import type { Trade } from "@/lib/types";

/**
 * The last item in the sidebar, and the only one that is not a place.
 *
 * A tab rather than a button tucked into a settings page because that is what
 * was asked for — but it is styled apart from the four routes above it, and it
 * never navigates: it asks which version's trades to throw away, in the middle
 * of the screen, and only then deletes them. Backtest data is never touched.
 */
export function ResetTab({ trades, onOpen }: { trades: Trade[]; onOpen?: () => void }) {
  const [asking, setAsking] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          // Same courtesy the nav links do: the drawer must not sit over the
          // dialog it just opened.
          onOpen?.();
          setAsking(true);
        }}
        aria-haspopup="dialog"
        aria-expanded={asking}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-theme-sm font-medium text-gray-600 transition-colors hover:bg-error-50 hover:text-error-600 dark:text-gray-400 dark:hover:bg-error-500/15 dark:hover:text-error-400"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="text-gray-400"
        >
          <path d="M20 12a8 8 0 11-2.6-5.9" />
          <path d="M20 3.6V8h-4.4" />
        </svg>
        Reset
      </button>

      {asking ? <ResetDialog trades={trades} onClose={() => setAsking(false)} /> : null}
    </>
  );
}

function ResetDialog({ trades, onClose }: { trades: Trade[]; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ResetResult | null>(null);

  // Counted once on open: after the delete the refreshed list would say 0,
  // which is true but would overwrite the choice the summary describes.
  const [counts] = useState(() => {
    const byVersion = new Map<number, number>();
    for (const trade of trades) {
      byVersion.set(trade.version, (byVersion.get(trade.version) ?? 0) + 1);
    }
    return byVersion;
  });

  // Opens on the first version that has something in it, so the default
  // choice is never a no-op.
  const [version, setVersion] = useState<number>(
    () => SHEET_VERSIONS.find((value) => (counts.get(value) ?? 0) > 0) ?? SHEET_VERSIONS[0],
  );
  const selected = counts.get(version) ?? 0;

  const options: MenuOption<number>[] = SHEET_VERSIONS.map((value) => {
    const count = counts.get(value) ?? 0;
    return {
      value,
      label: versionLabel(value),
      hint: count === 0 ? "empty" : `${count} ${count === 1 ? "trade" : "trades"}`,
    };
  });
  // Cancel takes the focus, not the confirm — a stray Enter on a dialog that
  // erases everything should do nothing.
  const cancelRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  const done = result?.ok === true;
  const error = result && !result.ok ? result.error : null;

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, onClose]);

  function confirm() {
    setResult(null);
    startTransition(async () => {
      const next = await resetVersion(version);
      setResult(next);
      // The server action already revalidated the layout; this pushes the fresh
      // tree into the client router so the tabs behind the dialog empty out.
      if (next.ok) router.refresh();
    });
  }

  // Portalled to <body>: an ancestor in the app shell creates a containing
  // block for `fixed`, which would pin the dialog under the header instead of
  // centring it in the viewport.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="reset-title"
        aria-describedby="reset-body"
        className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-2xl dark:border-gray-800 dark:bg-gray-dark"
      >
        <span
          aria-hidden="true"
          className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${
            done
              ? "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500"
              : "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500"
          }`}
        >
          {done ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 8v5" />
              <circle cx="12" cy="16.6" r="0.9" fill="currentColor" stroke="none" />
              <path d="M10.3 3.9L2.7 17a2 2 0 001.7 3h15.2a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
            </svg>
          )}
        </span>

        <h2
          id="reset-title"
          className="mt-4 text-theme-xl font-semibold text-gray-900 dark:text-white"
        >
          {done ? `${versionLabel(version)} cleared` : "Reset trade data?"}
        </h2>

        <p id="reset-body" className="mt-2 text-theme-sm text-gray-500 dark:text-gray-400">
          {result?.ok ? (
            summarise(result)
          ) : (
            <>
              Pick a version. Every trade logged on it, in every month, is
              deleted along with its screenshots. Backtest sessions are not
              touched. It cannot be undone.
            </>
          )}
        </p>

        {done ? null : (
          <div className="mt-4 flex items-center justify-center gap-3">
            <SelectMenu
              label="Version to delete"
              value={version}
              options={options}
              onChange={(next) => {
                setVersion(next);
                setResult(null);
              }}
              widthClass="w-48"
            />
            <span className="tnum text-theme-sm text-gray-500 dark:text-gray-400">
              {selected} {selected === 1 ? "trade" : "trades"}
            </span>
          </div>
        )}

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-error-50 px-3 py-2 text-theme-sm text-error-600 dark:bg-error-500/15 dark:text-error-400"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex justify-center gap-3">
          {done ? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-w-[6rem] items-center justify-center rounded-lg bg-brand-500 px-4 py-2.5 text-theme-sm font-medium text-white shadow-theme-xs transition-colors hover:bg-brand-600"
            >
              Done
            </button>
          ) : (
            <>
              <button
                ref={cancelRef}
                type="button"
                onClick={onClose}
                disabled={pending}
                className="inline-flex min-w-[6rem] items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-theme-sm font-medium text-gray-700 shadow-theme-xs transition-colors hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={pending || selected === 0}
                className="inline-flex min-w-[6rem] items-center justify-center rounded-lg bg-error-500 px-4 py-2.5 text-theme-sm font-medium text-white shadow-theme-xs transition-colors hover:bg-error-600 disabled:pointer-events-none disabled:opacity-50"
              >
                {pending ? "Clearing…" : `Delete ${versionLabel(version)}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Counts rather than "done", so it is obvious what actually went. */
function summarise(result: Extract<ResetResult, { ok: true }>): string {
  const parts = [
    plural(result.trades, "trade"),
    plural(result.screenshots, "screenshot"),
  ].filter((part) => part !== null);

  if (parts.length === 0) return `There was nothing on ${versionLabel(result.version)} to delete.`;
  return `Deleted ${parts.join(" and ")} from ${versionLabel(result.version)}.`;
}

function plural(count: number, noun: string): string | null {
  if (count === 0) return null;
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
