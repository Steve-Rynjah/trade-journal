"use client";

import { useEffect, useRef, useState } from "react";

import { DISPLAY_OFFSET_MINUTES } from "@/lib/backtest/display-time";
import {
  DEFAULT_SESSION_SETTINGS,
  SESSION_KEYS,
  SESSION_LABEL,
  type LevelConfig,
  type LineStyleName,
  type SessionConfig,
  type SessionKey,
  type SessionSettings,
  type TextSize,
} from "@/lib/backtest/session-indicator";
import { ColourButton, ColourPicker } from "./colour-picker";
import { Grip, useDraggable } from "./use-draggable";

/** Hours are entered on the New York clock; the readout converts to this chart. */
const EST_TO_DISPLAY_MINUTES = DISPLAY_OFFSET_MINUTES + 300;
/** An hour less to add in summer, when New York is on EDT. */
const EDT_TO_DISPLAY_MINUTES = DISPLAY_OFFSET_MINUTES + 240;

const HOURS = Array.from({ length: 24 }, (_, i) => i);
/** The quarter-hours the original offers. Sessions do not start at 07:23. */
const MINUTES = [0, 15, 30, 45];
const STYLES: LineStyleName[] = ["solid", "dashed", "dotted"];
const SIZES: TextSize[] = ["tiny", "small", "normal", "large"];

const pad = (n: number) => String(n).padStart(2, "0");

const clock = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

/** `06:30 – 12:30` — the same window read off this chart's clock. */
function displayWindow(config: SessionConfig, offset: number): string {
  const from = (config.startHour * 60 + config.startMinute + offset + 1440) % 1440;
  const to = (config.endHour * 60 + config.endMinute + offset + 1440) % 1440;
  return `${clock(from)} – ${clock(to)}`;
}

/**
 * The Session Indicator's inputs, split by session rather than in one long list.
 *
 * The original stacks fifty-odd inputs in a single scroll because Pine gives it
 * no choice. Here each session owns a tab, and everything that is not a session
 * — the carried-forward levels and the daily range — shares a fourth.
 */
export function SessionSettingsPanel({
  settings,
  onChange,
  onClose,
}: {
  settings: SessionSettings;
  onChange: (next: SessionSettings) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { gripProps, style: dragStyle } = useDraggable();
  const [open, setOpen] = useState<string | null>(null);
  const [tab, setTab] = useState<SessionKey | "levels">("asian");

  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    function away(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose();
    }
    document.addEventListener("keydown", key);
    const id = window.setTimeout(() => document.addEventListener("mousedown", away), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("keydown", key);
      document.removeEventListener("mousedown", away);
    };
  }, [onClose]);

  const setSession = (key: SessionKey, patch: Partial<SessionConfig>) =>
    onChange({
      ...settings,
      sessions: { ...settings.sessions, [key]: { ...settings.sessions[key], ...patch } },
    });

  return (
    <div
      ref={ref}
      style={dragStyle}
      className="absolute left-14 top-4 z-50 max-h-[80vh] w-[25rem] overflow-y-auto rounded-xl border border-gray-200 bg-white p-4 shadow-2xl dark:border-gray-700 dark:bg-[#1e222d]"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span {...gripProps} className="-ml-1 py-1" title="Drag to move">
            <Grip />
          </span>
          <h2 className="text-theme-sm font-semibold text-gray-900 dark:text-white">
            Session Indicator
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Check
            checked={settings.enabled}
            onChange={(enabled) => onChange({ ...settings, enabled })}
            label="On"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-700 dark:hover:bg-white/5"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>

      <div className="mt-3 flex gap-1 border-b border-gray-100 dark:border-gray-700">
        {([...SESSION_KEYS, "levels"] as const).map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setTab(name)}
            className={`-mb-px border-b-2 px-2.5 py-1.5 text-theme-xs font-medium transition-colors ${
              tab === name
                ? "border-brand-500 text-gray-900 dark:text-white"
                : "border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            {name === "levels" ? "Levels" : SESSION_LABEL[name]}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-3">
        {tab === "levels" ? (
          <Levels settings={settings} onChange={onChange} open={open} setOpen={setOpen} />
        ) : (
          <Session
            config={settings.sessions[tab]}
            onChange={(patch) => setSession(tab, patch)}
            open={open}
            setOpen={setOpen}
            extension={
              tab === "asian"
                ? {
                    hour: settings.extendHour,
                    minute: settings.extendMinute,
                    onChange: (extendHour, extendMinute) =>
                      onChange({ ...settings, extendHour, extendMinute }),
                  }
                : null
            }
          />
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 dark:border-gray-700">
        <button
          type="button"
          onClick={() => onChange(DEFAULT_SESSION_SETTINGS)}
          className="rounded-lg px-2.5 py-1.5 text-theme-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/5"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-brand-500 px-3.5 py-1.5 text-theme-xs font-medium text-white transition-colors hover:bg-brand-600"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function Session({
  config,
  onChange,
  open,
  setOpen,
  extension,
}: {
  config: SessionConfig;
  onChange: (patch: Partial<SessionConfig>) => void;
  open: string | null;
  setOpen: (id: string | null) => void;
  /** Only the Asian range carries its levels forward, so only it gets this. */
  extension: { hour: number; minute: number; onChange: (h: number, m: number) => void } | null;
}) {
  return (
    <>
      <div className="flex items-center gap-4">
        <Check checked={config.show} onChange={(show) => onChange({ show })} label="Show box" />
        <Check
          checked={config.showRange}
          onChange={(showRange) => onChange({ showRange })}
          label="Range pips"
        />
      </div>

      <Row label="Start (NY)">
        <Time
          hour={config.startHour}
          minute={config.startMinute}
          onChange={(startHour, startMinute) => onChange({ startHour, startMinute })}
        />
      </Row>
      <Row label="End (NY)">
        <Time
          hour={config.endHour}
          minute={config.endMinute}
          onChange={(endHour, endMinute) => onChange({ endHour, endMinute })}
        />
      </Row>
      {config.followsDst ? (
        <div className="pl-24 text-theme-xs text-gray-400">
          <p>{displayWindow(config, EDT_TO_DISPLAY_MINUTES)} Mar – Nov</p>
          <p>{displayWindow(config, EST_TO_DISPLAY_MINUTES)} Nov – Mar</p>
        </div>
      ) : (
        <p className="pl-24 text-theme-xs text-gray-400">
          {displayWindow(config, EST_TO_DISPLAY_MINUTES)} all year
        </p>
      )}

      <Check
        checked={config.followsDst}
        onChange={(followsDst) => onChange({ followsDst })}
        label="Follows US daylight saving"
      />

      {extension ? (
        <Row label="Extend to">
          <Time
            hour={extension.hour}
            minute={extension.minute}
            onChange={extension.onChange}
          />
        </Row>
      ) : null}

      <div className="border-t border-gray-100 pt-3 dark:border-gray-700">
        <Row label="Box">
          <Swatch id="border" open={open} setOpen={setOpen} value={config.border}
            onChange={(border) => onChange({ border })} />
          <Num value={config.boxWidth} max={10} onChange={(boxWidth) => onChange({ boxWidth })} />
          <Style value={config.boxStyle} onChange={(boxStyle) => onChange({ boxStyle })} />
        </Row>

        <Row label="High / low">
          <Num value={config.lineWidth} max={20} onChange={(lineWidth) => onChange({ lineWidth })} />
          <Style value={config.lineStyle} onChange={(lineStyle) => onChange({ lineStyle })} />
        </Row>

        <Row label="Mid">
          <Swatch id="mid" open={open} setOpen={setOpen} value={config.midColor}
            onChange={(midColor) => onChange({ midColor })} />
          <Style value={config.midStyle} onChange={(midStyle) => onChange({ midStyle })} />
        </Row>

        <Row label="Fill">
          <Swatch id="fill" open={open} setOpen={setOpen} value={config.fill}
            onChange={(fill) => onChange({ fill })} />
          <Range
            value={config.fillOpacity}
            onChange={(fillOpacity) => onChange({ fillOpacity })}
          />
        </Row>

        <Row label="Text">
          <Swatch id="text" open={open} setOpen={setOpen} value={config.textColor}
            onChange={(textColor) => onChange({ textColor })} />
          <Select
            value={config.textSize}
            options={SIZES}
            onChange={(textSize) => onChange({ textSize })}
          />
        </Row>
      </div>
    </>
  );
}

function Levels({
  settings,
  onChange,
  open,
  setOpen,
}: {
  settings: SessionSettings;
  onChange: (next: SessionSettings) => void;
  open: string | null;
  setOpen: (id: string | null) => void;
}) {
  return (
    <>
      <div>
        <p className="mb-2 text-theme-xs font-medium uppercase tracking-wide text-gray-400">
          Average daily range
        </p>
        <div className="flex items-center gap-4">
          <Check
            checked={settings.showAdr}
            onChange={(showAdr) => onChange({ ...settings, showAdr })}
            label="Show ADR"
          />
        </div>
        <Row label="Days shown">
          <Num value={settings.adrDays} max={365} onChange={(adrDays) => onChange({ ...settings, adrDays })} />
        </Row>
        <Row label="Averaged over">
          <Num value={settings.adrLength} max={365} onChange={(adrLength) => onChange({ ...settings, adrLength })} />
          <span className="text-theme-xs text-gray-400">days</span>
        </Row>
      </div>

      <Level
        title="Previous day"
        id="pd"
        config={settings.previousDay}
        onChange={(patch) => onChange({ ...settings, previousDay: { ...settings.previousDay, ...patch } })}
        open={open}
        setOpen={setOpen}
        labelName="YH / YL"
        extra={
          <Check
            checked={settings.previousDay.showRange}
            onChange={(showRange) =>
              onChange({ ...settings, previousDay: { ...settings.previousDay, showRange } })
            }
            label="Range"
          />
        }
      />

      <Level
        title="Last week"
        id="lw"
        config={settings.lastWeek}
        onChange={(patch) => onChange({ ...settings, lastWeek: { ...settings.lastWeek, ...patch } })}
        open={open}
        setOpen={setOpen}
        labelName="PWH / PWL"
      />

      <Level
        title="This week"
        id="tw"
        config={settings.thisWeek}
        onChange={(patch) => onChange({ ...settings, thisWeek: { ...settings.thisWeek, ...patch } })}
        open={open}
        setOpen={setOpen}
        labelName="WH / WL"
      />
    </>
  );
}

function Level({
  title,
  id,
  config,
  onChange,
  open,
  setOpen,
  labelName,
  extra,
}: {
  title: string;
  id: string;
  config: LevelConfig;
  onChange: (patch: Partial<LevelConfig>) => void;
  open: string | null;
  setOpen: (id: string | null) => void;
  labelName: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="border-t border-gray-100 pt-3 dark:border-gray-700">
      <div className="mb-2 flex items-center gap-4">
        <Check checked={config.show} onChange={(show) => onChange({ show })} label={title} />
        <Check checked={config.showLabel} onChange={(showLabel) => onChange({ showLabel })} label={labelName} />
        {extra}
      </div>
      <Row label="Line">
        <Swatch id={id} open={open} setOpen={setOpen} value={config.color}
          onChange={(color) => onChange({ color })} />
        <Num value={config.width} max={10} onChange={(width) => onChange({ width })} />
        <Style value={config.style} onChange={(style) => onChange({ style })} />
      </Row>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-2 flex items-center gap-3">
      <span className="w-24 shrink-0 text-theme-xs text-gray-500 dark:text-gray-400">{label}</span>
      <div className="flex flex-1 items-center gap-2">{children}</div>
    </div>
  );
}

function Time({
  hour,
  minute,
  onChange,
}: {
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
}) {
  return (
    <span className="flex items-center gap-1">
      <Select
        value={hour}
        options={HOURS}
        format={pad}
        onChange={(next) => onChange(next, minute)}
      />
      <span className="text-theme-xs text-gray-400">:</span>
      <Select
        value={minute}
        options={MINUTES}
        format={pad}
        onChange={(next) => onChange(hour, next)}
      />
    </span>
  );
}

function Select<T extends string | number>({
  value,
  options,
  onChange,
  format,
}: {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  format?: (value: T) => string;
}) {
  const numeric = typeof value === "number";
  return (
    <select
      value={String(value)}
      onChange={(event) =>
        onChange((numeric ? Number(event.target.value) : event.target.value) as T)
      }
      className="rounded-md border border-gray-200 bg-white px-1.5 py-1 text-theme-xs capitalize text-gray-800 outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-white/5 dark:text-gray-200"
    >
      {options.map((option) => (
        <option key={String(option)} value={String(option)}>
          {format ? format(option) : String(option)}
        </option>
      ))}
    </select>
  );
}

function Style({
  value,
  onChange,
}: {
  value: LineStyleName;
  onChange: (value: LineStyleName) => void;
}) {
  return <Select value={value} options={STYLES} onChange={onChange} />;
}

function Swatch({
  id, open, setOpen, value, onChange,
}: {
  id: string;
  open: string | null;
  setOpen: (id: string | null) => void;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <ColourButton value={value} title="Pick a colour" onClick={() => setOpen(open === id ? null : id)} />
      {open === id ? (
        <ColourPicker value={value} onChange={onChange} onClose={() => setOpen(null)} />
      ) : null}
    </div>
  );
}

function Check({
  checked, onChange, label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-theme-xs text-gray-600 dark:text-gray-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3.5 w-3.5 accent-brand-500"
      />
      {label}
    </label>
  );
}

function Num({
  value, onChange, max,
}: {
  value: number;
  onChange: (value: number) => void;
  max: number;
}) {
  return (
    <input
      type="number"
      value={value}
      min={0}
      max={max}
      onChange={(event) => {
        const next = Number(event.target.value);
        if (Number.isFinite(next)) onChange(Math.max(0, Math.min(max, next)));
      }}
      className="w-14 rounded-md border border-gray-200 bg-white px-2 py-1 text-theme-xs tabular-nums text-gray-800 outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-white/5 dark:text-gray-200"
    />
  );
}

/** Fill strength, as a slider — a number box for 0.1 reads as a typo. */
function Range({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <span className="flex flex-1 items-center gap-2">
      <input
        type="range"
        min={0}
        max={60}
        value={Math.round(value * 100)}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        className="h-1 flex-1 accent-brand-500"
      />
      <span className="w-8 text-right text-theme-xs tabular-nums text-gray-400">
        {Math.round(value * 100)}%
      </span>
    </span>
  );
}
