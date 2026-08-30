"use client";

import { useEffect, useRef, useState } from "react";

import { DARK_THEME, LIGHT_THEME, type ChartTheme } from "@/lib/backtest/chart-theme";
import { ColourButton, ColourPicker } from "./colour-picker";
import { Grip, useDraggable } from "./use-draggable";

/**
 * Canvas and candle appearance.
 *
 * Split the way TradingView splits it — what the candles are made of, then what
 * they sit on — because those are the two questions people actually arrive with.
 */
export function ChartSettings({
  theme,
  onChange,
  onClose,
}: {
  theme: ChartTheme;
  onChange: (next: ChartTheme) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { gripProps, style: dragStyle } = useDraggable();
  const [open, setOpen] = useState<string | null>(null);
  const [tab, setTab] = useState<"candles" | "canvas">("candles");

  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    function away(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose();
    }
    document.addEventListener("keydown", key);
    const id = window.setTimeout(() => document.addEventListener("mousedown", away), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("keydown", key);
      document.removeEventListener("mousedown", away);
    };
  }, [onClose]);

  const set = (patch: Partial<ChartTheme>) => onChange({ ...theme, ...patch });

  return (
    <div
      ref={ref}
      style={dragStyle}
      className="absolute right-4 top-4 z-50 w-[23rem] rounded-xl border border-gray-200 bg-white p-4 shadow-2xl dark:border-gray-700 dark:bg-[#1e222d]"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span {...gripProps} className="-ml-1 py-1" title="Drag to move">
            <Grip />
          </span>
          <h2 className="text-theme-sm font-semibold text-gray-900 dark:text-white">Chart</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-700 dark:hover:bg-white/5"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="mt-3 flex gap-1 border-b border-gray-100 dark:border-gray-700">
        {(["candles", "canvas"] as const).map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setTab(name)}
            className={`-mb-px border-b-2 px-3 py-1.5 text-theme-xs font-medium capitalize transition-colors ${
              tab === name
                ? "border-brand-500 text-gray-900 dark:text-white"
                : "border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-3">
        {tab === "candles" ? (
          <>
            <Pair label="Body" open={open} setOpen={setOpen} id="body"
              up={theme.upColor} down={theme.downColor}
              onUp={(upColor) => set({ upColor })} onDown={(downColor) => set({ downColor })} />

            <Pair label="Borders" open={open} setOpen={setOpen} id="border"
              up={theme.upBorder} down={theme.downBorder}
              onUp={(upBorder) => set({ upBorder })} onDown={(downBorder) => set({ downBorder })}
              checked={theme.showBorders} onCheck={(showBorders) => set({ showBorders })} />

            <Pair label="Wick" open={open} setOpen={setOpen} id="wick"
              up={theme.upWick} down={theme.downWick}
              onUp={(upWick) => set({ upWick })} onDown={(downWick) => set({ downWick })}
              checked={theme.showWicks} onCheck={(showWicks) => set({ showWicks })} />

            <p className="pt-1 text-theme-xs text-gray-400">
              Each swatch carries its own opacity — open one to set it.
            </p>
          </>
        ) : (
          <>
            <Row label="Background">
              <Swatch id="bg" open={open} setOpen={setOpen} value={theme.background}
                onChange={(background) => set({ background })} />
            </Row>
            <Row label="Grid">
              <Swatch id="grid" open={open} setOpen={setOpen} value={theme.grid}
                onChange={(grid) => set({ grid })} />
              <Check checked={theme.showGrid} onChange={(showGrid) => set({ showGrid })} label="Show" />
            </Row>

            {/* The rules that fence the price axis off from the chart, and the
                date strip off from the bottom of it. */}
            <Row label="Scale lines">
              <Swatch id="scaleline" open={open} setOpen={setOpen} value={theme.scaleLine}
                onChange={(scaleLine) => set({ scaleLine })} />
              <Check
                checked={theme.showScaleLines}
                onChange={(showScaleLines) => set({ showScaleLines })}
                label="Show"
              />
            </Row>

            <Row label="Scale text">
              <Swatch id="scaletext" open={open} setOpen={setOpen} value={theme.scaleText}
                onChange={(scaleText) => set({ scaleText })} />
            </Row>

            {/* Chart furniture rather than a candle property, so it lives here
                beside the grid and the scales. */}
            <Row label="Position arrow">
              <Swatch id="arrow" open={open} setOpen={setOpen} value={theme.positionArrow}
                onChange={(positionArrow) => set({ positionArrow })} />
            </Row>

            <div className="border-t border-gray-100 pt-3 dark:border-gray-700">
              <p className="mb-2 text-theme-xs font-medium uppercase tracking-wide text-gray-400">
                Margins
              </p>
              <Row label="Top">
                <Num value={theme.marginTop} suffix="%" onChange={(marginTop) => set({ marginTop })} />
              </Row>
              <Row label="Bottom">
                <Num value={theme.marginBottom} suffix="%" onChange={(marginBottom) => set({ marginBottom })} />
              </Row>
              <Row label="Right">
                <Num value={theme.rightOffset} suffix="bars" onChange={(rightOffset) => set({ rightOffset })} />
              </Row>
            </div>
          </>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 dark:border-gray-700">
        <button
          type="button"
          onClick={() =>
            onChange(document.documentElement.classList.contains("dark") ? DARK_THEME : LIGHT_THEME)
          }
          className="rounded-lg px-2.5 py-1.5 text-theme-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/5"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-brand-500 px-3.5 py-1.5 text-theme-xs font-medium text-white transition-colors hover:bg-brand-600"
        >
          Done
        </button>
      </div>
    </div>
  );
}

/** An up/down colour pair, optionally switchable off entirely. */
function Pair({
  label, id, open, setOpen, up, down, onUp, onDown, checked, onCheck,
}: {
  label: string;
  id: string;
  open: string | null;
  setOpen: (id: string | null) => void;
  up: string;
  down: string;
  onUp: (value: string) => void;
  onDown: (value: string) => void;
  checked?: boolean;
  onCheck?: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex w-24 shrink-0 items-center gap-1.5">
        {onCheck ? <Check checked={checked ?? true} onChange={onCheck} label="" /> : null}
        <span className="text-theme-xs text-gray-600 dark:text-gray-300">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <Swatch id={`${id}-up`} open={open} setOpen={setOpen} value={up} onChange={onUp} />
        <Swatch id={`${id}-down`} open={open} setOpen={setOpen} value={down} onChange={onDown} />
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-theme-xs text-gray-500 dark:text-gray-400">{label}</span>
      <div className="flex flex-1 items-center gap-2">{children}</div>
    </div>
  );
}

function Swatch({
  id, open, setOpen, value, onChange,
}: {
  id: string;
  open: string | null;
  setOpen: (id: string | null) => void;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <ColourButton value={value} title="Pick a colour" onClick={() => setOpen(open === id ? null : id)} />
      {open === id ? (
        <ColourPicker value={value} onChange={onChange} onClose={() => setOpen(null)} />
      ) : null}
    </div>
  );
}

function Check({
  checked, onChange, label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-theme-xs text-gray-600 dark:text-gray-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3.5 w-3.5 accent-brand-500"
      />
      {label}
    </label>
  );
}

function Num({
  value, onChange, suffix,
}: {
  value: number;
  onChange: (value: number) => void;
  suffix: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <input
        type="number"
        value={value}
        min={0}
        max={90}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
        className="w-20 rounded-md border border-gray-200 bg-white px-2 py-1 text-theme-xs tabular-nums text-gray-800 outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-white/5 dark:text-gray-200"
      />
      <span className="text-theme-xs text-gray-400">{suffix}</span>
    </span>
  );
}
