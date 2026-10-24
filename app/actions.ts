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
  MAX_SCREENSHOTS_PER_TRADE,
  RESULTS,
  SETUPS,
  isValidDate,
  isWeekday,
  sortSetups,
  type Bias,
  type Direction,
  type Setup,
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
  setups: Setup[];
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
  const setups = formData.getAll("setups").map(String);

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

  if (setups.some((setup) => !SETUPS.includes(setup as Setup))) {
    fieldErrors.setups = "Pick setups from the list.";
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
      setups: sortSetups(setups),
      remarks: remarks === "" ? null : remarks,
    },
  };
}

/** Every image under `screenshot`, checked one by one. Empty slots are skipped. */
function readScreenshots(formData: FormData): {
  files: File[];
  error?: string;
} {
  const files = formData
    .getAll("screenshot")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  for (const file of files) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return { files: [], error: "Screenshots must be PNG, JPEG, WebP or AVIF images." };
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      return { files: [], error: `${file.name} is over 5 MB.` };
    }
  }
  return { files };
}

function tooMany(count: number): string | null {
  return count > MAX_SCREENSHOTS_PER_TRADE
    ? `A trade holds at most ${MAX_SCREENSHOTS_PER_TRADE} charts.`
    : null;
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

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Upload every file or none of them: if one fails, the ones already up are
 * removed again so a half-attached set never outlives the error.
 */
async function uploadAll(
  supabase: Supabase,
  user: SessionUser,
  files: File[],
): Promise<{ paths: string[]; error?: string }> {
  const paths: string[] = [];
  for (const file of files) {
    const path = screenshotPathFor(user, file);
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

  const { files, error: fileError } = readScreenshots(formData);
  const limitError = fileError ?? tooMany(files.length);
  if (limitError) {
    return { status: "error", message: limitError, fieldErrors: { screenshot: limitError } };
  }

  const user = await currentUser();
  if (!user) return SIGNED_OUT;

  try {
    const supabase = await createClient();

    const { paths, error: uploadError } = await uploadAll(supabase, user, files);
    if (uploadError) return { status: "error", message: uploadError };

    // `user_id` is stated rather than left to the column default: the RLS check
    // compares it to auth.uid(), and a row that names its owner is one less
    // thing depending on a default staying in place.
    const { error } = await supabase
      .from("trades")
      .insert({ ...values, user_id: user.id, screenshot_paths: paths });

    if (error) {
      // Don't leave the uploaded files behind if the row never landed.
      await removeFiles(supabase, paths);
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

  const { files, error: fileError } = readScreenshots(formData);
  if (fileError) {
    return { status: "error", message: fileError, fieldErrors: { screenshot: fileError } };
  }

  const user = await currentUser();
  if (!user) return SIGNED_OUT;

  try {
    const supabase = await createClient();

    const { data: existing, error: readError } = await supabase
      .from("trades")
      .select("screenshot_paths")
      .eq("id", id)
      .single();

    if (readError) {
      return { status: "error", message: `Could not load trade: ${readError.message}` };
    }

    // New charts join the ones already there rather than replacing them —
    // removing one is its own action, from the thumbnail.
    const previous: string[] = existing?.screenshot_paths ?? [];
    const limitError = tooMany(previous.length + files.length);
    if (limitError) return { status: "error", message: limitError };

    const { paths, error: uploadError } = await uploadAll(supabase, user, files);
    if (uploadError) return { status: "error", message: uploadError };

    const { error } = await supabase
      .from("trades")
      .update({ ...values, screenshot_paths: [...previous, ...paths] })
      .eq("id", id);

    if (error) {
      await removeFiles(supabase, paths);
      return saveError("Could not update trade", error.message);
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
      .select("screenshot_paths")
      .eq("id", id)
      .single();

    const { error } = await supabase.from("trades").delete().eq("id", id);
    if (error) {
      return { status: "error", message: `Could not delete trade: ${error.message}` };
    }

    await removeFiles(supabase, existing?.screenshot_paths ?? []);

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
 * Attach one or more charts to a saved trade, won or lost.
 *
 * Split out from `updateTrade` because the journal uploads straight from the
 * row's file input — there is no form around it to carry the other fields.
 */
export async function addScreenshots(formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { status: "error", message: "Missing trade id." };

  const { files, error: fileError } = readScreenshots(formData);
  if (fileError) return { status: "error", message: fileError };
  if (files.length === 0) return { status: "error", message: "No image was selected." };

  const user = await currentUser();
  if (!user) return SIGNED_OUT;

  try {
    const supabase = await createClient();

    const { data: existing, error: readError } = await supabase
      .from("trades")
      .select("screenshot_paths")
      .eq("id", id)
      .single();

    if (readError) {
      return { status: "error", message: `Could not load trade: ${readError.message}` };
    }

    const previous: string[] = existing?.screenshot_paths ?? [];
    const limitError = tooMany(previous.length + files.length);
    if (limitError) return { status: "error", message: limitError };

    const { paths, error: uploadError } = await uploadAll(supabase, user, files);
    if (uploadError) return { status: "error", message: uploadError };

    const { error } = await supabase
      .from("trades")
      .update({ screenshot_paths: [...previous, ...paths] })
      .eq("id", id);

    if (error) {
      await removeFiles(supabase, paths);
      return { status: "error", message: `Could not attach charts: ${error.message}` };
    }

    revalidatePath("/", "layout");
    return {
      status: "success",
      message: files.length === 1 ? "Chart attached." : `${files.length} charts attached.`,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
}

/** Take one chart off a trade, and out of storage once the row lets go of it. */
export async function removeScreenshot(id: string, path: string): Promise<FormState> {
  if (!id || !path) return { status: "error", message: "Missing chart." };

  const user = await currentUser();
  if (!user) return SIGNED_OUT;

  try {
    const supabase = await createClient();

    const { data: existing, error: readError } = await supabase
      .from("trades")
      .select("screenshot_paths")
      .eq("id", id)
      .single();

    if (readError) {
      return { status: "error", message: `Could not load trade: ${readError.message}` };
    }

    const previous: string[] = existing?.screenshot_paths ?? [];
    if (!previous.includes(path)) {
      return { status: "error", message: "That chart is not on this trade." };
    }

    const { error } = await supabase
      .from("trades")
      .update({ screenshot_paths: previous.filter((entry) => entry !== path) })
      .eq("id", id);

    if (error) {
      return { status: "error", message: `Could not remove chart: ${error.message}` };
    }

    // Only now is the file genuinely orphaned.
    await removeFiles(supabase, [path]);

    revalidatePath("/", "layout");
    return { status: "success", message: "Chart removed." };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
}
