"use server";

import { revalidatePath } from "next/cache";

import { currentUser, type SessionUser } from "@/lib/auth";
import type { FormState } from "@/lib/form-state";
import { createClient } from "@/lib/supabase/server";
import { SCREENSHOT_BUCKET } from "@/lib/supabase/config";
import { MAX_SHEET_VERSIONS, FIRST_VERSION } from "@/lib/stats";
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

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/avif"];

type ParsedTrade = {
  trade_date: string;
  /** Which sheet of the month the row lands on. */
  version: number;
  bias: Bias;
  direction: Direction;
  /** Free text — the journal records it, nothing computes on it. */
  ratio: string;
  result: TradeResult;
  remarks: string | null;
};

function parseTrade(formData: FormData): {
  values?: ParsedTrade;
  fieldErrors?: Record<string, string>;
} {
  const fieldErrors: Record<string, string> = {};

  const tradeDate = String(formData.get("trade_date") ?? "").trim();
  const version = Number(formData.get("version") ?? FIRST_VERSION);
  const bias = String(formData.get("bias") ?? "");
  const direction = String(formData.get("direction") ?? "");
  const result = String(formData.get("result") ?? "");
  const ratio = String(formData.get("ratio") ?? "").trim();
  const remarks = String(formData.get("remarks") ?? "").trim();

  if (!isValidDate(tradeDate)) {
    fieldErrors.trade_date = "Pick a date.";
  } else if (!isWeekday(tradeDate)) {
    fieldErrors.trade_date = "Forex week runs Monday to Friday.";
  }

  if (!BIASES.includes(bias as Bias)) fieldErrors.bias = "Choose a bias.";
  if (!DIRECTIONS.includes(direction as Direction)) {
    fieldErrors.direction = "Choose a direction.";
  }
  if (!RESULTS.includes(result as TradeResult)) {
    fieldErrors.result = "Choose a result.";
  }

  if (!Number.isInteger(version) || version < FIRST_VERSION || version > MAX_SHEET_VERSIONS) {
    fieldErrors.version = "Pick a sheet.";
  }

  if (ratio === "") {
    fieldErrors.ratio = "Enter the ratio.";
  } else if (ratio.length > MAX_RATIO_LENGTH) {
    fieldErrors.ratio = `Keep the ratio under ${MAX_RATIO_LENGTH} characters.`;
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  return {
    values: {
      trade_date: tradeDate,
      version,
      bias: bias as Bias,
      direction: direction as Direction,
      ratio,
      result: result as TradeResult,
      remarks: remarks === "" ? null : remarks,
    },
  };
}

function readScreenshot(formData: FormData): {
  file?: File;
  error?: string;
} {
  const entry = formData.get("screenshot");
  if (!(entry instanceof File) || entry.size === 0) return {};

  if (!ALLOWED_TYPES.includes(entry.type)) {
    return { error: "Screenshot must be a PNG, JPEG, WebP or AVIF image." };
  }
  if (entry.size > MAX_SCREENSHOT_BYTES) {
    return { error: "Screenshot must be 5 MB or smaller." };
  }
  return { file: entry };
}

function extensionFor(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  return file.type.split("/")[1] ?? "png";
}

/**
 * Objects live under `<user_id>/<uuid>.<ext>`. The first segment is what the
 * storage policies read the owner off, so the folder is not decoration — put a
 * file anywhere else and the upload is rejected.
 */
function screenshotPathFor(user: SessionUser, file: File): string {
  return `${user.id}/${crypto.randomUUID()}.${extensionFor(file)}`;
}

/**
 * What every action answers with when nobody is signed in.
 *
 * The proxy turns signed-out visitors away at the door, but a Server Action is
 * a POST to whatever route used it — one matcher edit and it is no longer
 * covered. So each action checks for itself rather than trusting the door.
 */
const SIGNED_OUT: FormState = {
  status: "error",
  message: "Your session has expired. Sign in again.",
};

/**
 * The sheet limit is a database trigger, so its message arrives already written
 * for a person. Anything else gets the usual prefix.
 */
function saveError(prefix: string, message: string): FormState {
  return {
    status: "error",
    message: message.startsWith("Sheet v") ? message : `${prefix}: ${message}`,
  };
}

export async function createTrade(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { values, fieldErrors } = parseTrade(formData);
  if (!values) {
    return { status: "error", message: "Check the highlighted fields.", fieldErrors };
  }

  const { file, error: fileError } = readScreenshot(formData);
  if (fileError) {
    return { status: "error", message: fileError, fieldErrors: { screenshot: fileError } };
  }

  // The DB enforces this too; catching it here gives a better message.
  if (file && values.result !== "LOSE") {
    return {
      status: "error",
      message: "Screenshots are only kept for losing trades.",
      fieldErrors: { screenshot: "Only losing trades take a screenshot." },
    };
  }

  const user = await currentUser();
  if (!user) return SIGNED_OUT;

  try {
    const supabase = await createClient();
    let screenshotPath: string | null = null;

    if (file) {
      const path = screenshotPathFor(user, file);
      const { error } = await supabase.storage
        .from(SCREENSHOT_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });

      if (error) {
        return { status: "error", message: `Upload failed: ${error.message}` };
      }
      screenshotPath = path;
    }

    // `user_id` is stated rather than left to the column default: the RLS check
    // compares it to auth.uid(), and a row that names its owner is one less
    // thing depending on a default staying in place.
    const { error } = await supabase
      .from("trades")
      .insert({ ...values, user_id: user.id, screenshot_path: screenshotPath });

    if (error) {
      // Don't leave the uploaded file behind if the row never landed.
      if (screenshotPath) {
        await supabase.storage.from(SCREENSHOT_BUCKET).remove([screenshotPath]);
      }
      return saveError("Could not save trade", error.message);
    }

    revalidatePath("/", "layout");
    return { status: "success", message: "Trade logged." };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
}

export async function updateTrade(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { status: "error", message: "Missing trade id." };

  const { values, fieldErrors } = parseTrade(formData);
  if (!values) {
    return { status: "error", message: "Check the highlighted fields.", fieldErrors };
  }

  const { file, error: fileError } = readScreenshot(formData);
  if (fileError) {
    return { status: "error", message: fileError, fieldErrors: { screenshot: fileError } };
  }

  if (file && values.result !== "LOSE") {
    return {
      status: "error",
      message: "Screenshots are only kept for losing trades.",
      fieldErrors: { screenshot: "Only losing trades take a screenshot." },
    };
  }

  const user = await currentUser();
  if (!user) return SIGNED_OUT;

  try {
    const supabase = await createClient();

    const { data: existing, error: readError } = await supabase
      .from("trades")
      .select("screenshot_path")
      .eq("id", id)
      .single();

    if (readError) {
      return { status: "error", message: `Could not load trade: ${readError.message}` };
    }

    const previousPath: string | null = existing?.screenshot_path ?? null;
    let screenshotPath = previousPath;

    if (file) {
      const path = screenshotPathFor(user, file);
      const { error } = await supabase.storage
        .from(SCREENSHOT_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });

      if (error) {
        return { status: "error", message: `Upload failed: ${error.message}` };
      }
      screenshotPath = path;
    }

    // A trade that is no longer a loss must not keep a screenshot — the DB
    // constraint would reject the row anyway.
    if (values.result !== "LOSE") screenshotPath = null;

    const { error } = await supabase
      .from("trades")
      .update({ ...values, screenshot_path: screenshotPath })
      .eq("id", id);

    if (error) {
      if (file && screenshotPath && screenshotPath !== previousPath) {
        await supabase.storage.from(SCREENSHOT_BUCKET).remove([screenshotPath]);
      }
      return saveError("Could not update trade", error.message);
    }

    // Only now is the old file genuinely orphaned.
    if (previousPath && previousPath !== screenshotPath) {
      await supabase.storage.from(SCREENSHOT_BUCKET).remove([previousPath]);
    }

    revalidatePath("/", "layout");
    return { status: "success", message: "Trade updated." };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
}

export async function deleteTrade(id: string): Promise<FormState> {
  if (!id) return { status: "error", message: "Missing trade id." };

  const user = await currentUser();
  if (!user) return SIGNED_OUT;

  try {
    const supabase = await createClient();

    const { data: existing } = await supabase
      .from("trades")
      .select("screenshot_path")
      .eq("id", id)
      .single();

    const { error } = await supabase.from("trades").delete().eq("id", id);
    if (error) {
      return { status: "error", message: `Could not delete trade: ${error.message}` };
    }

    if (existing?.screenshot_path) {
      await supabase.storage
        .from(SCREENSHOT_BUCKET)
        .remove([existing.screenshot_path]);
    }

    revalidatePath("/", "layout");
    return { status: "success", message: "Trade deleted." };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
}

/**
 * Attach (or replace) the chart for a losing trade.
 *
 * Split out from `updateTrade` because the journal uploads straight from the
 * row's file input — there is no form around it to carry the other fields.
 */
export async function setScreenshot(formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { status: "error", message: "Missing trade id." };

  const { file, error: fileError } = readScreenshot(formData);
  if (fileError) return { status: "error", message: fileError };
  if (!file) return { status: "error", message: "No image was selected." };

  const user = await currentUser();
  if (!user) return SIGNED_OUT;

  try {
    const supabase = await createClient();

    const { data: existing, error: readError } = await supabase
      .from("trades")
      .select("result, screenshot_path")
      .eq("id", id)
      .single();

    if (readError) {
      return { status: "error", message: `Could not load trade: ${readError.message}` };
    }
    if (existing?.result !== "LOSE") {
      return { status: "error", message: "Charts are only kept for losing trades." };
    }

    const path = screenshotPathFor(user, file);
    const { error: uploadError } = await supabase.storage
      .from(SCREENSHOT_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });

    if (uploadError) {
      return { status: "error", message: `Upload failed: ${uploadError.message}` };
    }

    const { error } = await supabase
      .from("trades")
      .update({ screenshot_path: path })
      .eq("id", id);

    if (error) {
      await supabase.storage.from(SCREENSHOT_BUCKET).remove([path]);
      return { status: "error", message: `Could not attach chart: ${error.message}` };
    }

    // Only now is the previous file genuinely orphaned.
    const previousPath: string | null = existing?.screenshot_path ?? null;
    if (previousPath && previousPath !== path) {
      await supabase.storage.from(SCREENSHOT_BUCKET).remove([previousPath]);
    }

    revalidatePath("/", "layout");
    return { status: "success", message: "Chart attached." };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
}
