"use client";

import { Card } from "@/app/components/ui";
import type { SheetFacts } from "@/lib/ai/facts";
import type { AiReport, Point, ReportMeta, Verdict } from "@/lib/ai/report";

/* ---------------------------------------------------------------------------
   The counted half

   Drawn from the journal, never from the model. It sits above the prose so the
   figures on screen are the sheet's own — if a sentence below misquotes one,
   the disagreement is visible rather than hidden.
   --------------------------------------------------------------------------- */

function signedR(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (rounded === 0) return "0R";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded)}R`;
}

function Stat({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "bad";
  hint?: string;
}) {
  const tones = {
    neutral: "text-gray-900 dark:text-white",
    good: "text-success-600 dark:text-success-500",
    bad: "text-error-600 dark:text-error-500",
  } as const;

  return (
    <div className="px-5 py-4">
      <p className="text-theme-xs font-medium uppercase tracking-[0.08em] text-gray-400">
        {label}
      </p>
      <p className={`tnum mt-1.5 text-title-sm font-bold leading-none ${tones[tone]}`}>
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-theme-xs text-gray-500 dark:text-gray-400">{hint}</p> : null}
    </div>
  );
}

export function FactStrip({ facts }: { facts: SheetFacts }) {
  const { overall, expectancyR, streaks, daysTraded } = facts;

  return (
    <Card className="overflow-hidden">
      <div className="grid divide-y divide-gray-200 sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4 dark:divide-gray-800 sm:[&>*+*]:border-l sm:[&>*+*]:border-gray-200 dark:sm:[&>*+*]:border-gray-800">
        <Stat
          label="Trades"
          value={String(overall.trades)}
          hint={`${overall.wins}W / ${overall.losses}L${overall.breakevens > 0 ? ` / ${overall.breakevens}BE` : ""} on ${daysTraded} day${daysTraded === 1 ? "" : "s"}`}
        />
        <Stat
          label="Win rate"
          value={`${Math.round(overall.winRate)}%`}
          tone={overall.winRate >= 50 ? "good" : "bad"}
          hint={`Longest run ${streaks.longestWin}W, ${streaks.longestLoss}L`}
        />
        <Stat
          label="Net"
          value={signedR(overall.netR)}
          tone={overall.netR > 0 ? "good" : overall.netR < 0 ? "bad" : "neutral"}
          hint="Risk-multiples, summed"
        />
        <Stat
          label="Expectancy"
          value={signedR(expectancyR)}
          tone={expectancyR > 0 ? "good" : expectancyR < 0 ? "bad" : "neutral"}
          hint="Per trade taken"
        />
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------------------
   The written half
   --------------------------------------------------------------------------- */

const VERDICTS: Record<Verdict, { label: string; className: string }> = {
  strong: {
    label: "Strong sheet",
    className: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500",
  },
  mixed: {
    label: "Mixed sheet",
    className: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-500",
  },
  weak: {
    label: "Weak sheet",
    className: "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-500",
  },
};

type SectionTone = "good" | "bad" | "brand" | "neutral";

const SECTION_TONES: Record<SectionTone, { dot: string; icon: string }> = {
  good: {
    dot: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500",
    icon: "M5 12.5l4.5 4.5L19 7.5",
  },
  bad: {
    dot: "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500",
    icon: "M7 7l10 10M17 7L7 17",
  },
  brand: {
    dot: "bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400",
    icon: "M12 4.5v15M4.5 12h15",
  },
  neutral: {
    dot: "bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400",
    icon: "M4.5 12h15",
  },
};

function Section({
  title,
  hint,
  tone,
  points,
}: {
  title: string;
  hint: string;
  tone: SectionTone;
  points: Point[];
}) {
  if (points.length === 0) return null;
  const { dot, icon } = SECTION_TONES[tone];

  return (
    <Card className="h-full">
      <header className="flex items-start gap-3 px-5 pb-4 pt-5">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${dot}`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={icon} />
          </svg>
        </span>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
          <p className="mt-0.5 text-theme-xs text-gray-500 dark:text-gray-400">{hint}</p>
        </div>
      </header>

      <ul className="flex flex-col gap-4 px-5 pb-5">
        {points.map((point, index) => (
          <li
            key={`${point.title}-${index}`}
            className="border-l-2 border-gray-200 pl-4 dark:border-gray-800"
          >
            {point.title ? (
              <p className="text-theme-sm font-semibold text-gray-900 dark:text-white/90">
                {point.title}
              </p>
            ) : null}
            <p className="mt-1 text-theme-sm leading-relaxed text-gray-600 dark:text-gray-300">
              {point.detail}
            </p>
            {point.evidence ? (
              // The receipt for the point above it — set apart so a claim and
              // what backs it never read as one sentence.
              <p className="mt-1.5 text-theme-xs text-gray-400 dark:text-gray-500">
                {point.evidence}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function ReportView({
  report,
  facts,
  meta,
}: {
  report: AiReport;
  facts: SheetFacts;
  meta: ReportMeta;
}) {
  const verdict = VERDICTS[report.verdict];

  return (
    <div className="flex flex-col gap-5">
      <FactStrip facts={facts} />

      <Card>
        <div className="px-5 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-theme-xs font-semibold ${verdict.className}`}
            >
              {verdict.label}
            </span>
            <span className="text-theme-xs text-gray-400">
              {meta.sheet} · {meta.trades} {meta.trades === 1 ? "trade" : "trades"}
            </span>
          </div>

          <h2 className="mt-3 text-title-sm font-bold leading-snug text-gray-900 dark:text-white">
            {report.headline}
          </h2>
          {report.summary ? (
            <p className="mt-2.5 max-w-3xl text-theme-sm leading-relaxed text-gray-600 dark:text-gray-300">
              {report.summary}
            </p>
          ) : null}
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Section
          title="What went well"
          hint="Worth repeating on the next sheet"
          tone="good"
          points={report.strengths}
        />
        <Section
          title="Mistakes"
          hint="What cost this sheet"
          tone="bad"
          points={report.mistakes}
        />
        <Section
          title="How to improve"
          hint="Concrete changes, not resolutions"
          tone="brand"
          points={report.improvements}
        />
        <Section
          title="Patterns"
          hint="Tendencies across the sheet"
          tone="neutral"
          points={report.patterns}
        />
      </div>

      {report.focus ? (
        <Card className="border-brand-200 bg-brand-50/60 dark:border-brand-500/30 dark:bg-brand-500/10">
          <div className="flex items-start gap-3 px-5 py-5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
                <circle cx="12" cy="12" r="8" />
                <circle cx="12" cy="12" r="3.2" />
              </svg>
            </span>
            <div>
              <p className="text-theme-xs font-medium uppercase tracking-[0.08em] text-brand-500 dark:text-brand-400">
                Focus next
              </p>
              <p className="mt-1 text-theme-sm font-medium leading-relaxed text-gray-800 dark:text-white/90">
                {report.focus}
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Written by a model, from the figures above. Said once, at the bottom,
          where it belongs — a banner over every report would be noise. */}
      <p className="px-1 text-theme-xs text-gray-400">
        Written by {meta.model} from the figures above
        {meta.insteadOf ? ` — ${meta.insteadOf} was busy` : ""} ·{" "}
        {new Date(meta.generatedAt).toLocaleString("en-GB", {
          dateStyle: "medium",
          timeStyle: "short",
        })}
      </p>
    </div>
  );
}
