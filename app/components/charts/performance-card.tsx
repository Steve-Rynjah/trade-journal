import type { ResultSplit } from "@/lib/stats";

/**
 * A win rate stated as a percentage, with the counts underneath so "60%" can
 * never be mistaken for a share of trades taken rather than trades won.
 */
export function PerformanceCard({
  label,
  split,
  hint,
  tone = "brand",
}: {
  label: string;
  split: ResultSplit;
  /** What the figure covers, when it is not simply the month on screen. */
  hint?: string;
  tone?: "brand" | "success" | "error";
}) {
  const tones = {
    brand: { text: "text-brand-500", bar: "bg-brand-500" },
    success: { text: "text-success-600 dark:text-success-500", bar: "bg-success-500" },
    error: { text: "text-error-600 dark:text-error-500", bar: "bg-error-500" },
  } as const;

  const empty = split.total === 0;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-theme-sm text-gray-500 dark:text-gray-400">{label}</p>
      {hint ? (
        <p className="mt-0.5 text-theme-xs text-gray-400 dark:text-gray-500">{hint}</p>
      ) : null}

      <p
        className={`tnum mt-2 text-title-sm font-bold ${empty ? "text-gray-300 dark:text-gray-600" : tones[tone].text}`}
      >
        {empty ? "—" : `${split.winRate.toFixed(1)}%`}
      </p>

      {/* The bar is the same number again, drawn — never the only encoding. */}
      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${tones[tone].bar}`}
          style={{ width: `${empty ? 0 : split.winRate}%` }}
        />
      </div>

      <p className="tnum mt-3 text-theme-xs text-gray-500 dark:text-gray-400">
        {empty
          ? "Nothing logged yet"
          : `${split.wins} won · ${split.losses} lost · ${split.total} taken`}
      </p>
    </div>
  );
}
