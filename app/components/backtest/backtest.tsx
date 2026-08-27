"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { saveSessionProgress, type SetsResult } from "@/app/backtest-actions";
import {
  TIMEFRAMES,
  TIMEFRAME_SECONDS,
  aggregate,
  decodeCandles,
  sliceAt,
  type Candle,
  type Series,
  type Timeframe,
} from "@/lib/backtest/candles";
import { newId, type Drawing, type ToolKind } from "@/lib/backtest/drawings";
import { styleFrom, type DrawingSet, type StylePreset } from "@/lib/backtest/sets";
import type { BacktestSession } from "@/lib/backtest/sessions";
import { DARK_THEME, loadTheme, saveTheme, type ChartTheme } from "@/lib/backtest/chart-theme";
import { ChartSettings } from "./chart-settings";
import { StylePalette } from "./style-palette";
import { Chart } from "./chart";
import { ReplayBar, type Speed } from "./replay-bar";
import { DrawingToolbar } from "./drawing-toolbar";
import { StyleEditor } from "./style-editor";
import { ToolRail } from "./tool-rail";

/**
 * Folded series, remembered per base array.
 *
 * Folding 117k candles is quick but not free, and the timeframe buttons would
 * pay for it on every click otherwise. A module-level WeakMap rather than a ref
 * because this is a pure function of the data, not part of any render: when the
 * candles are replaced the cache for the old array becomes collectable on its own.
 */
const folds = new WeakMap<Candle[], Map<Timeframe, Series>>();

function foldCached(base: Candle[], timeframe: Timeframe): Series {
  let perTimeframe = folds.get(base);
  if (!perTimeframe) {
    perTimeframe = new Map<Timeframe, Series>();
    folds.set(base, perTimeframe);
  }
  const hit = perTimeframe.get(timeframe);
  if (hit) return hit;

  const built = aggregate(base, timeframe);
  perTimeframe.set(timeframe, built);
  return built;
}

/** First index at or after `time`. */
function indexAtTime(base: Candle[], time: number): number {
  let low = 0;
  let high = base.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (base[mid].time < time) low = mid + 1;
    else high = mid;
  }
  return low;
}

const DATA_URL = "/data/eurusd_m5.bin";
const SAVE_DEBOUNCE_MS = 900;

export function Backtest({ session, sets: initialSets }: { session: BacktestSession; sets: SetsResult }) {
  const router = useRouter();
  const [base, setBase] = useState<Candle[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>(session.timeframe);

  const [drawings, setDrawings] = useState<Drawing[]>(session.drawings);
  const [activeTool, setActiveTool] = useState<ToolKind | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [sets, setSets] = useState<DrawingSet[]>(initialSets.ok ? initialSets.sets : []);
  const [setsError, setSetsError] = useState<string | null>(
    initialSets.ok ? null : initialSets.error,
  );

  /**
   * Chart appearance, read from storage on the first client render.
   *
   * The server has no localStorage, so it falls back to the dark palette. That
   * cannot cause a hydration mismatch: the theme only ever reaches the chart
   * through `applyOptions` inside an effect, never into rendered markup.
   */
  const [theme, setTheme] = useState<ChartTheme>(() =>
    typeof window === "undefined"
      ? DARK_THEME
      : loadTheme(document.documentElement.classList.contains("dark")),
  );
  const [themeOpen, setThemeOpen] = useState(false);

  /** Per-tool styling chosen from the rail, applied to the next shape drawn. */
  const [presets, setPresets] = useState<Partial<Record<ToolKind, StylePreset>>>({});

  /** Position in the 5-minute array. Null until the candles are in. */
  const [cursor, setCursor] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [stepSeconds, setStepSeconds] = useState(session.stepSeconds);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");

  useEffect(() => {
    let cancelled = false;

    fetch(DATA_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        return response.arrayBuffer();
      })
      .then((buffer) => {
        if (cancelled) return;
        const candles = decodeCandles(buffer);
        setBase(candles);
        // Open exactly where the session left off — that is the whole point of
        // saving the cursor.
        setCursor(indexAtTime(candles, session.cursorTime));
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setLoadError(
          cause instanceof Error
            ? `Could not load candles (${cause.message}). Run: node scripts/ingest-eurusd.mjs`
            : "Could not load candles.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [session.cursorTime]);

  const series = useMemo(() => (base ? foldCached(base, timeframe) : null), [base, timeframe]);

  /** 5-minute bars covered by one replay step. At least one, always. */
  const stride = Math.max(1, Math.round(stepSeconds / TIMEFRAME_SECONDS["5m"]));

  const candles = useMemo(() => {
    if (!series || !base || cursor === null) return [];
    return sliceAt(series, base, cursor);
  }, [series, base, cursor]);

  const moveCursor = useCallback(
    (next: number) => {
      if (!base) return;
      const clamped = Math.max(0, Math.min(next, base.length - 1));
      setCursor(clamped);
      if (clamped >= base.length - 1) setPlaying(false);
    },
    [base],
  );

  useEffect(() => {
    if (!playing || !base) return;

    const id = window.setInterval(() => {
      setCursor((previous) => {
        if (previous === null) return previous;
        const next = previous + stride;
        if (next >= base.length - 1) {
          setPlaying(false);
          return base.length - 1;
        }
        return next;
      });
    }, 1000 / speed);

    return () => window.clearInterval(id);
  }, [playing, speed, stride, base]);

  // ---- saving progress ----------------------------------------------------
  /**
   * The session is only worth having if it remembers where it got to, so the
   * cursor, timeframe, step and markup are written back shortly after they
   * settle. Debounced because playing moves the cursor many times a second.
   */
  const latestProgress = useRef({ cursor, timeframe, stepSeconds, drawings, base });
  useEffect(() => {
    latestProgress.current = { cursor, timeframe, stepSeconds, drawings, base };
  });

  const flush = useCallback(async () => {
    const { cursor: at, timeframe: tf, stepSeconds: step, drawings: marks, base: candles } =
      latestProgress.current;
    if (at === null || !candles) return;

    setSaveState("saving");
    const result = await saveSessionProgress(session.id, {
      cursorTime: candles[at].time,
      timeframe: tf,
      stepSeconds: step,
      drawings: marks,
    });
    setSaveState(result.ok ? "idle" : "error");
  }, [session.id]);

  useEffect(() => {
    if (cursor === null) return;
    const id = window.setTimeout(flush, SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [cursor, timeframe, stepSeconds, drawings, flush]);

  // A tab closed mid-replay should not lose the last few steps.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [flush]);

  // Space and the arrow keys are what a replay is actually driven with.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (cursor === null) return;

      if (event.code === "Space") {
        event.preventDefault();
        setPlaying((value) => !value);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setPlaying(false);
        moveCursor(cursor + stride);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setPlaying(false);
        moveCursor(cursor - stride);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cursor, stride, moveCursor]);

  // One table holds both; `kind` is what tells a saved look from a saved shape.
  const shapeSets = useMemo(() => sets.filter((set) => set.kind === null), [sets]);
  const styleSets = useMemo(() => sets.filter((set) => set.kind !== null), [sets]);

  const editing = drawings.find((drawing) => drawing.id === editingId) ?? null;
  const selected = drawings.find((drawing) => drawing.id === selectedId) ?? null;
  const startIndex = base ? indexAtTime(base, session.startTime) : 0;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white dark:bg-gray-dark">
      <header className="flex shrink-0 items-center gap-2 border-b border-gray-200 px-3 py-2 dark:border-gray-800">
        <Link
          href="/backtest"
          title="Back to sessions"
          aria-label="Back to sessions"
          onClick={(event) => {
            // The only way out now that the transport has no Exit, so it is also
            // the last chance to write the position the debounce has not yet saved.
            event.preventDefault();
            void flush().then(() => router.push("/backtest"));
          }}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </Link>

        <span className="text-theme-sm font-semibold text-gray-900 dark:text-white">
          {session.symbol}
        </span>
        <div className="ml-2 flex items-center gap-0.5">
          {TIMEFRAMES.map((tf) => {
            const on = tf === timeframe;
            return (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                title={`Switch to ${tf}`}
                className={`rounded-md px-2 py-1 text-theme-xs font-medium transition-colors ${
                  on
                    ? "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
                }`}
              >
                {tf}
              </button>
            );
          })}
        </div>

        {base && cursor !== null ? (
          <div className="ml-3 flex items-center gap-1 border-l border-gray-200 pl-3 dark:border-gray-800">
            <ReplayBar
              playing={playing}
              speed={speed}
              stepSeconds={stepSeconds}
              atStart={cursor <= startIndex}
              atEnd={cursor >= base.length - 1}
              onPlay={() => setPlaying((value) => !value)}
              onStep={(direction) => {
                setPlaying(false);
                moveCursor(cursor + direction * stride);
              }}
              onSpeed={setSpeed}
              onStepSeconds={setStepSeconds}
            />
          </div>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          {/* Saving is silent. Only a failure is worth a word, because that is
              the only case where the session is not what the chart shows. */}
          {saveState === "error" ? (
            <span className="text-theme-xs text-error-500" title="Progress could not be saved">
              Not saved
            </span>
          ) : null}
        </div>
      </header>

      {setsError ? (
        <p className="shrink-0 border-b border-error-100 bg-error-50 px-3 py-1.5 text-theme-xs text-error-600 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-400">
          {setsError}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <ToolRail
          active={activeTool}
          onPick={setActiveTool}
          onChartSettings={() => setThemeOpen((open) => !open)}
          onClear={() => {
            setDrawings([]);
            setSelectedId(null);
            setEditingId(null);
          }}
          canClear={drawings.length > 0}
        />

        <div className="relative min-w-0 flex-1">
          {loadError ? (
            <Notice tone="error">{loadError}</Notice>
          ) : !base || cursor === null ? (
            <Notice tone="muted">Loading EURUSD candles…</Notice>
          ) : (
            <Chart
              candles={candles}
              timeframe={timeframe}
              activeTool={activeTool}
              onToolUsed={() => setActiveTool(null)}
              drawings={drawings}
              onDrawingsChange={setDrawings}
              selectedId={selectedId}
              onSelect={setSelectedId}
              presets={presets}
              theme={theme}
              onEdit={setEditingId}
            />
          )}

          {selected && !editing ? (
            <DrawingToolbar
              drawing={selected}
              sets={shapeSets}
              timeframe={timeframe}
              allDrawings={drawings}
              onSettings={() => setEditingId(selected.id)}
              onDelete={() => {
                setDrawings((current) => current.filter((d) => d.id !== selected.id));
                setSelectedId(null);
              }}
              onSets={(result) => {
                if (result.ok) {
                  setSets(result.sets);
                  setSetsError(null);
                } else setSetsError(result.error);
              }}
              onApplySet={(set) =>
                setDrawings((current) => [
                  ...current,
                  ...set.drawings.map((d) => ({ ...d, id: newId(), setId: set.id })),
                ])
              }
            />
          ) : null}

          {/* Saved looks for whichever tool is armed — floating, so it can be
              moved off wherever the next mark is going. */}
          {activeTool && styleSets.some((set) => set.kind === activeTool) ? (
            <StylePalette
              key={activeTool}
              styles={styleSets.filter((set) => set.kind === activeTool)}
              onPick={(set) => {
                const style = set.drawings[0];
                if (style && set.kind) {
                  setPresets((current) => ({ ...current, [set.kind!]: styleFrom(style) }));
                }
              }}
              onStyles={(result) => {
                if (result.ok) {
                  setSets(result.sets);
                  setSetsError(null);
                } else setSetsError(result.error);
              }}
            />
          ) : null}

          {themeOpen ? (
            <ChartSettings
              theme={theme}
              onChange={(next) => {
                setTheme(next);
                saveTheme(next);
              }}
              onClose={() => setThemeOpen(false)}
            />
          ) : null}

          {editing ? (
            <StyleEditor
              drawing={editing}
              onChange={(next) =>
                setDrawings((current) => current.map((d) => (d.id === next.id ? next : d)))
              }
              onDelete={() => {
                setDrawings((current) => current.filter((d) => d.id !== editing.id));
                setEditingId(null);
                setSelectedId(null);
              }}
              onClose={() => setEditingId(null)}
            />
          ) : null}

        </div>
      </div>
    </div>
  );
}

function Notice({ tone, children }: { tone: "error" | "muted"; children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center">
      <p
        className={`text-theme-sm ${
          tone === "error" ? "text-error-600 dark:text-error-400" : "text-gray-400"
        }`}
      >
        {children}
      </p>
    </div>
  );
}
