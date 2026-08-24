"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

import { ACCOUNT_SIZES, type AccountSize } from "@/lib/stats";
import type { TradeWithScreenshot } from "@/lib/types";

/* ---------------------------------------------------------------------------
   The journal is read once, in the root layout, and handed to both tabs from
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

/** The month and year both tabs are scoped to — always a concrete pair. */
type PeriodStore = {
  month: number;
  year: number;
  /** Drives the PnL figure on Analytics; kept here so it survives a tab switch. */
  accountSize: AccountSize;
  setMonth: (month: number) => void;
  setYear: (year: number) => void;
  setAccountSize: (size: AccountSize) => void;
};

const PeriodContext = createContext<PeriodStore | null>(null);

export function usePeriod(): PeriodStore {
  const period = useContext(PeriodContext);
  if (period === null) {
    throw new Error("usePeriod must be used inside <AppData>.");
  }
  return period;
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
  const [accountSize, setAccountSize] = useState<AccountSize>(ACCOUNT_SIZES[0]);

  // No useMemo: the React Compiler handles this, and hand-rolling it here made
  // the setters look like dependencies.
  const period = { month, year, accountSize, setMonth, setYear, setAccountSize };

  return (
    <TradesContext.Provider value={trades}>
      <PeriodContext.Provider value={period}>{children}</PeriodContext.Provider>
    </TradesContext.Provider>
  );
}
