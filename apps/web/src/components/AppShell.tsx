import type { ReactNode } from "react";

import { ShellFrame } from "@/components/shell/ShellFrame";
import { StoreBanner } from "@/components/shell/StoreBanner";
import { cx } from "@/components/ui/classes";

/**
 * The frame every page renders inside: the sidebar, and beside it the store
 * banner and the page, under a header on a phone.
 *
 * The sidebar (`AppSidebar`) is the app's only navigation: New chat when this
 * deployment has a studio, the four learning destinations, the studio's
 * conversations, and the account at the foot. It replaced the top bar, the
 * phone tab bar and the studio's own conversation list. `ShellFrame` is the
 * client half that holds it; this stays a server component so the page is
 * drawn on the server as before.
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
 * | `focus`   | the whole width, no padding, and no sidebar from 768px up | Session and Review (focus mode) |
 * | `workspace` | `app` until the three panels fit beside the sidebar (`ws:`: 1160px, 960px with it on its rail); then the shell is fixed to the viewport and the page fills the rest | the concept workspace |
 * | `full`    | the whole region, no padding, the shell fixed to the viewport | the studio |
 *
 * `focus` is the hi-fi's focus mode (frames 05 to 08): on a desktop the page
 * owns the whole screen, drawing its own step bar and exit link, so the
 * sidebar goes. On a phone (frames 14 and 15) the header stays, and the page
 * still starts flush under it. There `main`, the column inside it and the
 * page's root are a chain of flex columns, so the page is exactly as tall as
 * the space the header and the store banner leave (`ShellFrame` is at least
 * the screen), and a session's action row sits at the bottom where a thumb
 * is. A `min-height` worked out from the header's height missed its
 * border, its safe-area padding and the banner, so it always ran a few
 * pixels past the screen, and an open banner pushed the actions off it.
 *
 * `workspace` is `app` with the window scroll taken away on a desktop. The
 * concept page is three panels that scroll inside themselves, and any page
 * height beyond the viewport, from a long thread, a tall note or a short
 * window, put the composer and the panel headers out of reach: the window
 * scrolled, the panels did not. Fixing the shell to `h-dvh` and handing the
 * page a `flex-1 min-h-0` region means the panels can only ever be as tall as
 * the viewport, whatever they contain. Where the three do not fit (`ws:`), they stack behind
 * tabs and the page scrolls as `app` does.
 *
 * `full` is not a wider `wide`. The studio's conversation and canvas have to
 * fill the region exactly, so it drops the measure *and* the padding, fixes
 * the shell to the viewport height, and hands the route a flex child as tall
 * as the space beside the sidebar.
 *
 * Every other page scrolls the window, and the sidebar sticks beside it.
 */
export function AppShell({
  studio = false,
  runner = studio,
  collapsed = false,
  children,
}: {
  /** Whether this deployment has a studio. Only the server can know (D11). */
  studio?: boolean;
  /** Whether the studio's runner was listening as the page was drawn (`runnerListening`). */
  runner?: boolean;
  /** Whether the sidebar is folded to its rail on a desktop (`SIDEBAR_COOKIE`). */
  collapsed?: boolean;
  children: ReactNode;
}) {
  return (
    <ShellFrame studio={studio} runner={runner} initialCollapsed={collapsed}>
      <StoreBanner />
      <main
        className={cx(
          // The old pages' gutters, and room under a phone page for the home indicator.
          "flex-1 px-4 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-8 md:pb-8 lg:px-12",
          "has-[[data-layout=app]]:px-4 has-[[data-layout=app]]:pt-6 md:has-[[data-layout=app]]:px-6 md:has-[[data-layout=app]]:pb-10",
          "has-[[data-layout=workspace]]:px-4 has-[[data-layout=workspace]]:pt-6 md:has-[[data-layout=workspace]]:px-6 md:has-[[data-layout=workspace]]:pb-10",
          "ws:has-[[data-layout=workspace]]:flex ws:has-[[data-layout=workspace]]:min-h-0 ws:has-[[data-layout=workspace]]:pb-6",
          "has-[[data-layout=focus]]:px-0 has-[[data-layout=focus]]:pt-0 md:has-[[data-layout=focus]]:pb-0",
          // A focus page on a phone fills what the header and the store banner leave (the column below).
          "max-md:has-[[data-layout=focus]]:flex max-md:has-[[data-layout=focus]]:flex-col",
          "has-[[data-layout=full]]:flex has-[[data-layout=full]]:min-h-0 has-[[data-layout=full]]:p-0",
        )}
      >
        <div
          className={cx(
            "mx-auto w-full max-w-3xl",
            "has-[[data-layout=wide]]:max-w-6xl has-[[data-layout=app]]:max-w-[1392px] has-[[data-layout=focus]]:max-w-none",
            "has-[[data-layout=workspace]]:max-w-[1392px] ws:has-[[data-layout=workspace]]:flex ws:has-[[data-layout=workspace]]:min-h-0 ws:has-[[data-layout=workspace]]:flex-1 ws:has-[[data-layout=workspace]]:flex-col",
            "has-[[data-layout=full]]:flex has-[[data-layout=full]]:min-h-0 has-[[data-layout=full]]:max-w-none has-[[data-layout=full]]:flex-1",
            "max-md:has-[[data-layout=focus]]:flex max-md:has-[[data-layout=focus]]:flex-1 max-md:has-[[data-layout=focus]]:flex-col",
            "max-md:[&>[data-layout=focus]]:flex max-md:[&>[data-layout=focus]]:flex-1 max-md:[&>[data-layout=focus]]:flex-col",
          )}
        >
          {children}
        </div>
      </main>
    </ShellFrame>
  );
}
