"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { deleteSet, saveSet, saveStyle, type SetsResult } from "@/app/backtest-actions";
import type { Timeframe } from "@/lib/backtest/candles";
import { FONT_SIZES, TOOL_LABEL, styleOf, type Drawing } from "@/lib/backtest/drawings";
import type { DrawingSet } from "@/lib/backtest/sets";
import { ColourButton, ColourPicker } from "./colour-picker";
import { Grip, useDraggable } from "./use-draggable";

/**
 * The bar that appears beside whatever drawing is selected.
 *
 * Deliberately few controls: save it, open its settings, delete it. Everything
 * the chart header used to carry lives here instead, next to the thing it acts
 * on. A label earns two extras — its colour and its size are what you actually
 * reach for once the words are down, and neither is worth a trip to the panel.
 */
export function DrawingToolbar({
  drawing,
  sets,
  timeframe,
  allDrawings,
  onChange,
  onSettings,
  onDelete,
  onSets,
  onApplySet,
}: {
  drawing: Drawing;
  sets: DrawingSet[];
  timeframe: Timeframe;
  allDrawings: Drawing[];
  onChange: (next: Drawing) => void;
  onSettings: () => void;
  onDelete: () => void;
  onSets: (result: SetsResult) => void;
  onApplySet: (set: DrawingSet) => void;
}) {
  const { gripProps, style } = useDraggable();
  const [saveOpen, setSaveOpen] = useState(false);
  const [colourOpen, setColourOpen] = useState(false);
  const isText = drawing.kind === "text";
  const text = styleOf(drawing);

  return (
    <div
      style={style}
      className="pointer-events-auto absolute left-1/2 top-4 z-30 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-gray-200 bg-white/95 px-1.5 py-1 shadow-xl backdrop-blur dark:border-gray-700 dark:bg-[#1e222d]/95"
    >
      <span {...gripProps} className="px-1 py-1.5" title="Drag to move">
        <Grip />
      </span>

      <div className="relative">
        <IconButton
          label="Save these drawings as a set"
          onClick={() => setSaveOpen((open) => !open)}
        >
          <path d="M6 4.5h12a1 1 0 011 1v14l-7-4-7 4v-14a1 1 0 011-1z" />
        </IconButton>
        {saveOpen ? (
          <SaveMenu
            sets={sets}
            timeframe={timeframe}
            drawing={drawing}
            drawings={allDrawings}
            onSets={onSets}
            onApply={onApplySet}
            onClose={() => setSaveOpen(false)}
          />
        ) : null}
      </div>

      {isText ? (
        <>
          <IconButton label="Edit text" onClick={onSettings}>
            <path d="M6.5 6.5V5h11v1.5M12 5.2v13.6M9.5 18.8h5" />
          </IconButton>

          <select
            value={text.fontSize}
            onChange={(event) => onChange({ ...drawing, fontSize: Number(event.target.value) })}
            aria-label="Font size"
            title="Font size"
            className="mx-0.5 cursor-pointer rounded-md border-0 bg-transparent py-1 text-theme-xs tabular-nums text-gray-600 outline-none dark:text-gray-300"
          >
            {FONT_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>

          <div className="relative mx-0.5">
            <ColourButton
              value={text.line}
              title="Text colour"
              onClick={() => setColourOpen((was) => !was)}
            />
            {colourOpen ? (
              <ColourPicker
                value={text.line}
                onChange={(color) => onChange({ ...drawing, color })}
                onClose={() => setColourOpen(false)}
              />
            ) : null}
          </div>
        </>
      ) : null}

      <IconButton label="Settings" onClick={onSettings}>
        {/* A toothed gear rather than radiating spokes — the latter reads as a
            brightness control at this size. */}
        <circle cx="12" cy="12" r="2.9" />
        <path d="M18.9 14.4a1.5 1.5 0 00.3 1.65l.05.05a1.75 1.75 0 11-2.48 2.48l-.05-.05a1.5 1.5 0 00-1.65-.3 1.5 1.5 0 00-.9 1.37v.15a1.75 1.75 0 11-3.5 0v-.08a1.5 1.5 0 00-.98-1.37 1.5 1.5 0 00-1.65.3l-.05.05A1.75 1.75 0 114.5 16.2l.05-.05a1.5 1.5 0 00.3-1.65 1.5 1.5 0 00-1.37-.9H3.3a1.75 1.75 0 110-3.5h.08a1.5 1.5 0 001.37-.98 1.5 1.5 0 00-.3-1.65l-.05-.05A1.75 1.75 0 116.88 4.9l.5.05a1.5 1.5 0 001.65.3h.07a1.5 1.5 0 00.9-1.37V3.3a1.75 1.75 0 113.5 0v.08a1.5 1.5 0 00.9 1.37 1.5 1.5 0 001.65-.3l.05-.05a1.75 1.75 0 112.48 2.48l-.05.05a1.5 1.5 0 00-.3 1.65v.07a1.5 1.5 0 001.37.9h.15a1.75 1.75 0 110 3.5h-.08a1.5 1.5 0 00-1.37.9z" />
      </IconButton>

      <IconButton label="Delete" onClick={onDelete} danger>
        <path d="M5 7h14M10 7V5.5a1 1 0 011-1h2a1 1 0 011 1V7M7 7l.8 11.2a1.5 1.5 0 001.5 1.3h5.4a1.5 1.5 0 001.5-1.3L17 7" />
      </IconButton>
    </div>
  );
}

/** Save the current markup under a name, or drop a saved set onto the chart. */
function SaveMenu({
  sets,
  timeframe,
  drawing,
  drawings,
  onSets,
  onApply,
  onClose,
}: {
  sets: DrawingSet[];
  timeframe: Timeframe;
  drawing: Drawing;
  drawings: Drawing[];
  onSets: (result: SetsResult) => void;
  onApply: (set: DrawingSet) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  /** null = menu, "set" = naming a shape set, "style" = naming a tool style. */
  const [naming, setNaming] = useState<null | "set" | "style">(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    function away(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose();
    }
    const id = window.setTimeout(() => document.addEventListener("mousedown", away), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", away);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-50 mt-1.5 w-60 rounded-xl border border-gray-200 bg-white py-1.5 shadow-2xl dark:border-gray-700 dark:bg-[#1e222d]"
    >
      {naming ? (
        <form
          className="px-2 py-1"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            startTransition(async () => {
              const result =
                naming === "style"
                  ? await saveStyle(drawing.kind, name, drawing)
                  : await saveSet(name, timeframe, drawings);
              if (result.ok) {
                onSets(result);
                onClose();
              } else setError(result.error);
            });
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={naming === "style" ? "Style name, e.g. FVG" : "Name, e.g. SUPPORT"}
            aria-label="Set name"
            className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-theme-xs text-gray-900 outline-none focus:border-brand-400 dark:border-gray-600 dark:bg-white/5 dark:text-white"
          />
          <div className="mt-1.5 flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setNaming(null)}
              className="rounded-md px-2 py-1 text-theme-xs text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || name.trim() === ""}
              className="rounded-md bg-brand-500 px-2.5 py-1 text-theme-xs font-medium text-white disabled:opacity-40"
            >
              Save
            </button>
          </div>
          {error ? <p className="mt-1 text-theme-xs text-error-500">{error}</p> : null}
        </form>
      ) : (
        <>
          {/* Two different saves, and the difference matters: one keeps the
              shapes where they are, the other keeps only how they look. */}
          <button
            type="button"
            onClick={() => setNaming("style")}
            className="block w-full px-3 py-1.5 text-left text-theme-xs text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/5"
          >
            Save {TOOL_LABEL[drawing.kind].toLowerCase()} style as…
          </button>
          <button
            type="button"
            onClick={() => setNaming("set")}
            className="block w-full px-3 py-1.5 text-left text-theme-xs text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/5"
          >
            Save all drawings as…
          </button>
        </>
      )}

      {sets.length > 0 ? (
        <>
          <div className="my-1 h-px bg-gray-100 dark:bg-gray-700" />
          {sets.map((set) => (
            <div
              key={set.id}
              className="group/set flex items-center hover:bg-gray-50 dark:hover:bg-white/5"
            >
              <button
                type="button"
                onClick={() => {
                  onApply(set);
                  onClose();
                }}
                className="min-w-0 flex-1 truncate px-3 py-1.5 text-left text-theme-xs uppercase tracking-wide text-gray-600 dark:text-gray-300"
              >
                {set.name}
              </button>
              {/* The only way to prune a saved set now that the header panel is
                  gone — hidden until the row is hovered so the list stays calm. */}
              <button
                type="button"
                aria-label={`Delete the ${set.name} set`}
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await deleteSet(set.id);
                    if (result.ok) onSets(result);
                    else setError(result.error);
                  })
                }
                className="mr-1.5 rounded p-1 text-gray-300 opacity-0 transition hover:bg-error-50 hover:text-error-600 group-hover/set:opacity-100 disabled:opacity-40 dark:text-gray-600 dark:hover:bg-error-500/15 dark:hover:text-error-400"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          ))}
        </>
      ) : null}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
        danger
          ? "text-gray-500 hover:bg-error-50 hover:text-error-600 dark:text-gray-400 dark:hover:bg-error-500/15 dark:hover:text-error-400"
          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
      }`}
    >
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    </button>
  );
}
