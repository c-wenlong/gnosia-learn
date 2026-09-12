import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { courses } from "@/data/courses";
import { toCourseNav } from "@/lib/curriculum";
import { LearnerProvider } from "@/lib/learner-context";
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
 * The sidebar and the header progress bar are client components, and the
 * course files are on disk. The layout is the one place that can read both, so
 * it resolves the nav here and hands it down.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('self-learn:v1');if(!s)return;var t=JSON.parse(s).theme;if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full">
        <LearnerProvider>
          <AppShell nav={toCourseNav(courses)}>{children}</AppShell>
        </LearnerProvider>
      </body>
    </html>
  );
}
