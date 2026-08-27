"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createSession, deleteSession, type SessionsResult } from "@/app/backtest-actions";
import {
  DATA_FIRST_DAY,
  DATA_LAST_DAY,
  daysBetween,
  shortDate,
  type BacktestSession,
} from "@/lib/backtest/sessions";

/**
 * The sessions you can pick up again.
 *
 * Each card is a run through history that remembers where it got to, so the
 * date on it moves as you replay — that is what you are choosing between.
 */
export function SessionList({ initial }: { initial: SessionsResult }) {
  const router = useRouter();
  const [sessions, setSessions] = useState<BacktestSession[]>(
    initial.ok ? initial.sessions : [],
  );
  const [error, setError] = useState<string | null>(initial.ok ? null : initial.error);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-theme-xl font-semibold text-gray-900 dark:text-white">Sessions</h2>
          <p className="text-theme-xs text-gray-500 dark:text-gray-400">
            Replay EURUSD from a date and pick up where you left off.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="shrink-0 rounded-lg bg-brand-500 px-3.5 py-2 text-theme-sm font-medium text-white transition-colors hover:bg-brand-600"
        >
          New session
        </button>
      </div>

      {error ? (
        <p className="rounded-lg bg-error-50 px-3 py-2 text-theme-xs text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </p>
      ) : null}

      {sessions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-14 text-center dark:border-gray-700">
          <p className="text-theme-sm font-medium text-gray-700 dark:text-gray-200">
            No sessions yet
          </p>
          <p className="mx-auto mt-1 max-w-sm text-theme-xs text-gray-500 dark:text-gray-400">
            Create one, pick the date to start from, and the chart opens there with everything
            after it hidden.
          </p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-4 rounded-lg bg-brand-500 px-3.5 py-2 text-theme-sm font-medium text-white transition-colors hover:bg-brand-600"
          >
            Create a session
          </button>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              onDeleted={(result) => {
                if (result.ok) setSessions(result.sessions);
                else setError(result.error);
              }}
            />
          ))}
        </ul>
      )}

      {creating ? (
        <CreateDialog
          onClose={() => setCreating(false)}
          onCreated={(session) => router.push(`/backtest/session/${session.id}`)}
          onError={setError}
        />
      ) : null}
    </div>
  );
}

function SessionCard({
  session,
  onDeleted,
}: {
  session: BacktestSession;
  onDeleted: (result: SessionsResult) => void;
}) {
  const [pending, startTransition] = useTransition();
  const advanced = daysBetween(session.startTime, session.cursorTime);

  return (
    <li className="group relative rounded-2xl border border-gray-200 bg-white p-4 transition-colors hover:border-gray-300 dark:border-gray-800 dark:bg-gray-dark dark:hover:border-gray-700">
      <Link href={`/backtest/session/${session.id}`} className="flex items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5.5l11 6.5-11 6.5z" />
          </svg>
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-theme-sm font-semibold text-gray-900 dark:text-white">
              {session.symbol}
            </span>
            <span className="rounded-full border border-gray-200 px-2 py-0.5 text-[11px] text-gray-500 dark:border-gray-700 dark:text-gray-400">
              {advanced} day{advanced === 1 ? "" : "s"} in
            </span>
          </div>

          <p className="mt-1.5 text-theme-xs tabular-nums text-gray-600 dark:text-gray-300">
            {shortDate(session.startTime)} → {shortDate(session.cursorTime)}
          </p>
          <p className="mt-0.5 text-theme-xs text-gray-400">
            {session.timeframe}
            {session.drawings.length > 0 ? ` · ${session.drawings.length} drawings` : ""}
          </p>
        </div>
      </Link>

      <button
        type="button"
        disabled={pending}
        aria-label={`Delete the ${session.symbol} session`}
        onClick={() => startTransition(async () => onDeleted(await deleteSession(session.id)))}
        className="absolute right-3 top-3 rounded-md p-1.5 text-gray-300 opacity-0 transition hover:bg-error-50 hover:text-error-600 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-40 dark:text-gray-600 dark:hover:bg-error-500/15 dark:hover:text-error-400"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M5 7h14M10 7V5.5a1 1 0 011-1h2a1 1 0 011 1V7M7 7l.8 11.2a1.5 1.5 0 001.5 1.3h5.4a1.5 1.5 0 001.5-1.3L17 7" />
        </svg>
      </button>
    </li>
  );
}

function CreateDialog({
  onClose,
  onCreated,
  onError,
}: {
  onClose: () => void;
  onCreated: (session: BacktestSession) => void;
  onError: (message: string) => void;
}) {
  // Somewhere with plenty of history behind it and plenty of chart ahead.
  const [day, setDay] = useState("2026-02-02");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setMessage(null);
          startTransition(async () => {
            const result = await createSession(day);
            if (result.ok) onCreated(result.session);
            else {
              setMessage(result.error);
              onError(result.error);
            }
          });
        }}
        className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-800 dark:bg-gray-dark"
      >
        <h3 className="text-theme-sm font-semibold text-gray-900 dark:text-white">New session</h3>
        <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">
          The chart opens on this date at 4h, with everything after it hidden.
        </p>

        <label className="mt-4 block">
          <span className="text-theme-xs font-medium text-gray-600 dark:text-gray-300">
            Start date
          </span>
          <input
            type="date"
            value={day}
            min={DATA_FIRST_DAY}
            max={DATA_LAST_DAY}
            onChange={(event) => setDay(event.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-theme-sm text-gray-900 outline-none focus:border-brand-400 dark:border-gray-800 dark:bg-white/5 dark:text-white"
          />
          <span className="mt-1 block text-theme-xs text-gray-400">
            Candles run {DATA_FIRST_DAY} to {DATA_LAST_DAY}.
          </span>
        </label>

        {message ? (
          <p className="mt-3 rounded-lg bg-error-50 px-2.5 py-2 text-theme-xs text-error-600 dark:bg-error-500/10 dark:text-error-400">
            {message}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-theme-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-brand-500 px-3.5 py-2 text-theme-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
          >
            {pending ? "Creating…" : "Start"}
          </button>
        </div>
      </form>
    </div>
  );
}
