import { LiveJournal } from "@/app/components/live-journal/live-journal";
import { getJournalEntries } from "@/lib/journal-data";

/**
 * The Journal tab: trades actually taken. Read here rather than in the (app)
 * layout, so the backtest tabs never pay to sign these charts.
 */
export default async function JournalPage() {
  const result = await getJournalEntries();
  return (
    <LiveJournal
      entries={result.ok ? result.entries : []}
      loadError={result.ok ? null : result.error}
    />
  );
}
