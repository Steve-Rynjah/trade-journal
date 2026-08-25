import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import type { ReactNode } from "react";

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

/**
 * Document shell only.
 *
 * The sidebar, the header and the journal read all live one level down, in the
 * `(app)` group — so the login page can share the fonts and the theme without
 * inheriting a chrome it has no business rendering.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full font-outfit">{children}</body>
    </html>
  );
}
