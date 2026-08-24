import type { Metadata } from "next";
import { Outfit } from "next/font/google";

import { AppShell } from "./components/shell/app-shell";
import { loadTrades } from "@/lib/page-data";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Trade Journal",
  description:
    "A forex trading journal: type each trade straight into the row, then see how the month performed on the analytics tab.",
};

// The journal is a live record — always read it fresh rather than serving a
// snapshot from before the last trade was logged.
export const dynamic = "force-dynamic";

/**
 * Applied before first paint so a dark-mode reload never flashes the light
 * theme. Kept in sync with the toggle in the header.
 */
const THEME_SCRIPT = `
try {
  var stored = localStorage.getItem("theme");
  var dark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (dark) document.documentElement.classList.add("dark");
} catch (e) {}
`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Read here rather than in each page: the layout is preserved across
  // navigation, so moving between the tabs costs no server round trip.
  const result = await loadTrades();

  return (
    <html lang="en" className={`${outfit.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full font-outfit">
        <AppShell result={result}>{children}</AppShell>
      </body>
    </html>
  );
}
