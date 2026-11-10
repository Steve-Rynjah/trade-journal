"use server";

import { revalidatePath } from "next/cache";

import { currentUser, type SessionUser } from "@/lib/auth";
import type { FormState } from "@/lib/form-state";
import {
  MAX_JOURNAL_CHARTS,
  MAX_JOURNAL_LENGTH,
  NO_TP,
  levelsProblem,
  normalisePrice,
  parsePrice,
} from "@/lib/journal";
import { createClient } from "@/lib/supabase/server";
import { SCREENSHOT_BUCKET } from "@/lib/supabase/config";
import { FIRST_VERSION, MAX_SHEET_VERSIONS } from "@/lib/stats";
import {
  BIASES,
  DIRECTIONS,
  MAX_RATIO_LENGTH,
  RESULTS,
  isValidDate,
  isWeekday,
  type Bias,
  type Direction,
  type TradeResult,
} from "@/lib/types";

const JOURNAL_PATH = "/journal";
const MAX_CHART_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/avif"];

const SIGNED_OUT: FormState = {
  status: "error",
  message: "Your session has expired. Sign in again.",
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

type ParsedEntry = {
  trade_date: string;
  version: number;
  bias: Bias;
  direction: Direction;
  // Sent as strings so `1.12450` reaches the column with its last zero —
  // a JSON number would drop it before Postgres ever saw it.
  entry_price: string;
  stop_loss: string;
  take_profit: string | null;
  ratio: string;
  result: TradeResult;
  journal: string | null;
};

function parseEntry(formData: FormData): {
  values?: ParsedEntry;
  fieldErrors?: Record<string, string>;
} {
  const fieldErrors: Record<string, string> = {};

  const tradeDate = String(formData.get("trade_date") ?? "").trim();
  const version = Number(formData.get("version") ?? FIRST_VERSION);
  const bias = String(formData.get("bias") ?? "");
  const direction = String(formData.get("direction") ?? "");
  const result = String(formData.get("result") ?? "");
  const journal = String(formData.get("journal") ?? "").trim();
  const entryRaw = String(formData.get("entry") ?? "");
  const stopLossRaw = String(formData.get("stop_loss") ?? "");
  const entry = parsePrice(entryRaw);
  const stopLoss = parsePrice(stopLossRaw);
  const tpRaw = String(formData.get("take_profit") ?? "").trim();
  const noTarget = tpRaw === NO_TP;
  const takeProfit = noTarget ? null : parsePrice(tpRaw);
  const ratio = String(formData.get("ratio") ?? "").trim();

  if (!isValidDate(tradeDate)) fieldErrors.trade_date = "Pick a date.";
  else if (!isWeekday(tradeDate)) fieldErrors.trade_date = "Forex week runs Monday to Friday.";

  if (!Number.isInteger(version) || version < FIRST_VERSION || version > MAX_SHEET_VERSIONS) {
    fieldErrors.version = "Pick a version.";
  }
  if (!BIASES.includes(bias as Bias)) fieldErrors.bias = "Choose a bias.";
  if (!DIRECTIONS.includes(direction as Direction)) fieldErrors.direction = "Choose a direction.";
  if (!RESULTS.includes(result as TradeResult)) fieldErrors.result = "Choose a result.";

  if (entry === null) fieldErrors.entry = "Enter the entry price.";
  if (stopLoss === null) fieldErrors.stop_loss = "Enter the SL.";
  if (takeProfit === null && !noTarget) fieldErrors.take_profit = "Enter the TP, or - for none.";

  if (!/^\d+(\.\d+)? : \d+(\.\d+)?$/.test(ratio) || ratio.length > MAX_RATIO_LENGTH) {
    fieldErrors.ratio = "Enter both legs of the RR.";
  }

  const levels = levelsProblem(direction as Direction, entry, stopLoss, takeProfit);
  if (levels) fieldErrors.levels = levels;

  if (journal.length > MAX_JOURNAL_LENGTH) {
    fieldErrors.journal = `Keep the journal under ${MAX_JOURNAL_LENGTH} characters.`;
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  return {
    values: {
      trade_date: tradeDate,
      version,
      bias: bias as Bias,
      direction: direction as Direction,
      entry_price: normalisePrice(entryRaw),
      stop_loss: normalisePrice(stopLossRaw),
      take_profit: noTarget ? null : normalisePrice(tpRaw),
      ratio,
      result: result as TradeResult,
      journal: journal === "" ? null : journal,
    },
  };
}

function readCharts(formData: FormData): { files: File[]; error?: string } {
  const files = formData
    .getAll("chart")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  for (const file of files) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return { files: [], error: "Charts must be PNG, JPEG, WebP or AVIF images." };
    }
    if (file.size > MAX_CHART_BYTES) return { files: [], error: `${file.name} is over 5 MB.` };
  }
  return { files };
}

function tooMany(count: number): string | null {
  return count > MAX_JOURNAL_CHARTS ? `An entry holds at most ${MAX_JOURNAL_CHARTS} charts.` : null;
}

function extensionFor(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  return file.type.split("/")[1] ?? "png";
}

/**
 * `<user_id>/journal/<uuid>.<ext>` — the owner stays the first segment, which is
 * all the storage policies read, so the existing bucket rules cover these too.
 */
async function uploadAll(
  supabase: Supabase,
  user: SessionUser,
  files: File[],
): Promise<{ paths: string[]; error?: string }> {
  const paths: string[] = [];
  for (const file of files) {
    const path = `${user.id}/journal/${crypto.randomUUID()}.${extensionFor(file)}`;
    const { error } = await supabase.storage
      .from(SCREENSHOT_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) {
      await removeFiles(supabase, paths);
      return { paths: [], error: `Upload failed: ${error.message}` };
    }
    paths.push(path);
  }
  return { paths };
}

async function removeFiles(supabase: Supabase, paths: string[]) {
  if (paths.length > 0) await supabase.storage.from(SCREENSHOT_BUCKET).remove(paths);
}

async function existingPaths(
  supabase: Supabase,
  id: string,
): Promise<{ paths: string[]; error?: string }> {
  const { data, error } = await supabase
    .from("journal_entries")
    .select("screenshot_paths")
    .eq("id", id)
    .single();
  if (error) return { paths: [], error: `Could not load the entry: ${error.message}` };
  return { paths: data?.screenshot_paths ?? [] };
}

function failure(error: unknown): FormState {
  return {
    status: "error",
    message: error instanceof Error ? error.message : "Something went wrong.",
  };
}

function invalid(fieldErrors: Record<string, string>): FormState {
  return { status: "error", message: Object.values(fieldErrors).join(" "), fieldErrors };
}

export async function createJournalEntry(formData: FormData): Promise<FormState> {
  const { values, fieldErrors } = parseEntry(formData);
  if (!values) return invalid(fieldErrors!);

  const { files, error: fileError } = readCharts(formData);
  const limitError = fileError ?? tooMany(files.length);
  if (limitError) return { status: "error", message: limitError };

  const user = await currentUser();
  if (!user) return SIGNED_OUT;

  try {
    const supabase = await createClient();
    const { paths, error: uploadError } = await uploadAll(supabase, user, files);
    if (uploadError) return { status: "error", message: uploadError };

    const { error } = await supabase
      .from("journal_entries")
      .insert({ ...values, user_id: user.id, screenshot_paths: paths });

    if (error) {
      await removeFiles(supabase, paths);
      return { status: "error", message: `Could not save the entry: ${error.message}` };
    }

    revalidatePath(JOURNAL_PATH);
    return { status: "success", message: "Trade journalled." };
  } catch (error) {
    return failure(error);
  }
}

export async function updateJournalEntry(formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { status: "error", message: "Missing entry id." };

  const { values, fieldErrors } = parseEntry(formData);
  if (!values) return invalid(fieldErrors!);

  const { files, error: fileError } = readCharts(formData);
  if (fileError) return { status: "error", message: fileError };

  const user = await currentUser();
  if (!user) return SIGNED_OUT;

  try {
    const supabase = await createClient();
    const { paths: previous, error: readError } = await existingPaths(supabase, id);
    if (readError) return { status: "error", message: readError };

    const limitError = tooMany(previous.length + files.length);
    if (limitError) return { status: "error", message: limitError };

    const { paths, error: uploadError } = await uploadAll(supabase, user, files);
    if (uploadError) return { status: "error", message: uploadError };

    const { error } = await supabase
      .from("journal_entries")
      .update({ ...values, screenshot_paths: [...previous, ...paths] })
      .eq("id", id);

    if (error) {
      await removeFiles(supabase, paths);
      return { status: "error", message: `Could not update the entry: ${error.message}` };
    }

    revalidatePath(JOURNAL_PATH);
    return { status: "success", message: "Entry updated." };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteJournalEntry(id: string): Promise<FormState> {
  if (!id) return { status: "error", message: "Missing entry id." };

  const user = await currentUser();
  if (!user) return SIGNED_OUT;

  try {
    const supabase = await createClient();
    const { paths } = await existingPaths(supabase, id);

    const { error } = await supabase.from("journal_entries").delete().eq("id", id);
    if (error) return { status: "error", message: `Could not delete the entry: ${error.message}` };

    await removeFiles(supabase, paths);
    revalidatePath(JOURNAL_PATH);
    return { status: "success", message: "Entry deleted." };
  } catch (error) {
    return failure(error);
  }
}

/** Attach charts straight from a saved row's picker, without opening an edit. */
export async function addJournalCharts(formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { status: "error", message: "Missing entry id." };

  const { files, error: fileError } = readCharts(formData);
  if (fileError) return { status: "error", message: fileError };
  if (files.length === 0) return { status: "error", message: "No image was selected." };

  const user = await currentUser();
  if (!user) return SIGNED_OUT;

  try {
    const supabase = await createClient();
    const { paths: previous, error: readError } = await existingPaths(supabase, id);
    if (readError) return { status: "error", message: readError };

    const limitError = tooMany(previous.length + files.length);
    if (limitError) return { status: "error", message: limitError };

    const { paths, error: uploadError } = await uploadAll(supabase, user, files);
    if (uploadError) return { status: "error", message: uploadError };

    const { error } = await supabase
      .from("journal_entries")
      .update({ screenshot_paths: [...previous, ...paths] })
      .eq("id", id);

    if (error) {
      await removeFiles(supabase, paths);
      return { status: "error", message: `Could not attach charts: ${error.message}` };
    }

    revalidatePath(JOURNAL_PATH);
    return { status: "success", message: "Charts attached." };
  } catch (error) {
    return failure(error);
  }
}

export async function removeJournalChart(id: string, path: string): Promise<FormState> {
  if (!id || !path) return { status: "error", message: "Missing chart." };

  const user = await currentUser();
  if (!user) return SIGNED_OUT;

  try {
    const supabase = await createClient();
    const { paths: previous, error: readError } = await existingPaths(supabase, id);
    if (readError) return { status: "error", message: readError };
    if (!previous.includes(path)) {
      return { status: "error", message: "That chart is not on this entry." };
    }

    const { error } = await supabase
      .from("journal_entries")
      .update({ screenshot_paths: previous.filter((entry) => entry !== path) })
      .eq("id", id);
    if (error) return { status: "error", message: `Could not remove chart: ${error.message}` };

    await removeFiles(supabase, [path]);
    revalidatePath(JOURNAL_PATH);
    return { status: "success", message: "Chart removed." };
  } catch (error) {
    return failure(error);
  }
}
