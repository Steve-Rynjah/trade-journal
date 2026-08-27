"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A swatch grid with an opacity slider, in place of the browser's colour dialog.
 *
 * The native `<input type="color">` opens an OS window that lands outside the
 * chart and has no notion of transparency, which is the one thing a zone fill
 * actually needs.
 */

const HUES = ["#f23645", "#ff9800", "#ffd60a", "#4caf50", "#089981", "#22b5bf", "#2962ff", "#674ea7", "#9c27b0", "#e91e63"];
const GREYS = ["#ffffff", "#e0e3eb", "#b2b5be", "#9598a1", "#787b86", "#5d606b", "#434651", "#2a2e39", "#1e222d", "#131722"];

/** Lighter and darker variants, so a row of hues becomes a usable palette. */
function shade(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const mix = (channel: number) =>
    Math.round(amount >= 0 ? channel + (255 - channel) * amount : channel * (1 + amount));
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

const ROWS = [GREYS, HUES, ...[0.6, 0.3, -0.25, -0.5].map((a) => HUES.map((h) => shade(h, a)))];

const CUSTOM_KEY = "backtest.custom-colours";

/**
 * Colours the user has mixed themselves.
 *
 * Kept in the browser next to the chart theme: they are a personal palette,
 * they belong to whoever is sitting at the machine, and losing them costs a few
 * seconds rather than any work.
 */
function loadCustom(): string[] {
  try {
    const raw = window.localStorage.getItem(CUSTOM_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === "string") : [];
  } catch {
    return [];
  }
}

function saveCustom(colours: string[]): void {
  try {
    window.localStorage.setItem(CUSTOM_KEY, JSON.stringify(colours.slice(0, 12)));
  } catch {
    /* a palette that will not persist is still usable this session */
  }
}

/** Splits `rgba(r, g, b, a)` or `#rrggbb` into a hex colour and its alpha. */
export function splitAlpha(value: string): { hex: string; alpha: number } {
  const rgba = value.match(/^rgba?\(([^)]+)\)$/i);
  if (rgba) {
    const [r, g, b, a] = rgba[1].split(",").map((part) => Number(part.trim()));
    const hex = `#${[r, g, b].map((n) => (n | 0).toString(16).padStart(2, "0")).join("")}`;
    return { hex, alpha: Number.isFinite(a) ? a : 1 };
  }
  return { hex: value, alpha: 1 };
}

/** Recombines them, staying hex while fully opaque so saved themes stay legible. */
export function withAlpha(hex: string, alpha: number): string {
  if (alpha >= 1) return hex;
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  const int = Number.parseInt(full, 16);
  if (Number.isNaN(int)) return hex;
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}

export function ColourPicker({
  value,
  opacity,
  onChange,
  onOpacity,
  onClose,
}: {
  /** Hex, or rgba when the colour carries its own alpha. */
  value: string;
  /**
   * Explicit opacity for callers that keep it in a separate field. Omit and the
   * picker reads the alpha out of `value` instead, emitting rgba on change —
   * which is how each candle element ends up with its own opacity.
   */
  opacity?: number;
  onChange: (colour: string) => void;
  onOpacity?: (opacity: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const parsed = splitAlpha(value);
  const selfManaged = opacity === undefined && onOpacity === undefined;
  const shownAlpha = opacity ?? parsed.alpha;

  const [custom, setCustom] = useState<string[]>(() =>
    typeof window === "undefined" ? [] : loadCustom(),
  );
  const [mixing, setMixing] = useState(false);
  const [draft, setDraft] = useState(parsed.hex);

  const pick = (colour: string) => onChange(selfManaged ? withAlpha(colour, parsed.alpha) : colour);

  const add = () => {
    if (!/^#[0-9a-f]{6}$/i.test(draft)) return;
    const next = [draft.toLowerCase(), ...custom.filter((c) => c !== draft.toLowerCase())];
    setCustom(next);
    saveCustom(next);
    pick(draft);
    setMixing(false);
  };

  useEffect(() => {
    function away(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose();
    }
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    // Deferred so the click that opened this does not immediately close it.
    const id = window.setTimeout(() => document.addEventListener("mousedown", away), 0);
    document.addEventListener("keydown", key);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-50 mt-1.5 w-[17.5rem] rounded-xl border border-gray-200 bg-white p-3 shadow-2xl dark:border-gray-700 dark:bg-[#1e222d]"
    >
      <div className="space-y-1">
        {ROWS.map((row, i) => (
          <div key={i} className="grid grid-cols-10 gap-1">
            {row.map((colour) => (
              <button
                key={colour}
                type="button"
                aria-label={colour}
                onClick={() => pick(colour)}
                style={{ background: colour }}
                className={`h-5 w-full rounded-[3px] border transition-transform hover:scale-110 ${
                  colour.toLowerCase() === parsed.hex.toLowerCase()
                    ? "border-brand-400 ring-2 ring-brand-400"
                    : "border-black/10 dark:border-white/10"
                }`}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Mixed colours, and the way to make one. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1 border-t border-gray-100 pt-2.5 dark:border-gray-700">
        {custom.map((colour) => (
          <button
            key={colour}
            type="button"
            aria-label={colour}
            title={colour}
            onClick={() => pick(colour)}
            style={{ background: colour }}
            className={`h-5 w-5 rounded-[3px] border transition-transform hover:scale-110 ${
              colour.toLowerCase() === parsed.hex.toLowerCase()
                ? "border-brand-400 ring-2 ring-brand-400"
                : "border-black/10 dark:border-white/10"
            }`}
          />
        ))}
        <button
          type="button"
          aria-label="Add a custom colour"
          title="Add a custom colour"
          onClick={() => {
            setDraft(parsed.hex);
            setMixing((open) => !open);
          }}
          className="flex h-5 w-5 items-center justify-center rounded-[3px] border border-dashed border-gray-400 text-gray-500 transition-colors hover:border-brand-400 hover:text-brand-500 dark:border-gray-600 dark:text-gray-400"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      {mixing ? (
        <div className="mt-2 flex items-center gap-1.5">
          {/* The OS picker does the visual mixing; the field is for pasting a
              known hex, which is how a brand colour usually arrives. */}
          <label
            className="h-7 w-9 shrink-0 cursor-pointer rounded-md border border-gray-300 dark:border-gray-600"
            style={{ background: /^#[0-9a-f]{6}$/i.test(draft) ? draft : "#000000" }}
            title="Pick visually"
          >
            <input
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(draft) ? draft : "#000000"}
              onChange={(event) => setDraft(event.target.value)}
              className="sr-only"
            />
          </label>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
            spellCheck={false}
            aria-label="Hex colour"
            placeholder="#0b0e11"
            className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 font-mono text-theme-xs text-gray-800 outline-none focus:border-brand-400 dark:border-gray-600 dark:bg-white/5 dark:text-gray-200"
          />
          <button
            type="button"
            onClick={add}
            disabled={!/^#[0-9a-f]{6}$/i.test(draft)}
            className="shrink-0 rounded-md bg-brand-500 px-2.5 py-1 text-theme-xs font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-40"
          >
            Add
          </button>
        </div>
      ) : null}

      {opacity !== undefined || selfManaged ? (
        <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <span className="text-theme-xs text-gray-500 dark:text-gray-400">Opacity</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(shownAlpha * 100)}
              onChange={(event) => {
                const next = Number(event.target.value) / 100;
                if (selfManaged) onChange(withAlpha(parsed.hex, next));
                else onOpacity?.(next);
              }}
              aria-label="Opacity"
              className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-gray-200 accent-brand-500 dark:bg-gray-600"
            />
            <span className="w-10 text-right text-theme-xs tabular-nums text-gray-600 dark:text-gray-300">
              {Math.round(shownAlpha * 100)}%
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** The button that opens the picker — a swatch showing the current colour. */
export function ColourButton({
  value,
  title,
  onClick,
}: {
  value: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="flex h-7 w-9 items-center justify-center rounded-md border border-gray-300 transition-colors hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500"
      style={{ background: value }}
    />
  );
}
