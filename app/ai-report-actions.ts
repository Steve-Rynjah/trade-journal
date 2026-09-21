"use server";

import { currentUser } from "@/lib/auth";
import { getSheetTrades } from "@/lib/data";
import { chat, hasOpenRouterKey, MISSING_KEY_ERROR, MODEL } from "@/lib/ai/openrouter";
import {
  SYSTEM_PROMPT,
  buildPrompt,
  parseReport,
  sheetFacts,
  sheetLabel,
  type AiReport,
  type ReportMeta,
  type SheetFacts,
} from "@/lib/ai/report";
import { MAX_SHEET_VERSIONS, FIRST_VERSION } from "@/lib/stats";

export type ReportResult =
  | { ok: true; report: AiReport; facts: SheetFacts; meta: ReportMeta }
  | { ok: false; error: string; empty?: boolean };

function validSheet(month: number, year: number, version: number): boolean {
  return (
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12 &&
    Number.isInteger(year) &&
    year >= 2000 &&
    year <= 2100 &&
    Number.isInteger(version) &&
    version >= FIRST_VERSION &&
    version <= MAX_SHEET_VERSIONS
  );
}

/**
 * Reviews one sheet.
 *
 * The trades are read here rather than taken from the client. The page already
 * holds them, so passing them in would be faster — and would also mean the
 * report could be made to describe any rows a caller cared to POST. A Server
 * Action is a public endpoint; the sheet it reports on is the signed-in user's
 * own, read under their RLS policies, every time.
 */
export async function generateReport(
  month: number,
  year: number,
  version: number,
): Promise<ReportResult> {
  if (!validSheet(month, year, version)) {
    return { ok: false, error: "That is not a sheet." };
  }

  const user = await currentUser();
  if (!user) return { ok: false, error: "Your session has expired. Sign in again." };

  if (!hasOpenRouterKey()) {
    return { ok: false, error: MISSING_KEY_ERROR };
  }

  let trades;
  try {
    trades = await getSheetTrades(month, year, version);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not load the sheet.",
    };
  }

  const label = sheetLabel(month, year, version);

  // Nothing to review is not an error, and it is not worth a model call either.
  if (trades.length === 0) {
    return { ok: false, empty: true, error: `No trades logged on ${label} yet.` };
  }

  const result = await chat(SYSTEM_PROMPT, buildPrompt(trades, month, year, version));
  if (!result.ok) return { ok: false, error: result.error };

  const report = parseReport(result.content);
  if (!report) {
    return {
      ok: false,
      error: `${MODEL} answered with something that was not a report. Try again.`,
    };
  }

  return {
    ok: true,
    report,
    // Sent back alongside: the page shows the counted figures itself, so the
    // numbers on screen are the journal's own even if the prose misquotes one.
    facts: sheetFacts(trades),
    meta: {
      model: result.model,
      insteadOf: result.model === MODEL ? undefined : MODEL,
      generatedAt: new Date().toISOString(),
      sheet: label,
      trades: trades.length,
    },
  };
}
