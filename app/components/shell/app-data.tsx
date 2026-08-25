"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

import {
  ACCOUNT_SIZES,
  DEFAULT_RISK_PERCENT,
  FIRST_VERSION,
  MONTHS,
  SHEET_VERSIONS,
  isSheetVersion,
  versionLabel,
  type AccountSize,
  type RiskPercent,
} from "@/lib/stats";
import type { TradeWithScreenshot } from "@/lib/types";

/* ---------------------------------------------------------------------------
   The journal is read once, in the (app) layout, and handed to both tabs from
   here. Layouts survive navigation, so switching between Home and Analytics
   costs no round trip at all.
   --------------------------------------------------------------------------- */

const TradesContext = createContext<TradeWithScreenshot[] | null>(null);

export function useTrades(): TradeWithScreenshot[] {
  const trades = useContext(TradesContext);
  if (trades === null) {
    throw new Error("useTrades must be used inside <AppData>.");
  }
  return trades;
}

/** The sheet both tabs are scoped to — always a concrete month, year and run. */
type PeriodStore = {
  month: number;
  year: number;
  /** The version sheet: v1 is the first run of the month, v2 the next. */
  version: number;
  /** Drives the PnL figure on Analytics; kept here so it survives a tab switch. */
  accountSize: AccountSize;
  /** How much of the balance rides on each trade — the other half of the PnL. */
  riskPercent: RiskPercent;
  setMonth: (month: number) => void;
  setYear: (year: number) => void;
  setVersion: (version: number) => void;
  setAccountSize: (size: AccountSize) => void;
  setRiskPercent: (percent: RiskPercent) => void;
};

const PeriodContext = createContext<PeriodStore | null>(null);

export function usePeriod(): PeriodStore {
  const period = useContext(PeriodContext);
  if (period === null) {
    throw new Error("usePeriod must be used inside <AppData>.");
  }
  return period;
}

export type Sheet = {
  month: number;
  year: number;
  version: number;
  /** The versions on offer — the same five for every month. */
  versions: readonly number[];
  /** `August 2026 · v2` — one phrase both tabs title themselves with. */
  label: string;
};

/** The sheet on screen: the month, the year and the run, as one thing. */
export function useSheet(): Sheet {
  const { month, year, version } = usePeriod();
  const active = isSheetVersion(version) ? version : FIRST_VERSION;

  return {
    month,
    year,
    version: active,
    versions: SHEET_VERSIONS,
    label: `${MONTHS[month - 1]} ${year} · ${versionLabel(active)}`,
  };
}

export function AppData({
  trades,
  children,
}: {
  trades: TradeWithScreenshot[];
  children: ReactNode;
}) {
  const today = new Date();
  const [month, setMonth] = useState(today.getUTCMonth() + 1);
  const [year, setYear] = useState(today.getUTCFullYear());
  // Typed wider than the literal FIRST_VERSION so the setter takes any sheet.
  const [version, setVersion] = useState<number>(FIRST_VERSION);
  const [accountSize, setAccountSize] = useState<AccountSize>(ACCOUNT_SIZES[0]);
  const [riskPercent, setRiskPercent] = useState<RiskPercent>(DEFAULT_RISK_PERCENT);

  // No useMemo: the React Compiler handles this, and hand-rolling it here made
  // the setters look like dependencies.
  const period = {
    month,
    year,
    version,
    accountSize,
    riskPercent,
    setMonth,
    setYear,
    setVersion,
    setAccountSize,
    setRiskPercent,
  };

  return (
    <TradesContext.Provider value={trades}>
      <PeriodContext.Provider value={period}>{children}</PeriodContext.Provider>
    </TradesContext.Provider>
  );
}
