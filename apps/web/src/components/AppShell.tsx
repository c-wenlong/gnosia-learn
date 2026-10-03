import type { ReactNode } from "react";

import { StoreBanner } from "@/components/shell/StoreBanner";
import { TabBar } from "@/components/shell/TabBar";
import { TopBar } from "@/components/shell/TopBar";

/**
 * The frame every page renders inside: the top bar, the store banner, the
 * page, and on a phone the tab bar.
 *
 * A server component; the parts that need the browser (the active tab, the
 * avatar menu, the banner) are client components one level down.
 *
 * **The page chooses its width with `data-layout` on its root element**, which
 * `has-*` reads here without a prop, a context or a client boundary between
 * the layout and the route:
 *
 * | value     | width                                   | used by                  |
 * | --------- | --------------------------------------- | ------------------------ |
 * | none      | the old 48rem reading measure           | pages not yet redesigned |
 * | `wide`    | 72rem, old gutters                      | the old library pages    |
 * | `app`     | up to 1392px inside 24px gutters (16 on a phone) | every redesigned page |
 * | `focus`   | the whole width, no padding, and no top bar from 768px up | Session and Review (focus mode) |
 * | `workspace` | `app` below 900px; from 900px up the shell is fixed to the viewport and the page fills the rest | the concept workspace |
 * | `full`    | the whole region, no padding, the shell fixed to the viewport | the studio canvas |
 *
 * `focus` is the hi-fi's focus mode (frames 05 to 08): on a desktop the page
 * owns the whole screen, drawing its own step bar and exit link, so the top
 * bar goes. On a phone (frames 14 and 15) the header and the tab bar stay,
 * and the page still starts flush under the header.
 *
 * `workspace` is `app` with the window scroll taken away on a desktop. The
 * concept page is three panels that scroll inside themselves, and any page
 * height beyond the viewport, from a long thread, a tall note or a short
 * window, put the composer and the panel headers out of reach: the window
 * scrolled, the panels did not. Fixing the shell to `h-dvh` and handing the
 * page a `flex-1 min-h-0` region means the panels can only ever be as tall as
 * the space under the header, whatever they contain. Below 900px the panels
 * stack behind tabs and the page scrolls as `app` does.
 *
 * `full` is not a wider `wide`. The studio's canvas is an iframe that has to
 * fill the region exactly, so it drops the measure *and* the padding, fixes
 * the shell to the viewport height, hides the phone tab bar, and hands the
 * route a flex child as tall as the space under the header.
 *
 * A redesigned page puts `data-layout="app"` on its root. Once every page has
 * moved, `app` becomes the default and the other two old values go.
 */
export function AppShell({
  studio = false,
  children,
}: {
  /** Whether this deployment has a studio. Only the server can know (D11). */
  studio?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={[
        "group/shell flex min-h-full flex-col bg-page text-text",
        "has-[[data-layout=full]]:h-dvh has-[[data-layout=full]]:overflow-hidden",
        "min-[900px]:has-[[data-layout=workspace]]:h-dvh min-[900px]:has-[[data-layout=workspace]]:overflow-hidden",
      ].join(" ")}
    >
      <TopBar studio={studio} />
      <StoreBanner />
      <main
        className={[
          // The old pages' gutters, and room under a phone page for the tab bar.
          "flex-1 px-4 pt-8 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:px-8 md:pb-8 lg:px-12",
          "has-[[data-layout=app]]:px-4 has-[[data-layout=app]]:pt-6 md:has-[[data-layout=app]]:px-6 md:has-[[data-layout=app]]:pb-10",
          "has-[[data-layout=workspace]]:px-4 has-[[data-layout=workspace]]:pt-6 md:has-[[data-layout=workspace]]:px-6 md:has-[[data-layout=workspace]]:pb-10",
          "min-[900px]:has-[[data-layout=workspace]]:flex min-[900px]:has-[[data-layout=workspace]]:min-h-0 min-[900px]:has-[[data-layout=workspace]]:pb-6",
          "has-[[data-layout=focus]]:px-0 has-[[data-layout=focus]]:pt-0 md:has-[[data-layout=focus]]:pb-0",
          "has-[[data-layout=full]]:flex has-[[data-layout=full]]:min-h-0 has-[[data-layout=full]]:p-0",
        ].join(" ")}
      >
        <div
          className={[
            "mx-auto w-full max-w-3xl",
            "has-[[data-layout=wide]]:max-w-6xl has-[[data-layout=app]]:max-w-[1392px] has-[[data-layout=focus]]:max-w-none",
            "has-[[data-layout=workspace]]:max-w-[1392px] min-[900px]:has-[[data-layout=workspace]]:flex min-[900px]:has-[[data-layout=workspace]]:min-h-0 min-[900px]:has-[[data-layout=workspace]]:flex-1 min-[900px]:has-[[data-layout=workspace]]:flex-col",
            "has-[[data-layout=full]]:flex has-[[data-layout=full]]:min-h-0 has-[[data-layout=full]]:max-w-none has-[[data-layout=full]]:flex-1",
          ].join(" ")}
        >
          {children}
        </div>
      </main>
      <TabBar />
    </div>
  );
}
