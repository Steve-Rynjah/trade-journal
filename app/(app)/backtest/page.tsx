import { listSessions } from "@/app/backtest-actions";
import { SessionList } from "@/app/components/backtest/session-list";

/**
 * The Backtest tab: a list of saved runs, not the chart.
 *
 * The chart is a full-window route of its own — this page stays inside the
 * shell so the sidebar and header are still there while you choose one.
 */
export default async function BacktestPage() {
  const initial = await listSessions();
  return <SessionList initial={initial} />;
}
