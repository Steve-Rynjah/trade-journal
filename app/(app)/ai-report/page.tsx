"use client";

import { useMemo, useState, useTransition } from "react";

import { generateReport, type ReportResult } from "@/app/ai-report-actions";
import { PeriodFilter } from "@/app/components/period-filter";
import { FactStrip, ReportView } from "@/app/components/ai-report/report-view";
import { useTrades, useSheet } from "@/app/components/shell/app-data";
import { Button, Card } from "@/app/components/ui";
import { sheetFacts } from "@/lib/ai/facts";
import { filterSheet } from "@/lib/stats";

type Success = Extract<ReportResult, { ok: true }>;

/**
 * One review per sheet, kept for as long as the tab is open.
 *
 * Reports are not stored: the model costs nothing but a minute, and a report
 * saved against a sheet you have since edited is worse than no report at all.
 * Holding them in memory means flicking between v1 and v2 to compare does not
 * re-run either one, and a reload starts honest.
 */
export default function AiReportPage() {
  const trades = useTrades();
  const { month, year, version, label } = useSheet();
  const [pending, startTransition] = useTransition();
  const [reports, setReports] = useState<Record<string, Success>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const key = `${year}-${month}-${version}`;
  const scoped = useMemo(
    () => filterSheet(trades, month, year, version),
    [trades, month, year, version],
  );
  const facts = useMemo(() => sheetFacts(scoped), [scoped]);

  const report = reports[key];
  const error = errors[key];
  const empty = scoped.length === 0;

  function run() {
    setErrors((current) => ({ ...current, [key]: "" }));
    startTransition(async () => {
      const result = await generateReport(month, year, version);
      if (result.ok) {
        setReports((current) => ({ ...current, [key]: result }));
      } else {
        setErrors((current) => ({ ...current, [key]: result.error }));
      }
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-[100rem] flex-col">
      <PeriodFilter
        action={
          <Button onClick={run} disabled={pending || empty}>
            {pending ? (
              <>
                <Spinner />
                Reading {label}…
              </>
            ) : (
              <>
                <SparkIcon />
                {report ? "Review again" : "Review this sheet"}
              </>
            )}
          </Button>
        }
        trailing={
          <p className="tnum text-theme-sm text-gray-500 dark:text-gray-400">
            <span className="font-semibold text-gray-800 dark:text-white/90">
              {scoped.length}
            </span>{" "}
            {scoped.length === 1 ? "trade" : "trades"} on {label}
          </p>
        }
      />

      {error ? (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-theme-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400"
        >
          {error}
        </div>
      ) : null}

      {report ? (
        <ReportView report={report.report} facts={report.facts} meta={report.meta} />
      ) : (
        <div className="flex flex-col gap-5">
          {/* The counted figures do not need the model, so they are on screen
              before anyone presses anything — and stay put underneath when the
              written review arrives. */}
          {empty ? null : <FactStrip facts={facts} />}
          {pending ? <Working label={label} /> : <Empty empty={empty} label={label} />}
        </div>
      )}
    </div>
  );
}

function Empty({ empty, label }: { empty: boolean; label: string }) {
  return (
    <Card>
      <div className="flex flex-col items-center px-6 py-14 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-500 dark:bg-brand-500/12 dark:text-brand-400">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3.2l1.9 4.9 4.9 1.9-4.9 1.9L12 16.8l-1.9-4.9L5.2 10l4.9-1.9L12 3.2z" />
            <path d="M18.4 15.6l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />
          </svg>
        </span>

        <h2 className="mt-5 text-lg font-semibold text-gray-900 dark:text-white">
          {empty ? `Nothing logged on ${label}` : `Review ${label}`}
        </h2>
        <p className="mt-2 max-w-md text-theme-sm leading-relaxed text-gray-500 dark:text-gray-400">
          {empty
            ? "Log some trades on this sheet first — there is nothing here to read yet."
            : "Every trade on this sheet, its result, its risk-reward and your notes, read together: what you did well, what it cost you, and what to change on the next run."}
        </p>
      </div>
    </Card>
  );
}

/** Roughly the shape the report will take, so the page does not jump. */
function Working({ label }: { label: string }) {
  return (
    <>
      <Card>
        <div className="px-5 py-5">
          <div className="h-4 w-40 animate-pulse rounded bg-gray-100 dark:bg-white/5" />
          <div className="mt-4 h-7 w-3/4 animate-pulse rounded bg-gray-100 dark:bg-white/5" />
          <div className="mt-3 h-4 w-full animate-pulse rounded bg-gray-100 dark:bg-white/5" />
          <div className="mt-2 h-4 w-5/6 animate-pulse rounded bg-gray-100 dark:bg-white/5" />
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        {[0, 1].map((column) => (
          <Card key={column}>
            <div className="px-5 py-5">
              <div className="h-5 w-36 animate-pulse rounded bg-gray-100 dark:bg-white/5" />
              {[0, 1, 2].map((row) => (
                <div key={row} className="mt-4 border-l-2 border-gray-100 pl-4 dark:border-gray-800">
                  <div className="h-4 w-1/3 animate-pulse rounded bg-gray-100 dark:bg-white/5" />
                  <div className="mt-2 h-3.5 w-full animate-pulse rounded bg-gray-100 dark:bg-white/5" />
                  <div className="mt-1.5 h-3.5 w-4/5 animate-pulse rounded bg-gray-100 dark:bg-white/5" />
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <p className="px-1 text-theme-xs text-gray-400">
        Reading every trade on {label}. A free model can take up to a minute.
      </p>
    </>
  );
}

function Spinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="animate-spin">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.4" opacity="0.3" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z" />
    </svg>
  );
}
