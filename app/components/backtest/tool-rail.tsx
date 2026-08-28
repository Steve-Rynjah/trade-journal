"use client";


import { TOOL_LABEL, type ToolKind } from "@/lib/backtest/drawings";

/**
 * The six tools, drawn the way TradingView draws them: a thin monochrome glyph
 * with open circles marking where the shape's grab points will be.
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
  active,
  onPick,
  onClear,
  canClear,
  onChartSettings,
  onSessionSettings,
  sessionsOn,
}: {
  active: ToolKind | null;
  onPick: (kind: ToolKind | null) => void;
  onClear: () => void;
  canClear: boolean;
  /** Saved style presets, keyed by the tool they belong to. */
  onChartSettings: () => void;
  onSessionSettings: () => void;
  /** Lights the button up while the indicator is switched on. */
  sessionsOn: boolean;
}) {
  return (
    <div className="relative flex w-[52px] shrink-0 flex-col items-center gap-1 border-r border-gray-200 py-2 dark:border-gray-800">
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

      {/* Asian / London / New York ranges. Three stacked bands, which is what
          the indicator actually puts on the chart. */}
      <button
        type="button"
        title="Session Indicator"
        aria-label="Session Indicator"
        aria-pressed={sessionsOn}
        onClick={onSessionSettings}
        className={`flex h-11 w-11 items-center justify-center rounded-lg transition-colors ${
          sessionsOn
            ? "bg-brand-50 text-brand-500 dark:bg-white/10 dark:text-brand-400"
            : "text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-100"
        }`}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
          <rect x="3.5" y="5.5" width="6" height="6" rx="0.8" />
          <rect x="9.5" y="9.5" width="6" height="6" rx="0.8" />
          <rect x="15.5" y="7.5" width="5" height="6" rx="0.8" />
          <path d="M3.5 19.5h17" />
        </svg>
      </button>

      {/* Canvas and candle appearance — the surface everything else sits on,
          so it lives at the foot of the rail rather than in the chart header. */}
      <button
        type="button"
        title="Chart appearance"
        aria-label="Chart appearance"
        onClick={onChartSettings}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-100"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8 4.5v15M16 4.5v15" />
          <rect x="5.5" y="8" width="5" height="8" rx="1" />
          <rect x="13.5" y="6.5" width="5" height="8" rx="1" />
        </svg>
      </button>

    </div>
  );
}
