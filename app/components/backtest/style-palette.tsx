"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { deleteSet, type SetsResult } from "@/app/backtest-actions";
import type { DrawingSet } from "@/lib/backtest/sets";
import { Grip, useDraggable } from "./use-draggable";

/**
 * Saved looks for the tool that is currently armed.
 *
 * The caller keys this on the tool, so switching tools remounts it and the menu
 * never lingers showing the previous tool's styles.
 *
 * A floating bar rather than a flyout pinned to the rail: it appears whenever a
 * tool with saved styles is picked up, and it has to be movable because it will
 * otherwise sit exactly where the next mark is going.
 */
export function StylePalette({
  styles,
  onPick,
  onStyles,
}: {
  styles: DrawingSet[];
  onPick: (set: DrawingSet) => void;
  onStyles: (result: SetsResult) => void;
}) {
  const { gripProps, style } = useDraggable();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    function away(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    const id = window.setTimeout(() => document.addEventListener("mousedown", away), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", away);
    };
  }, [open]);

  return (
    <div ref={ref} style={style} className="pointer-events-auto absolute left-4 top-4 z-30">
      <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white/95 px-1 py-1 shadow-xl backdrop-blur dark:border-gray-700 dark:bg-[#1e222d]/95">
        <span {...gripProps} className="px-1 py-1" title="Drag to move">
          <Grip />
        </span>
        <button
          type="button"
          title="Saved styles"
          aria-label="Saved styles"
          onClick={() => setOpen((value) => !value)}
          className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
            open
              ? "bg-gray-100 text-gray-900 dark:bg-white/10 dark:text-white"
              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4" y="4" width="6.5" height="6.5" rx="1" />
            <rect x="13.5" y="4" width="6.5" height="6.5" rx="1" />
            <rect x="4" y="13.5" width="6.5" height="6.5" rx="1" />
            <path d="M16.75 13.9v6M13.75 16.9h6" />
          </svg>
        </button>
      </div>

      {open ? (
        <div className="mt-1.5 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-2xl dark:border-gray-700 dark:bg-[#1e222d]">
          <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-gray-400">
            Saved styles
          </p>
          {styles.map((set) => (
            <div
              key={set.id}
              className="group/row flex items-center hover:bg-gray-50 dark:hover:bg-white/5"
            >
              <button
                type="button"
                onClick={() => {
                  onPick(set);
                  setOpen(false);
                }}
                className="min-w-0 flex-1 truncate px-3 py-1.5 text-left text-theme-xs uppercase tracking-wide text-gray-700 dark:text-gray-200"
              >
                {set.name}
              </button>
              <button
                type="button"
                aria-label={`Delete the ${set.name} style`}
                disabled={pending}
                onClick={() => startTransition(async () => onStyles(await deleteSet(set.id)))}
                className="mr-1.5 rounded p-1 text-gray-300 opacity-0 transition hover:bg-error-50 hover:text-error-600 group-hover/row:opacity-100 disabled:opacity-40 dark:text-gray-600 dark:hover:bg-error-500/15 dark:hover:text-error-400"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
