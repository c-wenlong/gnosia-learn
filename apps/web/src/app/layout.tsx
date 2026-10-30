import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { Figtree, Geist_Mono } from "next/font/google";
import { cx } from "@/components/ui/classes";
import { NONCE_HEADER } from "@/lib/auth/csp";
import { asMotionMode, LEGACY_MOTION_COOKIE, MOTION_COOKIE, motionAttribute } from "@/lib/motion";
import { resolveSiteUrl } from "@/lib/site-url";
import { asThemeMode, LEGACY_THEME_COOKIE, SYSTEM_THEME_SCRIPT, THEME_COOKIE, themeClass } from "@/lib/theme-cookie";
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
    default: "Gnosia",
    template: "%s · Gnosia",
  },
  description:
    "A book that grows as you do. A living personal knowledge system that learns what you know and teaches what comes next.",
  // Declared by hand rather than via the app/opengraph-image.png file
  // convention: under Turbopack that convention ignores the documented
  // opengraph-image.alt.txt sidecar, so the card ships with no alt text.
  openGraph: {
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "The Gnosia wordmark and the line A book that grows as you do, beside the Gnosia mascot: a floating teal book with a glowing four-point star on its cover, two bright eyes under the hood of its pages, and a long ribbon tail",
      },
    ],
  },
};

/**
 * The document, and nothing that needs a database.
 *
 * Two route groups sit under it. `(site)` is the public face: the landing
 * page and the sign-in page, which anyone can load and which must therefore
 * cost no query. `(app)` is the owner's: its layout checks the session, reads
 * the learner snapshot, and draws the shell. Splitting
 * them here rather than in the shell keeps `loadLearnerSnapshot` off the
 * landing page's request path entirely, not merely unused.
 *
 * The theme stays here because it is a cookie and has to be known before the
 * first byte of HTML, or a dark-mode reload flashes white. It used to fall
 * back to the `preference` row when the cookie was missing; the `(app)`
 * layout still seeds the learner state from the row, and the client sets
 * the class to match on hydration, so a new browser gets the right theme one
 * frame late rather than a query on every public page.
 *
 * A system appearance (`system`, `gnosia-system`) is what the server cannot
 * resolve. It is rendered light, with `gnosia` already on for the brand
 * palette and `data-theme` naming the mode, and the first thing in `<body>`
 * is a two-line script that adds `dark` when the device prefers it, before
 * anything paints (see `SYSTEM_THEME_SCRIPT` in `@/lib/theme-cookie`).
 *
 * Settings' "Always reduce motion" is a cookie for the same reason, and lands
 * as `data-motion="reduce"` on `<html>`, which `globals.css` reads beside the
 * device's `prefers-reduced-motion` (`@/lib/motion`).
 *
 * The theme script carries the request's CSP nonce, which the proxy put on
 * `NONCE_HEADER` (`@/lib/auth/csp`); without it the page's policy would
 * refuse to run it.
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const nonce = requestHeaders.get(NONCE_HEADER) ?? undefined;
  const theme = asThemeMode(cookieStore.get(THEME_COOKIE)?.value ?? cookieStore.get(LEGACY_THEME_COOKIE)?.value) ?? "light";
  const classes = themeClass(theme, false);
  const motion = motionAttribute(
    asMotionMode(cookieStore.get(MOTION_COOKIE)?.value ?? cookieStore.get(LEGACY_MOTION_COOKIE)?.value),
  );

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-theme={theme}
      data-motion={motion}
      className={cx(figtree.variable, geistMono.variable, "h-full antialiased", ...classes)}
    >
      <body className="min-h-full">
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: SYSTEM_THEME_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
