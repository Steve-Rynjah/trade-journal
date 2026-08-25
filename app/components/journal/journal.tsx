"use client";

import { useMemo, useState, useTransition } from "react";

import { createTrade } from "@/app/actions";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import {
  DEFAULT_PAGE_SIZE,
  MAX_TRADES_PER_SHEET,
  MONTHS,
  filterSheet,
  sheetCapacity,
} from "@/lib/stats";
import {
  composeRatio,
  defaultDateInMonth,
  isInMonth,
  isWeekday,
  isValidDate,
} from "@/lib/types";
import { Pagination } from "../pagination";
import { PeriodFilter } from "../period-filter";
import { useTrades, useSheet } from "../shell/app-data";
import { Card } from "../ui";
import { TradeSheet, type Draft } from "./trade-sheet";

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
  const { month, year, version, label } = useSheet();

  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [requestedPage, setRequestedPage] = useState(1);

  // Newest first, so the trade you just logged is the one you are looking at.
  const rows = useMemo(
    () =>
      [...filterSheet(trades, month, year, version)].sort(
        (a, b) =>
          b.tradeDate.localeCompare(a.tradeDate) ||
          b.createdAt.localeCompare(a.createdAt),
      ),
    [trades, month, year, version],
  );

  const capacity = sheetCapacity(rows.length);

  /* -------------------------------------------------------------------------
     Paging
     Both values are derived rather than synced: changing the sheet or shrinking
     the page size can strand you past the last page, and clamping at the point
     of reading fixes that without an effect writing state back on render.
     ------------------------------------------------------------------------- */
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const visible = rows.slice((page - 1) * pageSize, page * pageSize);

  const fallbackDate = defaultDateInMonth(month, year);
  const tradeDate = draft.tradeDate || fallbackDate;

  function saveDraft() {
    setError(null);
    startTransition(async () => {
      const data = new FormData();
      // What the row shows is what it saves — an untouched Date cell already
      // reads as a date in this month, and that is the one that is meant.
      data.set("trade_date", tradeDate);
      data.set("version", String(version));
      data.set("bias", draft.bias);
      data.set("direction", draft.direction);
      data.set("ratio", composeRatio("1", draft.reward));
      data.set("result", draft.result);
      data.set("remarks", draft.remarks);
      if (draft.screenshot) data.set("screenshot", draft.screenshot);

      const result = await createTrade(EMPTY_FORM_STATE, data);
      if (result.status === "success") {
        setDraft(blankDraft());
        // Rows read newest first, so the trade just saved is at the top of the
        // first page — which is no use if you are looking at the third.
        setRequestedPage(1);
      } else {
        // Name the cells that are wrong: "check the highlighted fields" means
        // nothing when the row itself has no highlighting.
        const fields = Object.values(result.fieldErrors ?? {});
        setError(fields.length > 0 ? fields.join(" ") : result.message);
      }
    });
  }

  // Why Save is off, in the order the journal would hit them.
  //
  // The month check is the important one: a date outside the sheet used to save
  // happily and then vanish, because the table only ever shows its own month.
  const blocked = capacity.full
    ? `${label} is full — ${MAX_TRADES_PER_SHEET} trades. Open the next sheet.`
    : !isValidDate(tradeDate)
      ? "Pick a date."
      : !isInMonth(tradeDate, month, year)
        ? `That date is outside ${MONTHS[month - 1]} ${year} — this sheet only holds that month.`
        : !isWeekday(tradeDate)
          ? "Forex week runs Monday to Friday"
          : null;

  return (
    <div className="mx-auto w-full max-w-[100rem]">
      <PeriodFilter
        action={
          <button
            type="button"
            onClick={saveDraft}
            disabled={pending || blocked !== null}
            title={blocked ?? "Save the open row"}
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
            <span
              className={
                capacity.full
                  ? "font-semibold text-error-600 dark:text-error-400"
                  : "font-semibold text-gray-800 dark:text-white/90"
              }
            >
              {capacity.used} / {capacity.limit}
            </span>{" "}
            on {label}
          </p>
        }
      />

      {blocked && !capacity.full && !error ? (
        <p className="mb-3 rounded-lg bg-warning-50 px-4 py-2.5 text-theme-sm text-warning-700 dark:bg-warning-500/12 dark:text-warning-500">
          {blocked}
        </p>
      ) : null}

      {capacity.full && !error ? (
        <p className="mb-3 rounded-lg bg-warning-50 px-4 py-2.5 text-theme-sm text-warning-700 dark:bg-warning-500/12 dark:text-warning-500">
          {label} is full at {MAX_TRADES_PER_SHEET} trades. Pick the next version
          sheet to keep backtesting this month.
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mb-3 rounded-lg bg-error-50 px-4 py-2.5 text-theme-sm text-error-600 dark:bg-error-500/12 dark:text-error-400"
        >
          {error}
        </p>
      ) : null}

      {/* No `overflow-hidden` here: the Rows menu in the footer opens upward and
          a clipping card cuts it off on a short sheet. The table clips its own
          corners instead — see the scroll wrapper in TradeSheet. */}
      <Card>
        <TradeSheet
          trades={visible}
          draft={draft}
          onDraftChange={setDraft}
          onSaveDraft={saveDraft}
          pending={pending}
          onError={setError}
          fallbackDate={fallbackDate}
          version={version}
          month={month}
          year={year}
        />

        {rows.length > 0 ? (
          <Pagination
            page={page}
            pageCount={pageCount}
            pageSize={pageSize}
            total={rows.length}
            onPage={setRequestedPage}
            onPageSize={(size) => {
              setPageSize(size);
              // Row 7 is on page 2 at six a page and page 1 at ten; rather than
              // guess which one you meant, start again from the top.
              setRequestedPage(1);
            }}
          />
        ) : null}
      </Card>
    </div>
  );
}
