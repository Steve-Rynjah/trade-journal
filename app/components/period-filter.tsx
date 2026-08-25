"use client";

import type { ReactNode } from "react";

import {
  MAX_TRADES_PER_SHEET,
  MONTHS,
  filterSheet,
  listYears,
  versionLabel,
} from "@/lib/stats";
import { useTrades, usePeriod, useSheet } from "./shell/app-data";
import { SelectMenu, type MenuOption } from "./select-menu";

const CALENDAR_ICON = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3.5" y="5" width="17" height="15.5" rx="3" stroke="currentColor" strokeWidth="1.6" />
    <path
      d="M3.5 9.8h17M8.2 3.5v3M15.8 3.5v3"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

/** Stacked sheets — the same month, layered. */
const SHEET_ICON = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 3.2l8.4 4.2-8.4 4.2-8.4-4.2L12 3.2z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M3.6 12l8.4 4.2 8.4-4.2M3.6 16.4l8.4 4.2 8.4-4.2"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Sheet, Month and Year, shared by both tabs. The selection lives in context
 * rather than in either page, so switching tabs keeps the sheet you were on.
 *
 * Sheet leads: it is the coarsest of the three — changing it swaps the whole
 * table underneath the month, rather than moving you to a different month.
 */
export function PeriodFilter({
  action,
  trailing,
}: {
  /** Rendered next to the menus — the Save button on Home. */
  action?: ReactNode;
  /** Rendered at the far right, e.g. the trade count. */
  trailing?: ReactNode;
}) {
  const trades = useTrades();
  const { month, year, setMonth, setYear, setVersion } = usePeriod();
  const { version, versions } = useSheet();

  const monthOptions: MenuOption<number>[] = MONTHS.map((name, index) => ({
    value: index + 1,
    label: name,
  }));

  const yearOptions: MenuOption<number>[] = listYears(trades).map((value) => ({
    value,
    label: String(value),
  }));

  // The hint counts what each sheet holds, so picking a run is picking between
  // "24/25" and a blank rather than between identical labels. An untouched
  // sheet says nothing at all — the absence reads as empty on its own.
  const versionOptions: MenuOption<number>[] = versions.map((value: number) => {
    const used = filterSheet(trades, month, year, value).length;
    return {
      value,
      label: versionLabel(value),
      hint: used === 0 ? undefined : `${used}/${MAX_TRADES_PER_SHEET}`,
    };
  });

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <SelectMenu
          label="Version sheet"
          value={version}
          options={versionOptions}
          onChange={setVersion}
          icon={SHEET_ICON}
          widthClass="w-40"
        />
        <SelectMenu
          label="Month"
          value={month}
          options={monthOptions}
          onChange={setMonth}
          icon={CALENDAR_ICON}
          widthClass="w-48"
        />
        <SelectMenu
          label="Year"
          value={year}
          options={yearOptions}
          onChange={setYear}
          widthClass="w-40"
        />
        {action}
      </div>
      {trailing}
    </div>
  );
}
