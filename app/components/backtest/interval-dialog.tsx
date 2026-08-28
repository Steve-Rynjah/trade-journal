"use client";

import { useEffect, useRef } from "react";

import type { Timeframe } from "@/lib/backtest/candles";
import { AVAILABLE_INTERVALS, parseInterval } from "@/lib/backtest/interval-entry";

/**
 * The box that appears when you start typing an interval over the chart.
 *
 * Opened by the first digit rather than by a button, which is the whole point
 * of it — the gesture is "type 15, press Enter", and anything that needs a
 * click first is slower than the timeframe buttons already sitting in the
 * header.
 */
export function IntervalDialog({
  text,
  onText,
  onApply,
  onClose,
}: {
  text: string;
  onText: (next: string) => void;
  onApply: (timeframe: Timeframe) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { label, timeframe } = parseInterval(text);

  // Focus on open, caret at the end so the seeding digit is not selected and
  // replaced by the next keystroke.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    const at = input.value.length;
    input.setSelectionRange(at, at);
  }, []);

  return (
    // Covers the chart so a click anywhere outside the box dismisses it, the
    // way Escape does.
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/20"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-[22rem] rounded-2xl border border-gray-200 bg-white px-8 py-7 shadow-theme-lg dark:border-gray-700 dark:bg-[#1e222d]">
        <div className="flex items-center justify-center gap-2">
          <h2 className="text-theme-xl font-semibold text-gray-900 dark:text-white">
            Change interval
          </h2>
          <span
            title={`Type a number for minutes, or add H for hours. Available here: ${AVAILABLE_INTERVALS}.`}
            className="cursor-help text-gray-400"
            aria-label={`Type a number for minutes, or add H for hours. Available here: ${AVAILABLE_INTERVALS}.`}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5" strokeLinecap="round" />
              <circle cx="12" cy="7.8" r="0.9" fill="currentColor" stroke="none" />
            </svg>
          </span>
        </div>

        <input
          ref={inputRef}
          value={text}
          // Uppercased as you type, so `1h` reads back as `1H` — the same
          // shorthand the header buttons and the hint use.
          onChange={(event) => onText(event.target.value.toUpperCase().slice(0, 6))}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (timeframe) onApply(timeframe);
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            }
          }}
          aria-label="Interval"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          className={`mt-5 w-full rounded-xl border-2 bg-transparent px-4 py-3 text-center text-theme-xl font-medium tabular-nums text-gray-900 outline-none transition-colors dark:text-white ${
            // Grey while it means nothing yet, blue once Enter would do
            // something, amber when it parses but this chart has no such fold.
            timeframe
              ? "border-brand-500"
              : label
                ? "border-warning-500"
                : "border-gray-300 dark:border-gray-600"
          }`}
        />

        <p className="mt-3 text-center text-theme-sm text-gray-500 dark:text-gray-400">
          {timeframe ? (
            label
          ) : label ? (
            <>
              {label} — not available here
              <span className="mt-0.5 block text-theme-xs text-gray-400">
                Try {AVAILABLE_INTERVALS}
              </span>
            </>
          ) : (
            <span className="text-gray-400">Type {AVAILABLE_INTERVALS}</span>
          )}
        </p>
      </div>
    </div>
  );
}
