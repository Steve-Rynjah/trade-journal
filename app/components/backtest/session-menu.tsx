"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The Session Indicator's header control, sitting beside "Skip to".
 *
 * It used to be a slot at the foot of the tool rail, which put a backdrop
 * setting among the things you draw — and made switching it off a trip past
 * seven tools. Here it sits next to the session control it belongs with, and
 * the menu holds the only two things ever wanted at speed: the switch, and the
 * full panel behind it.
 */
export function SessionMenu({
  on,
  onToggle,
  onSettings,
}: {
  /** Whether the indicator is currently painting on the chart. */
  on: boolean;
  onToggle: (next: boolean) => void;
  onSettings: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function away(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    // Deferred a tick so the click that opened the menu does not close it.
    const id = window.setTimeout(() => document.addEventListener("mousedown", away), 0);
    document.addEventListener("keydown", escape);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Session Indicator"
        // Same shell as the "Skip to" button beside it, plus the lit state the
        // rail slot used to carry: whether the bands are on is worth reading
        // off the header without opening anything.
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-theme-xs font-medium shadow-theme-xs transition-colors ${
          on
            ? "border-brand-200 bg-brand-50 text-brand-600 hover:bg-brand-100 dark:border-brand-500/40 dark:bg-brand-500/15 dark:text-brand-400 dark:hover:bg-brand-500/25"
            : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/5"
        }`}
      >
        {/* Asian / London / New York ranges — three stacked bands, which is
            what the indicator actually puts on the chart. */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <rect x="3.5" y="5.5" width="6" height="6" rx="0.8" />
          <rect x="9.5" y="9.5" width="6" height="6" rx="0.8" />
          <rect x="15.5" y="7.5" width="5" height="6" rx="0.8" />
          <path d="M3.5 19.5h17" />
        </svg>
        Sessions
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={`text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M6 9.5l6 6 6-6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className="animate-rise absolute right-0 z-40 mt-2 w-64 rounded-2xl border border-gray-200 bg-white p-2 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark"
        >
          <div className="flex items-center gap-2 rounded-lg px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-theme-sm text-gray-700 dark:text-gray-300">
              Session Indicator
            </span>

            <button
              type="button"
              onClick={() => {
                onSettings();
                setOpen(false);
              }}
              title="Session Indicator settings"
              aria-label="Session Indicator settings"
              className="rounded-md p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="2.9" />
                <path d="M18.9 14.4a1.5 1.5 0 00.3 1.65l.05.05a1.75 1.75 0 11-2.48 2.48l-.05-.05a1.5 1.5 0 00-1.65-.3 1.5 1.5 0 00-.9 1.37v.15a1.75 1.75 0 11-3.5 0v-.08a1.5 1.5 0 00-.98-1.37 1.5 1.5 0 00-1.65.3l-.05.05A1.75 1.75 0 114.5 16.2l.05-.05a1.5 1.5 0 00.3-1.65 1.5 1.5 0 00-1.37-.9H3.3a1.75 1.75 0 110-3.5h.08a1.5 1.5 0 001.37-.98 1.5 1.5 0 00-.3-1.65l-.05-.05A1.75 1.75 0 116.88 4.9l.5.05a1.5 1.5 0 001.65.3h.07a1.5 1.5 0 00.9-1.37V3.3a1.75 1.75 0 113.5 0v.08a1.5 1.5 0 00.9 1.37 1.5 1.5 0 001.65-.3l.05-.05a1.75 1.75 0 112.48 2.48l-.05.05a1.5 1.5 0 00-.3 1.65v.07a1.5 1.5 0 001.37.9h.15a1.75 1.75 0 110 3.5h-.08a1.5 1.5 0 00-1.37.9z" />
              </svg>
            </button>

            <Switch checked={on} onChange={onToggle} label="Show the Session Indicator" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** A sliding on/off switch — the control a backdrop deserves over a checkbox. */
function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
        checked ? "bg-brand-500" : "bg-gray-300 dark:bg-gray-600"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
          checked ? "left-[1.125rem]" : "left-0.5"
        }`}
      />
    </button>
  );
}
