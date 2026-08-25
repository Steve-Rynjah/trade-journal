"use client";

import { useState, type ReactNode } from "react";

import {
  ACCOUNT_CURRENCY,
  INSTRUMENTS,
  MAX_RISK_PERCENT,
  MIN_RISK_PERCENT,
  RISK_PRESETS,
  RISK_TIERS,
  computeLotSize,
  formatLots,
  formatUnits,
  formatUsd,
  pipValuePerLot,
  riskTier,
  sanitiseNumeric,
  type Instrument,
} from "@/lib/lot-size";

/* ---------------------------------------------------------------------------
   Icons
   --------------------------------------------------------------------------- */

const ICONS = {
  balance: (
    <>
      <rect x="2.8" y="5" width="18.4" height="14" rx="3" strokeWidth="1.7" />
      <path d="M2.8 9.6h18.4" strokeWidth="1.7" />
    </>
  ),
  risk: (
    <>
      <path
        d="M12 3.8 21 19.5H3L12 3.8Z"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M12 9.8v4.2M12 16.6v.2" strokeWidth="1.9" strokeLinecap="round" />
    </>
  ),
  stop: (
    <>
      <circle cx="12" cy="12" r="7.4" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="1.9" strokeWidth="1.7" />
      <path d="M12 2.6v3M12 18.4v3M2.6 12h3M18.4 12h3" strokeWidth="1.7" strokeLinecap="round" />
    </>
  ),
  instrument: (
    <>
      <path
        d="M3.5 15.5 9 10l3.5 3.5L20.5 6"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M15.5 6h5v5" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  mini: (
    <>
      <rect x="3.2" y="3.8" width="17.6" height="16.4" rx="3" strokeWidth="1.7" />
      <path d="M3.2 9.4h17.6M9.4 9.4v10.8" strokeWidth="1.7" />
    </>
  ),
  micro: (
    <>
      <circle cx="12" cy="12" r="8.6" strokeWidth="1.7" />
      <path d="M3.4 12h17.2" strokeWidth="1.7" />
      <path d="M12 3.4c2.2 2.4 3.3 5.4 3.3 8.6s-1.1 6.2-3.3 8.6c-2.2-2.4-3.3-5.4-3.3-8.6S9.8 5.8 12 3.4Z" strokeWidth="1.7" />
    </>
  ),
  units: (
    <>
      <path
        d="M12 3.2 20 7.4v9.2L12 20.8 4 16.6V7.4L12 3.2Z"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M4 7.4l8 4.2 8-4.2M12 11.6v9.2" strokeWidth="1.7" strokeLinejoin="round" />
    </>
  ),
  shield: (
    <path
      d="M12 3.2 19 6v5.6c0 4-2.9 7.6-7 9.2-4.1-1.6-7-5.2-7-9.2V6l7-2.8Z"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
  ),
  alert: (
    <>
      <path d="M12 3.8 21 19.5H3L12 3.8Z" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M12 9.8v4.2M12 16.6v.2" strokeWidth="1.9" strokeLinecap="round" />
    </>
  ),
} as const;

function Icon({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

/* ---------------------------------------------------------------------------
   Shared shapes
   --------------------------------------------------------------------------- */

/** One of the stacked input panels down the left. */
function Panel({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="mb-4 flex items-center gap-2.5 text-theme-xs font-semibold uppercase tracking-[0.1em] text-gray-500 dark:text-gray-400">
        <span className="text-brand-500 dark:text-brand-400">
          <Icon>{icon}</Icon>
        </span>
        {label}
      </h2>
      {children}
    </section>
  );
}

const INPUT =
  "w-full rounded-xl border border-gray-300 bg-white py-3 text-theme-sm text-gray-800 transition-colors placeholder:text-gray-400 hover:border-gray-400 focus:border-brand-300 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:hover:border-gray-600";

/** An input with a fixed affix boxed off at one end, as in the reference. */
function AffixInput({
  value,
  onChange,
  affix,
  side,
  placeholder,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  affix: string;
  side: "left" | "right";
  placeholder?: string;
  label: string;
}) {
  const divider =
    side === "left"
      ? "left-0 border-r pl-4 pr-3.5"
      : "right-0 border-l pl-3.5 pr-4";

  return (
    <div className="relative">
      <span
        className={`pointer-events-none absolute inset-y-0 flex items-center border-gray-200 text-theme-sm text-gray-500 dark:border-gray-800 dark:text-gray-400 ${divider}`}
      >
        {affix}
      </span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(sanitiseNumeric(event.target.value))}
        placeholder={placeholder}
        className={`${INPUT} tnum ${side === "left" ? "pl-16 pr-4" : "pl-4 pr-20"}`}
      />
    </div>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2.5 text-theme-xs text-gray-400 dark:text-gray-500">{children}</p>
  );
}

/** One of the result tiles: an icon badge, a label, a figure and a note. */
function Stat({
  icon,
  label,
  value,
  note,
  tone = "neutral",
  className = "",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  note: string;
  tone?: "neutral" | "danger";
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] ${className}`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            tone === "danger"
              ? "bg-error-50 text-error-500 dark:bg-error-500/15"
              : "bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400"
          }`}
        >
          <Icon>{icon}</Icon>
        </span>
        <p className="text-theme-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
          {label}
        </p>
      </div>

      <p
        className={`tnum mt-3 text-title-sm font-bold leading-none ${
          tone === "danger"
            ? "text-error-500"
            : "text-gray-900 dark:text-white"
        }`}
      >
        {value}
      </p>
      <p className="tnum mt-1.5 text-theme-xs text-gray-400 dark:text-gray-500">{note}</p>
    </div>
  );
}

/** A key/value pair in the trade summary grid. */
function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-gray-100 py-3 last:border-0 dark:border-gray-800">
      <dt className="text-theme-xs uppercase tracking-[0.06em] text-gray-400 dark:text-gray-500">
        {label}
      </dt>
      <dd className="tnum text-theme-sm font-semibold text-gray-900 dark:text-white">
        {value}
      </dd>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   The page
   --------------------------------------------------------------------------- */

export default function CalculatorPage() {
  const [instrument, setInstrument] = useState<Instrument>(INSTRUMENTS[0]);
  const [balance, setBalance] = useState("5000");
  const [riskPercent, setRiskPercent] = useState(1);
  const [stopLossPips, setStopLossPips] = useState("20");
  const [useCustomPip, setUseCustomPip] = useState(false);
  const [customPip, setCustomPip] = useState("");

  const defaultPip = pipValuePerLot(instrument);

  const size = computeLotSize({
    instrument,
    balance: Number(balance),
    riskPercent,
    stopLossPips: Number(stopLossPips),
    customPipValue: useCustomPip ? Number(customPip) : undefined,
  });

  const tier = riskTier(riskPercent);
  const pipSize = instrument.pip.toFixed(instrument.quotePrecision - 1);

  // Mini and micro lots are tenths and hundredths of a standard one, so the
  // contract behind each is the same fraction of the standard contract.
  const miniUnits = instrument.contractSize / 10;
  const microUnits = instrument.contractSize / 100;

  return (
    <div className="mx-auto w-full max-w-[85rem]">
      {/* ------------------------------------------------------------------
          Header
          ------------------------------------------------------------------ */}
      <header className="mb-6 flex items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect
              x="4"
              y="2.6"
              width="16"
              height="18.8"
              rx="3"
              stroke="currentColor"
              strokeWidth="1.7"
            />
            <rect x="7.2" y="5.8" width="9.6" height="3.6" rx="1.2" fill="currentColor" />
            <g fill="currentColor">
              <circle cx="8.6" cy="13.4" r="1.25" />
              <circle cx="12" cy="13.4" r="1.25" />
              <circle cx="15.4" cy="13.4" r="1.25" />
              <circle cx="8.6" cy="17.4" r="1.25" />
              <circle cx="12" cy="17.4" r="1.25" />
              <circle cx="15.4" cy="17.4" r="1.25" />
            </g>
          </svg>
        </span>
        <div>
          <h1 className="text-title-sm font-bold text-gray-900 dark:text-white">
            Position Size Calculator
          </h1>
          <p className="mt-0.5 text-theme-sm text-gray-500 dark:text-gray-400">
            Calculate optimal lot size based on risk tolerance
          </p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ----------------------------------------------------------------
            Inputs
            ---------------------------------------------------------------- */}
        <div className="flex flex-col gap-5">
          <Panel icon={ICONS.balance} label="Account balance">
            <AffixInput
              label="Account balance"
              value={balance}
              onChange={setBalance}
              affix="$"
              side="left"
              placeholder="5000"
            />
            <Hint>Enter your trading account balance</Hint>
          </Panel>

          <Panel icon={ICONS.risk} label="Risk percentage">
            <div className="flex items-baseline justify-between gap-3">
              <p className="tnum text-title-sm font-bold text-brand-500 dark:text-brand-400">
                {riskPercent}%
              </p>
              <p className="tnum text-theme-xl font-medium text-gray-700 dark:text-gray-300">
                {formatUsd(size.riskAmount)}
              </p>
            </div>

            <input
              type="range"
              aria-label="Risk percentage"
              min={MIN_RISK_PERCENT}
              max={MAX_RISK_PERCENT}
              step={0.1}
              value={riskPercent}
              onChange={(event) => setRiskPercent(Number(event.target.value))}
              className="risk-slider mt-4"
            />

            {/* The tier the current value falls in lights up, so the slider says
                what kind of risk it is and not only how much. */}
            <div className="mt-2.5 flex items-center justify-between">
              {RISK_TIERS.map((name) => (
                <span
                  key={name}
                  className={`text-theme-xs font-semibold uppercase tracking-[0.08em] transition-colors ${
                    tier === name
                      ? "text-brand-500 dark:text-brand-400"
                      : "text-gray-400 dark:text-gray-500"
                  }`}
                >
                  {name}
                </span>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-5 gap-2">
              {RISK_PRESETS.map((preset) => {
                const active = preset === riskPercent;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setRiskPercent(preset)}
                    aria-pressed={active}
                    className={`tnum rounded-lg border py-2 text-theme-sm font-medium transition-colors ${
                      active
                        ? "border-brand-500 bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400"
                        : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/5"
                    }`}
                  >
                    {preset}%
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel icon={ICONS.stop} label="Stop loss distance">
            <AffixInput
              label="Stop loss distance in pips"
              value={stopLossPips}
              onChange={setStopLossPips}
              affix="pips"
              side="right"
              placeholder="20"
            />
            <Hint>Distance from entry to stop loss in pips</Hint>
          </Panel>

          <Panel icon={ICONS.instrument} label="Trading instrument">
            <div className="relative">
              <select
                aria-label="Trading instrument"
                value={instrument.symbol}
                onChange={(event) =>
                  setInstrument(
                    INSTRUMENTS.find((item) => item.symbol === event.target.value) ??
                      INSTRUMENTS[0],
                  )
                }
                className={`${INPUT} appearance-none pl-4 pr-11`}
              >
                {INSTRUMENTS.map((option) => (
                  <option key={option.symbol} value={option.symbol}>
                    {option.symbol}
                  </option>
                ))}
              </select>
              <svg
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M6 9.5l6 6 6-6"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <p className="tnum mt-3 flex flex-wrap gap-x-6 gap-y-1 rounded-xl bg-brand-50 px-4 py-3 text-theme-sm text-gray-700 dark:bg-brand-500/10 dark:text-gray-300">
              <span>
                Pip Value:{" "}
                <span className="font-semibold">
                  {formatUsd(size.pipValuePerLot, 0)}/lot
                </span>
              </span>
              <span>
                Pip Size: <span className="font-semibold">{pipSize}</span>
              </span>
            </p>

            <label className="mt-3.5 flex items-center gap-2.5 text-theme-sm text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={useCustomPip}
                onChange={(event) => {
                  setUseCustomPip(event.target.checked);
                  // Seed with the value being replaced, so ticking the box does
                  // not blank the figure the whole result depends on.
                  if (event.target.checked && customPip === "") {
                    setCustomPip(String(defaultPip));
                  }
                }}
                className="h-4 w-4 rounded border-gray-300 accent-brand-500 dark:border-gray-700"
              />
              Use custom pip value
            </label>

            {useCustomPip ? (
              <div className="mt-3">
                <AffixInput
                  label="Custom pip value per lot"
                  value={customPip}
                  onChange={setCustomPip}
                  affix="$"
                  side="left"
                  placeholder={String(defaultPip)}
                />
                <Hint>What one pip is worth per standard lot at your broker</Hint>
              </div>
            ) : null}
          </Panel>
        </div>

        {/* ----------------------------------------------------------------
            Results
            ---------------------------------------------------------------- */}
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-brand-25 px-6 py-8 text-center dark:border-brand-500/20 dark:from-brand-500/12 dark:to-transparent">
            <p className="text-theme-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
              Recommended position size
            </p>

            <p className="mt-3 flex flex-wrap items-baseline justify-center gap-x-3">
              <span className="tnum text-[64px] font-bold leading-none text-brand-500 dark:text-brand-400">
                {size.valid ? formatLots(size.lots) : "—"}
              </span>
              <span className="text-theme-xl font-semibold text-gray-700 dark:text-gray-200">
                Standard Lots
              </span>
            </p>

            <p className="mt-3 text-theme-sm text-gray-500 dark:text-gray-400">
              {size.valid
                ? `Based on ${riskPercent}% risk (${formatUsd(size.riskAmount)})`
                : "Enter a balance and a stop loss above"}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Stat
              icon={ICONS.mini}
              label="Mini lots"
              value={size.valid ? formatLots(size.miniLots) : "—"}
              note={`${miniUnits.toLocaleString("en-US")} ${instrument.unitNoun}`}
            />
            <Stat
              icon={ICONS.micro}
              label="Micro lots"
              value={size.valid ? formatLots(size.microLots) : "—"}
              note={`${microUnits.toLocaleString("en-US")} ${instrument.unitNoun}`}
            />

            {/* Units spans the row: it is the figure a platform that does not
                think in lots will ask for. */}
            <Stat
              className="sm:col-span-2"
              icon={ICONS.units}
              label={instrument.unitNoun}
              value={size.valid ? formatUnits(size.units, instrument) : "—"}
              note={`${instrument.contractSize.toLocaleString("en-US")} ${instrument.unitNoun} per standard lot`}
            />

            <Stat
              icon={ICONS.shield}
              label="Risk amount"
              value={formatUsd(size.riskAmount)}
              note={`${riskPercent}% of balance`}
            />
            <Stat
              icon={ICONS.alert}
              tone="danger"
              label="Loss at stop"
              value={size.valid ? formatUsd(size.lossAtStop) : "—"}
              note="If SL is hit"
            />
          </div>

          <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <h2 className="text-theme-xs font-semibold uppercase tracking-[0.1em] text-gray-500 dark:text-gray-400">
              Trade summary
            </h2>
            <dl className="mt-2 grid gap-x-8 sm:grid-cols-2">
              <SummaryRow
                label="Account balance"
                value={formatUsd(Number(balance) || 0)}
              />
              <SummaryRow label="Symbol" value={instrument.symbol} />
              <SummaryRow label="Stop loss" value={`${stopLossPips || 0} pips`} />
              <SummaryRow
                label="Pip value"
                value={`${formatUsd(size.pipValuePerLot, 0)}/pip/lot`}
              />
              <SummaryRow
                label={instrument.unitNoun}
                value={size.valid ? formatUnits(size.units, instrument) : "—"}
              />
              <SummaryRow label="Currency" value={ACCOUNT_CURRENCY} />
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
