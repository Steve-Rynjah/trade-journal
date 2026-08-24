"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { deleteTrade, setScreenshot, updateTrade } from "@/app/actions";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import {
  BIASES,
  DIRECTIONS,
  RESULTS,
  WEEKDAYS,
  dayNameOf,
  formatTradeDate,
  composeRatio,
  isValidDate,
  parseRatio,
  sanitiseRatioLeg,
  withWeekday,
  type Bias,
  type Direction,
  type TradeResult,
  type TradeWithScreenshot,
  type Weekday,
} from "@/lib/types";
import {
  BiasBadge,
  biasLabel,
  DirectionBadge,
  ResultBadge,
  fieldBad,
  fieldBase,
  fieldClass,
  fieldGood,
  fieldNeutral,
} from "../ui";
import { ScreenshotLightbox, type Lightbox } from "../screenshot-lightbox";

/** The fields a row holds, as strings — exactly what the inputs produce. */
export type Draft = {
  tradeDate: string;
  bias: Bias | "";
  direction: Direction | "";
  /**
   * Only the reward leg. Risk is always 1 — that is what makes the 1%-per-trade
   * PnL on Analytics comparable across trades — so it is printed, not typed.
   */
  reward: string;
  result: TradeResult | "";
  remarks: string;
  /** Only ever set while the result is LOSE. */
  screenshot: File | null;
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

const biasTone = (option: Bias) => (option === "BULLISH" ? fieldGood : fieldBad);
const directionTone = (option: Direction) => (option === "LONG" ? fieldGood : fieldBad);
const resultTone = (option: TradeResult) => (option === "WIN" ? fieldGood : fieldBad);

/** The input cells, shared by the new-trade row and any row being edited. */
function DraftCells({
  draft,
  onChange,
  onSubmit,
  onPickFile,
  fallbackDate,
}: {
  draft: Draft;
  onChange: (next: Draft) => void;
  onSubmit: () => void;
  onPickFile: () => void;
  /** The week a Day pick lands in while the row still has no date. */
  fallbackDate: string;
}) {
  const dayValid = isValidDate(draft.tradeDate);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      onSubmit();
    }
  }

  return (
    <>
      <td className={`${TD} cell-rule`} onKeyDown={onKeyDown}>
        <SelectCell
          label="Day"
          value={(dayValid ? dayNameOf(draft.tradeDate) : "") as Weekday | ""}
          options={WEEKDAYS}
          onChange={(day) =>
            onChange({
              ...draft,
              tradeDate: withWeekday(draft.tradeDate || fallbackDate, day),
            })
          }
          minWidth="min-w-[9rem]"
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
        <input
          type="date"
          aria-label="Date"
          value={draft.tradeDate}
          onChange={(event) => onChange({ ...draft, tradeDate: event.target.value })}
          className={`${fieldClass} tnum h-9`}
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
      <td className={`${TD} cell-rule`} onKeyDown={onKeyDown}>
        <span className="flex items-center gap-1.5">
          <span className="tnum shrink-0 text-theme-sm font-medium text-gray-500 dark:text-gray-400">
            1
          </span>
          <span aria-hidden="true" className="shrink-0 text-gray-400">
            :
          </span>
          <input
            type="text"
            inputMode="decimal"
            aria-label="Reward leg of the ratio"
            value={draft.reward}
            maxLength={6}
            onChange={(event) =>
              onChange({ ...draft, reward: sanitiseRatioLeg(event.target.value) })
            }
            placeholder="2"
            className={`${fieldClass} tnum h-9 w-full min-w-[3.5rem] text-center`}
          />
        </span>
      </td>
      <td className={`${TD} cell-rule`} onKeyDown={onKeyDown}>
        <SelectCell
          label="Result"
          value={draft.result}
          options={RESULTS}
          onChange={(result) =>
            // A trade that is no longer a loss cannot carry a chart.
            onChange({
              ...draft,
              result,
              screenshot: result === "LOSE" ? draft.screenshot : null,
            })
          }
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
        {draft.result === "LOSE" ? (
          <button
            type="button"
            onClick={onPickFile}
            className="w-full rounded-lg border border-dashed border-gray-300 px-2 py-1.5 text-theme-xs text-gray-500 transition-colors hover:border-brand-300 hover:text-brand-500 dark:border-gray-700 dark:text-gray-400"
          >
            {draft.screenshot ? "1 image" : "+ Image"}
          </button>
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
}: {
  trades: TradeWithScreenshot[];
  draft: Draft;
  onDraftChange: (next: Draft) => void;
  onSaveDraft: () => void;
  pending: boolean;
  onError: (message: string | null) => void;
  /** A date inside the month on screen, for a Day pick on an empty row. */
  fallbackDate: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<Lightbox>(null);
  const [busy, setBusy] = useState(false);

  /** Which saved row the shared file picker is currently acting for. */
  const uploadFor = useRef<string | null>(null);
  const rowFileRef = useRef<HTMLInputElement>(null);
  const draftFileRef = useRef<HTMLInputElement>(null);

  function draftOf(trade: TradeWithScreenshot): Draft {
    return {
      tradeDate: trade.tradeDate,
      bias: trade.bias,
      direction: trade.direction,
      reward: parseRatio(trade.ratio).reward,
      result: trade.result,
      remarks: trade.remarks ?? "",
      screenshot: null,
    };
  }

  async function saveEdit() {
    if (!editingId || !editDraft) return;
    onError(null);
    setBusy(true);
    const data = new FormData();
    data.set("id", editingId);
    data.set("trade_date", editDraft.tradeDate);
    data.set("bias", editDraft.bias);
    data.set("direction", editDraft.direction);
    data.set("ratio", composeRatio("1", editDraft.reward));
    data.set("result", editDraft.result);
    data.set("remarks", editDraft.remarks);
    if (editDraft.screenshot) data.set("screenshot", editDraft.screenshot);

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

  async function attachToRow(file: File | null) {
    const id = uploadFor.current;
    if (!file || !id) return;
    onError(null);
    setBusy(true);
    const data = new FormData();
    data.set("id", id);
    data.set("screenshot", file);
    const result = await setScreenshot(data);
    setBusy(false);
    if (result.status === "error") onError(result.message);
  }

  const working = pending || busy;

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[70rem] border-collapse">
          {/* Day is the widest of the fixed columns: "Wednesday" plus the
              select's chevron needs the room. Remarks gives it up — that column
              takes whatever is left over anyway. */}
          <colgroup>
            <col className="w-[11rem]" />
            <col className="w-[7.5rem]" />
            <col className="w-[9rem]" />
            <col className="w-[7.5rem]" />
            <col className="w-[8.5rem]" />
            <col className="w-[7.5rem]" />
            <col className="min-w-[15rem]" />
            <col className="w-[6rem]" />
            <col className="w-[5rem]" />
          </colgroup>

          <thead>
            <tr className="border-y border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.02]">
              <th className={`${TH} cell-rule`}>Day</th>
              <th className={`${TH} cell-rule`}>Bias</th>
              <th className={`${TH} cell-rule`}>Date</th>
              <th className={`${TH} cell-rule`}>Direction</th>
              <th className={`${TH} cell-rule`}>Ratio</th>
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
              />
              <td className={`${TD} text-right`}>
                {draft.screenshot ? (
                  <button
                    type="button"
                    onClick={() => onDraftChange({ ...draft, screenshot: null })}
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

              const day = dayNameOf(trade.tradeDate);
              return (
                <tr
                  key={trade.id}
                  className="group border-b border-gray-100 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/[0.02]"
                >
                  <td className={`${TD} cell-rule font-medium text-gray-700 dark:text-gray-300`}>
                    {day}
                  </td>
                  <td className={`${TD} cell-rule`}>
                    <BiasBadge bias={trade.bias} />
                  </td>
                  <td
                    className={`${TD} cell-rule tnum whitespace-nowrap text-gray-600 dark:text-gray-400`}
                  >
                    {formatTradeDate(trade.tradeDate)}
                  </td>
                  <td className={`${TD} cell-rule`}>
                    <DirectionBadge direction={trade.direction} />
                  </td>
                  <td className={`${TD} cell-rule tnum text-gray-700 dark:text-gray-300`}>
                    {trade.ratio}
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

                  {/* Charts are kept for losses only — the DB enforces it too. */}
                  <td className={`${TD} cell-rule`}>
                    {trade.screenshotUrl ? (
                      <button
                        type="button"
                        onClick={() =>
                          setLightbox({
                            url: trade.screenshotUrl!,
                            caption: `${day} · ${formatTradeDate(trade.tradeDate)} · ${trade.direction} · ${trade.ratio}`,
                          })
                        }
                        className="block h-8 w-12 overflow-hidden rounded-md ring-1 ring-gray-200 transition-transform hover:scale-105 dark:ring-gray-700"
                        aria-label={`Open the chart for ${formatTradeDate(trade.tradeDate)}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={trade.screenshotUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ) : trade.result === "LOSE" ? (
                      <button
                        type="button"
                        disabled={working}
                        onClick={() => {
                          uploadFor.current = trade.id;
                          rowFileRef.current?.click();
                        }}
                        className="rounded-lg border border-dashed border-gray-300 px-2 py-1 text-theme-xs text-gray-500 transition-colors hover:border-brand-300 hover:text-brand-500 disabled:opacity-50 dark:border-gray-700 dark:text-gray-400"
                      >
                        + Image
                      </button>
                    ) : (
                      <span className="text-gray-300 dark:text-gray-600">—</span>
                    )}
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
          No trades in this month yet — the row above is ready when you are.
        </p>
      ) : null}

      {/* One picker for saved rows, one for the open row. */}
      <input
        ref={rowFileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          event.target.value = "";
          if (editingId && editDraft) setEditDraft({ ...editDraft, screenshot: file });
          else void attachToRow(file);
        }}
      />
      <input
        ref={draftFileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif"
        className="hidden"
        onChange={(event) => {
          onDraftChange({ ...draft, screenshot: event.target.files?.[0] ?? null });
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
