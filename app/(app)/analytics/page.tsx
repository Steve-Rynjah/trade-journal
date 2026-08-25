"use client";

import { useMemo } from "react";

import { LongShortCard } from "@/app/components/charts/long-short-card";
import { PerformanceCard } from "@/app/components/charts/performance-card";
import { PnlCard } from "@/app/components/charts/pnl-card";
import { TradingDaysChart } from "@/app/components/charts/trading-days-chart";
import { TradeCalendar } from "@/app/components/charts/trade-calendar";
import { WinLoseDonut } from "@/app/components/charts/win-lose-donut";
import { PeriodFilter } from "@/app/components/period-filter";
import { SelectMenu, type MenuOption } from "@/app/components/select-menu";
import { useTrades, usePeriod, useSheet } from "@/app/components/shell/app-data";
import { Card, CardHeader } from "@/app/components/ui";
import {
  ACCOUNT_SIZES,
  RISK_PERCENTS,
  computePnl,
  filterSheet,
  filterVersion,
  formatMoney,
  formatRiskPercent,
  monthsCovered,
  splitResults,
  versionLabel,
  tradingDaysByWeekday,
  type AccountSize,
  type RiskPercent,
} from "@/lib/stats";

/** `5000` → `5k`, the way an account size is usually written. */
function accountLabel(size: number): string {
  return `${size / 1000}k`;
}

export default function AnalyticsPage() {
  const trades = useTrades();
  const { accountSize, setAccountSize, riskPercent, setRiskPercent } = usePeriod();
  const { month, year, version, label: periodLabel } = useSheet();

  // One sheet, not one month: two runs of August are two different answers to
  // "how did August go", and averaging them together would answer neither.
  const scoped = useMemo(
    () => filterSheet(trades, month, year, version),
    [trades, month, year, version],
  );

  // Everything below the top-left card answers for this one sheet.
  const sheetSplit = splitResults(scoped);
  const pnl = computePnl(scoped, accountSize, riskPercent);

  // The exception: the run itself, read across every month it has been tried
  // against. Picking v1 asks "how is my first pass doing" — Jan v1 and Aug v1
  // are the same attempt at different months, so they are judged together.
  const runTrades = useMemo(() => filterVersion(trades, version), [trades, version]);
  const runSplit = splitResults(runTrades);
  const runPnl = computePnl(runTrades, accountSize, riskPercent);
  const weekdays = tradingDaysByWeekday(scoped);

  // Risk is the other half of every money figure on this page, so the menu sits
  // on the card it changes rather than up with the period filter.
  const riskOptions: MenuOption<RiskPercent>[] = RISK_PERCENTS.map((percent) => ({
    value: percent,
    label: formatRiskPercent(percent),
    hint: formatMoney(accountSize * (percent / 100)),
  }));

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
            {scoped.length === 1 ? "trade" : "trades"} on {periodLabel}
          </p>
        }
      />

      {/* Row 1 — the run so far, and what this sheet was worth.
          `items-stretch` so the two cards share a height and the figures inside
          them line up rather than each floating in its own box. */}
      <div className="grid items-stretch gap-4 sm:grid-cols-2">
        <PerformanceCard
          label={`${versionLabel(version)} performance — in %`}
          hint={`Every ${versionLabel(version)} sheet, across all months`}
          netPercent={runPnl.netPercent}
          split={runSplit}
          months={monthsCovered(runTrades)}
        />
        <PnlCard
          pnl={pnl}
          trades={scoped.length}
          action={
            <SelectMenu
              label="Risk per trade"
              value={riskPercent}
              options={riskOptions}
              onChange={setRiskPercent}
              widthClass="w-36"
              align="right"
            />
          }
        />
      </div>

      {/* Row 2 — the split drawn, then the two directions against each other. */}
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Win & Lose %"
            hint={
              sheetSplit.total === 0
                ? `Nothing logged in ${periodLabel}`
                : `${sheetSplit.wins} of ${sheetSplit.total} trades won`
            }
          />
          <div className="px-5 pb-6">
            <WinLoseDonut split={sheetSplit} />
          </div>
        </Card>

        <LongShortCard
          trades={scoped}
          accountSize={accountSize}
          riskPercent={riskPercent}
        />
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
