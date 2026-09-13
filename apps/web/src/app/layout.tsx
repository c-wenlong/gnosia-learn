import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { courses } from "@/data/courses";
import { toCourseNav } from "@/lib/curriculum";
import { LearnerProvider } from "@/lib/learner-context";
import { loadLearnerSnapshot } from "@/lib/learner-store";
import { asThemeMode, THEME_COOKIE } from "@/lib/theme-cookie";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const LOCAL_SITE_URL = "http://localhost:3000";

/**
 * Absolute base that social image URLs resolve against.
 *
 * Set `NEXT_PUBLIC_SITE_URL` to the canonical origin, with or without a
 * scheme ("example.com" and "https://example.com" both work). On Vercel the
 * production domain is injected instead. Anything unusable falls back to the
 * dev server rather than throwing: a bad value should cost a link preview,
 * not the whole app, since this runs while the root layout loads.
 */
function resolveSiteUrl(): URL {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();

  if (!configured) return new URL(LOCAL_SITE_URL);

  const withScheme = /^https?:\/\//i.test(configured)
    ? configured
    : `https://${configured}`;

  try {
    return new URL(withScheme);
  } catch {
    console.warn(
      `Ignoring unparseable site URL ${JSON.stringify(configured)}; ` +
        `social images will resolve against ${LOCAL_SITE_URL}.`,
    );
    return new URL(LOCAL_SITE_URL);
  }
}

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
 * It is also the one place that can read both `content/` and the database, so
 * it resolves the sidebar's nav here and hands it down: the sidebar and the
 * header progress bar are client components, and the course files are on disk.
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [cookieStore, { state, reachable }] = await Promise.all([
    cookies(),
    loadLearnerSnapshot(),
  ]);

  // The cookie wins when both are present: it is what the browser last chose,
  // and it may have been chosen while the database was unreachable.
  const theme = asThemeMode(cookieStore.get(THEME_COOKIE)?.value) ?? state.theme;
  const initialState = theme === state.theme ? state : { ...state, theme };

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased${
        theme === "dark" ? " dark" : ""
      }`}
    >
      <body className="min-h-full">
        <LearnerProvider initialState={initialState} reachable={reachable}>
          <AppShell nav={toCourseNav(courses)}>{children}</AppShell>
        </LearnerProvider>
      </body>
    </html>
  );
}
