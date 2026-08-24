"use client";

import { useMemo } from "react";

import { LongShortCard } from "../components/charts/long-short-card";
import { PerformanceCard } from "../components/charts/performance-card";
import { PnlCard } from "../components/charts/pnl-card";
import { TradingDaysChart } from "../components/charts/trading-days-chart";
import { TradeCalendar } from "../components/charts/trade-calendar";
import { WinLoseDonut } from "../components/charts/win-lose-donut";
import { PeriodFilter } from "../components/period-filter";
import { SelectMenu, type MenuOption } from "../components/select-menu";
import { useTrades, usePeriod } from "../components/shell/app-data";
import { Card, CardHeader } from "../components/ui";
import {
  ACCOUNT_SIZES,
  MONTHS,
  computePnl,
  filterTrades,
  formatMoney,
  splitResults,
  tradingDaysByWeekday,
  type AccountSize,
} from "@/lib/stats";

/** `5000` → `5k`, the way an account size is usually written. */
function accountLabel(size: number): string {
  return `${size / 1000}k`;
}

export default function AnalyticsPage() {
  const trades = useTrades();
  const { month, year, accountSize, setAccountSize } = usePeriod();

  const scoped = useMemo(
    () => filterTrades(trades, month, year),
    [trades, month, year],
  );

  // Two different questions, so two different splits — sharing one variable is
  // what previously leaked the all-time figure into the month's donut.
  //
  // `allTime` is every trade on record: the Overall performance card alone.
  // `monthly` is the selected month: everything else on this page.
  const allTime = splitResults(trades);
  const monthly = splitResults(scoped);
  const pnl = computePnl(scoped, accountSize);
  const weekdays = tradingDaysByWeekday(scoped);
  const periodLabel = `${MONTHS[month - 1]} ${year}`;

  const accountOptions: MenuOption<AccountSize>[] = ACCOUNT_SIZES.map((size) => ({
    value: size,
    label: accountLabel(size),
    hint: formatMoney(size),
  }));

  return (
    <div className="mx-auto flex w-full max-w-[100rem] flex-col">
      <PeriodFilter
        action={
          <SelectMenu
            label="Account size"
            value={accountSize}
            options={accountOptions}
            onChange={setAccountSize}
            widthClass="w-44"
            icon={
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect
                  x="2.8"
                  y="5.5"
                  width="18.4"
                  height="13"
                  rx="3"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            }
          />
        }
        trailing={
          <p className="tnum text-theme-sm text-gray-500 dark:text-gray-400">
            <span className="font-semibold text-gray-800 dark:text-white/90">
              {scoped.length}
            </span>{" "}
            {scoped.length === 1 ? "trade" : "trades"}
          </p>
        }
      />

      {/* Row 1 — how the month went, and what it was worth. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <PerformanceCard
          label="Overall performance — in %"
          hint="Every trade on record"
          split={allTime}
        />
        <PnlCard pnl={pnl} trades={scoped.length} />
      </div>

      {/* Row 2 — the split, then the two directions against each other. */}
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Win & Lose %"
            hint={
              monthly.total === 0
                ? `Nothing logged in ${periodLabel}`
                : `${monthly.wins} of ${monthly.total} trades won`
            }
          />
          <div className="px-5 pb-6">
            <WinLoseDonut split={monthly} />
          </div>
        </Card>

        <LongShortCard trades={scoped} accountSize={accountSize} />
      </div>

      {/* Row 3 — which days pay, and where they fall in the month. */}
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Trading days"
            hint="Winning days minus losing days, by weekday"
          />
          <TradingDaysChart rows={weekdays} />
        </Card>

        <Card>
          <CardHeader
            title={periodLabel}
            hint="Green closed the day up, red closed it down"
          />
          <TradeCalendar trades={scoped} month={month} year={year} />
        </Card>
      </div>
    </div>
  );
}
