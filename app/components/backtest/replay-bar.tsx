"use client";

import { SelectMenu } from "../select-menu";
import { STEP_CHOICES } from "@/lib/backtest/sessions";
import { SESSION_KEYS, SESSION_LABEL, type SessionKey } from "@/lib/backtest/session-indicator";

/** Bars per second while playing. */
export const SPEEDS = [0.5, 1, 2, 4, 10] as const;
export type Speed = (typeof SPEEDS)[number];

/**
 * The replay transport.
 *
 * The interval here is *how much time one step advances*, which is a separate
 * thing from the chart's timeframe: you can watch a 4h chart while stepping
 * forward in 15-minute increments, and the forming candle grows as you go.
 */
export function ReplayBar({
  playing,
  speed,
  stepSeconds,
  atStart,
  atEnd,
  onPlay,
  onStep,
  onSpeed,
  onStepSeconds,
  onSkipToSession,
  skipTargets,
}: {
  playing: boolean;
  speed: Speed;
  stepSeconds: number;
  atStart: boolean;
  atEnd: boolean;
  onPlay: () => void;
  onStep: (direction: 1 | -1) => void;
  onSpeed: (next: Speed) => void;
  onStepSeconds: (next: number) => void;
  /** Jump the replay to the open of the next session of this kind. */
  onSkipToSession: (key: SessionKey) => void;
  /**
   * When each session next opens, as a short label — or null when the data
   * runs out before it does, which greys that row out rather than offering a
   * jump that would quietly do nothing.
   */
  skipTargets: Record<SessionKey, string | null>;
}) {
  return (
    // Inline in the header beside the timeframes. It used to float over the
    // chart, where it covered the date axis and had to be dragged out of the way.
    <div className="flex items-center gap-0.5">
      <Icon label="Previous step" onClick={() => onStep(-1)} disabled={atStart}>
        <path d="M7 6v12M18 6l-8 6 8 6" />
      </Icon>

      <Icon label={playing ? "Pause" : "Play"} onClick={onPlay} disabled={atEnd && !playing} primary>
        {playing ? <path d="M9 6v12M15 6v12" /> : <path d="M8 5.5l11 6.5-11 6.5z" />}
      </Icon>

      <Icon label="Next step" onClick={() => onStep(1)} disabled={atEnd}>
        <path d="M17 6v12M6 6l8 6-8 6" />
      </Icon>

      <div className="mx-1.5 flex items-center gap-1.5" title={`Playback speed — ${speed}×`}>
        <input
          type="range"
          min={0}
          max={SPEEDS.length - 1}
          step={1}
          value={SPEEDS.indexOf(speed)}
          onChange={(event) => onSpeed(SPEEDS[Number(event.target.value)])}
          aria-label="Playback speed"
          className="h-1 w-20 cursor-pointer appearance-none rounded-full bg-gray-200 accent-brand-500 dark:bg-gray-700"
        />
        <span className="w-7 text-theme-xs tabular-nums text-gray-500 dark:text-gray-400">
          {speed}×
        </span>
      </div>

      <div className="mx-1 h-6 w-px bg-gray-200 dark:bg-gray-800" />

      <span title="Time advanced per step">
        <SelectMenu
          label="Step"
          value={stepSeconds}
          // No per-row hint: it repeated "per step" down every line to say what
          // the button's own tooltip already says once.
          options={STEP_CHOICES.map((choice) => ({
            value: choice.seconds,
            label: choice.label,
          }))}
          onChange={onStepSeconds}
          // Down, not up: the transport sits in the header now, and a menu
          // opening upward went off the top of the window — which read as the
          // dropdown having no options at all.
          placement="down"
          align="right"
          widthClass="w-32"
          compact
        />
      </span>

      <div className="mx-1 h-6 w-px bg-gray-200 dark:bg-gray-800" />

      {/* An action menu, not a value picker: `value` stays null so no row ever
          reads as chosen and the button keeps saying "Skip to". Watching one
          London and wanting the next means skipping two whole sessions, which
          is a long time to hold the step button down. */}
      <span title="Jump to the next session open">
        <SelectMenu<SessionKey | null>
          label="Skip to"
          value={null}
          options={SESSION_KEYS.map((key) => ({
            value: key,
            label: SESSION_LABEL[key],
            // No timestamp: the row names a session, and the date it would
            // land on is not a choice anyone makes. The hint is kept only for
            // the dead case, so a row that cannot move reads as disabled
            // rather than as a click that did nothing.
            hint: skipTargets[key] === null ? "no more data" : undefined,
          }))}
          onChange={(key) => {
            if (key !== null && skipTargets[key] !== null) onSkipToSession(key);
          }}
          placement="down"
          align="right"
          widthClass="w-40"
          compact
        />
      </span>
    </div>
  );
}

function Icon({
  label,
  onClick,
  disabled,
  primary,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-35 ${
        primary
          ? "bg-brand-500 text-white hover:bg-brand-600"
          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
      }`}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill={primary ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    </button>
  );
}
