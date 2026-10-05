import { Literata } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";

import { GnosiaWordmark } from "@/components/brand";
import { cx } from "@/components/ui/classes";

import { GITHUB_URL, siteLink } from "./site";
import { ThemeToggle } from "./ThemeToggle";

// The public pages' title face. Literata was drawn for reading books on
// screens, which is the product's one idea; loading it here rather than in the
// root layout keeps it off every signed-in page. The `font-book` utility
// (globals.css) names it.
const literata = Literata({
  variable: "--font-literata",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
});

/**
 * The public pages' frame: the landing page at `/` and the sign-in page.
 *
 * No top bar, no learner state, no database. A signed-in visitor never gets
 * here for `/` (proxy.ts sends them to `/home`), so nothing in this layout
 * asks who is looking. The ground is cream in light and deep navy in dark
 * (`.gnosia-ground` in globals.css); the theme class on <html> still comes
 * from the root layout's cookie, so a reader's choice carries over.
 *
 * The page content sits in the one `<main>`: a page under this layout starts
 * with a `<div>`, never its own `<main>`.
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={cx(literata.variable, "group/site gnosia-ground flex min-h-dvh flex-col overflow-x-clip font-sans")}
    >
      <a
        href="#main"
        className="sr-only rounded-full bg-brand-teal px-4 py-2 text-[14px] font-semibold text-brand-cream focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 dark:text-brand-navy"
      >
        Skip to content
      </a>

      <header className="pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between px-5 md:h-20 md:px-8">
          <Link href="/" aria-label="Gnosia home" className={siteLink("rounded-md text-[14px] text-brand-ink md:text-[15px]")}>
            <GnosiaWordmark />
          </Link>
          <div className="flex items-center gap-3 md:gap-5">
            {/* The sign-in page marks its root `data-page="sign-in"`, and
                this link hides itself there: a layout cannot read the path,
                but the wrapper can see what is inside it (the `data-layout`
                trick AppShell uses). `hidden` is display none, so it leaves
                the accessibility tree too. */}
            <nav aria-label="Site" className="group-has-[[data-page=sign-in]]/site:hidden">
              <Link
                href="/sign-in"
                className={siteLink(
                  "rounded-md px-1 py-2 text-[15px] font-semibold text-brand-ink underline-offset-[6px] hover:text-brand-teal hover:underline",
                )}
              >
                Sign in
              </Link>
            </nav>
            {/* Outside the nav, so it stays on the sign-in page too. */}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-brand-ink/10 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-5 py-10 md:flex-row md:items-center md:justify-between md:px-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
            <GnosiaWordmark className="text-[13px] text-brand-ink" />
            <p className="text-[14px] text-brand-mist">A book that grows as you do.</p>
          </div>
          <a
            href={GITHUB_URL}
            className={siteLink(
              "self-start rounded-md text-[14px] font-medium text-brand-mist underline-offset-4 hover:text-brand-ink hover:underline md:self-auto",
            )}
          >
            Source on GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
