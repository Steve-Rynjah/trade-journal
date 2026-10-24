"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { addScreenshots, deleteTrade, removeScreenshot, updateTrade } from "@/app/actions";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import {
  BIASES,
  DIRECTIONS,
  MAX_SCREENSHOTS_PER_TRADE,
  RESULTS,
  SETUPS,
  dayNameOf,
  formatTradeDate,
  monthBounds,
  sortSetups,
  type Bias,
  type Direction,
  type Screenshot,
  type Setup,
  type TradeResult,
  type TradeWithScreenshot,
} from "@/lib/types";
import {
  BiasBadge,
  biasLabel,
  DirectionBadge,
  ResultBadge,
  SETUP_STYLES,
  SetupChip,
  fieldBad,
  fieldBase,
  fieldClass,
  fieldGood,
  fieldMuted,
  fieldNeutral,
} from "../ui";
import { ScreenshotLightbox, type Lightbox } from "../screenshot-lightbox";

/** The fields a row holds, as strings — exactly what the inputs produce. */
export type Draft = {
  tradeDate: string;
  bias: Bias | "";
  direction: Direction | "";
  setups: Setup[];
  result: TradeResult | "";
  remarks: string;
  /**
   * Not on the sheet. A new trade is always `1 : 2`; an edited one keeps
   * whatever it was saved with, so PnL never shifts under an old row.
   */
  ratio: string;
  /** Charts picked for the row but not uploaded yet, won or lost. */
  screenshots: File[];
};

const TH =
  "whitespace-nowrap px-4 py-3 text-left text-theme-xs font-medium uppercase tracking-[0.06em] text-gray-500 dark:text-gray-400";
const TD = "px-4 py-3 align-top text-theme-sm";

function SelectCell<T extends string>({
  label,
  value,
  options,
  onChange,
  tone,
  format,
  placeholder = "—",
  minWidth = "min-w-[6.5rem]",
}: {
  label: string;
  /** `""` until the journal picks something — a fresh row starts unset. */
  value: T | "";
  options: readonly T[];
  onChange: (next: T) => void;
  /** Shown while the cell is unset. */
  placeholder?: string;
  /** Green for the bullish side, red for the bearish one. */
  tone?: (option: T) => string;
  format?: (option: T) => string;
  /**
   * A select sizes itself to its longest option, and `box-sizing: border-box`
   * then lets the chevron's right padding eat into that width — so the text
   * clips unless a minimum is stated that already allows for the padding.
   */
  minWidth?: string;
}) {
  return (
    <span className="relative block">
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className={`${fieldBase} ${value !== "" && tone ? tone(value) : fieldNeutral} ${minWidth} h-9 appearance-none truncate pr-7`}
      >
        {/* Kept in the list so an unset cell still has something to display. */}
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((option) => (
          <option key={option} value={option}>
            {format ? format(option) : option}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 opacity-60"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M6 9.5l6 6 6-6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/** Grows with its content, so a long note pushes the whole row taller. */
function RemarksCell({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      aria-label="Remarks"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        // Enter commits; Shift+Enter is how you get a second line.
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          onSubmit();
        }
      }}
      placeholder="What went right, or what to fix"
      className={`${fieldClass} min-h-9 resize-none overflow-hidden leading-6`}
    />
  );
}

/**
 * Chip tags for the row. The list opens in a portal: the table scrolls
 * sideways, and anything absolutely placed inside it would be clipped.
 */
function SetupPicker({
  value,
  onChange,
}: {
  value: Setup[];
  onChange: (next: Setup[]) => void;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!anchor) return;
    const close = () => setAnchor(null);
    const inside = (target: EventTarget | null) =>
      target instanceof Node &&
      (menuRef.current?.contains(target) || buttonRef.current?.contains(target));

    function onPointerDown(event: MouseEvent) {
      if (!inside(event.target)) close();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    // The list is pinned to where the button was; once the page moves, it no
    // longer points at anything.
    function onScroll(event: Event) {
      if (!inside(event.target)) close();
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [anchor]);

  function toggle(setup: Setup) {
    onChange(
      sortSetups(value.includes(setup) ? value.filter((s) => s !== setup) : [...value, setup]),
    );
  }

  // Open upward when the row is near the bottom of the window.
  const MENU_HEIGHT = 220;
  const above =
    anchor !== null &&
    window.innerHeight - anchor.bottom < MENU_HEIGHT &&
    anchor.top > window.innerHeight - anchor.bottom;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Setup"
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        onClick={() =>
          setAnchor((open) => (open ? null : buttonRef.current!.getBoundingClientRect()))
        }
        className={`${fieldClass} relative flex min-h-9 flex-wrap items-center gap-1 pr-7 text-left`}
      >
        {value.length === 0 ? (
          <span className="text-gray-400 dark:text-gray-500">—</span>
        ) : (
          value.map((setup) => <SetupChip key={setup} setup={setup} />)
        )}
        <svg
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 opacity-60"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M6 9.5l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {anchor
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label="Setups"
              style={{
                left: Math.max(8, Math.min(anchor.left, window.innerWidth - 368)),
                ...(above
                  ? { bottom: window.innerHeight - anchor.top + 6 }
                  : { top: anchor.bottom + 6 }),
              }}
              className="fixed z-50 w-[22rem] max-w-[calc(100vw-1rem)] rounded-xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-900"
            >
              {/* Pills that wrap: grey until picked, then their own colour with
                  a × to drop them again. */}
              <div className="flex flex-wrap gap-2">
                {SETUPS.map((setup) => {
                  const checked = value.includes(setup);
                  return (
                    <button
                      key={setup}
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={checked}
                      onClick={() => toggle(setup)}
                      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-theme-xs font-medium transition-colors ${
                        checked
                          ? `${SETUP_STYLES[setup]} ring-1 ring-current/40`
                          : "bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:bg-white/[0.05] dark:text-gray-500 dark:hover:bg-white/[0.09] dark:hover:text-gray-300"
                      }`}
                    >
                      {setup}
                      {checked ? (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path
                            d="M6 6l12 12M18 6L6 18"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                          />
                        </svg>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              {value.length > 0 ? (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="mt-3 w-full border-t border-gray-100 pt-2 text-left text-theme-xs text-gray-500 hover:text-error-500 dark:border-gray-800 dark:text-gray-400"
                >
                  Clear all
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/** A small square preview of a chart. */
function Thumb({ url, label, onClick }: { url: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block h-8 w-12 shrink-0 overflow-hidden rounded-md ring-1 ring-gray-200 transition-transform hover:scale-105 dark:ring-gray-700"
      aria-label={label}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="h-full w-full object-cover" />
    </button>
  );
}

const biasTone = (option: Bias) => (option === "BULLISH" ? fieldGood : fieldBad);
const directionTone = (option: Direction) => (option === "LONG" ? fieldGood : fieldBad);
const resultTone = (option: TradeResult) =>
  option === "WIN" ? fieldGood : option === "LOSE" ? fieldBad : fieldMuted;

/** The input cells, shared by the new-trade row and any row being edited. */
function DraftCells({
  draft,
  onChange,
  onSubmit,
  onPickFile,
  fallbackDate,
  bounds,
  existing = [],
  onOpenExisting,
  onRemoveExisting,
  removing,
}: {
  draft: Draft;
  onChange: (next: Draft) => void;
  onSubmit: () => void;
  onPickFile: () => void;
  /** Shown until the row is typed into — always a date inside the sheet. */
  fallbackDate: string;
  /** The sheet's month. Every date this row can produce falls inside it. */
  bounds: { start: string; end: string };
  /** Charts already saved on the row being edited. */
  existing?: Screenshot[];
  onOpenExisting?: (index: number) => void;
  onRemoveExisting?: (path: string) => void;
  /** The chart currently being taken off, so its button can say so. */
  removing?: string | null;
}) {
  // An untouched row already reads as a date in this month, so "fill it in and
  // save" cannot quietly file the trade under a month you were not looking at.
  const shownDate = draft.tradeDate || fallbackDate;
  const room = MAX_SCREENSHOTS_PER_TRADE - existing.length - draft.screenshots.length;

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      onSubmit();
    }
  }

  return (
    <>
      <td className={`${TD} cell-rule`} onKeyDown={onKeyDown}>
        {/* min/max keep the native picker on this month and refuse anything
            outside it — the Date cell is the one place the row could otherwise
            disagree with the sheet it is being typed into. The weekday is read
            off this date wherever it is needed; there is no Day cell to keep
            in step. */}
        <input
          type="date"
          aria-label="Date"
          value={shownDate}
          min={bounds.start}
          max={bounds.end}
          onChange={(event) => onChange({ ...draft, tradeDate: event.target.value })}
          className={`${fieldClass} tnum h-9`}
        />
      </td>
      <td className={`${TD} cell-rule`} onKeyDown={onKeyDown}>
        <SelectCell
          label="Bias"
          value={draft.bias}
          options={BIASES}
          onChange={(bias) => onChange({ ...draft, bias })}
          tone={biasTone}
          format={biasLabel}
          placeholder="—"
        />
      </td>
      <td className={`${TD} cell-rule`} onKeyDown={onKeyDown}>
        <SelectCell
          label="Direction"
          value={draft.direction}
          options={DIRECTIONS}
          onChange={(direction) => onChange({ ...draft, direction })}
          tone={directionTone}
        />
      </td>
      <td className={`${TD} cell-rule`}>
        <SetupPicker value={draft.setups} onChange={(setups) => onChange({ ...draft, setups })} />
      </td>
      <td className={`${TD} cell-rule`} onKeyDown={onKeyDown}>
        <SelectCell
          label="Result"
          value={draft.result}
          options={RESULTS}
          onChange={(result) => onChange({ ...draft, result })}
          tone={resultTone}
        />
      </td>
      <td className={`${TD} cell-rule`}>
        <RemarksCell
          value={draft.remarks}
          onChange={(remarks) => onChange({ ...draft, remarks })}
          onSubmit={onSubmit}
        />
      </td>
      <td className={`${TD} cell-rule`}>
        {draft.result ? (
          <span className="flex flex-col gap-1.5">
            {existing.length > 0 ? (
              <span className="flex flex-wrap gap-1.5">
                {existing.map((shot, index) => (
                  <span key={shot.path} className="relative">
                    <Thumb
                      url={shot.url}
                      label={`Open chart ${index + 1}`}
                      onClick={() => onOpenExisting?.(index)}
                    />
                    <button
                      type="button"
                      aria-label={`Remove chart ${index + 1}`}
                      title="Remove this chart"
                      disabled={removing === shot.path}
                      onClick={() => onRemoveExisting?.(shot.path)}
                      className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-gray-800 text-white ring-2 ring-white hover:bg-error-500 disabled:opacity-50 dark:ring-gray-900"
                    >
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path
                          d="M6 6l12 12M18 6L6 18"
                          stroke="currentColor"
                          strokeWidth="3.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </span>
                ))}
              </span>
            ) : null}
            {room > 0 || draft.screenshots.length > 0 ? (
              <button
                type="button"
                onClick={onPickFile}
                disabled={room <= 0}
                title={
                  room <= 0
                    ? `A trade holds at most ${MAX_SCREENSHOTS_PER_TRADE} charts`
                    : "Pick one or more chart images"
                }
                className="w-full rounded-lg border border-dashed border-gray-300 px-2 py-1.5 text-theme-xs text-gray-500 transition-colors hover:border-brand-300 hover:text-brand-500 disabled:cursor-default disabled:hover:border-gray-300 disabled:hover:text-gray-500 dark:border-gray-700 dark:text-gray-400"
              >
                {draft.screenshots.length > 0
                  ? `${draft.screenshots.length} ${existing.length > 0 ? "new" : draft.screenshots.length === 1 ? "image" : "images"}${room > 0 ? " · +" : ""}`
                  : "+ Images"}
              </button>
            ) : null}
          </span>
        ) : (
          <span className="text-gray-300 dark:text-gray-600">—</span>
        )}
      </td>
    </>
  );
}

export function TradeSheet({
  trades,
  draft,
  onDraftChange,
  onSaveDraft,
  pending,
  onError,
  fallbackDate,
  version,
  month,
  year,
}: {
  trades: TradeWithScreenshot[];
  draft: Draft;
  onDraftChange: (next: Draft) => void;
  onSaveDraft: () => void;
  pending: boolean;
  onError: (message: string | null) => void;
  /** A date inside the month on screen, shown until the row is typed into. */
  fallbackDate: string;
  /**
   * The sheet these rows came from. Every row on screen already belongs to it,
   * so an edit re-states it rather than letting the update drop the column.
   */
  version: number;
  month: number;
  year: number;
}) {
  const bounds = monthBounds(month, year);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<Lightbox>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  /** Which saved row the shared file picker is currently acting for. */
  const uploadFor = useRef<string | null>(null);
  const rowFileRef = useRef<HTMLInputElement>(null);
  const draftFileRef = useRef<HTMLInputElement>(null);

  function draftOf(trade: TradeWithScreenshot): Draft {
    return {
      tradeDate: trade.tradeDate,
      bias: trade.bias,
      direction: trade.direction,
      setups: trade.setups,
      result: trade.result,
      remarks: trade.remarks ?? "",
      ratio: trade.ratio,
      screenshots: [],
    };
  }

  async function saveEdit() {
    if (!editingId || !editDraft) return;
    onError(null);
    setBusy(true);
    const data = new FormData();
    data.set("id", editingId);
    data.set("trade_date", editDraft.tradeDate);
    data.set("version", String(version));
    data.set("bias", editDraft.bias);
    data.set("direction", editDraft.direction);
    data.set("ratio", editDraft.ratio);
    data.set("result", editDraft.result);
    data.set("remarks", editDraft.remarks);
    for (const setup of editDraft.setups) data.append("setups", setup);
    for (const file of editDraft.screenshots) data.append("screenshot", file);

    const result = await updateTrade(EMPTY_FORM_STATE, data);
    setBusy(false);
    if (result.status === "success") {
      setEditingId(null);
      setEditDraft(null);
    } else {
      onError(result.message);
    }
  }

  async function removeTrade(id: string) {
    setBusy(true);
    const result = await deleteTrade(id);
    setBusy(false);
    if (result.status === "error") onError(result.message);
    setConfirming(null);
  }

  async function attachToRow(files: File[]) {
    const id = uploadFor.current;
    if (files.length === 0 || !id) return;
    onError(null);
    setBusy(true);
    const data = new FormData();
    data.set("id", id);
    for (const file of files) data.append("screenshot", file);
    const result = await addScreenshots(data);
    setBusy(false);
    if (result.status === "error") onError(result.message);
  }

  async function detach(id: string, path: string) {
    onError(null);
    setRemoving(path);
    const result = await removeScreenshot(id, path);
    setRemoving(null);
    if (result.status === "error") onError(result.message);
  }

  function openCharts(trade: TradeWithScreenshot, index: number) {
    setLightbox({
      urls: trade.screenshots.map((shot) => shot.url),
      index,
      caption: `${dayNameOf(trade.tradeDate)} · ${formatTradeDate(trade.tradeDate)} · ${trade.direction}`,
    });
  }

  /** Keep a picked batch within what the trade still has room for. */
  function fit(picked: FileList | null, room: number): File[] {
    const files = Array.from(picked ?? []);
    if (files.length > room) {
      onError(
        `A trade holds at most ${MAX_SCREENSHOTS_PER_TRADE} charts — kept the first ${Math.max(0, room)}.`,
      );
    }
    return files.slice(0, Math.max(0, room));
  }

  const working = pending || busy;

  return (
    <>
      {/* Rounded at the top so the header's fill follows the card's corners.
          `overflow-x-auto` already clips the other axis, so this is all the
          clipping the table needs — and none of it reaches the footer. */}
      <div className="overflow-x-auto rounded-t-2xl">
        <table className="w-full min-w-[70rem] border-collapse">
          {/* Setup and Chart wrap their chips and thumbnails onto more lines
              rather than widening; Remarks takes whatever is left over. */}
          <colgroup>
            <col className="w-[10rem]" />
            <col className="w-[7.5rem]" />
            <col className="w-[7.5rem]" />
            <col className="w-[15rem]" />
            <col className="w-[7.5rem]" />
            <col className="min-w-[15rem]" />
            <col className="w-[10rem]" />
            <col className="w-[5rem]" />
          </colgroup>

          <thead>
            <tr className="border-y border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.02]">
              <th className={`${TH} cell-rule`}>Date</th>
              <th className={`${TH} cell-rule`}>Bias</th>
              <th className={`${TH} cell-rule`}>Direction</th>
              <th className={`${TH} cell-rule`}>Setup</th>
              <th className={`${TH} cell-rule`}>Results</th>
              <th className={`${TH} cell-rule`}>Remarks</th>
              <th className={`${TH} cell-rule`}>Chart</th>
              <th className={`${TH} text-right`}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {/* The open row sits at the top so it never drifts out of reach as
                the month fills up. Save lives above it, beside Month and Year. */}
            <tr className="border-b border-gray-200 bg-brand-25 dark:border-gray-800 dark:bg-brand-500/5">
              <DraftCells
                draft={draft}
                onChange={onDraftChange}
                onSubmit={onSaveDraft}
                onPickFile={() => draftFileRef.current?.click()}
                fallbackDate={fallbackDate}
                bounds={bounds}
              />
              <td className={`${TD} text-right`}>
                {draft.screenshots.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => onDraftChange({ ...draft, screenshots: [] })}
                    className="text-theme-xs text-gray-500 hover:text-error-500"
                  >
                    Clear
                  </button>
                ) : null}
              </td>
            </tr>

            {trades.map((trade) => {
              if (editingId === trade.id && editDraft) {
                return (
                  <tr
                    key={trade.id}
                    className="border-b border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.04]"
                  >
                    <DraftCells
                      draft={editDraft}
                      onChange={setEditDraft}
                      onSubmit={saveEdit}
                      onPickFile={() => {
                        uploadFor.current = trade.id;
                        rowFileRef.current?.click();
                      }}
                      fallbackDate={fallbackDate}
                      bounds={bounds}
                      existing={trade.screenshots}
                      onOpenExisting={(index) => openCharts(trade, index)}
                      onRemoveExisting={(path) => void detach(trade.id, path)}
                      removing={removing}
                    />
                    <td className={`${TD} text-right`}>
                      <span className="flex items-center justify-end gap-1">
                        <IconButton
                          label="Save this row"
                          tone="brand"
                          disabled={working}
                          onClick={saveEdit}
                        >
                          <path
                            d="M5 12.5l4.5 4.5L19 7.5"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </IconButton>
                        <IconButton
                          label="Cancel"
                          onClick={() => {
                            setEditingId(null);
                            setEditDraft(null);
                          }}
                        >
                          <path
                            d="M6 6l12 12M18 6L6 18"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                        </IconButton>
                      </span>
                    </td>
                  </tr>
                );
              }

              const room = MAX_SCREENSHOTS_PER_TRADE - trade.screenshots.length;
              return (
                <tr
                  key={trade.id}
                  className="group border-b border-gray-100 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/[0.02]"
                >
                  <td
                    className={`${TD} cell-rule tnum whitespace-nowrap font-medium text-gray-700 dark:text-gray-300`}
                  >
                    {formatTradeDate(trade.tradeDate)}
                  </td>
                  <td className={`${TD} cell-rule`}>
                    <BiasBadge bias={trade.bias} />
                  </td>
                  <td className={`${TD} cell-rule`}>
                    <DirectionBadge direction={trade.direction} />
                  </td>
                  <td className={`${TD} cell-rule`}>
                    {trade.setups.length > 0 ? (
                      <span className="flex flex-wrap gap-1">
                        {trade.setups.map((setup) => (
                          <SetupChip key={setup} setup={setup} />
                        ))}
                      </span>
                    ) : (
                      <span className="text-gray-300 dark:text-gray-600">—</span>
                    )}
                  </td>
                  <td className={`${TD} cell-rule`}>
                    <ResultBadge result={trade.result} />
                  </td>
                  <td
                    className={`${TD} cell-rule whitespace-pre-line break-words text-gray-600 dark:text-gray-400`}
                  >
                    {trade.remarks || (
                      <span className="text-gray-300 dark:text-gray-600">—</span>
                    )}
                  </td>

                  <td className={`${TD} cell-rule`}>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {trade.screenshots.map((shot, index) => (
                        <Thumb
                          key={shot.path}
                          url={shot.url}
                          label={`Open chart ${index + 1} for ${formatTradeDate(trade.tradeDate)}`}
                          onClick={() => openCharts(trade, index)}
                        />
                      ))}
                      {room > 0 ? (
                        <button
                          type="button"
                          disabled={working}
                          title="Add chart images"
                          onClick={() => {
                            uploadFor.current = trade.id;
                            rowFileRef.current?.click();
                          }}
                          className={`rounded-lg border border-dashed border-gray-300 text-theme-xs text-gray-500 transition-colors hover:border-brand-300 hover:text-brand-500 disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 ${
                            trade.screenshots.length > 0
                              ? "flex h-8 w-8 items-center justify-center"
                              : "px-2 py-1"
                          }`}
                        >
                          {trade.screenshots.length > 0 ? "+" : "+ Images"}
                        </button>
                      ) : null}
                    </span>
                  </td>

                  <td className={`${TD} text-right`}>
                    <span className="flex items-center justify-end gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                      {confirming === trade.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => removeTrade(trade.id)}
                            disabled={working}
                            className="rounded-md bg-error-50 px-2 py-1 text-theme-xs font-medium text-error-600 hover:bg-error-100 disabled:opacity-50 dark:bg-error-500/15 dark:text-error-400"
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirming(null)}
                            className="px-1 text-theme-xs text-gray-500 hover:text-gray-700"
                          >
                            No
                          </button>
                        </>
                      ) : (
                        <>
                          <IconButton
                            label={`Edit the trade on ${formatTradeDate(trade.tradeDate)}`}
                            onClick={() => {
                              setEditingId(trade.id);
                              setEditDraft(draftOf(trade));
                              onError(null);
                            }}
                          >
                            <path
                              d="M16.5 4.5l3 3L8 19l-4.5 1.5L5 16 16.5 4.5z"
                              stroke="currentColor"
                              strokeWidth="1.7"
                              strokeLinejoin="round"
                            />
                          </IconButton>
                          <IconButton
                            label={`Delete the trade on ${formatTradeDate(trade.tradeDate)}`}
                            tone="error"
                            onClick={() => setConfirming(trade.id)}
                          >
                            <path
                              d="M4 6.5h16M9.5 6.5v-2h5v2M6.5 6.5l1 13h9l1-13"
                              stroke="currentColor"
                              strokeWidth="1.7"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </IconButton>
                        </>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {trades.length === 0 ? (
        <p className="px-5 py-6 text-center text-theme-sm text-gray-500 dark:text-gray-400">
          Nothing on this sheet yet — the row above is ready when you are.
        </p>
      ) : null}

      {/* One picker for saved rows, one for the open row. Both take several
          files at once. */}
      <input
        ref={rowFileRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/avif"
        className="hidden"
        onChange={(event) => {
          const target = trades.find((trade) => trade.id === uploadFor.current);
          const saved = target?.screenshots.length ?? 0;
          if (editingId && editDraft) {
            const room = MAX_SCREENSHOTS_PER_TRADE - saved - editDraft.screenshots.length;
            const files = fit(event.target.files, room);
            setEditDraft({ ...editDraft, screenshots: [...editDraft.screenshots, ...files] });
          } else {
            void attachToRow(fit(event.target.files, MAX_SCREENSHOTS_PER_TRADE - saved));
          }
          event.target.value = "";
        }}
      />
      <input
        ref={draftFileRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/avif"
        className="hidden"
        onChange={(event) => {
          const files = fit(
            event.target.files,
            MAX_SCREENSHOTS_PER_TRADE - draft.screenshots.length,
          );
          onDraftChange({ ...draft, screenshots: [...draft.screenshots, ...files] });
          event.target.value = "";
        }}
      />

      <ScreenshotLightbox value={lightbox} onClose={() => setLightbox(null)} />
    </>
  );
}

function IconButton({
  label,
  onClick,
  children,
  tone = "neutral",
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  tone?: "neutral" | "brand" | "error";
  disabled?: boolean;
}) {
  const tones = {
    neutral:
      "text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white",
    brand: "text-white bg-brand-500 hover:bg-brand-600",
    error:
      "text-gray-500 hover:bg-error-50 hover:text-error-600 dark:text-gray-400 dark:hover:bg-error-500/15 dark:hover:text-error-400",
  } as const;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:opacity-50 ${tones[tone]}`}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}
