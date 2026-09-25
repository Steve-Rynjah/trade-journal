/**
 * The report the AI Report tab renders, and the prompt that produces it.
 *
 * Shared by the server action and the page, so the shape the model is asked for
 * and the shape the page draws can never drift apart.
 */

import { MONTHS, versionLabel } from "@/lib/stats";
import type { Trade } from "@/lib/types";
import { sheetFacts, tradeLines, type SheetFacts } from "./facts";

export type Verdict = "strong" | "mixed" | "weak";

export type Point = {
  title: string;
  detail: string;
  /** The rows or figures the point is drawn from — what makes it checkable. */
  evidence: string;
};

export type AiReport = {
  headline: string;
  verdict: Verdict;
  summary: string;
  /** What was done well, worth repeating. */
  strengths: Point[];
  /** What went wrong, named plainly. */
  mistakes: Point[];
  /** What to change, each one actionable on the next sheet. */
  improvements: Point[];
  /** Tendencies across the sheet that are neither good nor bad on their own. */
  patterns: Point[];
  /** The single thing to carry into the next run. */
  focus: string;
};

export type ReportMeta = {
  /** The model that actually answered, which is not always the one asked for. */
  model: string;
  /** Set only when a fallback answered, so the swap is stated rather than implied. */
  insteadOf?: string;
  generatedAt: string;
  sheet: string;
  trades: number;
};

export function sheetLabel(month: number, year: number, version: number): string {
  return `${MONTHS[month - 1]} ${year} · ${versionLabel(version)}`;
}

/* ---------------------------------------------------------------------------
   Prompt
   --------------------------------------------------------------------------- */

export const SYSTEM_PROMPT = `You are a trading coach reviewing one sheet of a forex journal.

Rules you must follow:
- Every number you state is given to you in the FACTS block. Never compute, estimate or invent a figure, and never contradict one.
- Be specific. "Manage risk better" is worthless; "four of your five losses were SHORT trades on Wednesday" is worth reading.
- Cite the evidence for each point: trade numbers, dates, or a figure from FACTS.
- Be honest. If the sheet went badly, say so plainly. If it went well, do not invent faults to seem balanced.
- R means the risk taken on one trade. A win at 1:3 returns +3R, any loss costs -1R.
- A small sheet is weak evidence. With fewer than 8 trades, say that the sample is small rather than drawing firm conclusions from it.
- The trader's own notes are the best material you have. Quote them when they explain a result.
- Write in second person ("you"), plain English, no jargon padding, no motivational filler.

Answer with a single JSON object and nothing else:
{
  "headline": "one sentence, under 90 characters, the verdict of this sheet",
  "verdict": "strong" | "mixed" | "weak",
  "summary": "2 to 4 sentences on how the sheet went overall",
  "strengths": [{"title": "short label", "detail": "1-3 sentences", "evidence": "trades or figures behind it"}],
  "mistakes": [{"title": "...", "detail": "...", "evidence": "..."}],
  "improvements": [{"title": "...", "detail": "what to do differently, concretely", "evidence": "what in this sheet calls for it"}],
  "patterns": [{"title": "...", "detail": "...", "evidence": "..."}],
  "focus": "the one thing to fix on the next sheet, in one sentence"
}

Two to four items per list. Leave a list empty only when the sheet genuinely gives nothing for it.`;

function cohortLines(title: string, rows: { label: string; trades: number; wins: number; losses: number; breakevens: number; winRate: number; netR: number }[]): string {
  if (rows.length === 0) return "";
  const body = rows
    .map(
      (row) =>
        `  - ${row.label}: ${row.trades} trade${row.trades === 1 ? "" : "s"}, ${row.wins}W/${row.losses}L${row.breakevens > 0 ? `/${row.breakevens}BE` : ""}, ${row.winRate}% win rate, ${signed(row.netR)}R`,
    )
    .join("\n");
  return `${title}:\n${body}`;
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export function buildPrompt(
  trades: Trade[],
  month: number,
  year: number,
  version: number,
): string {
  const facts = sheetFacts(trades);
  const label = sheetLabel(month, year, version);

  return [
    `SHEET: ${label}`,
    `This is run ${versionLabel(version)} of ${MONTHS[month - 1]} ${year}. Judge only these trades.`,
    "",
    "FACTS (authoritative — quote these, never recompute):",
    `- Trades: ${facts.overall.trades} (${facts.overall.wins} won, ${facts.overall.losses} lost, ${facts.overall.breakevens} break even, ${facts.overall.winRate}% win rate of decided trades)`,
    `- Net result: ${signed(facts.overall.netR)}R across the sheet, ${signed(facts.expectancyR)}R expectancy per trade`,
    `- Best trade ${signed(facts.bestTradeR)}R, worst ${signed(facts.worstTradeR)}R`,
    `- Longest winning streak ${facts.streaks.longestWin}, longest losing streak ${facts.streaks.longestLoss}`,
    `- Traded on ${facts.daysTraded} day${facts.daysTraded === 1 ? "" : "s"}${
      facts.busiestDay
        ? `, busiest was ${facts.busiestDay.date} with ${facts.busiestDay.trades} trades (${signed(facts.busiestDay.netR)}R)`
        : ""
    }`,
    `- Trades taken later the same day after a loss: ${facts.afterLoss.taken}${
      facts.afterLoss.taken > 0
        ? ` (${facts.afterLoss.wins} of them won, ${signed(facts.afterLoss.netR)}R)`
        : ""
    }`,
    `- Journalling: ${facts.withRemarks} of ${facts.overall.trades} trades carry a note, ${facts.withScreenshot} carry a chart`,
    "",
    cohortLines("By direction", facts.byDirection),
    cohortLines("By bias", facts.byBias),
    cohortLines("Bias against direction", facts.byAlignment),
    cohortLines("By weekday", facts.byWeekday),
    cohortLines("By risk-reward", facts.byRatio),
    "",
    "TRADES, in the order taken:",
    ...tradeLines(trades),
    "",
    facts.overall.trades < 8
      ? "NOTE: this is a small sample. Say so, and keep your conclusions tentative."
      : "",
    "Write the review now, as JSON.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/** Re-exported so the action can attach the same figures it prompted with. */
export type { SheetFacts };
export { sheetFacts };

/* ---------------------------------------------------------------------------
   Parsing

   A free model does not always honour JSON mode: the answer arrives wrapped in
   a ```json fence, or with a sentence before it. None of that is worth failing
   a report over, so the object is dug out rather than demanded.
   --------------------------------------------------------------------------- */

export function parseReport(content: string): AiReport | null {
  const raw = extractJson(content);
  if (!raw) return null;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;

  const headline = text(candidate.headline);
  const summary = text(candidate.summary);
  if (headline === "" && summary === "") return null;

  return {
    headline: headline || "Sheet reviewed.",
    verdict: verdictOf(candidate.verdict),
    summary,
    strengths: points(candidate.strengths),
    mistakes: points(candidate.mistakes),
    improvements: points(candidate.improvements),
    patterns: points(candidate.patterns),
    focus: text(candidate.focus),
  };
}

function extractJson(content: string): string | null {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced?.[1] ?? content).trim();

  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  return body.slice(start, end + 1);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function verdictOf(value: unknown): Verdict {
  const word = text(value).toLowerCase();
  if (word === "strong" || word === "weak") return word;
  return "mixed";
}

/**
 * Accepts a list of objects or a list of plain strings — smaller models often
 * answer with the latter, and a bare sentence is still a usable point.
 */
function points(value: unknown): Point[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): Point | null => {
      if (typeof item === "string") {
        const detail = item.trim();
        return detail === "" ? null : { title: "", detail, evidence: "" };
      }
      if (typeof item !== "object" || item === null) return null;

      const entry = item as Record<string, unknown>;
      const title = text(entry.title);
      const detail = text(entry.detail) || text(entry.description);
      if (title === "" && detail === "") return null;

      return { title, detail, evidence: text(entry.evidence) };
    })
    .filter((point): point is Point => point !== null)
    .slice(0, 6);
}
