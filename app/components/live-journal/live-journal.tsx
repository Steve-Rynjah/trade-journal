"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";

import {
  addJournalCharts,
  createJournalEntry,
  deleteJournalEntry,
  removeJournalChart,
  updateJournalEntry,
} from "@/app/journal-actions";
import {
  MAX_JOURNAL_CHARTS,
  NO_TP,
  levelsProblem,
  parsePrice,
  sanitisePrice,
  sanitiseTakeProfit,
  type JournalEntryWithCharts,
} from "@/lib/journal";
import {
  ACCOUNT_SIZES,
  DEFAULT_PAGE_SIZE,
  MONTHS,
  RISK_PERCENTS,
  SHEET_VERSIONS,
  computePnl,
  formatMoney,
  formatRiskPercent,
  splitResults,
  versionLabel,
  type AccountSize,
  type RiskPercent,
} from "@/lib/stats";
import {
  BIASES,
  DIRECTIONS,
  RESULTS,
  composeRatio,
  parseRatio,
  sanitiseRatioLeg,
  dayNameOf,
  defaultDateInMonth,
  formatTradeDate,
  isValidDate,
  isWeekday,
  type Bias,
  type Direction,
  type Screenshot,
  type TradeResult,
} from "@/lib/types";
import { Pagination } from "../pagination";
import { ScreenshotLightbox, type Lightbox } from "../screenshot-lightbox";
import { SelectMenu, type MenuOption } from "../select-menu";
import { usePeriod } from "../shell/app-data";
import {
  IconButton,
  SelectCell,
  Thumb,
  biasTone,
  directionTone,
  resultTone,
} from "../journal/trade-sheet";
import { LongShortCard } from "../charts/long-short-card";
import { PnlCard } from "../charts/pnl-card";
import { WinLoseDonut } from "../charts/win-lose-donut";
import { CALENDAR_ICON, SHEET_ICON } from "../period-filter";
import { RowMenu } from "../row-menu";
import {
  BiasBadge,
  Card,
  CardHeader,
  DirectionBadge,
  ResultBadge,
  biasLabel,
  fieldClass,
} from "../ui";

type Draft = {
  tradeDate: string;
  bias: Bias | "";
  direction: Direction | "";
  entry: string;
  stopLoss: string;
  /** A price, or `-` for a trade taken without a target. */
  takeProfit: string;
  /** The RR legs, `1` and `2` for `1 : 2`. Both are the journal's to set. */
  riskLeg: string;
  rewardLeg: string;
  result: TradeResult | "";
  journal: string;
  /** Picked but not uploaded yet. */
  charts: File[];
};

function blankDraft(): Draft {
  return {
    tradeDate: "",
    bias: "",
    direction: "",
    entry: "",
    stopLoss: "",
    takeProfit: "",
    riskLeg: "1",
    rewardLeg: "2",
    result: "",
    journal: "",
    charts: [],
  };
}

function draftOf(entry: JournalEntryWithCharts): Draft {
  return {
    tradeDate: entry.tradeDate,
    bias: entry.bias,
    direction: entry.direction,
    entry: entry.entry,
    stopLoss: entry.stopLoss,
    takeProfit:
      entry.takeProfit === null ? NO_TP : entry.takeProfit,
    riskLeg: parseRatio(entry.ratio).risk,
    rewardLeg: parseRatio(entry.ratio).reward,
    result: entry.result,
    journal: entry.journal ?? "",
    charts: [],
  };
}

function ratioOf(draft: Draft): string {
  return composeRatio(draft.riskLeg, draft.rewardLeg);
}

/** Why the row cannot be saved yet, in the order you would fill it in. */
function blockedReason(draft: Draft, date: string): string | null {
  if (!isValidDate(date)) return "Pick a date.";
  if (!isWeekday(date)) return "Forex week runs Monday to Friday.";
  if (!draft.bias) return "Choose a bias.";
  if (!draft.direction) return "Choose a direction.";
  const entry = parsePrice(draft.entry);
  const sl = parsePrice(draft.stopLoss);
  const noTarget = draft.takeProfit === NO_TP;
  const tp = noTarget ? null : parsePrice(draft.takeProfit);
  if (entry === null) return "Enter the entry price.";
  if (sl === null) return "Enter the SL.";
  if (tp === null && !noTarget) return "Enter the TP, or - if there was none.";
  const levels = levelsProblem(draft.direction, entry, sl, tp);
  if (levels) return levels;
  if (!ratioOf(draft)) return "Enter both legs of the RR.";
  if (!draft.result) return "Choose a result.";
  return null;
}

function toFormData(
  draft: Draft,
  date: string,
  version: number,
  id?: string,
): FormData {
  const data = new FormData();
  if (id) data.set("id", id);
  data.set("trade_date", date);
  data.set("version", String(version));
  data.set("bias", draft.bias);
  data.set("direction", draft.direction);
  data.set("entry", draft.entry);
  data.set("stop_loss", draft.stopLoss);
  data.set("take_profit", draft.takeProfit);
  data.set("ratio", ratioOf(draft));
  data.set("result", draft.result);
  data.set("journal", draft.journal);
  for (const file of draft.charts) data.append("chart", file);
  return data;
}

const TH =
  "whitespace-nowrap px-3 py-3 text-left text-theme-xs font-medium uppercase tracking-[0.06em] text-gray-500 dark:text-gray-400";
const TD = "px-3 py-3 align-top text-theme-sm";

export function LiveJournal({
  entries,
  loadError,
}: {
  entries: JournalEntryWithCharts[];
  loadError: string | null;
}) {
  const {
    month,
    year,
    version,
    setMonth,
    setYear,
    setVersion,
    accountSize,
    setAccountSize,
    riskPercent,
    setRiskPercent,
  } = usePeriod();

  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<Lightbox>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  // Collapsed by default: the table is the page, the cards are on request.
  const [showStats, setShowStats] = useState(false);
  const [requestedPage, setRequestedPage] = useState(1);

  const uploadFor = useRef<string | null>(null);
  const rowFileRef = useRef<HTMLInputElement>(null);
  const draftFileRef = useRef<HTMLInputElement>(null);

  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const rows = useMemo(
    () =>
      entries.filter(
        (entry) =>
          entry.version === version && entry.tradeDate.slice(0, 7) === monthKey,
      ),
    [entries, version, monthKey],
  );
  const sheetLabel = `${MONTHS[month - 1]} ${year} · ${versionLabel(version)}`;

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const visible = rows.slice((page - 1) * pageSize, page * pageSize);

  const fallbackDate = defaultDateInMonth(month, year);
  const draftDate = draft.tradeDate || fallbackDate;
  const blocked = blockedReason(draft, draftDate);
  const touched =
    draft.bias ||
    draft.direction ||
    draft.entry ||
    draft.stopLoss ||
    draft.takeProfit ||
    draft.result;

  const split = splitResults(rows);
  const pnl = computePnl(rows, accountSize, riskPercent);

  // This year and the five after it — a live journal looks forward. A year
  // that already holds entries stays reachable even once it falls out of range.
  const yearOptions: MenuOption<number>[] = useMemo(() => {
    const current = new Date().getUTCFullYear();
    const years = new Set<number>();
    for (let offset = 0; offset <= 5; offset += 1) years.add(current + offset);
    for (const entry of entries) years.add(Number(entry.tradeDate.slice(0, 4)));
    // The year is shared with Home, which still offers past years for backtests.
    years.add(year);
    return [...years]
      .sort((a, b) => a - b)
      .map((value) => ({ value, label: String(value) }));
  }, [entries, year]);

  const versionOptions: MenuOption<number>[] = SHEET_VERSIONS.map((value) => {
    const used = entries.filter(
      (entry) =>
        entry.version === value && entry.tradeDate.slice(0, 7) === monthKey,
    ).length;
    return {
      value,
      label: versionLabel(value),
      hint: used > 0 ? String(used) : undefined,
    };
  });

  const monthOptions: MenuOption<number>[] = MONTHS.map((name, index) => {
    const key = `${year}-${String(index + 1).padStart(2, "0")}`;
    const count = entries.filter(
      (entry) => entry.version === version && entry.tradeDate.startsWith(key),
    ).length;
    return {
      value: index + 1,
      label: name,
      hint: count > 0 ? String(count) : undefined,
    };
  });

  const accountOptions: MenuOption<AccountSize>[] = ACCOUNT_SIZES.map(
    (size) => ({
      value: size,
      label: `${size / 1000}k`,
      hint: formatMoney(size),
    }),
  );

  const riskOptions: MenuOption<RiskPercent>[] = RISK_PERCENTS.map(
    (percent) => ({
      value: percent,
      label: formatRiskPercent(percent),
      hint: formatMoney(accountSize * (percent / 100)),
    }),
  );

  function saveDraft() {
    if (blocked) {
      setError(blocked);
      return;
    }
    setError(null);
    const date = draftDate;
    startTransition(async () => {
      const result = await createJournalEntry(toFormData(draft, date, version));
      if (result.status === "success") {
        setDraft(blankDraft());
        setRequestedPage(1);
        // A trade dated into another month would vanish from this table — follow it.
        // It stays on the version it was saved to, which is the one on screen.
        setMonth(Number(date.slice(5, 7)));
        setYear(Number(date.slice(0, 4)));
      } else {
        setError(result.message);
      }
    });
  }

  function saveEdit() {
    if (!editingId || !editDraft) return;
    const editing = entries.find((entry) => entry.id === editingId);
    const reason = blockedReason(editDraft, editDraft.tradeDate);
    if (reason) {
      setError(reason);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateJournalEntry(
        toFormData(
          editDraft,
          editDraft.tradeDate,
          editing?.version ?? version,
          editingId,
        ),
      );
      if (result.status === "success") {
        setEditingId(null);
        setEditDraft(null);
      } else {
        setError(result.message);
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteJournalEntry(id);
      if (result.status === "error") setError(result.message);
    });
  }

  function attach(files: File[]) {
    const id = uploadFor.current;
    if (!id || files.length === 0) return;
    setError(null);
    startTransition(async () => {
      const data = new FormData();
      data.set("id", id);
      for (const file of files) data.append("chart", file);
      const result = await addJournalCharts(data);
      if (result.status === "error") setError(result.message);
    });
  }

  function detach(id: string, path: string) {
    setError(null);
    setRemoving(path);
    startTransition(async () => {
      const result = await removeJournalChart(id, path);
      setRemoving(null);
      if (result.status === "error") setError(result.message);
    });
  }

  function openCharts(entry: JournalEntryWithCharts, index: number) {
    setLightbox({
      urls: entry.screenshots.map((shot) => shot.url),
      index,
      caption: `${dayNameOf(entry.tradeDate)} · ${formatTradeDate(entry.tradeDate)} · ${entry.direction} · ${entry.result}`,
    });
  }

  function fit(picked: FileList | null, room: number): File[] {
    const files = Array.from(picked ?? []);
    if (files.length > room) {
      setError(
        `An entry holds at most ${MAX_JOURNAL_CHARTS} charts — kept the first ${Math.max(0, room)}.`,
      );
    }
    return files.slice(0, Math.max(0, room));
  }

  return (
    <div className="mx-auto w-full max-w-[100rem]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SelectMenu
            label="Version"
            value={version}
            options={versionOptions}
            onChange={setVersion}
            icon={SHEET_ICON}
            widthClass="w-40"
          />
          <SelectMenu
            label="Month"
            value={month}
            options={monthOptions}
            onChange={setMonth}
            icon={CALENDAR_ICON}
            widthClass="w-48"
          />
          <SelectMenu
            label="Year"
            value={year}
            options={yearOptions}
            onChange={setYear}
            widthClass="w-40"
          />
          <SelectMenu
            label="Account size"
            value={accountSize}
            options={accountOptions}
            onChange={setAccountSize}
            widthClass="w-44"
            icon={
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <rect
                  x="2.8"
                  y="5.5"
                  width="18.4"
                  height="13"
                  rx="3"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="2.6"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
              </svg>
            }
          />
          <button
            type="button"
            onClick={saveDraft}
            disabled={pending || (touched ? false : true)}
            title={blocked ?? "Save the open row"}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-theme-sm font-medium text-white shadow-theme-xs transition-colors hover:bg-brand-600 disabled:pointer-events-none disabled:opacity-50"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M5 12.5l4.5 4.5L19 7.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
        <div className="flex items-center gap-3">
          <p className="tnum text-theme-sm text-gray-500 dark:text-gray-400">
            <span className="font-semibold text-gray-800 dark:text-white/90">
              {rows.length}
            </span>{" "}
            {rows.length === 1 ? "trade" : "trades"} on {sheetLabel}
          </p>
          <button
            type="button"
            onClick={() => setShowStats((open) => !open)}
            aria-expanded={showStats}
            aria-controls="journal-analytics"
            aria-label={showStats ? "Hide analytics" : "Show analytics"}
            title={showStats ? "Hide analytics" : "Show analytics"}
            className={`inline-flex h-11 items-center gap-1.5 rounded-lg border px-3 shadow-theme-xs transition-colors ${
              showStats
                ? "border-brand-300 bg-brand-50 text-brand-500 dark:border-brand-500/40 dark:bg-brand-500/12 dark:text-brand-400"
                : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/5"
            }`}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <rect x="3.2" y="12" width="4.4" height="8.8" rx="1.6" />
              <rect x="9.8" y="7" width="4.4" height="13.8" rx="1.6" />
              <rect x="16.4" y="3.2" width="4.4" height="17.6" rx="1.6" />
            </svg>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className={`transition-transform duration-200 ${showStats ? "rotate-180" : ""}`}
            >
              <path
                d="M6 9.5l6 6 6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {loadError ? (
        <p
          role="alert"
          className="mb-3 rounded-lg bg-error-50 px-4 py-2.5 text-theme-sm text-error-600 dark:bg-error-500/12 dark:text-error-400"
        >
          {loadError}
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mb-3 rounded-lg bg-error-50 px-4 py-2.5 text-theme-sm text-error-600 dark:bg-error-500/12 dark:text-error-400"
        >
          {error}
        </p>
      ) : null}

      {/* The Analytics cards, read against this sheet — shown on request. */}
      <AnimatePresence initial={false}>
        {showStats ? (
          <motion.div
            id="journal-analytics"
            key="analytics"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            // The risk menu opens within the PnL card's own height, so clipping
            // the panel for the slide never cuts it off.
            className="overflow-hidden"
          >
            <div className="mb-5 grid items-stretch gap-5 lg:grid-cols-3">
              <PnlCard
                pnl={pnl}
                trades={rows.length}
                action={
                  <SelectMenu
                    label="Risk per trade"
                    value={riskPercent}
                    options={riskOptions}
                    onChange={setRiskPercent}
                    widthClass="w-36"
                    align="right"
                  />
                }
              />

              <Card>
                <CardHeader
                  title={`${split.total} ${split.total === 1 ? "trade" : "trades"}`}
                  hint={
                    split.total === 0
                      ? `Nothing journalled on ${sheetLabel}`
                      : `${split.wins} won · ${split.losses} lost${
                          split.breakevens > 0
                            ? ` · ${split.breakevens} break even`
                            : ""
                        }`
                  }
                />
                <div className="px-5 pb-6">
                  <WinLoseDonut split={split} size={200} />
                </div>
              </Card>

              <div className="[&>div]:h-full">
                <LongShortCard
                  trades={rows}
                  accountSize={accountSize}
                  riskPercent={riskPercent}
                />
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <Card>
        <div className="overflow-x-auto rounded-t-2xl">
          <table className="w-full min-w-[86rem] border-collapse">
            <colgroup>
              <col className="w-[10rem]" />
              <col className="w-[6.75rem]" />
              <col className="w-[8.5rem]" />
              <col className="w-[7.5rem]" />
              <col className="w-[7.5rem]" />
              <col className="w-[7.5rem]" />
              <col className="w-[7.5rem]" />
              <col className="w-[6.75rem]" />
              <col className="min-w-[18rem]" />
              <col className="w-[14rem]" />
            </colgroup>
            <thead>
              <tr className="border-y border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.02]">
                {[
                  "Date",
                  "Bias",
                  "Direction",
                  "Entry",
                  "SL",
                  "TP",
                  "RR",
                  "Result",
                  "Journal",
                  "Chart",
                ].map((label, index, all) => (
                  <th
                    key={label}
                    className={`${TH} ${index < all.length - 1 ? "cell-rule" : ""}`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-200 bg-brand-25 dark:border-gray-800 dark:bg-brand-500/5">
                <DraftCells
                  draft={draft}
                  shownDate={draftDate}
                  onChange={setDraft}
                  onSubmit={saveDraft}
                  onPickFile={() => draftFileRef.current?.click()}
                  trailing={
                    touched || draft.charts.length > 0 || draft.journal ? (
                      <IconButton
                        label="Clear the row"
                        onClick={() => {
                          setDraft(blankDraft());
                          setError(null);
                        }}
                      >
                        <path
                          d="M6 6l12 12M18 6L6 18"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </IconButton>
                    ) : null
                  }
                />
              </tr>

              {visible.map((entry) => {
                if (editingId === entry.id && editDraft) {
                  return (
                    <tr
                      key={entry.id}
                      className="border-b border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.04]"
                    >
                      <DraftCells
                        draft={editDraft}
                        shownDate={editDraft.tradeDate}
                        onChange={setEditDraft}
                        onSubmit={saveEdit}
                        onPickFile={() => {
                          uploadFor.current = entry.id;
                          rowFileRef.current?.click();
                        }}
                        existing={entry.screenshots}
                        onOpenExisting={(index) => openCharts(entry, index)}
                        onRemoveExisting={(path) => detach(entry.id, path)}
                        removing={removing}
                        trailing={
                          <span className="flex flex-col gap-1">
                            <IconButton
                              label="Save this row"
                              tone="brand"
                              disabled={pending}
                              onClick={saveEdit}
                            >
                              <path
                                d="M5 12.5l4.5 4.5L19 7.5"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </IconButton>
                            <IconButton
                              label="Cancel"
                              onClick={() => {
                                setEditingId(null);
                                setEditDraft(null);
                                setError(null);
                              }}
                            >
                              <path
                                d="M6 6l12 12M18 6L6 18"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                              />
                            </IconButton>
                          </span>
                        }
                      />
                    </tr>
                  );
                }

                const room = MAX_JOURNAL_CHARTS - entry.screenshots.length;
                return (
                  <tr
                    key={entry.id}
                    className="group border-b border-gray-100 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/[0.02]"
                  >
                    <td
                      className={`${TD} cell-rule tnum whitespace-nowrap font-medium text-gray-700 dark:text-gray-300`}
                    >
                      {formatTradeDate(entry.tradeDate)}
                      <span className="block text-theme-xs font-normal text-gray-400">
                        {dayNameOf(entry.tradeDate)}
                      </span>
                    </td>
                    <td className={`${TD} cell-rule`}>
                      <BiasBadge bias={entry.bias} />
                    </td>
                    <td className={`${TD} cell-rule`}>
                      <DirectionBadge direction={entry.direction} />
                    </td>
                    <td
                      className={`${TD} cell-rule tnum text-gray-700 dark:text-gray-300`}
                    >
                      {entry.entry}
                    </td>
                    <td
                      className={`${TD} cell-rule tnum text-error-600 dark:text-error-400`}
                    >
                      {entry.stopLoss}
                    </td>
                    <td
                      className={`${TD} cell-rule tnum text-success-600 dark:text-success-500`}
                    >
                      {entry.takeProfit === null ? (
                        <span className="text-gray-400">-</span>
                      ) : (
                        entry.takeProfit
                      )}
                    </td>
                    <td
                      className={`${TD} cell-rule tnum whitespace-nowrap font-medium text-gray-700 dark:text-gray-300`}
                    >
                      {entry.ratio}
                    </td>
                    <td className={`${TD} cell-rule`}>
                      <ResultBadge result={entry.result} />
                    </td>
                    <td
                      className={`${TD} cell-rule whitespace-pre-line break-words text-gray-600 dark:text-gray-400`}
                    >
                      {entry.journal || (
                        <span className="text-gray-300 dark:text-gray-600">
                          —
                        </span>
                      )}
                    </td>
                    <td className={TD}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="flex flex-wrap items-center gap-1.5">
                          {entry.screenshots.map((shot, index) => (
                            <Thumb
                              key={shot.path}
                              url={shot.url}
                              label={`Open chart ${index + 1} for ${formatTradeDate(entry.tradeDate)}`}
                              onClick={() => openCharts(entry, index)}
                            />
                          ))}
                          {room > 0 ? (
                            <button
                              type="button"
                              disabled={pending}
                              title="Add chart images"
                              onClick={() => {
                                uploadFor.current = entry.id;
                                rowFileRef.current?.click();
                              }}
                              className={`rounded-lg border border-dashed border-gray-300 text-theme-xs text-gray-500 transition-colors hover:border-brand-300 hover:text-brand-500 disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 ${
                                entry.screenshots.length > 0
                                  ? "flex h-8 w-8 items-center justify-center"
                                  : "px-2 py-1"
                              }`}
                            >
                              {entry.screenshots.length > 0 ? "+" : "+ Images"}
                            </button>
                          ) : null}
                        </span>
                        <RowMenu
                          label={`the trade on ${formatTradeDate(entry.tradeDate)}`}
                          disabled={pending}
                          onEdit={() => {
                            setEditingId(entry.id);
                            setEditDraft(draftOf(entry));
                            setError(null);
                          }}
                          onDelete={() => remove(entry.id)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {rows.length === 0 ? (
          <p className="px-5 py-6 text-center text-theme-sm text-gray-500 dark:text-gray-400">
            No trades journalled on {sheetLabel} — the row above is ready when
            you are.
          </p>
        ) : (
          <Pagination
            page={page}
            pageCount={pageCount}
            pageSize={pageSize}
            total={rows.length}
            onPage={setRequestedPage}
            onPageSize={(size) => {
              setPageSize(size);
              setRequestedPage(1);
            }}
          />
        )}
      </Card>

      <input
        ref={rowFileRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/avif"
        className="hidden"
        onChange={(event) => {
          const target = entries.find(
            (entry) => entry.id === uploadFor.current,
          );
          const saved = target?.screenshots.length ?? 0;
          if (editingId && editDraft) {
            const files = fit(
              event.target.files,
              MAX_JOURNAL_CHARTS - saved - editDraft.charts.length,
            );
            setEditDraft({
              ...editDraft,
              charts: [...editDraft.charts, ...files],
            });
          } else {
            attach(fit(event.target.files, MAX_JOURNAL_CHARTS - saved));
          }
          event.target.value = "";
        }}
      />
      <input
        ref={draftFileRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/avif"
        className="hidden"
        onChange={(event) => {
          const files = fit(
            event.target.files,
            MAX_JOURNAL_CHARTS - draft.charts.length,
          );
          setDraft({ ...draft, charts: [...draft.charts, ...files] });
          event.target.value = "";
        }}
      />

      <ScreenshotLightbox value={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}

function PriceCell({
  label,
  value,
  onChange,
  onSubmit,
  sanitise = sanitisePrice,
  placeholder = "0.00000",
  title,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  sanitise?: (value: string) => string;
  placeholder?: string;
  title?: string;
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      title={title}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(sanitise(event.target.value))}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onSubmit();
        }
      }}
      className={`${fieldClass} tnum h-9`}
    />
  );
}

function RatioLeg({
  label,
  value,
  onChange,
  onSubmit,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      value={value}
      onChange={(event) => onChange(sanitiseRatioLeg(event.target.value))}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onSubmit();
        }
      }}
      className={`${fieldClass} tnum h-9 w-full min-w-0 px-1.5 text-center`}
    />
  );
}

function JournalCell({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  // Unlike Remarks on Home, Enter is a new line here: a journal runs to
  // paragraphs. Save is the button above the table.
  return (
    <textarea
      ref={ref}
      rows={2}
      aria-label="Journal"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Why you took it, how you managed it, what you felt"
      className={`${fieldClass} min-h-9 resize-none overflow-hidden leading-6`}
    />
  );
}

function DraftCells({
  draft,
  shownDate,
  onChange,
  onSubmit,
  onPickFile,
  existing = [],
  onOpenExisting,
  onRemoveExisting,
  removing,
  trailing,
}: {
  draft: Draft;
  shownDate: string;
  onChange: (next: Draft) => void;
  onSubmit: () => void;
  onPickFile: () => void;
  existing?: Screenshot[];
  onOpenExisting?: (index: number) => void;
  onRemoveExisting?: (path: string) => void;
  removing?: string | null;
  /** Row controls, in the Chart cell's right corner — Clear, or Save/Cancel. */
  trailing?: ReactNode;
}) {
  const room = MAX_JOURNAL_CHARTS - existing.length - draft.charts.length;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <td className={`${TD} cell-rule`}>
        <input
          type="date"
          aria-label="Date"
          value={shownDate}
          max={today}
          onChange={(event) =>
            onChange({ ...draft, tradeDate: event.target.value })
          }
          className={`${fieldClass} tnum h-9`}
        />
      </td>
      <td className={`${TD} cell-rule`}>
        <SelectCell
          label="Bias"
          value={draft.bias}
          options={BIASES}
          onChange={(bias) => onChange({ ...draft, bias })}
          tone={biasTone}
          format={biasLabel}
        />
      </td>
      <td className={`${TD} cell-rule`}>
        <SelectCell
          label="Direction"
          value={draft.direction}
          options={DIRECTIONS}
          onChange={(direction) => onChange({ ...draft, direction })}
          tone={directionTone}
        />
      </td>
      <td className={`${TD} cell-rule`}>
        <PriceCell
          label="Entry"
          value={draft.entry}
          onChange={(entry) => onChange({ ...draft, entry })}
          onSubmit={onSubmit}
        />
      </td>
      <td className={`${TD} cell-rule`}>
        <PriceCell
          label="Stop loss"
          value={draft.stopLoss}
          onChange={(stopLoss) => onChange({ ...draft, stopLoss })}
          onSubmit={onSubmit}
        />
      </td>
      <td className={`${TD} cell-rule`}>
        <PriceCell
          label="Take profit"
          value={draft.takeProfit}
          onChange={(takeProfit) => onChange({ ...draft, takeProfit })}
          onSubmit={onSubmit}
          sanitise={sanitiseTakeProfit}
          placeholder="0.00000 or -"
          title="A price, or - if the trade had no target"
        />
      </td>
      <td className={`${TD} cell-rule`}>
        <span className="flex items-center gap-1">
          <RatioLeg
            label="RR risk leg"
            value={draft.riskLeg}
            onChange={(riskLeg) => onChange({ ...draft, riskLeg })}
            onSubmit={onSubmit}
          />
          <span className="text-gray-400">:</span>
          <RatioLeg
            label="RR reward leg"
            value={draft.rewardLeg}
            onChange={(rewardLeg) => onChange({ ...draft, rewardLeg })}
            onSubmit={onSubmit}
          />
        </span>
      </td>
      <td className={`${TD} cell-rule`}>
        <SelectCell
          label="Result"
          value={draft.result}
          options={RESULTS}
          onChange={(result) => onChange({ ...draft, result })}
          tone={resultTone}
        />
      </td>
      <td className={`${TD} cell-rule`}>
        <JournalCell
          value={draft.journal}
          onChange={(journal) => onChange({ ...draft, journal })}
        />
      </td>
      <td className={TD}>
        <div className="flex items-start gap-2">
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            {existing.length > 0 ? (
              <span className="flex flex-wrap gap-1.5">
                {existing.map((shot, index) => (
                  <span key={shot.path} className="relative">
                    <Thumb
                      url={shot.url}
                      label={`Open chart ${index + 1}`}
                      onClick={() => onOpenExisting?.(index)}
                    />
                    <button
                      type="button"
                      aria-label={`Remove chart ${index + 1}`}
                      title="Remove this chart"
                      disabled={removing === shot.path}
                      onClick={() => onRemoveExisting?.(shot.path)}
                      className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-gray-800 text-white ring-2 ring-white hover:bg-error-500 disabled:opacity-50 dark:ring-gray-900"
                    >
                      <svg
                        width="8"
                        height="8"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M6 6l12 12M18 6L6 18"
                          stroke="currentColor"
                          strokeWidth="3.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </span>
                ))}
              </span>
            ) : null}
            <button
              type="button"
              onClick={onPickFile}
              disabled={room <= 0}
              title={
                room <= 0
                  ? `An entry holds at most ${MAX_JOURNAL_CHARTS} charts`
                  : "Pick one or more chart images"
              }
              className="w-full rounded-lg border border-dashed border-gray-300 px-2 py-1.5 text-theme-xs text-gray-500 transition-colors hover:border-brand-300 hover:text-brand-500 disabled:cursor-default disabled:opacity-50 dark:border-gray-700 dark:text-gray-400"
            >
              {draft.charts.length > 0
                ? `${draft.charts.length} new ${draft.charts.length === 1 ? "image" : "images"}${room > 0 ? " · +" : ""}`
                : "+ Images"}
            </button>
          </span>
          {trailing}
        </div>
      </td>
    </>
  );
}
