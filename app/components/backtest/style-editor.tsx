"use client";

import { useEffect, useRef, useState } from "react";

import { TOOL_LABEL, styleOf, type Drawing } from "@/lib/backtest/drawings";
import { ColourButton, ColourPicker } from "./colour-picker";
import { Grip, useDraggable } from "./use-draggable";

/**
 * Per-drawing settings.
 *
 * Opened by double-clicking a drawing, or from the toolbar while one is
 * selected. Which controls appear depends on the tool: a vertical line has no
 * background to colour, and only a position has money behind it.
 */
export function StyleEditor({
  drawing,
  onChange,
  onDelete,
  onClose,
}: {
  drawing: Drawing;
  onChange: (next: Drawing) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const style = styleOf(drawing);
  const ref = useRef<HTMLDivElement>(null);
  const { gripProps, style: dragStyle } = useDraggable();
  /** Which swatch has its picker open, if any. */
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    function onPointerDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose();
    }
    document.addEventListener("keydown", onKey);
    // Deferred: the very click that opened this would otherwise close it again.
    const id = window.setTimeout(() => document.addEventListener("mousedown", onPointerDown), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [onClose]);

  const set = (patch: Partial<Drawing>) => onChange({ ...drawing, ...patch });
  const isPosition = drawing.kind === "long-position" || drawing.kind === "short-position";
  const isRectangle = drawing.kind === "rectangle";
  const isLine = drawing.kind === "trendline";

  return (
    <div
      ref={ref}
      style={dragStyle}
      className="absolute left-1/2 top-6 z-50 w-[21rem] -translate-x-1/2 rounded-xl border border-gray-200 bg-white p-4 shadow-2xl dark:border-gray-700 dark:bg-[#1e222d]"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span {...gripProps} className="-ml-1 py-1" title="Drag to move">
            <Grip />
          </span>
          <h2 className="text-theme-sm font-semibold text-gray-900 dark:text-white">
            {TOOL_LABEL[drawing.kind]}
          </h2>
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

      <div className="mt-3 space-y-3">
        <Row label={isPosition ? "Entry line" : "Line"}>
          <Swatch
            id="line"
            open={open}
            setOpen={setOpen}
            value={style.line}
            onChange={(color) => set({ color })}
          />
          <Width value={style.lineWidth} onChange={(lineWidth) => set({ lineWidth })} />
        </Row>

        {isLine ? (
          <Row label="Text">
            <input
              value={drawing.text ?? ""}
              onChange={(event) => set({ text: event.target.value })}
              placeholder="Shown in a gap mid-line"
              aria-label="Line text"
              className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-theme-xs text-gray-800 outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-white/5 dark:text-gray-200"
            />
          </Row>
        ) : null}

        {isRectangle ? (
          <>
            <Row label="Border">
              <Toggle
                checked={style.showBorder}
                onChange={(showBorder) => set({ showBorder })}
                label="Show border"
              />
            </Row>
            <Row label="Background">
              <Swatch
                id="fill"
                open={open}
                setOpen={setOpen}
                value={style.fill}
                opacity={style.fillOpacity}
                onChange={(fill) => set({ fill })}
                onOpacity={(fillOpacity) => set({ fillOpacity })}
              />
              <Toggle
                checked={style.showFill}
                onChange={(showFill) => set({ showFill })}
                label="Fill"
              />
            </Row>
            <Row label="Extend">
              <Toggle
                checked={style.extend}
                onChange={(extend) => set({ extend })}
                label="Extend right"
              />
            </Row>
          </>
        ) : null}

        {isPosition ? (
          <>
            <Row label="Target">
              <Swatch
                id="target"
                open={open}
                setOpen={setOpen}
                value={style.targetColor}
                onChange={(targetColor) => set({ targetColor })}
              />
            </Row>
            <Row label="Stop">
              <Swatch
                id="stop"
                open={open}
                setOpen={setOpen}
                value={style.stopColor}
                onChange={(stopColor) => set({ stopColor })}
              />
            </Row>

            <div className="border-t border-gray-100 pt-3 dark:border-gray-800">
              <p className="mb-2 text-theme-xs font-medium uppercase tracking-wide text-gray-400">
                Sizing
              </p>
              <Row label="Account">
                <Num
                  value={style.accountSize}
                  step={100}
                  onChange={(accountSize) => set({ accountSize })}
                />
              </Row>
              <Row label="Risk %">
                <Num
                  value={style.riskPercent}
                  step={0.25}
                  onChange={(riskPercent) => set({ riskPercent })}
                />
              </Row>
            </div>

            <div className="border-t border-gray-100 pt-3 dark:border-gray-800">
              <p className="mb-2 text-theme-xs font-medium uppercase tracking-wide text-gray-400">
                Levels
              </p>
              {(["Entry", "Target", "Stop"] as const).map((name, index) => (
                <Row key={name} label={name}>
                  <Num
                    value={drawing.points[index]?.price ?? 0}
                    step={0.0001}
                    decimals={5}
                    onChange={(price) => {
                      const points = drawing.points.map((p) => ({ ...p }));
                      points[index] = { ...points[index], price };
                      set({ points });
                    }}
                  />
                </Row>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 dark:border-gray-800">
        <button
          type="button"
          onClick={onDelete}
          className="rounded-lg px-2.5 py-1.5 text-theme-xs font-medium text-error-600 transition-colors hover:bg-error-50 dark:text-error-400 dark:hover:bg-error-500/15"
        >
          Delete
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-theme-xs text-gray-500 dark:text-gray-400">{label}</span>
      <div className="flex flex-1 items-center gap-2">{children}</div>
    </div>
  );
}

/** A swatch that opens the palette, with only one palette open at a time. */
function Swatch({
  id,
  open,
  setOpen,
  value,
  opacity,
  onChange,
  onOpacity,
}: {
  id: string;
  open: string | null;
  setOpen: (id: string | null) => void;
  value: string;
  opacity?: number;
  onChange: (value: string) => void;
  onOpacity?: (value: number) => void;
}) {
  return (
    <div className="relative">
      <ColourButton value={value} title="Pick a colour" onClick={() => setOpen(open === id ? null : id)} />
      {open === id ? (
        <ColourPicker
          value={value}
          opacity={opacity}
          onChange={onChange}
          onOpacity={onOpacity}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
}

function Width({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      aria-label="Line width"
      className="rounded-md border border-gray-200 bg-white px-2 py-1 text-theme-xs text-gray-800 dark:border-gray-800 dark:bg-white/5 dark:text-gray-200"
    >
      {[1, 2, 3, 4].map((width) => (
        <option key={width} value={width}>
          {width}px
        </option>
      ))}
    </select>
  );
}

function Toggle({
  checked,
  onChange,
  label,
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
  value,
  onChange,
  step,
  decimals = 2,
}: {
  value: number;
  onChange: (value: number) => void;
  step: number;
  decimals?: number;
}) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? Number(value.toFixed(decimals)) : 0}
      step={step}
      onChange={(event) => {
        const next = Number(event.target.value);
        if (Number.isFinite(next)) onChange(next);
      }}
      className="w-32 rounded-md border border-gray-200 bg-white px-2 py-1 text-theme-xs tabular-nums text-gray-800 outline-none focus:border-brand-400 dark:border-gray-800 dark:bg-white/5 dark:text-gray-200"
    />
  );
}
