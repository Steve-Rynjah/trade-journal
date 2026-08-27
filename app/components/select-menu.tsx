"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export type MenuOption<T> = { value: T; label: string; hint?: string };

/**
 * A button that opens a list — the Month and Year controls above the sheet are
 * one of these each, so either can be changed without touching the other.
 */
export function SelectMenu<T extends string | number | null>({
  label,
  value,
  options,
  onChange,
  icon,
  widthClass = "w-56",
  placement = "down",
  align = "left",
  compact = false,
}: {
  label: string;
  value: T;
  options: MenuOption<T>[];
  onChange: (next: T) => void;
  icon?: ReactNode;
  widthClass?: string;
  /** Up for a menu near the foot of the page, where down would run off it. */
  placement?: "down" | "up";
  /**
   * Which edge the list hangs from. A button sitting at the right of its card
   * needs `right`, or a list wider than the button spills past the card edge.
   */
  align?: "left" | "right";
  /**
   * A tighter button, for bars that have to sit inside a fixed-height strip.
   * The default size is what the journal's filters use and stays untouched.
   */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = options.find((option) => option.value === value);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        className={`inline-flex items-center rounded-lg border border-gray-300 bg-white font-medium text-gray-700 shadow-theme-xs transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/5 ${
          compact ? "gap-1.5 px-2.5 py-1 text-theme-xs" : "gap-2.5 px-4 py-2.5 text-theme-sm"
        }`}
      >
        {icon}
        {current?.label ?? label}
        <svg
          width="16"
          height="16"
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
        <ul
          role="listbox"
          aria-label={label}
          className={`animate-rise absolute z-40 max-h-72 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-2 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark ${
            align === "right" ? "right-0" : "left-0"
          } ${placement === "up" ? "bottom-full mb-2" : "mt-2"} ${widthClass}`}
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <li key={String(option.value)}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-theme-sm transition-colors ${
                    active
                      ? "bg-brand-50 font-medium text-brand-500 dark:bg-brand-500/12 dark:text-brand-400"
                      : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
                  }`}
                >
                  {option.label}
                  {option.hint ? (
                    <span className="tnum text-theme-xs text-gray-400">{option.hint}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
