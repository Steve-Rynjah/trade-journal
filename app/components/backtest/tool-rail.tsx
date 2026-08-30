"use client";

import { useEffect, useRef, useState } from "react";

import { CURSOR_LABEL, type CursorKind } from "@/lib/backtest/cursors";
import { TOOL_LABEL, type ToolKind } from "@/lib/backtest/drawings";

/**
 * The pointer modes. They share one slot at the head of the rail rather than
 * taking a row each, which is what the corner wedge on the button is for.
 */
const CURSORS: { kind: CursorKind; icon: React.ReactNode }[] = [
  {
    kind: "cross",
    icon: <path d="M12 4v5.2M12 14.8V20M4 12h5.2M14.8 12H20" />,
  },
  {
    kind: "arrow",
    icon: (
      <path
        d="M7 3.6v14.1l3.5-3.4 2.4 5.2 2.5-1.2-2.5-5.1 4.8-.4z"
        strokeLinejoin="round"
      />
    ),
  },
];

/**
 * The tools, drawn the way TradingView draws them: a thin monochrome glyph with
 * open circles marking where the shape's grab points will be. Text is the one
 * exception — it has no grab points, so it is just the letter.
 */
const TOOLS: { kind: ToolKind; icon: React.ReactNode }[] = [
  {
    kind: "rectangle",
    icon: (
      <>
        <rect x="5.5" y="6.5" width="13" height="11" />
        <Dots points={[[5.5, 6.5], [18.5, 6.5], [5.5, 17.5], [18.5, 17.5]]} />
      </>
    ),
  },
  {
    kind: "trendline",
    icon: (
      <>
        <path d="M7.6 16.4L16.4 7.6" />
        <Dots points={[[7, 17], [17, 7]]} />
      </>
    ),
  },
  {
    kind: "horizontal-ray",
    icon: (
      <>
        <path d="M8.5 12h10.5" />
        <Dots points={[[7, 12]]} />
      </>
    ),
  },
  {
    kind: "vertical-line",
    icon: (
      <>
        <path d="M12 5.5v13" />
        <Dots points={[[12, 12]]} />
      </>
    ),
  },
  {
    kind: "long-position",
    icon: (
      <>
        <path d="M9.5 8.5h9M9.5 15.5h9" />
        <Dots points={[[7.5, 8.5], [7.5, 15.5]]} />
        <text x="13.5" y="13.4" fontSize="6.4" fill="currentColor" stroke="none" textAnchor="middle">
          L
        </text>
      </>
    ),
  },
  {
    kind: "short-position",
    icon: (
      <>
        <path d="M9.5 8.5h9M9.5 15.5h9" />
        <Dots points={[[7.5, 8.5], [7.5, 15.5]]} />
        <text x="13.5" y="13.4" fontSize="6.4" fill="currentColor" stroke="none" textAnchor="middle">
          S
        </text>
      </>
    ),
  },
  {
    kind: "text",
    icon: <path d="M6.5 7.5V6h11v1.5M12 6.2v11.6M9.5 17.8h5" />,
  },
];

/** The open circles TradingView uses to show a tool's grab points. */
function Dots({ points }: { points: [number, number][] }) {
  return (
    <>
      {points.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.5" />
      ))}
    </>
  );
}

export function ToolRail({
  cursorKind,
  onCursorChange,
  active,
  onPick,
  onClear,
  canClear,
}: {
  /** Which pointer mode is in force while no drawing tool is armed. */
  cursorKind: CursorKind;
  onCursorChange: (kind: CursorKind) => void;
  active: ToolKind | null;
  onPick: (kind: ToolKind | null) => void;
  onClear: () => void;
  canClear: boolean;
}) {
  return (
    <div className="relative flex w-[52px] shrink-0 flex-col items-center gap-1 border-r border-gray-200 py-2 dark:border-gray-800">
      <CursorGroup kind={cursorKind} onChange={onCursorChange} armed={active === null} />

      <div className="my-1 h-px w-6 bg-gray-200 dark:bg-gray-800" />

      {TOOLS.map((tool) => {
        const on = active === tool.kind;
        return (
          <button
            key={tool.kind}
            type="button"
            title={TOOL_LABEL[tool.kind]}
            aria-label={TOOL_LABEL[tool.kind]}
            aria-pressed={on}
            onClick={() => onPick(on ? null : tool.kind)}
            className={`flex h-11 w-11 items-center justify-center rounded-lg transition-colors ${
              on
                ? "bg-brand-50 text-brand-500 dark:bg-white/10 dark:text-brand-400"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-100"
            }`}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
              aria-hidden="true"
            >
              {tool.icon}
            </svg>
          </button>
        );
      })}

      <div className="my-1 h-px w-6 bg-gray-200 dark:bg-gray-800" />

      <button
        type="button"
        title="Remove every drawing"
        aria-label="Remove every drawing"
        onClick={onClear}
        disabled={!canClear}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-error-50 hover:text-error-600 disabled:pointer-events-none disabled:opacity-30 dark:text-gray-400 dark:hover:bg-error-500/15 dark:hover:text-error-400"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <path d="M5 7h14M10 7V5.5a1 1 0 011-1h2a1 1 0 011 1V7M7 7l.8 11.2a1.5 1.5 0 001.5 1.3h5.4a1.5 1.5 0 001.5-1.3L17 7" />
        </svg>
      </button>

    </div>
  );
}

/**
 * The pointer-mode slot: the active glyph, and a flyout holding both modes.
 *
 * `armed` is false while a drawing tool is selected, which greys the slot back
 * down — the pointer mode is what the chart falls back to once the shape is
 * placed, not what is happening right now.
 */
function CursorGroup({
  kind,
  onChange,
  armed,
}: {
  kind: CursorKind;
  onChange: (kind: CursorKind) => void;
  armed: boolean;
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
    // Deferred by a tick so the click that opened the menu does not close it.
    const id = window.setTimeout(() => document.addEventListener("mousedown", away), 0);
    document.addEventListener("keydown", escape);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const current = CURSORS.find((c) => c.kind === kind) ?? CURSORS[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title={`Cursor — ${CURSOR_LABEL[kind]}`}
        aria-label={`Cursor — ${CURSOR_LABEL[kind]}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        className={`relative flex h-11 w-11 items-center justify-center rounded-lg transition-colors ${
          armed
            ? "bg-brand-50 text-brand-500 dark:bg-white/10 dark:text-brand-400"
            : "text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-100"
        }`}
      >
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          aria-hidden="true"
        >
          {current.icon}
        </svg>
        {/* The corner wedge TradingView puts on a slot that holds several
            tools. Purely an affordance — the whole button opens the list. */}
        <span className="absolute bottom-1 right-1 text-gray-400 dark:text-gray-500" aria-hidden="true">
          <svg width="6" height="6" viewBox="0 0 6 6" fill="currentColor">
            <path d="M6 6H0L6 0z" />
          </svg>
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute left-full top-0 z-50 ml-2 w-44 rounded-xl border border-gray-200 bg-white p-1.5 shadow-2xl dark:border-gray-700 dark:bg-[#1e222d]"
        >
          {CURSORS.map((option) => {
            const on = option.kind === kind;
            return (
              <button
                key={option.kind}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                onClick={() => {
                  onChange(option.kind);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-theme-sm transition-colors ${
                  on
                    ? "bg-gray-100 font-medium text-gray-900 dark:bg-white/10 dark:text-white"
                    : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
                }`}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                  aria-hidden="true"
                  className="shrink-0"
                >
                  {option.icon}
                </svg>
                {CURSOR_LABEL[option.kind]}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
