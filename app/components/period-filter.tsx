"use client";

import type { ReactNode } from "react";

import { MONTHS, listYears } from "@/lib/stats";
import { useTrades, usePeriod } from "./shell/app-data";
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

/**
 * The Month and Year pair, shared by both tabs. The selection lives in context
 * rather than in either page, so switching tabs keeps the month you were on.
 */
export function PeriodFilter({
  action,
  trailing,
}: {
  /** Rendered next to the two menus — the Save button on Home. */
  action?: ReactNode;
  /** Rendered at the far right, e.g. the trade count. */
  trailing?: ReactNode;
}) {
  const trades = useTrades();
  const { month, year, setMonth, setYear } = usePeriod();

  const monthOptions: MenuOption<number>[] = MONTHS.map((name, index) => ({
    value: index + 1,
    label: name,
  }));

  const yearOptions: MenuOption<number>[] = listYears(trades).map((value) => ({
    value,
    label: String(value),
  }));

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
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
