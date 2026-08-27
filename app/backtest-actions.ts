"use server";

import { revalidatePath } from "next/cache";

import { currentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_SET_NAME,
  SYMBOL,
  parseDrawings,
  styleFrom,
  type DrawingSet,
} from "@/lib/backtest/sets";
import {
  DATA_FIRST_DAY,
  DATA_LAST_DAY,
  DEFAULT_BALANCE,
  type BacktestSession,
} from "@/lib/backtest/sessions";
import type { Timeframe } from "@/lib/backtest/candles";
import type { Drawing, ToolKind } from "@/lib/backtest/drawings";

const BACKTEST_PATH = "/backtest";

export type SetsResult = { ok: true; sets: DrawingSet[] } | { ok: false; error: string };

/** Every set the signed-in user has saved for EURUSD, newest first. */
export async function loadSets(): Promise<SetsResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Sign in to use saved drawing sets." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("backtest_drawing_sets")
    .select("id, name, timeframe, drawings, updated_at, kind")
    .eq("symbol", SYMBOL)
    .order("updated_at", { ascending: false });

  if (error) return { ok: false, error: describe(error.message) };

  return {
    ok: true,
    sets: (data ?? []).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      timeframe: row.timeframe as Timeframe,
      drawings: parseDrawings(row.drawings),
      updatedAt: row.updated_at as string,
      // '' is how a shape set is stored; the UI thinks in terms of null.
      kind: (row.kind as string) === "" ? null : ((row.kind as DrawingSet["kind"]) ?? null),
    })),
  };
}

/**
 * Saves the drawings currently on the chart under `name`.
 *
 * Upsert rather than insert: the unique constraint means saving "Daily S/R" a
 * second time is an edit of the set you already have, which is what "save"
 * means to someone who just moved a level.
 */
export async function saveSet(
  name: string,
  timeframe: Timeframe,
  drawings: Drawing[],
): Promise<SetsResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Sign in to use saved drawing sets." };

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Give the set a name." };
  if (trimmed.length > MAX_SET_NAME) {
    return { ok: false, error: `Keep the name under ${MAX_SET_NAME} characters.` };
  }
  if (drawings.length === 0) {
    return { ok: false, error: "Draw something on the chart before saving a set." };
  }

  // Strip the set link before writing: it records which set a drawing came
  // from, and storing it would pin these shapes to whichever set was last
  // applied rather than the one being saved now.
  const payload = drawings.map((drawing) => {
    const copy: Drawing = { ...drawing };
    delete copy.setId;
    return copy;
  });

  const supabase = await createClient();
  const { error } = await supabase
    .from("backtest_drawing_sets")
    .upsert(
      { user_id: user.id, symbol: SYMBOL, name: trimmed, timeframe, drawings: payload, kind: "" },
      { onConflict: "user_id,symbol,kind,name" },
    );

  if (error) return { ok: false, error: describe(error.message) };

  revalidatePath(BACKTEST_PATH);
  return loadSets();
}

/**
 * Remembers how one tool should look, under a name.
 *
 * Stored as a one-element drawing array so it can share the sets table; only
 * the styling fields survive, because where the shape happened to sit is not
 * part of what is being saved.
 */
export async function saveStyle(
  kind: ToolKind,
  name: string,
  drawing: Drawing,
): Promise<SetsResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Sign in to save drawing styles." };

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Give the style a name." };
  if (trimmed.length > MAX_SET_NAME) {
    return { ok: false, error: `Keep the name under ${MAX_SET_NAME} characters.` };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("backtest_drawing_sets").upsert(
    {
      user_id: user.id,
      symbol: SYMBOL,
      name: trimmed,
      timeframe: "4h",
      kind,
      // One placeholder anchor, not an empty array: `parseDrawings` rejects a
      // drawing with no points, so an empty one was silently dropped on the way
      // back out and every saved style came back as nothing at all.
      drawings: [{ ...styleFrom(drawing), id: "preset", kind, points: [{ time: 0, price: 0 }] }],
    },
    { onConflict: "user_id,symbol,kind,name" },
  );

  if (error) return { ok: false, error: describe(error.message) };

  revalidatePath(BACKTEST_PATH);
  return loadSets();
}

export async function deleteSet(id: string): Promise<SetsResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Sign in to use saved drawing sets." };

  const supabase = await createClient();
  const { error } = await supabase.from("backtest_drawing_sets").delete().eq("id", id);

  if (error) return { ok: false, error: describe(error.message) };

  revalidatePath(BACKTEST_PATH);
  return loadSets();
}

/**
 * Turns Postgres' own wording into something actionable.
 *
 * The 404 case is worth naming explicitly: it is what a missing migration looks
 * like from the browser, and "relation does not exist" sends people hunting in
 * the wrong place.
 */
function describe(message: string): string {
  if (/does not exist|schema cache/i.test(message)) {
    return "A backtest table is missing — run the migrations in supabase/migrations/.";
  }
  if (/duplicate key/i.test(message)) {
    return "A set with that name already exists.";
  }
  return message;
}


/* ---------------------------------------------------------------------------
   Sessions
   --------------------------------------------------------------------------- */

export type SessionsResult =
  | { ok: true; sessions: BacktestSession[] }
  | { ok: false; error: string };

export type SessionResult = { ok: true; session: BacktestSession } | { ok: false; error: string };

const SESSION_COLUMNS =
  "id, symbol, start_time, cursor_time, timeframe, step_seconds, balance, drawings, updated_at";

type SessionRow = {
  id: string;
  symbol: string;
  start_time: string;
  cursor_time: string;
  timeframe: string;
  step_seconds: number;
  balance: number | string;
  drawings: unknown;
  updated_at: string;
};

function toSession(row: SessionRow): BacktestSession {
  return {
    id: row.id,
    symbol: row.symbol,
    startTime: Math.floor(new Date(row.start_time).getTime() / 1000),
    cursorTime: Math.floor(new Date(row.cursor_time).getTime() / 1000),
    timeframe: row.timeframe as BacktestSession["timeframe"],
    stepSeconds: row.step_seconds,
    balance: Number(row.balance),
    drawings: parseDrawings(row.drawings),
    updatedAt: row.updated_at,
  };
}

export async function listSessions(): Promise<SessionsResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Sign in to use backtest sessions." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("backtest_sessions")
    .select(SESSION_COLUMNS)
    .order("updated_at", { ascending: false });

  if (error) return { ok: false, error: describe(error.message) };
  return { ok: true, sessions: (data ?? []).map((row) => toSession(row as SessionRow)) };
}

export async function loadSession(id: string): Promise<SessionResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Sign in to use backtest sessions." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("backtest_sessions")
    .select(SESSION_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) return { ok: false, error: describe(error.message) };
  if (!data) return { ok: false, error: "That session no longer exists." };
  return { ok: true, session: toSession(data as SessionRow) };
}

/**
 * Starts a session on `startDay` (YYYY-MM-DD).
 *
 * A date is the only thing worth asking for: the cursor begins there, so the
 * chart shows history up to it and nothing after — everything past the cursor
 * is what you are about to trade blind.
 *
 * `balance` is seeded from the default rather than asked for. Nothing trades
 * against it yet, and a number you cannot spend is a question not worth asking.
 */
export async function createSession(startDay: string): Promise<SessionResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Sign in to use backtest sessions." };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDay)) {
    return { ok: false, error: "Pick a start date." };
  }
  if (startDay < DATA_FIRST_DAY || startDay > DATA_LAST_DAY) {
    return {
      ok: false,
      error: `Pick a date between ${DATA_FIRST_DAY} and ${DATA_LAST_DAY} — that is the range the candles cover.`,
    };
  }
  const startedAt = new Date(`${startDay}T00:00:00Z`).toISOString();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("backtest_sessions")
    .insert({
      user_id: user.id,
      symbol: SYMBOL,
      start_time: startedAt,
      cursor_time: startedAt,
      timeframe: "4h",
      step_seconds: 3600,
      balance: DEFAULT_BALANCE,
    })
    .select(SESSION_COLUMNS)
    .single();

  if (error) return { ok: false, error: describe(error.message) };

  revalidatePath(BACKTEST_PATH);
  return { ok: true, session: toSession(data as SessionRow) };
}

/**
 * Writes back where the replay has reached.
 *
 * Called as the cursor moves, so it is deliberately small and forgiving: a
 * failed save loses a little progress, never the session.
 */
export async function saveSessionProgress(
  id: string,
  progress: {
    cursorTime: number;
    timeframe: string;
    stepSeconds: number;
    drawings: Drawing[];
  },
): Promise<{ ok: boolean; error?: string }> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Sign in to use backtest sessions." };

  const payload = progress.drawings.map((drawing) => {
    const copy: Drawing = { ...drawing };
    delete copy.setId;
    return copy;
  });

  const supabase = await createClient();
  const { error } = await supabase
    .from("backtest_sessions")
    .update({
      cursor_time: new Date(progress.cursorTime * 1000).toISOString(),
      timeframe: progress.timeframe,
      step_seconds: progress.stepSeconds,
      drawings: payload,
    })
    .eq("id", id);

  if (error) return { ok: false, error: describe(error.message) };
  return { ok: true };
}

export async function deleteSession(id: string): Promise<SessionsResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Sign in to use backtest sessions." };

  const supabase = await createClient();
  const { error } = await supabase.from("backtest_sessions").delete().eq("id", id);
  if (error) return { ok: false, error: describe(error.message) };

  revalidatePath(BACKTEST_PATH);
  return listSessions();
}
