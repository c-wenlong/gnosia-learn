import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Figtree, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { loadHabit } from "@/lib/habit";
import { LearnerProvider } from "@/lib/learner-context";
import { loadLearnerSnapshot } from "@/lib/learner-store";
import { resolveSiteUrl } from "@/lib/site-url";
import { studioEnabled } from "@/lib/studio";
import { asThemeMode, THEME_COOKIE } from "@/lib/theme-cookie";
import "./globals.css";

// The interface face. Brilliant's own is CoFo Brilliant, and Figtree is the
// fallback its CSS names; titles use Georgia from the system (see globals.css).
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

// Kept for code in notes: Figtree has no monospace.

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: resolveSiteUrl(),
  title: {
    default: "Self-Learn · AY2026/27 Shortlist",
    template: "%s · Self-Learn",
  },
  description:
    "Docs-style self-study hub for the SoC AY2026/27 course shortlist, with progress, notes, and resources.",
  // Declared by hand rather than via the app/opengraph-image.png file
  // convention: under Turbopack that convention ignores the documented
  // opengraph-image.alt.txt sidecar, so the card ships with no alt text.
  openGraph: {
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Pixel-art staircase built from stacked books, climbing from a forest up into the sky towards a glowing open book",
      },
    ],
  },
};

/**
 * The root layout reads the learner's state, which makes every page dynamic.
 *
 * That is the trade bundle 5 makes deliberately. `LearnerProvider` needs real
 * state on the first render — a provider seeded with zeros and corrected after
 * hydration is a progress bar that visibly jumps — and the state is a query.
 * Nothing is read at build time, so a build with no database at all still
 * succeeds; every read simply happens per request instead.
 *
 * The theme is the exception, and it is a cookie rather than a query. It has
 * to be known before the first byte of HTML or a dark-mode reload flashes
 * white, and putting a database round trip in front of the document for one
 * bit is not a trade worth making. The `preference` row is the durable copy
 * and the fallback when the cookie is missing.
 *
 * It also reads the habit numbers the top bar shows on every page (the streak
 * and the daily target, `@/lib/habit`) and hands them to the shell as props:
 * the bar is a client component and cannot query anything itself.
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [cookieStore, { state, reachable }, habit] = await Promise.all([
    cookies(),
    loadLearnerSnapshot(),
    loadHabit(),
  ]);

  // The cookie wins when both are present: it is what the browser last chose,
  // and it may have been chosen while the database was unreachable.
  const theme = asThemeMode(cookieStore.get(THEME_COOKIE)?.value) ?? state.theme;
  const initialState = theme === state.theme ? state : { ...state, theme };

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${figtree.variable} ${geistMono.variable} h-full antialiased${
        theme === "dark" ? " dark" : ""
      }`}
    >
      <body className="min-h-full">
        <LearnerProvider initialState={initialState} reachable={reachable}>
          <AppShell habit={habit} studio={studioEnabled()}>
            {children}
          </AppShell>
        </LearnerProvider>
      </body>
    </html>
  );
}
