/* ---------------------------------------------------------------------------
   Position sizing

   How many lots to buy so that being wrong by the stop loss costs exactly the
   amount you were willing to lose:

       lots = risk amount / (stop loss in pips × what a pip is worth per lot)

   Everything here is quoted in USD, which is what makes it this short: for a
   pair whose quote currency is already the account currency, a pip is worth
   `contract size × pip` per lot and no conversion is needed.
   --------------------------------------------------------------------------- */

export type Instrument = {
  symbol: string;
  /** The smallest move that counts as one pip. */
  pip: number;
  /** How much of the base asset one standard lot is. */
  contractSize: number;
  /** What `contractSize` is measured in — units of currency, or ounces. */
  unitNoun: string;
  /** Decimal places the instrument is quoted to, for the pip note. */
  quotePrecision: number;
};

/**
 * The two instruments the journal trades.
 *
 * Gold's pip is the one people disagree about: some platforms call a `0.01`
 * move a pip, which would make every figure here ten times larger. `0.10` is
 * the common convention — 100 ounces × 0.10 = $10 a pip per lot, the same as a
 * dollar-quoted FX major — and the calculator prints the value it used so the
 * assumption is never hidden.
 */
export const INSTRUMENTS: Instrument[] = [
  {
    symbol: "EURUSD",
    pip: 0.0001,
    contractSize: 100_000,
    unitNoun: "units",
    quotePrecision: 5,
  },
  {
    symbol: "XAUUSD",
    pip: 0.1,
    contractSize: 100,
    unitNoun: "ounces",
    quotePrecision: 2,
  },
];

export const ACCOUNT_CURRENCY = "USD";

/** What one pip is worth on a single standard lot. */
export function pipValuePerLot(instrument: Instrument): number {
  return instrument.contractSize * instrument.pip;
}

/** A standard lot is ten mini lots, and a hundred micro lots. */
export const MINI_LOTS_PER_STANDARD = 10;
export const MICRO_LOTS_PER_STANDARD = 100;

export type LotSize = {
  /** Account balance × risk %, the money on the line. */
  riskAmount: number;
  pipValuePerLot: number;
  /** Standard lots, unrounded — the caller decides how to present it. */
  lots: number;
  miniLots: number;
  microLots: number;
  /** `lots × contractSize`: currency units for FX, ounces for gold. */
  units: number;
  /** What one pip is worth on the position this works out to. */
  pipValue: number;
  /**
   * What being stopped out actually costs, worked forward from the position
   * rather than copied from `riskAmount` — so the two agreeing is a check on
   * the sizing rather than the same number printed twice.
   */
  lossAtStop: number;
  /**
   * False when the inputs cannot produce a position — a zero stop loss would
   * divide by zero, and a zero balance or risk has nothing to size against.
   */
  valid: boolean;
};

export function computeLotSize({
  instrument,
  balance,
  riskPercent,
  stopLossPips,
  customPipValue,
}: {
  instrument: Instrument;
  balance: number;
  riskPercent: number;
  stopLossPips: number;
  /** Overrides the instrument's own pip value, for a broker that differs. */
  customPipValue?: number;
}): LotSize {
  const perLot =
    customPipValue !== undefined &&
    Number.isFinite(customPipValue) &&
    customPipValue > 0
      ? customPipValue
      : pipValuePerLot(instrument);

  const riskAmount = balance * (riskPercent / 100);

  const valid =
    Number.isFinite(riskAmount) &&
    riskAmount > 0 &&
    Number.isFinite(stopLossPips) &&
    stopLossPips > 0 &&
    perLot > 0;

  const lots = valid ? riskAmount / (stopLossPips * perLot) : 0;

  const pipValue = lots * perLot;

  return {
    riskAmount: Number.isFinite(riskAmount) ? Math.max(0, riskAmount) : 0,
    pipValuePerLot: perLot,
    lots,
    miniLots: lots * MINI_LOTS_PER_STANDARD,
    microLots: lots * MICRO_LOTS_PER_STANDARD,
    units: lots * instrument.contractSize,
    pipValue,
    lossAtStop: valid ? pipValue * stopLossPips : 0,
    valid,
  };
}

/* ---------------------------------------------------------------------------
   Risk tiers
   The slider is labelled rather than bare, so a number has a character as well
   as a value.
   --------------------------------------------------------------------------- */

export const RISK_PRESETS = [0.5, 1, 2, 3, 5] as const;
export const MIN_RISK_PERCENT = 0.1;
export const MAX_RISK_PERCENT = 5;

export const RISK_TIERS = ["Conservative", "Moderate", "Aggressive"] as const;
export type RiskTier = (typeof RISK_TIERS)[number];

export function riskTier(percent: number): RiskTier {
  if (percent <= 1) return "Conservative";
  if (percent <= 3) return "Moderate";
  return "Aggressive";
}

/* ---------------------------------------------------------------------------
   Formatting
   --------------------------------------------------------------------------- */

/**
 * Lots to two decimals — the granularity brokers actually accept, since 0.01
 * is one micro lot and nothing finer can be traded.
 */
export function formatLots(lots: number): string {
  return lots.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Ounces keep two decimals; currency units are whole. */
export function formatUnits(units: number, instrument: Instrument): string {
  const fractional = instrument.contractSize < 1000;
  return units.toLocaleString("en-US", {
    minimumFractionDigits: fractional ? 2 : 0,
    maximumFractionDigits: fractional ? 2 : 0,
  });
}

export function formatUsd(amount: number, decimals = 2): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: ACCOUNT_CURRENCY,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Digits and at most one decimal point — what a typed figure can contain. */
export function sanitiseNumeric(value: string): string {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  return rest.length === 0 ? whole : `${whole}.${rest.join("")}`;
}
