import type { ReactNode } from "react";

import type { Bias, Direction, TradeResult } from "@/lib/types";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] ${className}`}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 px-5 pb-4 pt-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
        {hint ? (
          <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">{hint}</p>
        ) : null}
      </div>
      {action}
    </header>
  );
}

/* ---------------------------------------------------------------------------
   Badges
   The word is always spelled out inside the badge — colour is decoration, never
   the only thing carrying the meaning.
   --------------------------------------------------------------------------- */

const BADGE =
  "inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-theme-xs font-medium";

const SUCCESS = "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500";
const ERROR = "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-500";

/** Short form on purpose — the column is narrow and the word adds nothing. */
export function biasLabel(bias: Bias): string {
  return bias === "BULLISH" ? "BULL" : "BEAR";
}

export function BiasBadge({ bias }: { bias: Bias }) {
  return (
    <span className={`${BADGE} font-semibold ${bias === "BULLISH" ? SUCCESS : ERROR}`}>
      {biasLabel(bias)}
    </span>
  );
}

export function DirectionBadge({ direction }: { direction: Direction }) {
  return (
    <span className={`${BADGE} ${direction === "LONG" ? SUCCESS : ERROR}`}>
      {direction}
    </span>
  );
}

const RESULT_STYLES: Record<TradeResult, string> = {
  WIN: SUCCESS,
  LOSE: ERROR,
};

export function ResultBadge({ result }: { result: TradeResult }) {
  return (
    <span className={`${BADGE} font-semibold ${RESULT_STYLES[result]}`}>{result}</span>
  );
}

/* ---------------------------------------------------------------------------
   Controls
   --------------------------------------------------------------------------- */

/** Shared by every inline cell input, so a typed row lines up with a saved one. */
export const fieldBase =
  "w-full rounded-lg border px-2.5 py-1.5 text-theme-sm transition-colors focus:border-brand-300 focus:outline-none";

export const fieldNeutral =
  "border-gray-200 bg-white text-gray-800 placeholder:text-gray-400 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-gray-500 dark:hover:border-gray-600";

export const fieldClass = `${fieldBase} ${fieldNeutral}`;

/** A cell that means "good" (Bullish, Long, Win) reads green; its opposite red. */
export const fieldGood =
  "border-success-200 bg-success-50 font-medium text-success-700 hover:border-success-300 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-500";

export const fieldBad =
  "border-error-200 bg-error-50 font-medium text-error-700 hover:border-error-300 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-500";

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline";
}) {
  const styles =
    variant === "primary"
      ? "bg-brand-500 text-white shadow-theme-xs hover:bg-brand-600"
      : "border border-gray-300 bg-white text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/5";

  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-theme-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}
