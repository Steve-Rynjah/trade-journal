"use client";

import { useMemo, useState, useTransition } from "react";

import { createTrade } from "@/app/actions";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { filterTrades } from "@/lib/stats";
import { composeRatio, isWeekday, isValidDate } from "@/lib/types";
import { PeriodFilter } from "../period-filter";
import { useTrades, usePeriod } from "../shell/app-data";
import { Card } from "../ui";
import { TradeSheet, type Draft } from "./trade-sheet";

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Today, or the most recent weekday if the market is shut. */
function lastWeekdayOnOrBefore(date: Date): string {
  const cursor = new Date(date);
  while (!isWeekday(iso(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  return iso(cursor);
}

/**
 * Seeds the open row with a date inside the month and year on screen, so a trade
 * typed while looking at January cannot silently land in August.
 */
function defaultDateFor(month: number, year: number): string {
  const today = new Date();
  if (month === today.getUTCMonth() + 1 && year === today.getUTCFullYear()) {
    return lastWeekdayOnOrBefore(today);
  }
  // Day 0 of the next month is the last day of this one.
  return lastWeekdayOnOrBefore(new Date(Date.UTC(year, month, 0)));
}

/** A fresh row starts empty — nothing is pre-picked but the printed risk leg. */
function blankDraft(): Draft {
  return {
    tradeDate: "",
    bias: "",
    direction: "",
    reward: "",
    result: "",
    remarks: "",
    screenshot: null,
  };
}

export function Journal() {
  const trades = useTrades();
  const { month, year } = usePeriod();

  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Newest first, so the trade you just logged is the one you are looking at.
  const rows = useMemo(
    () =>
      [...filterTrades(trades, month, year)].sort(
        (a, b) =>
          b.tradeDate.localeCompare(a.tradeDate) ||
          b.createdAt.localeCompare(a.createdAt),
      ),
    [trades, month, year],
  );

  function saveDraft() {
    setError(null);
    startTransition(async () => {
      const data = new FormData();
      data.set("trade_date", draft.tradeDate);
      data.set("bias", draft.bias);
      data.set("direction", draft.direction);
      data.set("ratio", composeRatio("1", draft.reward));
      data.set("result", draft.result);
      data.set("remarks", draft.remarks);
      if (draft.screenshot) data.set("screenshot", draft.screenshot);

      const result = await createTrade(EMPTY_FORM_STATE, data);
      if (result.status === "success") {
        setDraft(blankDraft());
      } else {
        // Name the cells that are wrong: "check the highlighted fields" means
        // nothing when the row itself has no highlighting.
        const fields = Object.values(result.fieldErrors ?? {});
        setError(fields.length > 0 ? fields.join(" ") : result.message);
      }
    });
  }

  const dateOk = isValidDate(draft.tradeDate) && isWeekday(draft.tradeDate);
  const fallbackDate = defaultDateFor(month, year);

  return (
    <div className="mx-auto w-full max-w-[100rem]">
      <PeriodFilter
        action={
          <button
            type="button"
            onClick={saveDraft}
            disabled={pending || !dateOk}
            title={dateOk ? "Save the open row" : "Forex week runs Monday to Friday"}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-theme-sm font-medium text-white shadow-theme-xs transition-colors hover:bg-brand-600 disabled:pointer-events-none disabled:opacity-50"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M5 12.5l4.5 4.5L19 7.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {pending ? "Saving…" : "Save"}
          </button>
        }
        trailing={
          <p className="tnum text-theme-sm text-gray-500 dark:text-gray-400">
            <span className="font-semibold text-gray-800 dark:text-white/90">
              {rows.length}
            </span>{" "}
            {rows.length === 1 ? "trade" : "trades"}
          </p>
        }
      />

      {error ? (
        <p
          role="alert"
          className="mb-3 rounded-lg bg-error-50 px-4 py-2.5 text-theme-sm text-error-600 dark:bg-error-500/12 dark:text-error-400"
        >
          {error}
        </p>
      ) : null}

      <Card className="overflow-hidden">
        <TradeSheet
          trades={rows}
          draft={draft}
          onDraftChange={setDraft}
          onSaveDraft={saveDraft}
          pending={pending}
          onError={setError}
          fallbackDate={fallbackDate}
        />
      </Card>
    </div>
  );
}
